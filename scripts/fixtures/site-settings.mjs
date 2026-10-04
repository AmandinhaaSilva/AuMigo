import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  getFirestore,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import { T07_USERS } from "./admin-auth.mjs";
import {
  LOCAL_FIREBASE_CONFIG,
  LOCAL_HOST,
  LOCAL_PORTS,
  LOCAL_PROJECT_ID,
  resolveLocalPreflight
} from "./local-emulator-environment.mjs";

export const T12_SITE_SETTINGS = Object.freeze({
  schemaVersion: 1,
  brandName: "AuFriends",
  whatsappDigits: "5517991529090",
  whatsappGreeting: "Olá! Quero finalizar meu pedido com a equipe AuFriends.",
  updatedBy: T07_USERS.admin.uid
});

export async function applySiteSettingsFixture({ preflight, quiet = false } = {}) {
  await resolveLocalPreflight(preflight);
  const app = initializeApp(
    LOCAL_FIREBASE_CONFIG,
    `t12-site-settings-fixture-${crypto.randomUUID()}`
  );
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  connectAuthEmulator(auth, `http://${LOCAL_HOST}:${LOCAL_PORTS.auth}`, {
    disableWarnings: true
  });
  connectFirestoreEmulator(firestore, LOCAL_HOST, LOCAL_PORTS.firestore);

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      T07_USERS.admin.email,
      T07_USERS.admin.password
    );
    if (credential.user.uid !== T07_USERS.admin.uid) {
      throw new Error("Conta administrativa local não corresponde ao UID fixo esperado.");
    }
    await setDoc(doc(firestore, "siteSettings", "public"), {
      ...T12_SITE_SETTINGS,
      updatedAt: serverTimestamp()
    }, { merge: false });

    if (!quiet) {
      console.log(
        `Fixture T12 de siteSettings/public aplicada em ${LOCAL_PROJECT_ID} para ${T12_SITE_SETTINGS.brandName}.`
      );
    }
    return T12_SITE_SETTINGS;
  } finally {
    await signOut(auth).catch(() => {});
    await deleteApp(app);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await applySiteSettingsFixture();
}
