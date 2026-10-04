import { generateKeyPairSync, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { cert, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore, Timestamp } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import {
  ADMIN_METRICS,
  SiteSettingsValidationError,
  adminPanelErrorMessage,
  createAdminPanelDataService,
  loadedMetricState
} from "../web/src/services/admin-panel-data.js";

const PROJECT_ID = "demo-aufriends-local";
const HUB_URL = "http://127.0.0.1:4400/emulators";
const AUTH_URL = "http://127.0.0.1:9099";
const LOCAL_ENVIRONMENT = Object.freeze({
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080"
});
const CREDENTIALS = Object.freeze({
  admin: { email: "admin@aufriends.local", password: "AuFriendsLocal!2026" },
  nonAdmin: { email: "usuario@aufriends.local", password: "UsuarioLocal!2026" }
});
const VALID_SETTINGS = Object.freeze({
  brandName: "AuFriends Local",
  whatsappDigits: "+55 (17) 99152-9090",
  whatsappGreeting: "Olá! Quero conversar com a equipe AuFriends."
});

const results = [];
const clientApps = [];
const runId = randomUUID().replaceAll("-", "");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function scenario(name, run) {
  try {
    await run();
    results.push({ name, state: "PASSOU" });
  } catch (error) {
    results.push({ name, state: "FALHOU", detail: error?.message ?? String(error) });
  }
}

function requireLocalEnvironment() {
  for (const [name, expected] of Object.entries(LOCAL_ENVIRONMENT)) {
    const configured = process.env[name];

    if (configured && configured !== expected) {
      throw new Error(`${name} recusado: esperado somente ${expected}.`);
    }

    process.env[name] = expected;
  }

  for (const name of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
    const configured = process.env[name];

    if (configured && configured !== PROJECT_ID) {
      throw new Error(`${name} recusado: esperado somente ${PROJECT_ID}.`);
    }

    process.env[name] = PROJECT_ID;
  }
}

async function requireOfficialEmulators() {
  const response = await fetch(HUB_URL, { signal: AbortSignal.timeout(3_000) });
  assert(response.ok, `Hub local indisponível (${response.status}).`);
  const emulators = await response.json();
  const expected = {
    auth: { host: "127.0.0.1", port: 9099 },
    firestore: { host: "127.0.0.1", port: 8080 }
  };

  for (const [name, endpoint] of Object.entries(expected)) {
    const running = emulators[name];
    assert(
      running?.host === endpoint.host && running?.port === endpoint.port,
      `Emulador ${name} não está no endpoint oficial.`
    );
  }
}

function localCredential() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2_048 });

  return cert({
    projectId: PROJECT_ID,
    clientEmail: `verify-panel@${PROJECT_ID}.iam.gserviceaccount.com`,
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" })
  });
}

async function createClient(label, credentials) {
  const app = initializeApp(
    {
      apiKey: PROJECT_ID,
      projectId: PROJECT_ID,
      storageBucket: `${PROJECT_ID}.appspot.com`
    },
    `t08-${label}-${randomUUID()}`
  );
  clientApps.push(app);
  const auth = getAuth(app);
  const firestore = getFirestore(app);

  connectAuthEmulator(auth, AUTH_URL, { disableWarnings: true });
  connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  await setPersistence(auth, inMemoryPersistence);
  const credential = await signInWithEmailAndPassword(
    auth,
    credentials.email,
    credentials.password
  );

  return {
    auth,
    firestore,
    user: credential.user,
    service: createAdminPanelDataService(firestore)
  };
}

function isPermissionDenied(error) {
  return ["permission-denied", "firestore/permission-denied"].includes(error?.code);
}

function assertSettingsDocument(data, expected, uid) {
  const expectedKeys = [
    "brandName",
    "schemaVersion",
    "updatedAt",
    "updatedBy",
    "whatsappDigits",
    "whatsappGreeting"
  ];

  assert(
    Object.keys(data).sort().join("|") === expectedKeys.sort().join("|"),
    "siteSettings/public contém campos inesperados."
  );
  assert(data.schemaVersion === 1, "schemaVersion não foi preservado.");
  assert(data.brandName === expected.brandName, "brandName divergente.");
  assert(data.whatsappDigits === expected.whatsappDigits, "WhatsApp não foi normalizado.");
  assert(data.whatsappGreeting === expected.whatsappGreeting, "Saudação divergente.");
  assert(data.updatedBy === uid, "updatedBy não corresponde ao administrador.");
  assert(typeof data.updatedAt?.toDate === "function", "updatedAt não é timestamp.");
}

function comparable(value) {
  if (value?.toMillis instanceof Function) return { timestamp: value.toMillis() };
  if (Array.isArray(value)) return value.map(comparable);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, comparable(nested)])
    );
  }

  return value;
}

requireLocalEnvironment();
await requireOfficialEmulators();

const adminApp = initializeAdminApp(
  { projectId: PROJECT_ID, credential: localCredential() },
  `t08-panel-verifier-${runId}`
);
const privilegedAuth = getAdminAuth(adminApp);
const privilegedFirestore = getAdminFirestore(adminApp);
const settingsReference = privilegedFirestore.collection("siteSettings").doc("public");
const originalSettingsSnapshot = await settingsReference.get();
const originalSettings = originalSettingsSnapshot.exists ? originalSettingsSnapshot.data() : null;
const verificationDocuments = ADMIN_METRICS.map(({ key }) =>
  privilegedFirestore.collection(key).doc(`t08-${runId}`)
);
let revocationUser;
let revocationAdminReference;

try {
  const adminClient = await createClient("active-admin", CREDENTIALS.admin);

  await scenario("painel vazio representa zero sem confundir com carregamento", async () => {
    for (const { key } of ADMIN_METRICS) {
      const state = loadedMetricState(key, 0);
      assert(state.value === "0", `${key} não exibiu zero.`);
      assert(state.empty && state.description.length > 0, `${key} não informou estado vazio.`);
    }
  });

  await scenario("quatro métricas consultam dados reais", async () => {
    const before = await Promise.all(
      ADMIN_METRICS.map(async ({ key }) => [key, await adminClient.service.count(key)])
    );

    try {
      await Promise.all(
        verificationDocuments.map((reference) =>
          reference.set({ schemaVersion: 1, verificationRun: runId }, { merge: false })
        )
      );

      const outcomes = await Promise.allSettled(
        ADMIN_METRICS.map(({ key }) => adminClient.service.count(key))
      );

      outcomes.forEach((outcome, index) => {
        assert(outcome.status === "fulfilled", `${ADMIN_METRICS[index].key} falhou.`);
        assert(
          outcome.value === before[index][1] + 1,
          `${ADMIN_METRICS[index].key} não refletiu o documento temporário.`
        );
      });
    } finally {
      await Promise.allSettled(verificationDocuments.map((reference) => reference.delete()));
    }
  });

  await scenario("configuração inexistente retorna estado de criação", async () => {
    await settingsReference.delete();
    assert((await adminClient.service.readSiteSettings()) === null, "Documento ausente não retornou null.");
  });

  await scenario("administrador cria configuração válida", async () => {
    await settingsReference.delete();
    const saved = await adminClient.service.saveSiteSettings(adminClient.user.uid, VALID_SETTINGS);
    const snapshot = await settingsReference.get();

    assert(saved.whatsappDigits === "5517991529090", "Retorno não normalizou o telefone.");
    assert(snapshot.exists, "siteSettings/public não foi criado.");
    assertSettingsDocument(snapshot.data(), saved, adminClient.user.uid);
  });

  await scenario("administrador edita configuração com substituição integral", async () => {
    const editedInput = {
      brandName: "AuFriends",
      whatsappDigits: "55 17 98888-7766",
      whatsappGreeting: "Olá! Como a equipe AuFriends pode ajudar?"
    };
    const saved = await adminClient.service.saveSiteSettings(adminClient.user.uid, editedInput);
    const snapshot = await settingsReference.get();

    assertSettingsDocument(snapshot.data(), saved, adminClient.user.uid);
    assert(saved.whatsappDigits === "5517988887766", "Edição não normalizou o telefone.");
  });

  await scenario("entrada inválida não realiza escrita", async () => {
    await adminClient.service.saveSiteSettings(adminClient.user.uid, VALID_SETTINGS);
    const before = (await settingsReference.get()).data();
    let validationError;

    try {
      await adminClient.service.saveSiteSettings(adminClient.user.uid, {
        brandName: " ",
        whatsappDigits: "telefone-inválido",
        whatsappGreeting: ""
      });
    } catch (error) {
      validationError = error;
    }

    const after = (await settingsReference.get()).data();
    assert(validationError instanceof SiteSettingsValidationError, "Validação local não bloqueou.");
    assert(after.brandName === before.brandName, "brandName foi alterado pela entrada inválida.");
    assert(after.whatsappDigits === before.whatsappDigits, "WhatsApp foi alterado pela entrada inválida.");
    assert(
      after.whatsappGreeting === before.whatsappGreeting,
      "Saudação foi alterada pela entrada inválida."
    );
    assert(after.updatedAt.isEqual(before.updatedAt), "updatedAt mudou apesar da validação.");
  });

  await scenario("usuário autenticado não admin não consulta nem escreve o painel", async () => {
    const nonAdminClient = await createClient("non-admin", CREDENTIALS.nonAdmin);
    let countError;
    let writeError;

    try {
      await nonAdminClient.service.count("donations");
    } catch (error) {
      countError = error;
    }

    try {
      await nonAdminClient.service.saveSiteSettings(nonAdminClient.user.uid, VALID_SETTINGS);
    } catch (error) {
      writeError = error;
    }

    assert(isPermissionDenied(countError), "Não admin conseguiu consultar métrica protegida.");
    assert(isPermissionDenied(writeError), "Não admin conseguiu escrever siteSettings.");
  });

  await scenario("revogação nega dados e produz erro legível", async () => {
    const uid = `t08-revoked-${runId.slice(0, 20)}`;
    const email = `${uid}@aufriends.local`;
    const password = "T08RevogacaoLocal!2026";
    revocationUser = await privilegedAuth.createUser({
      uid,
      email,
      password,
      emailVerified: true,
      displayName: "Admin temporário T08"
    });
    revocationAdminReference = privilegedFirestore.collection("admins").doc(uid);
    await revocationAdminReference.set(
      {
        schemaVersion: 1,
        displayName: "Admin temporário T08",
        email,
        active: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      },
      { merge: false }
    );
    const revokedClient = await createClient("revoked-admin", { email, password });
    await revokedClient.service.count("animals");
    await revocationAdminReference.update({ active: false, updatedAt: Timestamp.now() });

    let revokedError;

    try {
      await revokedClient.service.count("adoptionRequests");
    } catch (error) {
      revokedError = error;
    }

    assert(isPermissionDenied(revokedError), "Revogação não removeu o acesso às métricas.");
    assert(
      adminPanelErrorMessage(revokedError).includes("acesso administrativo"),
      "Erro de revogação não é legível."
    );
  });

  await scenario("estrutura acessível preserva guarda e escopo T08", async () => {
    const html = readFileSync("web/admin/painel/index.html", "utf8");
    const guard = readFileSync("web/src/features/admin-guard.js", "utf8");
    const feature = readFileSync("web/src/features/admin-panel.js", "utf8");
    const service = readFileSync("web/src/services/admin-panel-data.js", "utf8");

    const requiredNavigation = [
      'href="#visao-geral"',
      'href="#indicadores"',
      'href="#produtos"',
      'href="#configuracoes"'
    ];
    assert(
      requiredNavigation.every((target) => html.includes(`${target} data-admin-nav`)),
      "Navegação administrativa T08/T11 incompleta."
    );
    assert(html.includes('aria-live="polite"'), "Estados do painel não possuem região viva.");
    assert(html.includes("data-settings-form"), "Formulário inline não foi encontrado.");
    assert(!/usuários|users/iu.test(html), "Módulo de usuários foi incluído indevidamente.");
    assert(guard.includes('import("./admin-panel.js")'), "Painel não usa carregamento dinâmico.");
    assert(
      guard.indexOf("hasActiveAdminAccess(user)") < guard.indexOf("revealPanel(user);") &&
        guard.indexOf("revealPanel(user);") < guard.lastIndexOf("startProtectedPanel(user)"),
      "Painel pode iniciar antes da autorização ativa."
    );
    assert(feature.includes("Promise.allSettled"), "Métricas não usam Promise.allSettled.");
    assert(service.includes("{ merge: false }"), "siteSettings não explicita merge=false.");
  });
} finally {
  const cleanupProblems = [];
  const documentCleanup = await Promise.allSettled(
    verificationDocuments.map((reference) => reference.delete())
  );

  if (documentCleanup.some((outcome) => outcome.status === "rejected")) {
    cleanupProblems.push("falha ao apagar documentos de métricas");
  }

  try {
    if (originalSettings) {
      await settingsReference.set(originalSettings, { merge: false });
    } else {
      await settingsReference.delete();
    }
  } catch {
    cleanupProblems.push("falha ao restaurar siteSettings/public");
  }

  if (revocationAdminReference) {
    try {
      await revocationAdminReference.delete();
    } catch {
      cleanupProblems.push("falha ao apagar admins temporário");
    }
  }

  if (revocationUser) {
    try {
      await privilegedAuth.deleteUser(revocationUser.uid);
    } catch {
      cleanupProblems.push("falha ao apagar usuário Auth temporário");
    }
  }

  try {
    const remainingDocuments = await Promise.all(
      verificationDocuments.map((reference) => reference.get())
    );
    if (remainingDocuments.some((snapshot) => snapshot.exists)) {
      cleanupProblems.push("documento temporário permaneceu no Firestore");
    }

    const restoredSettings = await settingsReference.get();
    if (originalSettings) {
      if (
        !restoredSettings.exists ||
        JSON.stringify(comparable(restoredSettings.data())) !==
          JSON.stringify(comparable(originalSettings))
      ) {
        cleanupProblems.push("siteSettings/public não voltou ao conteúdo inicial");
      }
    } else if (restoredSettings.exists) {
      cleanupProblems.push("siteSettings/public deveria continuar inexistente");
    }

    if (revocationAdminReference && (await revocationAdminReference.get()).exists) {
      cleanupProblems.push("admins temporário permaneceu no Firestore");
    }

    if (revocationUser) {
      try {
        await privilegedAuth.getUser(revocationUser.uid);
        cleanupProblems.push("usuário temporário permaneceu no Auth");
      } catch (error) {
        if (error?.code !== "auth/user-not-found") throw error;
      }
    }
  } catch (error) {
    cleanupProblems.push(`não foi possível confirmar a limpeza: ${error.message}`);
  }

  results.push(
    cleanupProblems.length === 0
      ? { name: "limpeza restaura dados temporários", state: "PASSOU" }
      : {
          name: "limpeza restaura dados temporários",
          state: "FALHOU",
          detail: cleanupProblems.join("; ")
        }
  );

  await Promise.allSettled(clientApps.map((app) => deleteApp(app)));
  await deleteAdminApp(adminApp);
}

for (const result of results) {
  console.log(`${result.state}: ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
}

const failures = results.filter((result) => result.state === "FALHOU");
console.log(`Resultado T08: ${results.length - failures.length}/${results.length} cenários aprovados.`);

if (failures.length === 0) {
  console.log("Dados temporários T08 removidos e siteSettings/public restaurado ao estado inicial.");
}

if (failures.length > 0) process.exitCode = 1;
