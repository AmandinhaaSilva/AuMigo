import {
  browserLocalPersistence,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword
} from "firebase/auth";
import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";
import { firebaseClient } from "../config/firebase-client.js";

const { auth, firestore } = firebaseClient;
let persistencePromise;

function isPermissionDenied(error) {
  return error?.code === "permission-denied" || error?.code === "firestore/permission-denied";
}

function adminReference(uid) {
  return doc(firestore, "admins", uid);
}

export function prepareAdminAuth() {
  persistencePromise ??= setPersistence(auth, browserLocalPersistence);
  return persistencePromise;
}

export async function waitForAdminSession() {
  await prepareAdminAuth();

  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      (error) => {
        unsubscribe();
        reject(error);
      }
    );
  });
}

export async function signInAdmin(email, password) {
  await prepareAdminAuth();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function hasActiveAdminAccess(user) {
  if (!user) return false;

  try {
    const snapshot = await getDocFromServer(adminReference(user.uid));
    return snapshot.exists() && snapshot.get("active") === true;
  } catch (error) {
    if (isPermissionDenied(error)) return false;
    throw error;
  }
}

export function watchAdminSession(onChange, onError) {
  return onAuthStateChanged(auth, onChange, onError);
}

export function watchActiveAdminAccess(user, onRevoked, onError) {
  return onSnapshot(
    adminReference(user.uid),
    (snapshot) => {
      if (!snapshot.exists() || snapshot.get("active") !== true) onRevoked();
    },
    (error) => {
      if (isPermissionDenied(error)) {
        onRevoked();
        return;
      }

      onError(error);
    }
  );
}

export function requestPasswordReset(email) {
  return sendPasswordResetEmail(auth, email);
}

export async function reauthenticateAdmin(currentPassword) {
  await prepareAdminAuth();
  const user = auth.currentUser;

  if (!user?.email) {
    const error = new Error("Sessão administrativa obrigatória.");
    error.code = "auth/user-not-found";
    throw error;
  }

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  return user;
}

export async function changeAdminPassword(currentPassword, newPassword) {
  const user = await reauthenticateAdmin(currentPassword);
  await updatePassword(user, newPassword);
}

export function signOutAdmin() {
  return signOut(auth);
}
