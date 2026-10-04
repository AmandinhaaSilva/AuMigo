import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  cert,
  deleteApp as deleteAdminApp,
  initializeApp as initializeAdminApp
} from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import {
  getFirestore as getAdminFirestore,
  Timestamp
} from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  connectStorageEmulator,
  getBytes,
  getMetadata,
  getStorage,
  ref
} from "firebase/storage";
import { T07_USERS } from "./fixtures/admin-auth.mjs";
import { T09_ANIMALS } from "./fixtures/adoptions-t09.mjs";
import {
  LOCAL_FIREBASE_CONFIG,
  LOCAL_HOST,
  LOCAL_PORTS,
  LOCAL_PROJECT_ID,
  configureAdminEmulatorEnvironment,
  preflightLocalEmulators
} from "./fixtures/local-emulator-environment.mjs";
import { T11_PRODUCTS } from "./fixtures/products-t11.mjs";
import { T12_SITE_SETTINGS } from "./fixtures/site-settings.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const seedScript = resolve(projectRoot, "scripts/seed-emulators.mjs");
const runId = randomUUID().toLowerCase();
const sentinelId = `t12-preserve-${runId}`;
const results = [];
let sentinelCreated = false;
let firstState = null;
let secondState = null;

function localCredential() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2_048 });
  return cert({
    projectId: LOCAL_PROJECT_ID,
    clientEmail: `verify-t12@${LOCAL_PROJECT_ID}.iam.gserviceaccount.com`,
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" })
  });
}

async function scenario(name, action) {
  try {
    await action();
    results.push({ name, state: "PASSOU" });
  } catch (error) {
    results.push({ name, state: "FALHOU", detail: error?.message ?? String(error) });
  }
}

function runSeed(extraEnvironment = {}) {
  return spawnSync(process.execPath, [seedScript], {
    cwd: projectRoot,
    env: { ...process.env, ...extraEnvironment },
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024
  });
}

function assertSeedPassed(outcome, label) {
  if (outcome.error) throw outcome.error;
  const output = `${outcome.stdout ?? ""}\n${outcome.stderr ?? ""}`;
  assert.equal(outcome.status, 0, `${label} falhou: ${output.trim()}`);
  assert.match(output, /Preflight confirmado: demo-aufriends-local/);
  assert.match(output, /Seed local concluído/);
}

function timestampMillis(data, field, label) {
  const value = data?.[field];
  assert.equal(typeof value?.toMillis, "function", `${label}.${field} não é timestamp.`);
  return value.toMillis();
}

function documents(snapshot) {
  return new Map(snapshot.docs.map((item) => [item.id, item.data()]));
}

async function captureState(auth, firestore) {
  const [users, admins, settings, animals, products, requests, donations] = await Promise.all([
    auth.listUsers(1_000),
    firestore.collection("admins").get(),
    firestore.collection("siteSettings").doc("public").get(),
    firestore.collection("animals").get(),
    firestore.collection("products").get(),
    firestore.collection("adoptionRequests").get(),
    firestore.collection("donations").get()
  ]);
  return Object.freeze({
    users: Object.freeze(users.users),
    admins: documents(admins),
    settings: settings.exists ? settings.data() : null,
    animals: documents(animals),
    products: documents(products),
    requestCount: requests.size,
    donationCount: donations.size
  });
}

function assertDocumentFields(actual, expected, fields, label) {
  assert.ok(actual, `${label} ausente.`);
  for (const field of fields) {
    assert.deepEqual(actual[field], expected[field], `${label}.${field} divergente.`);
  }
  timestampMillis(actual, "createdAt", label);
  timestampMillis(actual, "updatedAt", label);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const preflight = await preflightLocalEmulators();
configureAdminEmulatorEnvironment(preflight);
const adminApp = initializeAdminApp(
  { projectId: LOCAL_PROJECT_ID, credential: localCredential() },
  `t12-verifier-${runId}`
);
const privilegedAuth = getAdminAuth(adminApp);
const privilegedFirestore = getAdminFirestore(adminApp);
const sentinelReference = privilegedFirestore.collection("products").doc(sentinelId);
const clientApp = initializeApp(LOCAL_FIREBASE_CONFIG, `t12-client-${runId}`);
const clientAuth = getAuth(clientApp);
const clientStorage = getStorage(clientApp);
connectAuthEmulator(clientAuth, `http://${LOCAL_HOST}:${LOCAL_PORTS.auth}`, {
  disableWarnings: true
});
connectStorageEmulator(clientStorage, LOCAL_HOST, LOCAL_PORTS.storage);

try {
  await scenario("preflight confirma projeto, Hub e três emuladores nos endpoints oficiais", async () => {
    assert.equal(preflight.projectId, LOCAL_PROJECT_ID);
    assert.equal(preflight.host, LOCAL_HOST);
    assert.deepEqual(
      {
        auth: preflight.ports.auth,
        firestore: preflight.ports.firestore,
        storage: preflight.ports.storage,
        hub: preflight.ports.hub
      },
      { auth: 9099, firestore: 8080, storage: 9199, hub: 4400 }
    );
  });

  await scenario("estado aceito inicia sem submissões e recebe sentinela não destrutiva", async () => {
    const before = await captureState(privilegedAuth, privilegedFirestore);
    assert.equal(before.requestCount, 0);
    assert.equal(before.donationCount, 0);
    await sentinelReference.set({
      schemaVersion: 1,
      name: "Produto desconhecido preservado T12",
      description: "Sentinela sem dados pessoais usada somente durante a verificação local.",
      category: "toys",
      priceCents: 123,
      compareAtPriceCents: null,
      badge: "",
      active: false,
      sortOrder: 99_999,
      imagePath: `public/products/${sentinelId}/12000000-0000-4000-8000-000000000012.png`,
      imageAlt: "Sentinela local T12",
      createdAt: Timestamp.fromDate(new Date("2026-10-03T12:00:00.000Z")),
      updatedAt: Timestamp.fromDate(new Date("2026-10-03T12:00:00.000Z")),
      updatedBy: "verifier-t12"
    }, { merge: false });
    sentinelCreated = true;
  });

  await scenario("primeira execução do seed conclui o baseline sem reset", async () => {
    const outcome = runSeed();
    assertSeedPassed(outcome, "Primeira execução");
    firstState = await captureState(privilegedAuth, privilegedFirestore);
    assert.equal(firstState.products.has(sentinelId), true);
  });

  await scenario("segunda execução é idempotente e não duplica IDs", async () => {
    const outcome = runSeed();
    assertSeedPassed(outcome, "Segunda execução");
    secondState = await captureState(privilegedAuth, privilegedFirestore);
    assert.equal(secondState.products.has(sentinelId), true);
    assert.deepEqual(
      [...secondState.animals.keys()].sort(),
      T09_ANIMALS.map(({ id }) => id).sort()
    );
    assert.deepEqual(
      [...secondState.products.keys()].sort(),
      [...T11_PRODUCTS.map(({ id }) => id), sentinelId].sort()
    );
  });

  await scenario("Auth contém somente duas contas fixas e criação permanece estável", async () => {
    const expectedUids = [T07_USERS.admin.uid, T07_USERS.nonAdmin.uid].sort();
    assert.deepEqual(firstState.users.map(({ uid }) => uid).sort(), expectedUids);
    assert.deepEqual(secondState.users.map(({ uid }) => uid).sort(), expectedUids);
    for (const expected of Object.values(T07_USERS)) {
      const first = firstState.users.find(({ uid }) => uid === expected.uid);
      const second = secondState.users.find(({ uid }) => uid === expected.uid);
      assert.equal(second.email, expected.email);
      assert.equal(second.displayName, expected.displayName);
      assert.equal(second.disabled, false);
      assert.equal(second.emailVerified, true);
      assert.equal(second.metadata.creationTime, first.metadata.creationTime);
    }

    const adminCredential = await signInWithEmailAndPassword(
      clientAuth,
      T07_USERS.admin.email,
      T07_USERS.admin.password
    );
    assert.equal(adminCredential.user.uid, T07_USERS.admin.uid);
    await signOut(clientAuth);
    const nonAdminCredential = await signInWithEmailAndPassword(
      clientAuth,
      T07_USERS.nonAdmin.email,
      T07_USERS.nonAdmin.password
    );
    assert.equal(nonAdminCredential.user.uid, T07_USERS.nonAdmin.uid);
    await signOut(clientAuth);
  });

  await scenario("admins contém somente o administrador baseline ativo e createdAt estável", async () => {
    assert.deepEqual([...firstState.admins.keys()], [T07_USERS.admin.uid]);
    assert.deepEqual([...secondState.admins.keys()], [T07_USERS.admin.uid]);
    const first = firstState.admins.get(T07_USERS.admin.uid);
    const second = secondState.admins.get(T07_USERS.admin.uid);
    assert.equal(second.schemaVersion, 1);
    assert.equal(second.displayName, T07_USERS.admin.displayName);
    assert.equal(second.email, T07_USERS.admin.email);
    assert.equal(second.active, true);
    assert.equal(
      timestampMillis(second, "createdAt", `admins/${T07_USERS.admin.uid}`),
      timestampMillis(first, "createdAt", `admins/${T07_USERS.admin.uid}`)
    );
  });

  await scenario("siteSettings/public contém marca, destino e saudação aceitos", async () => {
    const settings = secondState.settings;
    assert.ok(settings);
    assert.deepEqual(Object.keys(settings).sort(), [
      "brandName",
      "schemaVersion",
      "updatedAt",
      "updatedBy",
      "whatsappDigits",
      "whatsappGreeting"
    ].sort());
    for (const [field, expected] of Object.entries(T12_SITE_SETTINGS)) {
      assert.equal(settings[field], expected, `siteSettings/public.${field} divergente.`);
    }
    timestampMillis(settings, "updatedAt", "siteSettings/public");
  });

  await scenario("três animais fixos mantêm contrato e createdAt entre execuções", async () => {
    assert.equal(firstState.animals.size, T09_ANIMALS.length);
    assert.equal(secondState.animals.size, T09_ANIMALS.length);
    const fields = [
      "name", "species", "breed", "ageMonths", "sex", "size", "color",
      "description", "sortOrder", "imagePath", "imageAlt"
    ];
    for (const expected of T09_ANIMALS) {
      const first = firstState.animals.get(expected.id);
      const second = secondState.animals.get(expected.id);
      assertDocumentFields(second, expected, fields, `animals/${expected.id}`);
      assert.equal(second.schemaVersion, 1);
      assert.equal(second.adoptionStatus, "available");
      assert.equal(second.published, true);
      assert.equal(second.updatedBy, T07_USERS.admin.uid);
      assert.equal(
        timestampMillis(second, "createdAt", `animals/${expected.id}`),
        timestampMillis(first, "createdAt", `animals/${expected.id}`)
      );
    }
  });

  await scenario("sete produtos fixos mantêm contrato e createdAt entre execuções", async () => {
    const fields = [
      "name", "description", "category", "priceCents", "compareAtPriceCents",
      "badge", "sortOrder", "imagePath", "imageAlt"
    ];
    for (const expected of T11_PRODUCTS) {
      const first = firstState.products.get(expected.id);
      const second = secondState.products.get(expected.id);
      assertDocumentFields(second, expected, fields, `products/${expected.id}`);
      assert.equal(second.schemaVersion, 1);
      assert.equal(second.active, true);
      assert.equal(second.updatedBy, T07_USERS.admin.uid);
      assert.equal(
        timestampMillis(second, "createdAt", `products/${expected.id}`),
        timestampMillis(first, "createdAt", `products/${expected.id}`)
      );
    }
  });

  await scenario("dez mídias fixas correspondem byte a byte aos assets versionados", async () => {
    const expectedMedia = [
      ...T09_ANIMALS,
      ...T11_PRODUCTS
    ];
    assert.equal(new Set(expectedMedia.map(({ imagePath }) => imagePath)).size, 10);
    for (const item of expectedMedia) {
      const reference = ref(clientStorage, item.imagePath);
      const [stored, metadata, asset] = await Promise.all([
        getBytes(reference),
        getMetadata(reference),
        readFile(resolve(projectRoot, "web/assets/img", item.imageFile))
      ]);
      assert.equal(metadata.fullPath, item.imagePath);
      assert.equal(metadata.contentType, item.imageType);
      assert.equal(Number(metadata.size), asset.byteLength);
      assert.equal(sha256(Buffer.from(stored)), sha256(asset));
    }
  });

  await scenario("submissões continuam vazias e documento desconhecido é preservado", async () => {
    assert.equal(firstState.requestCount, 0);
    assert.equal(firstState.donationCount, 0);
    assert.equal(secondState.requestCount, 0);
    assert.equal(secondState.donationCount, 0);
    const sentinel = secondState.products.get(sentinelId);
    assert.equal(sentinel?.name, "Produto desconhecido preservado T12");
    assert.equal(sentinel?.active, false);
  });

  await scenario("credencial, configuração, projeto e host remotos são recusados antes da escrita", async () => {
    const attempts = [
      { GOOGLE_APPLICATION_CREDENTIALS: "C:\\fixture-remota\\service-account.json" },
      { FIREBASE_CONFIG: JSON.stringify({ projectId: "remote-production" }) },
      { GCLOUD_PROJECT: "remote-production" },
      { FIREBASE_AUTH_EMULATOR_HOST: "remote.example:9099" }
    ];
    for (const environment of attempts) {
      const outcome = runSeed(environment);
      const output = `${outcome.stdout ?? ""}\n${outcome.stderr ?? ""}`;
      assert.notEqual(outcome.status, 0, "Ambiente remoto não foi recusado.");
      assert.match(output, /recusado/i);
    }
    const after = await captureState(privilegedAuth, privilegedFirestore);
    assert.equal(after.products.has(sentinelId), true);
    for (const animal of T09_ANIMALS) {
      assert.equal(
        timestampMillis(after.animals.get(animal.id), "createdAt", `animals/${animal.id}`),
        timestampMillis(secondState.animals.get(animal.id), "createdAt", `animals/${animal.id}`)
      );
    }
  });

  await scenario("comando único preserva fixtures antigas e não contém reset, SQL ou deploy", async () => {
    const packageData = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));
    const seedSource = readFileSync(seedScript, "utf8");
    const fixtureSources = [
      "scripts/fixtures/admin-auth.mjs",
      "scripts/fixtures/adoptions-t09.mjs",
      "scripts/fixtures/products-t11.mjs",
      "scripts/fixtures/site-settings.mjs"
    ].map((file) => readFileSync(resolve(projectRoot, file), "utf8")).join("\n");
    assert.equal(packageData.scripts["seed:emulators"], "node scripts/seed-emulators.mjs");
    assert.equal(packageData.scripts["fixtures:auth"], "node scripts/fixtures/admin-auth.mjs");
    assert.equal(packageData.scripts["fixtures:adoptions"], "node scripts/fixtures/adoptions-t09.mjs");
    assert.equal(packageData.scripts["fixtures:products"], "node scripts/fixtures/products-t11.mjs");
    assert.match(seedSource, /removeKnownNonAdminAuthorization:\s*false/);
    assert.match(seedSource, /removePreviousMedia:\s*false/g);
    assert.doesNotMatch(seedSource, /\.delete\s*\(|deleteObject|firebase\s+deploy|firebase\s+login/i);
    assert.doesNotMatch(fixtureSources, /readFile\([^\n]*(?:\.sql|banco|mysql)/i);
  });
} finally {
  const cleanupProblems = [];
  if (sentinelCreated) {
    try {
      await sentinelReference.delete();
    } catch (error) {
      cleanupProblems.push(`sentinela: ${error.message}`);
    }
  }
  try {
    const finalState = await captureState(privilegedAuth, privilegedFirestore);
    if (finalState.products.size !== T11_PRODUCTS.length) {
      cleanupProblems.push(`produtos finais: ${finalState.products.size}`);
    }
    if (finalState.animals.size !== T09_ANIMALS.length) {
      cleanupProblems.push(`animais finais: ${finalState.animals.size}`);
    }
    if (finalState.requestCount !== 0 || finalState.donationCount !== 0) {
      cleanupProblems.push("submissões finais não estão vazias");
    }
    if (finalState.products.has(sentinelId)) {
      cleanupProblems.push("sentinela permaneceu no Firestore");
    }
  } catch (error) {
    cleanupProblems.push(`estado final: ${error.message}`);
  }

  results.push(cleanupProblems.length === 0
    ? { name: "limpeza remove sentinela e restaura o estado aceito", state: "PASSOU" }
    : {
        name: "limpeza remove sentinela e restaura o estado aceito",
        state: "FALHOU",
        detail: cleanupProblems.join("; ")
      });

  await signOut(clientAuth).catch(() => {});
  await deleteApp(clientApp);
  await deleteAdminApp(adminApp);
}

for (const result of results) {
  console.log(`${result.state}: ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
}
const failures = results.filter(({ state }) => state === "FALHOU");
console.log(`Resultado T12: ${results.length - failures.length}/${results.length} cenários aprovados; ${failures.length} falhos.`);
console.log("Estado esperado: 2 contas Auth, 1 admin ativo, 3 animais, 7 produtos, 10 mídias e zero submissões.");
if (failures.length > 0) process.exitCode = 1;
