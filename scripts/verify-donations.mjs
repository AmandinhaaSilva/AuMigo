import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { createDonationAttemptStore } from "../web/src/services/donation-attempt.js";
import {
  DonationDataValidationError,
  createDonationsDataService,
  normalizeDonationInput,
  validateDonationSubmissionGate
} from "../web/src/services/donations-data.js";

const PROJECT_ID = "demo-aufriends-local";
const HOST = "127.0.0.1";
const HUB_URL = `http://${HOST}:4400/emulators`;
const ADMIN = Object.freeze({
  uid: "local-admin-aufriends",
  email: "admin@aufriends.local",
  password: "AuFriendsLocal!2026"
});
const NON_ADMIN = Object.freeze({
  uid: "local-user-aufriends",
  email: "usuario@aufriends.local",
  password: "UsuarioLocal!2026"
});
const suffix = crypto.randomUUID().toLowerCase();
const donationId = `t10-donation-${suffix}`;
const invalidDonationId = `t10-invalid-${suffix}`;
const apps = [];
let passed = 0;
let failed = 0;

function requireLocalEnvironment() {
  for (const name of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
    if (process.env[name] && process.env[name] !== PROJECT_ID) {
      throw new Error(`${name} recusado: a verificação aceita somente ${PROJECT_ID}.`);
    }
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_CONFIG) {
    throw new Error("Verificação recusada: credencial ou configuração Firebase externa detectada.");
  }
}

async function requireOfficialEmulators() {
  const response = await fetch(HUB_URL, { signal: AbortSignal.timeout(3_000) });
  if (!response.ok) throw new Error(`Hub local indisponível (${response.status}).`);
  const running = await response.json();
  for (const [name, port] of Object.entries({ auth: 9099, firestore: 8080 })) {
    if (running[name]?.host !== HOST || running[name]?.port !== port) {
      throw new Error(`Emulador ${name} recusado: esperado somente ${HOST}:${port}.`);
    }
  }
}

function createClient(name, withAuth = false) {
  const app = initializeApp({ apiKey: PROJECT_ID, projectId: PROJECT_ID }, `t10-${name}-${suffix}`);
  apps.push(app);
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, HOST, 8080);
  if (!withAuth) return { app, firestore, auth: null };
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true });
  return { app, firestore, auth };
}

function validInput(overrides = {}) {
  return {
    fullName: "Pessoa Doadora Local",
    email: "doador.t10@aufriends.local",
    phoneE164: "(17) 99999-1000",
    type: "food",
    amountOrQuantity: "Dois sacos de ração",
    deliveryMethod: "dropoff",
    message: "Registro fictício criado somente durante a verificação local.",
    privacyConsent: true,
    ...overrides
  };
}

function currentDocument(snapshot) {
  assert.equal(snapshot.exists(), true);
  return Object.freeze({ id: snapshot.id, ...snapshot.data() });
}

function isDenied(error) {
  return /permission-denied/i.test(String(error?.code ?? error?.message));
}

async function expectDenied(operation) {
  await assert.rejects(operation, isDenied);
}

async function scenario(label, action) {
  try {
    await action();
    passed += 1;
    console.log(`PASSOU: ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`FALHOU: ${label}`);
    console.error(error?.stack ?? error);
  }
}

requireLocalEnvironment();
await requireOfficialEmulators();

const admin = createClient("admin", true);
const nonAdmin = createClient("non-admin", true);
const publicClient = createClient("public");
const adminService = createDonationsDataService(admin.firestore);
const nonAdminService = createDonationsDataService(nonAdmin.firestore);
const publicService = createDonationsDataService(publicClient.firestore);

try {
  await Promise.all([
    setPersistence(admin.auth, inMemoryPersistence),
    setPersistence(nonAdmin.auth, inMemoryPersistence)
  ]);
  const [adminCredential, nonAdminCredential] = await Promise.all([
    signInWithEmailAndPassword(admin.auth, ADMIN.email, ADMIN.password),
    signInWithEmailAndPassword(nonAdmin.auth, NON_ADMIN.email, NON_ADMIN.password)
  ]);
  assert.equal(adminCredential.user.uid, ADMIN.uid);
  assert.equal(nonAdminCredential.user.uid, NON_ADMIN.uid);

  await scenario("normaliza telefone opcional e aplica honeypot e tempo mínimo", async () => {
    const normalized = normalizeDonationInput(validInput());
    assert.equal(normalized.valid, true);
    assert.equal(normalized.values.phoneE164, "+5517999991000");
    assert.equal(normalizeDonationInput(validInput({ phoneE164: "" })).values.phoneE164, "");
    assert.equal(validateDonationSubmissionGate({ elapsedMs: 100 }).reason, "too-fast");
    assert.equal(validateDonationSubmissionGate({ elapsedMs: 2_000, honeypot: "bot" }).bot, true);
    assert.equal(validateDonationSubmissionGate({ elapsedMs: 2_000 }).allowed, true);
  });

  await scenario("ID da tentativa persiste e bloqueia repetição na sessão", async () => {
    const memory = new Map();
    const session = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value)
    };
    const fixedId = `t10-attempt-${suffix}`;
    const first = createDonationAttemptStore(session, () => fixedId);
    first.markCompleted();
    const restored = createDonationAttemptStore(session, () => "unused");
    assert.deepEqual(restored.current, { id: fixedId, completed: true });
  });

  await scenario("HTML usa enums contratuais, antispam e nenhum formulário estático", async () => {
    const html = readFileSync("web/doacoes/index.html", "utf8");
    for (const value of [
      "money", "food", "hygiene", "clothing", "blanket", "other",
      "dropoff", "pickup", "arrange"
    ]) {
      assert.ok(html.includes(`value="${value}"`));
    }
    assert.ok(html.includes("data-donation-form"));
    assert.ok(html.includes('name="website"'));
    assert.ok(html.includes('name="privacyConsent"'));
    assert.equal(html.includes("data-static-form"), false);
    assert.equal(/comprovante|upload|chave pix/i.test(html), false);
  });

  await scenario("visitante persiste payload exato com timestamps do servidor", async () => {
    await publicService.submitDonation(donationId, validInput());
    const donation = currentDocument(await getDocFromServer(doc(admin.firestore, "donations", donationId)));
    assert.deepEqual(Object.keys(donation).sort(), [
      "adminNotes", "amountOrQuantity", "createdAt", "deliveryMethod", "email", "fullName",
      "handledBy", "id", "message", "phoneE164", "privacyConsent", "schemaVersion", "status",
      "type", "updatedAt"
    ].sort());
    assert.equal(donation.schemaVersion, 1);
    assert.equal(donation.status, "received");
    assert.equal(donation.adminNotes, "");
    assert.equal(donation.handledBy, null);
    assert.equal(donation.phoneE164, "+5517999991000");
    assert.ok(donation.createdAt?.toMillis() > 0);
    assert.ok(donation.updatedAt?.toMillis() > 0);
  });

  await scenario("mesma tentativa não pode ser sobrescrita", async () => {
    await expectDenied(publicService.submitDonation(donationId, validInput()));
  });

  await scenario("entrada inválida é rejeitada sem escrita", async () => {
    const invalid = normalizeDonationInput(validInput({
      email: "inválido",
      type: "pix",
      deliveryMethod: "transfer",
      privacyConsent: false
    }));
    assert.equal(invalid.valid, false);
    await assert.rejects(
      publicService.submitDonation(invalidDonationId, invalid.values),
      DonationDataValidationError
    );
    assert.equal((await getDocFromServer(doc(admin.firestore, "donations", invalidDonationId))).exists(), false);
  });

  await scenario("visitante não lê, edita ou exclui doação", async () => {
    const reference = doc(publicClient.firestore, "donations", donationId);
    await expectDenied(getDocFromServer(reference));
    await expectDenied(updateDoc(reference, { status: "contacting", updatedAt: serverTimestamp() }));
    await expectDenied(deleteDoc(reference));
  });

  await scenario("usuário autenticado não admin permanece negado", async () => {
    let donation = currentDocument(await getDocFromServer(doc(admin.firestore, "donations", donationId)));
    await expectDenied(nonAdminService.listAdminDonations());
    await expectDenied(nonAdminService.updateDonation(NON_ADMIN.uid, donation, {
      status: "contacting",
      adminNotes: "Tentativa negada"
    }));
    await expectDenied(nonAdminService.deleteDonation(NON_ADMIN.uid, donationId));
  });

  await scenario("administrador lista tudo e filtra estado recebido", async () => {
    const [all, received] = await Promise.all([
      adminService.listAdminDonations(),
      adminService.listAdminDonations("received")
    ]);
    assert.ok(all.some(({ id }) => id === donationId));
    assert.ok(received.some(({ id }) => id === donationId));
  });

  await scenario("administrador avança received para contacting com nota e responsável", async () => {
    let donation = currentDocument(await getDocFromServer(doc(admin.firestore, "donations", donationId)));
    await adminService.updateDonation(ADMIN.uid, donation, {
      status: "contacting",
      adminNotes: "Contato fictício iniciado."
    });
    donation = currentDocument(await getDocFromServer(doc(admin.firestore, "donations", donationId)));
    assert.equal(donation.status, "contacting");
    assert.equal(donation.adminNotes, "Contato fictício iniciado.");
    assert.equal(donation.handledBy, ADMIN.uid);
    assert.ok((await adminService.listAdminDonations("contacting")).some(({ id }) => id === donationId));
  });

  await scenario("administrador conclui doação pela transição permitida", async () => {
    let donation = currentDocument(await getDocFromServer(doc(admin.firestore, "donations", donationId)));
    await adminService.updateDonation(ADMIN.uid, donation, {
      status: "completed",
      adminNotes: "Doação fictícia concluída."
    });
    donation = currentDocument(await getDocFromServer(doc(admin.firestore, "donations", donationId)));
    assert.equal(donation.status, "completed");
    assert.equal(donation.handledBy, ADMIN.uid);
    assert.ok((await adminService.listAdminDonations("completed")).some(({ id }) => id === donationId));
  });

  await scenario("mesmo estado passa, salto é negado e completed reabre para contacting", async () => {
    let donation = currentDocument(await getDocFromServer(doc(admin.firestore, "donations", donationId)));
    await adminService.updateDonation(ADMIN.uid, donation, {
      status: "completed",
      adminNotes: "Nota fictícia revisada."
    });
    donation = currentDocument(await getDocFromServer(doc(admin.firestore, "donations", donationId)));
    assert.equal(donation.adminNotes, "Nota fictícia revisada.");
    await assert.rejects(
      adminService.updateDonation(ADMIN.uid, donation, { status: "received", adminNotes: "Salto" }),
      DonationDataValidationError
    );
    await expectDenied(updateDoc(doc(admin.firestore, "donations", donationId), {
      status: "received",
      adminNotes: "Salto negado",
      handledBy: ADMIN.uid,
      updatedAt: serverTimestamp()
    }));
    await adminService.updateDonation(ADMIN.uid, donation, {
      status: "contacting",
      adminNotes: "Doação fictícia reaberta."
    });
    donation = currentDocument(await getDocFromServer(doc(admin.firestore, "donations", donationId)));
    assert.equal(donation.status, "contacting");
    assert.ok((await adminService.listAdminDonations("contacting")).some(({ id }) => id === donationId));
  });

  await scenario("administrador exclui a intenção com sucesso", async () => {
    await adminService.deleteDonation(ADMIN.uid, donationId);
    assert.equal((await getDocFromServer(doc(admin.firestore, "donations", donationId))).exists(), false);
  });
} finally {
  const cleanupErrors = [];
  if (admin.auth.currentUser) {
    for (const id of [donationId, invalidDonationId]) {
      try {
        await deleteDoc(doc(admin.firestore, "donations", id));
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }
  await Promise.all([
    signOut(admin.auth).catch(() => {}),
    signOut(nonAdmin.auth).catch(() => {})
  ]);
  await Promise.all(apps.map((app) => deleteApp(app)));

  if (cleanupErrors.length === 0) {
    passed += 1;
    console.log("PASSOU: limpeza removeu todos os registros efêmeros T10.");
  } else {
    failed += 1;
    console.error(`FALHOU: limpeza encontrou ${cleanupErrors.length} erro(s).`);
  }
}

const total = passed + failed;
console.log(`Resultado T10: ${passed}/${total} cenários aprovados; ${failed} falhos.`);
console.log("Nenhuma fixture persistente de doação ou dado pessoal foi criada.");
if (failed > 0) process.exitCode = 1;
