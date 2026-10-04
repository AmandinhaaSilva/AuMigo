import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { createCatalogMediaGateway } from "../services/catalog-media.js";

const LOCAL_PROJECT_ID = "demo-aufriends-local";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const REMOTE_FIREBASE_CONFIG = Object.freeze({
  apiKey: "AIzaSyAKy-05uW7C6VLQBSPjli8R7EAR1QCxvqo",
  authDomain: "memberverse-sfhf9.firebaseapp.com",
  projectId: "memberverse-sfhf9",
  appId: "1:1041612049188:web:be2e5258c67b261e9481b1",
  messagingSenderId: "1041612049188"
});

function localPort(name, configuredValue, fallback) {
  const value = Number(configuredValue ?? fallback);

  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Porta local inválida em ${name}.`);
  }

  return value;
}

const browserHost = globalThis.location?.hostname ?? "127.0.0.1";
const useEmulators = LOOPBACK_HOSTS.has(browserHost);
const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST ?? "127.0.0.1";

if (useEmulators && !LOOPBACK_HOSTS.has(emulatorHost)) {
  throw new Error("Host recusado: os emuladores Firebase devem permanecer em loopback.");
}

const ports = Object.freeze({
  auth: localPort(
    "VITE_FIREBASE_AUTH_EMULATOR_PORT",
    import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT,
    9099
  ),
  firestore: localPort(
    "VITE_FIREBASE_FIRESTORE_EMULATOR_PORT",
    import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT,
    8080
  ),
  storage: localPort(
    "VITE_FIREBASE_STORAGE_EMULATOR_PORT",
    import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_PORT,
    9199
  )
});

const firebaseConfig = useEmulators
  ? {
      apiKey: LOCAL_PROJECT_ID,
      projectId: LOCAL_PROJECT_ID,
      storageBucket: `${LOCAL_PROJECT_ID}.appspot.com`
    }
  : REMOTE_FIREBASE_CONFIG;

if (getApps().length > 1) {
  throw new Error("Inicialização recusada: mais de uma aplicação Firebase foi encontrada.");
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

if (app.options.projectId !== firebaseConfig.projectId) {
  throw new Error("Aplicação recusada: uma configuração Firebase inesperada já estava ativa.");
}

const auth = getAuth(app);
const firestore = getFirestore(app);
const storage = getStorage(app);

if (useEmulators) {
  connectAuthEmulator(auth, `http://${emulatorHost}:${ports.auth}`, {
    disableWarnings: true
  });
  connectFirestoreEmulator(firestore, emulatorHost, ports.firestore);
  connectStorageEmulator(storage, emulatorHost, ports.storage);
}

const media = createCatalogMediaGateway({ auth, storage, useEmulators });

export const firebaseClient = Object.freeze({
  app,
  auth,
  firestore,
  storage,
  media,
  projectId: firebaseConfig.projectId,
  useEmulators,
  emulatorHost: useEmulators ? emulatorHost : null,
  ports: useEmulators ? ports : null
});
