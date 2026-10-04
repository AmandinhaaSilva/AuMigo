import { generateKeyPairSync, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  LOCAL_PROJECT_ID,
  configureAdminEmulatorEnvironment,
  resolveLocalPreflight
} from "./local-emulator-environment.mjs";

export const T07_LOCAL_TIMESTAMP = Timestamp.fromDate(
  new Date("2026-10-03T12:00:00.000Z")
);

export const T07_USERS = Object.freeze({
  admin: Object.freeze({
    uid: "local-admin-aufriends",
    displayName: "Admin AuFriends Local",
    email: "admin@aufriends.local",
    password: "AuFriendsLocal!2026"
  }),
  nonAdmin: Object.freeze({
    uid: "local-user-aufriends",
    displayName: "Usuário sem acesso local",
    email: "usuario@aufriends.local",
    password: "UsuarioLocal!2026"
  })
});

function localEmulatorCredential() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2_048 });
  return cert({
    projectId: LOCAL_PROJECT_ID,
    clientEmail: `fixture-local@${LOCAL_PROJECT_ID}.iam.gserviceaccount.com`,
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" })
  });
}

async function upsertUser(auth, user) {
  const properties = {
    email: user.email,
    password: user.password,
    displayName: user.displayName,
    emailVerified: true,
    disabled: false
  };
  try {
    await auth.updateUser(user.uid, properties);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    await auth.createUser({ uid: user.uid, ...properties });
  }
}

export async function applyAdminAuthFixture({
  preflight,
  removeKnownNonAdminAuthorization = true,
  deactivateKnownNonAdminAuthorization = false,
  quiet = false
} = {}) {
  const confirmed = await resolveLocalPreflight(preflight);
  configureAdminEmulatorEnvironment(confirmed);
  const app = initializeApp(
    { projectId: LOCAL_PROJECT_ID, credential: localEmulatorCredential() },
    `t07-local-auth-fixture-${randomUUID()}`
  );

  try {
    const auth = getAuth(app);
    const firestore = getFirestore(app);
    await upsertUser(auth, T07_USERS.admin);
    await upsertUser(auth, T07_USERS.nonAdmin);

    const adminReference = firestore.collection("admins").doc(T07_USERS.admin.uid);
    const currentAdmin = await adminReference.get();
    const currentCreatedAt = currentAdmin.exists ? currentAdmin.get("createdAt") : null;
    const createdAt = currentCreatedAt instanceof Timestamp
      ? currentCreatedAt
      : T07_LOCAL_TIMESTAMP;
    await adminReference.set({
      schemaVersion: 1,
      displayName: T07_USERS.admin.displayName,
      email: T07_USERS.admin.email,
      active: true,
      createdAt,
      updatedAt: T07_LOCAL_TIMESTAMP
    }, { merge: false });

    const nonAdminReference = firestore.collection("admins").doc(T07_USERS.nonAdmin.uid);
    if (removeKnownNonAdminAuthorization) {
      await nonAdminReference.delete();
    } else if (deactivateKnownNonAdminAuthorization) {
      const currentNonAdmin = await nonAdminReference.get();
      if (currentNonAdmin.exists) {
        await nonAdminReference.update({ active: false, updatedAt: T07_LOCAL_TIMESTAMP });
      }
    }

    if (!quiet) {
      console.log(`Fixture T07 aplicada em ${LOCAL_PROJECT_ID} (somente emuladores locais).`);
      console.log(`Admin: ${T07_USERS.admin.email} / ${T07_USERS.admin.password}`);
      console.log(`Não admin: ${T07_USERS.nonAdmin.email} / ${T07_USERS.nonAdmin.password}`);
    }
    return Object.freeze({
      users: Object.freeze([T07_USERS.admin.uid, T07_USERS.nonAdmin.uid]),
      adminUid: T07_USERS.admin.uid,
      createdAt
    });
  } finally {
    await deleteApp(app);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await applyAdminAuthFixture();
}
