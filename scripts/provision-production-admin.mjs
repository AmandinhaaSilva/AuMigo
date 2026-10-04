import { execFileSync } from "node:child_process";

const EXPECTED_PROJECT_ID = "memberverse-sfhf9";
const FIREBASE_WEB_API_KEY = "AIzaSyAKy-05uW7C6VLQBSPjli8R7EAR1QCxvqo";
const CONFIRMATION = "PROVISION_AUFRIENDS_ADMIN";
const projectId = process.env.AUFRIENDS_PRODUCTION_PROJECT_ID;
const confirmation = process.env.AUFRIENDS_PRODUCTION_CONFIRM;
const email = String(process.env.AUFRIENDS_ADMIN_EMAIL ?? "").trim().toLowerCase();
const displayName = String(process.env.AUFRIENDS_ADMIN_DISPLAY_NAME ?? "Administradora AuFriends").trim();

async function passwordFromStdin() {
  if (!process.argv.includes("--password-stdin") || process.stdin.isTTY) {
    throw new Error("Forneça a senha temporária por entrada padrão usando --password-stdin.");
  }

  let value = "";
  for await (const chunk of process.stdin) value += chunk;
  return value.replace(/[\r\n]+$/, "");
}

const password = await passwordFromStdin();

if (projectId !== EXPECTED_PROJECT_ID || confirmation !== CONFIRMATION) {
  throw new Error(
    `Provisionamento recusado. Confirme AUFRIENDS_PRODUCTION_PROJECT_ID=${EXPECTED_PROJECT_ID} `
      + `e AUFRIENDS_PRODUCTION_CONFIRM=${CONFIRMATION}.`
  );
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("Informe um e-mail administrativo válido em AUFRIENDS_ADMIN_EMAIL.");
}
if (password.length < 12 || password.length > 128) {
  throw new Error("A senha temporária deve ter entre 12 e 128 caracteres.");
}
if (!displayName || displayName.length > 120) {
  throw new Error("O nome administrativo deve ter entre 1 e 120 caracteres.");
}

function firebaseAccessToken() {
  const executable = process.platform === "win32"
    ? (process.env.ComSpec ?? "cmd.exe")
    : "firebase";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "firebase login:list --json"]
    : ["login:list", "--json"];
  const childEnvironment = { ...process.env };
  delete childEnvironment.AUFRIENDS_ADMIN_PASSWORD;
  const output = execFileSync(executable, args, {
    encoding: "utf8",
    env: childEnvironment,
    windowsHide: true
  });
  const login = JSON.parse(output);
  const token = login.result?.[0]?.tokens?.access_token;
  if (!token) throw new Error("Firebase CLI não possui uma sessão autenticada válida.");
  return token;
}

async function identityRequest(action, body) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function authenticateOrCreate() {
  const signup = await identityRequest("signUp", {
    email,
    password,
    returnSecureToken: true
  });

  if (signup.response.ok) {
    return { ...signup.payload, created: true };
  }

  if (signup.payload?.error?.message !== "EMAIL_EXISTS") {
    throw new Error(`Firebase Auth recusou a conta: ${signup.payload?.error?.message ?? signup.response.status}.`);
  }

  const signin = await identityRequest("signInWithPassword", {
    email,
    password,
    returnSecureToken: true
  });
  if (!signin.response.ok) {
    throw new Error(
      "O e-mail já existe com outra senha. O script não substituiu a credencial existente."
    );
  }
  return { ...signin.payload, created: false };
}

async function deleteNewAccount(idToken) {
  const deletion = await identityRequest("delete", { idToken });
  if (!deletion.response.ok) {
    throw new Error(`Falha ao remover a conta Auth nova: ${deletion.payload?.error?.message ?? deletion.response.status}.`);
  }
}

function firestoreFields(createdAt, updatedAt) {
  return {
    schemaVersion: { integerValue: "1" },
    displayName: { stringValue: displayName },
    email: { stringValue: email },
    active: { booleanValue: true },
    createdAt: { timestampValue: createdAt },
    updatedAt: { timestampValue: updatedAt }
  };
}

const now = new Date().toISOString();
const accessToken = firebaseAccessToken();
const documentsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}`
  + "/databases/(default)/documents";
const operatorHeaders = Object.freeze({ Authorization: `Bearer ${accessToken}` });
const operatorProbe = await fetch(`${documentsUrl}/admins?pageSize=1`, {
  headers: operatorHeaders
});
if (!operatorProbe.ok) {
  throw new Error(`A sessão Firebase não pode administrar ${projectId} (HTTP ${operatorProbe.status}).`);
}

let session;
let documentUrl;
let previousAdmin = null;
let previousAdminKnown = false;
let authorizationMutationAttempted = false;

async function restoreAdminAuthorization() {
  if (!previousAdminKnown || !documentUrl) return;

  const response = previousAdmin
    ? await fetch(documentUrl, {
        method: "PATCH",
        headers: { ...operatorHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: previousAdmin.fields ?? {} })
      })
    : await fetch(documentUrl, { method: "DELETE", headers: operatorHeaders });

  if (!response.ok && !(previousAdmin === null && response.status === 404)) {
    throw new Error(`Falha ao restaurar a autorização administrativa: HTTP ${response.status}.`);
  }

  const verification = await fetch(documentUrl, { headers: operatorHeaders });
  if (previousAdmin === null) {
    if (verification.status !== 404) {
      throw new Error("A autorização administrativa deveria ter sido removida no rollback.");
    }
    return;
  }

  if (!verification.ok) {
    throw new Error(`Não foi possível confirmar o rollback administrativo: HTTP ${verification.status}.`);
  }
  const restored = await verification.json();
  const canonicalize = (value) => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  };
  if (JSON.stringify(canonicalize(restored.fields)) !== JSON.stringify(canonicalize(previousAdmin.fields))) {
    throw new Error("O documento administrativo anterior não foi restaurado integralmente.");
  }
}

try {
  session = await authenticateOrCreate();
  const uid = session.localId;
  if (!uid || !session.idToken) throw new Error("Firebase Auth não retornou UID/token válidos.");
  documentUrl = `${documentsUrl}/admins/${encodeURIComponent(uid)}`;

  const existingResponse = await fetch(documentUrl, {
    headers: operatorHeaders
  });
  if (!existingResponse.ok && existingResponse.status !== 404) {
    throw new Error(`Falha ao consultar autorização existente: HTTP ${existingResponse.status}.`);
  }
  previousAdmin = existingResponse.ok ? await existingResponse.json() : null;
  previousAdminKnown = true;
  const createdAt = previousAdmin?.fields?.createdAt?.timestampValue ?? now;

  authorizationMutationAttempted = true;
  const adminResponse = await fetch(documentUrl, {
    method: "PATCH",
    headers: {
      ...operatorHeaders,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields: firestoreFields(createdAt, now) })
  });
  if (!adminResponse.ok) {
    throw new Error(`Falha ao ativar admins/${uid}: HTTP ${adminResponse.status}.`);
  }

  const verification = await fetch(documentUrl, {
    headers: { Authorization: `Bearer ${session.idToken}` }
  });
  if (!verification.ok) {
    throw new Error(`A conta foi criada, mas a autorização ativa não pôde ser validada (${verification.status}).`);
  }
  const verifiedDocument = await verification.json();
  if (verifiedDocument.fields?.active?.booleanValue !== true) {
    throw new Error("A autorização administrativa não ficou ativa.");
  }

  console.log(`Administrador ${session.created ? "criado" : "reutilizado"} e ativado: ${email}.`);
  console.log(`UID: ${session.localId}. A senha não foi registrada em arquivo, ambiente ou log.`);
} catch (error) {
  const rollbackFailures = [];

  if (authorizationMutationAttempted) {
    try {
      await restoreAdminAuthorization();
    } catch (rollbackError) {
      rollbackFailures.push(rollbackError);
    }
  }

  if (session?.created && session.idToken) {
    try {
      await deleteNewAccount(session.idToken);
    } catch (rollbackError) {
      rollbackFailures.push(rollbackError);
    }
  }

  if (rollbackFailures.length > 0) {
    throw new AggregateError(
      [error, ...rollbackFailures],
      `Provisionamento falhou e exige conferência manual de ${email}.`
    );
  }
  throw error;
}
