import { execFileSync } from "node:child_process";
import { T09_ANIMALS } from "./fixtures/adoptions-t09.mjs";
import { T11_PRODUCTS } from "./fixtures/products-t11.mjs";

const EXPECTED_PROJECT_ID = "memberverse-sfhf9";
const CONFIRMATION = "SEED_AUFRIENDS_PUBLIC_CATALOG";
const projectId = process.env.AUFRIENDS_PRODUCTION_PROJECT_ID;
const confirmation = process.env.AUFRIENDS_PRODUCTION_CONFIRM;

if (projectId !== EXPECTED_PROJECT_ID || confirmation !== CONFIRMATION) {
  throw new Error(
    `Seed remoto recusado. Informe AUFRIENDS_PRODUCTION_PROJECT_ID=${EXPECTED_PROJECT_ID} `
      + `e AUFRIENDS_PRODUCTION_CONFIRM=${CONFIRMATION}.`
  );
}

function firebaseAccessToken() {
  const executable = process.platform === "win32"
    ? (process.env.ComSpec ?? "cmd.exe")
    : "firebase";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "firebase login:list --json"]
    : ["login:list", "--json"];
  const output = execFileSync(executable, args, {
    encoding: "utf8",
    windowsHide: true
  });
  const login = JSON.parse(output);
  const token = login.result?.[0]?.tokens?.access_token;
  if (!token) throw new Error("Firebase CLI não possui uma sessão autenticada válida.");
  return token;
}

function firestoreValue(value) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (Number.isSafeInteger(value)) return { integerValue: String(value) };
  if (value === null) return { nullValue: null };
  throw new TypeError(`Tipo de campo não suportado pelo seed: ${typeof value}`);
}

function firestoreFields(record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      ["createdAt", "updatedAt"].includes(key)
        ? { timestampValue: value }
        : firestoreValue(value)
    ])
  );
}

const token = firebaseAccessToken();
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const headers = Object.freeze({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json"
});
const now = new Date().toISOString();

async function existingCreatedAt(collectionName, documentId) {
  const response = await fetch(`${baseUrl}/${collectionName}/${documentId}`, { headers });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Falha ao consultar ${collectionName}/${documentId}: HTTP ${response.status}.`);
  }
  const document = await response.json();
  return document.fields?.createdAt?.timestampValue ?? null;
}

async function putDocument(collectionName, documentId, record) {
  const fields = firestoreFields(record);
  const response = await fetch(`${baseUrl}/${collectionName}/${documentId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ fields })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Falha ao gravar ${collectionName}/${documentId}: HTTP ${response.status} ${body.slice(0, 300)}`
    );
  }
}

for (const animal of T09_ANIMALS) {
  await putDocument("animals", animal.id, {
    schemaVersion: 1,
    name: animal.name,
    species: animal.species,
    breed: animal.breed,
    ageMonths: animal.ageMonths,
    sex: animal.sex,
    size: animal.size,
    color: animal.color,
    description: animal.description,
    adoptionStatus: "available",
    published: true,
    sortOrder: animal.sortOrder,
    imagePath: animal.imagePath,
    imageAlt: animal.imageAlt,
    createdAt: await existingCreatedAt("animals", animal.id) ?? now,
    updatedAt: now,
    updatedBy: "system-bootstrap"
  });
}

for (const product of T11_PRODUCTS) {
  await putDocument("products", product.id, {
    schemaVersion: 1,
    name: product.name,
    description: product.description,
    category: product.category,
    priceCents: product.priceCents,
    compareAtPriceCents: product.compareAtPriceCents,
    badge: product.badge,
    active: true,
    sortOrder: product.sortOrder,
    imagePath: product.imagePath,
    imageAlt: product.imageAlt,
    createdAt: await existingCreatedAt("products", product.id) ?? now,
    updatedAt: now,
    updatedBy: "system-bootstrap"
  });
}

await putDocument("siteSettings", "public", {
  schemaVersion: 1,
  brandName: "AuFriends",
  whatsappDigits: "5517991529090",
  whatsappGreeting: "Olá! Quero finalizar meu pedido com a equipe AuFriends.",
  updatedAt: now,
  updatedBy: "system-bootstrap"
});

console.log(
  `Seed remoto concluído em ${projectId}: ${T09_ANIMALS.length} animais, `
    + `${T11_PRODUCTS.length} produtos e siteSettings/public. Nenhuma coleção foi apagada.`
);
