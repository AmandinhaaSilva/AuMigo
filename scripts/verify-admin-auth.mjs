import { globSync, readFileSync } from "node:fs";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  EmailAuthProvider,
  getAuth,
  inMemoryPersistence,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  getFirestore
} from "firebase/firestore";

const PROJECT_ID = "demo-aufriends-local";
const ROOT_URL = "http://127.0.0.1:5000";
const AUTH_URL = "http://127.0.0.1:9099";
const OOB_URL = `${AUTH_URL}/emulator/v1/projects/${PROJECT_ID}/oobCodes`;
const CREDENTIALS = Object.freeze({
  admin: { email: "admin@aufriends.local", password: "AuFriendsLocal!2026" },
  nonAdmin: { email: "usuario@aufriends.local", password: "UsuarioLocal!2026" }
});

const results = [];

function pass(name) {
  results.push({ name, state: "PASSOU" });
}

function fail(name, error) {
  results.push({ name, state: "FALHOU", detail: error?.message ?? String(error) });
}

async function scenario(name, run) {
  try {
    await run();
    pass(name);
  } catch (error) {
    fail(name, error);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function client(label) {
  const app = initializeApp(
    {
      apiKey: PROJECT_ID,
      projectId: PROJECT_ID,
      storageBucket: `${PROJECT_ID}.appspot.com`
    },
    `t07-verify-${label}-${crypto.randomUUID()}`
  );
  const auth = getAuth(app);
  const firestore = getFirestore(app);

  connectAuthEmulator(auth, AUTH_URL, { disableWarnings: true });
  connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  await setPersistence(auth, inMemoryPersistence);

  return { app, auth, firestore };
}

async function deleteClient(app) {
  await deleteApp(app);
}

async function oobCodes() {
  const response = await fetch(OOB_URL, { signal: AbortSignal.timeout(3_000) });
  assert(response.ok, `Auth Emulator recusou consulta OOB (${response.status}).`);
  const payload = await response.json();
  return payload.oobCodes ?? [];
}

await scenario("credencial admin válida e admins/{uid}.active", async () => {
  const current = await client("admin");

  try {
    const credential = await signInWithEmailAndPassword(
      current.auth,
      CREDENTIALS.admin.email,
      CREDENTIALS.admin.password
    );
    const snapshot = await getDocFromServer(doc(current.firestore, "admins", credential.user.uid));
    assert(snapshot.exists() && snapshot.get("active") === true, "Admin ativo não confirmado.");
  } finally {
    await deleteClient(current.app);
  }
});

await scenario("senha inválida recusada", async () => {
  const current = await client("invalid-password");

  try {
    let rejected = false;

    try {
      await signInWithEmailAndPassword(current.auth, CREDENTIALS.admin.email, "senha-incorreta");
    } catch (error) {
      rejected = ["auth/invalid-credential", "auth/wrong-password"].includes(error?.code);
    }

    assert(rejected, "Senha inválida não foi recusada como credencial inválida.");
  } finally {
    await deleteClient(current.app);
  }
});

await scenario("usuário autenticado não admin bloqueado pelas Rules", async () => {
  const current = await client("non-admin");

  try {
    const credential = await signInWithEmailAndPassword(
      current.auth,
      CREDENTIALS.nonAdmin.email,
      CREDENTIALS.nonAdmin.password
    );
    let denied = false;

    try {
      await getDocFromServer(doc(current.firestore, "admins", credential.user.uid));
    } catch (error) {
      denied = error?.code === "permission-denied";
    }

    assert(denied, "Usuário sem admins/{uid} não recebeu permission-denied.");
  } finally {
    await deleteClient(current.app);
  }
});

await scenario("logout limpa a sessão cliente", async () => {
  const current = await client("logout");

  try {
    await signInWithEmailAndPassword(
      current.auth,
      CREDENTIALS.admin.email,
      CREDENTIALS.admin.password
    );
    await signOut(current.auth);
    assert(current.auth.currentUser === null, "Usuário permaneceu na sessão após logout.");
  } finally {
    await deleteClient(current.app);
  }
});

await scenario("recuperação gera ação no Auth Emulator", async () => {
  const before = await oobCodes();
  const current = await client("password-reset");

  try {
    await sendPasswordResetEmail(current.auth, CREDENTIALS.admin.email);
  } finally {
    await deleteClient(current.app);
  }

  const after = await oobCodes();
  const generated = after.some(
    (entry) =>
      entry.email === CREDENTIALS.admin.email &&
      entry.requestType === "PASSWORD_RESET" &&
      !before.some((existing) => existing.oobCode === entry.oobCode)
  );
  assert(generated, "Nenhum novo código PASSWORD_RESET foi encontrado.");
});

await scenario("administrador altera a própria senha e consegue reutilizá-la", async () => {
  const current = await client("password-change");
  const temporaryPassword = "NovaSenhaLocal!2026";
  let passwordChanged = false;

  try {
    const credential = await signInWithEmailAndPassword(
      current.auth,
      CREDENTIALS.admin.email,
      CREDENTIALS.admin.password
    );
    await reauthenticateWithCredential(
      credential.user,
      EmailAuthProvider.credential(CREDENTIALS.admin.email, CREDENTIALS.admin.password)
    );
    await updatePassword(credential.user, temporaryPassword);
    passwordChanged = true;
    await signOut(current.auth);
    await signInWithEmailAndPassword(current.auth, CREDENTIALS.admin.email, temporaryPassword);
    await reauthenticateWithCredential(
      current.auth.currentUser,
      EmailAuthProvider.credential(CREDENTIALS.admin.email, temporaryPassword)
    );
    await updatePassword(current.auth.currentUser, CREDENTIALS.admin.password);
    passwordChanged = false;
  } finally {
    if (passwordChanged) {
      let user = current.auth.currentUser;
      if (!user) {
        user = (await signInWithEmailAndPassword(
          current.auth,
          CREDENTIALS.admin.email,
          temporaryPassword
        )).user;
      } else {
        await reauthenticateWithCredential(
          user,
          EmailAuthProvider.credential(CREDENTIALS.admin.email, temporaryPassword)
        );
      }
      await updatePassword(user, CREDENTIALS.admin.password);
    }
    await deleteClient(current.app);
  }
});

await scenario("entrada direta permanece oculta até o guard", async () => {
  const response = await fetch(`${ROOT_URL}/admin/painel`, {
    redirect: "manual",
    signal: AbortSignal.timeout(3_000)
  });
  const html = await response.text();
  const panelSource = readFileSync("web/admin/painel/index.html", "utf8");
  assert(response.status === 200, `Hosting respondeu ${response.status}.`);
  assert(/data-admin-protected(?:="")? hidden/.test(html), "Painel não inicia oculto.");
  assert(html.includes("data-admin-loading"), "Estado de carregamento não foi publicado.");
  assert(/<script type="module"[^>]+src="\/assets\/[^\"]+[.]js"/.test(html), "Bundle do guard ausente no build.");
  assert(panelSource.includes('/src/features/admin-guard.js'), "Entrypoint do guard ausente na fonte.");
});

await scenario("persistência declarada e nenhum cadastro público", async () => {
  const sourceFiles = globSync("web/**/*.{html,js}");
  const sources = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");
  const authService = readFileSync("web/src/services/admin-auth.js", "utf8");
  const loginPage = readFileSync("web/admin/index.html", "utf8");
  const panelPage = readFileSync("web/admin/painel/index.html", "utf8");

  assert(authService.includes("browserLocalPersistence"), "Persistência local não configurada.");
  assert(authService.includes("reauthenticateWithCredential"), "Reautenticação para troca de senha ausente.");
  assert(authService.includes("updatePassword"), "Atualização autenticada de senha ausente.");
  assert(panelPage.includes("data-password-form"), "Formulário de troca de senha ausente do painel.");
  assert(!sources.includes("createUserWithEmailAndPassword"), "Cadastro público encontrado.");
  assert(!loginPage.includes('href="/admin/painel"'), "Link público de prévia ainda existe.");
});

for (const result of results) {
  console.log(`${result.state}: ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
}

const failures = results.filter((result) => result.state === "FALHOU");
console.log(`Resultado T07: ${results.length - failures.length}/${results.length} cenários aprovados.`);

if (failures.length > 0) process.exitCode = 1;
