import assert from "node:assert/strict";
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
import {
  connectStorageEmulator,
  deleteObject,
  getMetadata,
  getStorage,
  ref,
  uploadBytes
} from "firebase/storage";
import { createAdoptionAttemptStore } from "../web/src/services/adoption-attempt.js";
import {
  AdoptionDataValidationError,
  createAdoptionsDataService,
  filterPublicAnimals,
  normalizeAdoptionRequest,
  normalizeAnimalInput,
  validateImageFile,
  validateSubmissionGate
} from "../web/src/services/adoptions-data.js";

const PROJECT_ID = "demo-aufriends-local";
const HOST = "127.0.0.1";
const HUB_URL = `http://${HOST}:4400/emulators`;
const BUCKET = `${PROJECT_ID}.appspot.com`;
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
const requestId = `t09-request-${suffix}`;
const invalidRequestId = `t09-invalid-${suffix}`;
const deniedImagePath = `public/animals/t09-denied-${suffix}/${crypto.randomUUID().toLowerCase()}.png`;
const temporaryPaths = new Set([deniedImagePath]);
const apps = [];
let temporaryAnimal = null;
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
  for (const [name, port] of Object.entries({ auth: 9099, firestore: 8080, storage: 9199 })) {
    if (running[name]?.host !== HOST || running[name]?.port !== port) {
      throw new Error(`Emulador ${name} recusado: esperado somente ${HOST}:${port}.`);
    }
  }
}

function createClient(name, withAuth = false) {
  const app = initializeApp({
    apiKey: PROJECT_ID,
    projectId: PROJECT_ID,
    storageBucket: BUCKET
  }, `t09-${name}-${suffix}`);
  apps.push(app);
  const firestore = getFirestore(app);
  const storage = getStorage(app);
  connectFirestoreEmulator(firestore, HOST, 8080);
  connectStorageEmulator(storage, HOST, 9199);
  if (!withAuth) return { app, firestore, storage, auth: null };
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true });
  return { app, firestore, storage, auth };
}

function testFile(contentType, name, bytes) {
  const content = Uint8Array.from(bytes);
  return Object.freeze({
    name,
    type: contentType,
    size: content.byteLength,
    async arrayBuffer() {
      return content.slice().buffer;
    }
  });
}

function validAnimalInput(overrides = {}) {
  return {
    name: "Animal temporário T09",
    species: "dog",
    breed: "Sem raça definida",
    ageMonths: 24,
    sex: "female",
    size: "medium",
    color: "Caramelo",
    description: "Perfil temporário criado exclusivamente pela verificação automatizada T09.",
    adoptionStatus: "available",
    published: true,
    sortOrder: 9_900,
    imageAlt: "Animal temporário da verificação T09",
    ...overrides
  };
}

function validRequestInput(overrides = {}) {
  return {
    fullName: "Pessoa Teste Local",
    email: "pessoa.t09@aufriends.local",
    phoneE164: "(17) 99999-0000",
    city: "São José do Rio Preto",
    state: "sp",
    message: "Contato fictício criado somente durante a verificação local.",
    privacyConsent: true,
    ...overrides
  };
}

function currentDocument(snapshot) {
  assert.equal(snapshot.exists(), true);
  return Object.freeze({ id: snapshot.id, ...snapshot.data() });
}

function isDenied(error) {
  return /permission-denied|unauthorized/i.test(String(error?.code ?? error?.message));
}

function isMissingObject(error) {
  return /object-not-found/i.test(String(error?.code ?? error?.message));
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

async function removeIfPresent(operation) {
  try {
    await operation();
  } catch (error) {
    if (!isMissingObject(error)) throw error;
  }
}

requireLocalEnvironment();
await requireOfficialEmulators();

const admin = createClient("admin", true);
const nonAdmin = createClient("non-admin", true);
const publicClient = createClient("public");
const adminService = createAdoptionsDataService(admin.firestore, admin.storage);
const nonAdminService = createAdoptionsDataService(nonAdmin.firestore, nonAdmin.storage);
const publicService = createAdoptionsDataService(publicClient.firestore, publicClient.storage);
const firstImage = testFile("image/png", "animal.png", [137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const replacementImage = testFile("image/webp", "animal.webp", [82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);

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

  await scenario("normaliza telefone/UF e aplica honeypot e tempo mínimo", async () => {
    const normalized = normalizeAdoptionRequest(validRequestInput());
    assert.equal(normalized.valid, true);
    assert.equal(normalized.values.phoneE164, "+5517999990000");
    assert.equal(normalized.values.state, "SP");
    assert.deepEqual(validateSubmissionGate({ elapsedMs: 100 }).reason, "too-fast");
    assert.equal(validateSubmissionGate({ elapsedMs: 2_000, honeypot: "bot" }).bot, true);
    assert.equal(validateSubmissionGate({ elapsedMs: 2_000 }).allowed, true);
  });

  await scenario("ID da tentativa persiste e bloqueia reenvio na sessão", async () => {
    const memory = new Map();
    const session = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value)
    };
    const fixedId = `t09-attempt-${suffix}`;
    const first = createAdoptionAttemptStore(session, "t09-animal", () => fixedId);
    assert.equal(first.current.id, fixedId);
    first.markCompleted();
    const restored = createAdoptionAttemptStore(session, "t09-animal", () => "never-used");
    assert.deepEqual(restored.current, { id: fixedId, completed: true });
  });

  await scenario("valida cadastro e rejeita arquivo fora do contrato antes da escrita", async () => {
    assert.equal(normalizeAnimalInput(validAnimalInput()).valid, true);
    assert.equal(normalizeAnimalInput(validAnimalInput({ name: "" })).valid, false);
    assert.equal(validateImageFile(testFile("image/svg+xml", "animal.svg", [1])).valid, false);
    assert.equal(validateImageFile({ type: "image/png", size: 5 * 1024 * 1024 + 1 }).valid, false);
  });

  await scenario("administrador cria animal com documento e imagem válidos", async () => {
    const created = await adminService.saveAnimal(ADMIN.uid, validAnimalInput(), { imageFile: firstImage });
    temporaryPaths.add(created.imagePath);
    const snapshot = await getDocFromServer(doc(admin.firestore, "animals", created.id));
    temporaryAnimal = currentDocument(snapshot);
    assert.equal(temporaryAnimal.schemaVersion, 1);
    assert.equal(temporaryAnimal.updatedBy, ADMIN.uid);
    assert.equal(temporaryAnimal.imagePath, created.imagePath);
  });

  await scenario("mídia do catálogo é publicamente legível com MIME correto", async () => {
    const metadata = await getMetadata(ref(publicClient.storage, temporaryAnimal.imagePath));
    assert.equal(metadata.contentType, "image/png");
  });

  await scenario("consulta pública retorna somente publicados/disponíveis e filtros reais", async () => {
    const listed = await publicService.listPublicAnimals();
    assert.ok(listed.some((animal) => animal.id === temporaryAnimal.id));
    assert.ok(listed.every((animal) => animal.published && animal.adoptionStatus === "available"));
    assert.deepEqual(
      filterPublicAnimals([temporaryAnimal], { sex: "female", size: "medium", age: "adult" }).map(({ id }) => id),
      [temporaryAnimal.id]
    );
    assert.equal(filterPublicAnimals([temporaryAnimal], { sex: "male" }).length, 0);
  });

  await scenario("detalhe resolve ID seguro sem fallback silencioso", async () => {
    const loaded = await publicService.getPublicAnimal(temporaryAnimal.id);
    assert.equal(loaded.id, temporaryAnimal.id);
    await assert.rejects(
      publicService.getPublicAnimal("../../luna"),
      AdoptionDataValidationError
    );
  });

  await scenario("animal oculto deixa de ser legível e volta ao ser publicado", async () => {
    await adminService.setAnimalPublished(ADMIN.uid, temporaryAnimal, false);
    assert.equal(await publicService.getPublicAnimal(temporaryAnimal.id), null);
    assert.equal((await publicService.listPublicAnimals()).some(({ id }) => id === temporaryAnimal.id), false);
    let snapshot = await getDocFromServer(doc(admin.firestore, "animals", temporaryAnimal.id));
    temporaryAnimal = currentDocument(snapshot);
    await adminService.setAnimalPublished(ADMIN.uid, temporaryAnimal, true);
    snapshot = await getDocFromServer(doc(admin.firestore, "animals", temporaryAnimal.id));
    temporaryAnimal = currentDocument(snapshot);
  });

  await scenario("transições de animal válidas passam e salto inválido é negado", async () => {
    await expectDenied(updateDoc(doc(admin.firestore, "animals", temporaryAnimal.id), {
      adoptionStatus: "adopted",
      updatedAt: serverTimestamp(),
      updatedBy: ADMIN.uid
    }));
    await adminService.setAnimalStatus(ADMIN.uid, temporaryAnimal, "in_process");
    temporaryAnimal = currentDocument(await getDocFromServer(doc(admin.firestore, "animals", temporaryAnimal.id)));
    await adminService.setAnimalStatus(ADMIN.uid, temporaryAnimal, "adopted");
    temporaryAnimal = currentDocument(await getDocFromServer(doc(admin.firestore, "animals", temporaryAnimal.id)));
    await adminService.setAnimalStatus(ADMIN.uid, temporaryAnimal, "available");
    temporaryAnimal = currentDocument(await getDocFromServer(doc(admin.firestore, "animals", temporaryAnimal.id)));
    assert.equal(temporaryAnimal.adoptionStatus, "available");
  });

  await scenario("visitante cria solicitação com payload exato e timestamps do servidor", async () => {
    await publicService.submitAdoptionRequest(requestId, temporaryAnimal.id, validRequestInput());
    const request = currentDocument(await getDocFromServer(doc(admin.firestore, "adoptionRequests", requestId)));
    assert.deepEqual(Object.keys(request).sort(), [
      "adminNotes", "animalId", "city", "createdAt", "email", "fullName", "handledBy", "id",
      "message", "phoneE164", "privacyConsent", "schemaVersion", "state", "status", "updatedAt"
    ].sort());
    assert.equal(request.status, "pending");
    assert.equal(request.adminNotes, "");
    assert.equal(request.handledBy, null);
    assert.equal(request.phoneE164, "+5517999990000");
    assert.ok(request.createdAt?.toMillis() > 0);
  });

  await scenario("público não lê nem sobrescreve a mesma tentativa", async () => {
    await expectDenied(getDocFromServer(doc(publicClient.firestore, "adoptionRequests", requestId)));
    await expectDenied(publicService.submitAdoptionRequest(requestId, temporaryAnimal.id, validRequestInput()));
  });

  await scenario("submissão inválida não cria documento", async () => {
    await assert.rejects(
      publicService.submitAdoptionRequest(
        invalidRequestId,
        temporaryAnimal.id,
        validRequestInput({ email: "inválido", privacyConsent: false })
      ),
      AdoptionDataValidationError
    );
    assert.equal((await getDocFromServer(doc(admin.firestore, "adoptionRequests", invalidRequestId))).exists(), false);
  });

  await scenario("usuário autenticado não admin não recebe operações administrativas", async () => {
    await expectDenied(nonAdminService.listAdminAnimals());
    await expectDenied(nonAdminService.setAnimalPublished(NON_ADMIN.uid, temporaryAnimal, false));
    await expectDenied(uploadBytes(
      ref(nonAdmin.storage, deniedImagePath),
      new Uint8Array([1, 2, 3]),
      { contentType: "image/png" }
    ));
  });

  await scenario("painel lista solicitação pelo filtro contratual", async () => {
    const pending = await adminService.listAdminAdoptionRequests("pending");
    const request = pending.find(({ id }) => id === requestId);
    assert.ok(request);
    assert.equal(request.animalId, temporaryAnimal.id);
    assert.equal(request.fullName, "Pessoa Teste Local");
  });

  await scenario("administrador trata somente por transições e campos permitidos", async () => {
    let request = currentDocument(await getDocFromServer(doc(admin.firestore, "adoptionRequests", requestId)));
    await assert.rejects(
      adminService.updateAdoptionRequest(ADMIN.uid, request, { status: "approved", adminNotes: "Salto" }),
      AdoptionDataValidationError
    );
    await adminService.updateAdoptionRequest(ADMIN.uid, request, {
      status: "contacting",
      adminNotes: "Contato local iniciado."
    });
    request = currentDocument(await getDocFromServer(doc(admin.firestore, "adoptionRequests", requestId)));
    assert.equal(request.handledBy, ADMIN.uid);
    await adminService.updateAdoptionRequest(ADMIN.uid, request, {
      status: "approved",
      adminNotes: "Solicitação local aprovada."
    });
    request = currentDocument(await getDocFromServer(doc(admin.firestore, "adoptionRequests", requestId)));
    assert.equal(request.status, "approved");
    await expectDenied(updateDoc(doc(admin.firestore, "adoptionRequests", requestId), {
      status: "pending",
      adminNotes: "Tentativa negada",
      handledBy: ADMIN.uid,
      updatedAt: serverTimestamp()
    }));
  });

  await scenario("substitui imagem somente após salvar documento e limpa a anterior", async () => {
    const previousPath = temporaryAnimal.imagePath;
    const outcome = await adminService.saveAnimal(ADMIN.uid, validAnimalInput({ name: "Animal temporário editado" }), {
      current: temporaryAnimal,
      imageFile: replacementImage
    });
    temporaryPaths.add(outcome.imagePath);
    temporaryAnimal = currentDocument(await getDocFromServer(doc(admin.firestore, "animals", temporaryAnimal.id)));
    assert.notEqual(temporaryAnimal.imagePath, previousPath);
    assert.equal(temporaryAnimal.imagePath, outcome.imagePath);
    await assert.rejects(getMetadata(ref(admin.storage, previousPath)), isMissingObject);
    assert.equal((await getMetadata(ref(publicClient.storage, outcome.imagePath))).contentType, "image/webp");
  });

  await scenario("exclusão confirmável remove solicitação, animal e mídia", async () => {
    await adminService.deleteAdoptionRequest(ADMIN.uid, requestId);
    const outcome = await adminService.deleteAnimal(ADMIN.uid, temporaryAnimal);
    assert.equal(outcome.warning, null);
    assert.equal((await getDocFromServer(doc(admin.firestore, "adoptionRequests", requestId))).exists(), false);
    assert.equal((await getDocFromServer(doc(admin.firestore, "animals", temporaryAnimal.id))).exists(), false);
    await assert.rejects(getMetadata(ref(admin.storage, temporaryAnimal.imagePath)), isMissingObject);
    temporaryAnimal = null;
  });
} finally {
  const cleanupErrors = [];
  if (admin.auth.currentUser) {
    for (const id of [requestId, invalidRequestId]) {
      try {
        await deleteDoc(doc(admin.firestore, "adoptionRequests", id));
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (temporaryAnimal?.id) {
      try {
        await deleteDoc(doc(admin.firestore, "animals", temporaryAnimal.id));
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    for (const path of temporaryPaths) {
      try {
        await removeIfPresent(() => deleteObject(ref(admin.storage, path)));
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

  if (cleanupErrors.length > 0) {
    failed += 1;
    console.error(`FALHOU: limpeza encontrou ${cleanupErrors.length} erro(s).`);
  } else {
    passed += 1;
    console.log("PASSOU: limpeza removeu os dados e mídias temporários.");
  }
}

const total = passed + failed;
console.log(`Resultado T09: ${passed}/${total} cenários aprovados; ${failed} falhos.`);
console.log("Dados fixos da fixture T09 foram preservados; somente IDs efêmeros do verificador foram removidos.");
if (failed > 0) process.exitCode = 1;
