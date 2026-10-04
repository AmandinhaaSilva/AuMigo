import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";

export const PROJECT_ID = "demo-aufriends-local";
export const FIRESTORE_HOST = "127.0.0.1";
export const FIRESTORE_PORT = 8080;
export const STORAGE_HOST = "127.0.0.1";
export const STORAGE_PORT = 9199;
export const STORAGE_BUCKET = `gs://${PROJECT_ID}.appspot.com`;

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

export async function createFirestoreTestEnvironment() {
  const rules = await readFile(`${projectRoot}firestore.rules`, "utf8");

  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
      rules
    }
  });
}

export async function createStorageTestEnvironment() {
  const [firestoreRules, storageRules] = await Promise.all([
    readFile(`${projectRoot}firestore.rules`, "utf8"),
    readFile(`${projectRoot}storage.rules`, "utf8")
  ]);

  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
      rules: firestoreRules
    },
    storage: {
      host: STORAGE_HOST,
      port: STORAGE_PORT,
      rules: storageRules
    }
  });
}

export async function seedFirestore(testEnvironment, documents) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await Promise.all(
      Object.entries(documents).map(([path, data]) => setDoc(doc(database, path), data))
    );
  });
}

export async function seedStorage(testEnvironment, objects) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const storage = context.storage(STORAGE_BUCKET);
    await Promise.all(
      objects.map(({ path, data, contentType }) =>
        uploadBytes(ref(storage, path), data, { contentType })
      )
    );
  });
}
