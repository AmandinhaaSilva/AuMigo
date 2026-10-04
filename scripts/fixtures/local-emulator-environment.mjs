export const LOCAL_PROJECT_ID = "demo-aufriends-local";
export const LOCAL_HOST = "127.0.0.1";
export const LOCAL_PORTS = Object.freeze({
  auth: 9099,
  firestore: 8080,
  storage: 9199,
  hub: 4400,
  ui: 4000
});
export const LOCAL_FIREBASE_CONFIG = Object.freeze({
  apiKey: LOCAL_PROJECT_ID,
  projectId: LOCAL_PROJECT_ID,
  storageBucket: `${LOCAL_PROJECT_ID}.appspot.com`
});

const PREFLIGHT_TOKEN = Symbol("aufriends-local-preflight");
const HUB_URL = `http://${LOCAL_HOST}:${LOCAL_PORTS.hub}/emulators`;
const UI_CONFIG_URL = `http://${LOCAL_HOST}:${LOCAL_PORTS.ui}/api/config`;
const EXPECTED_ENVIRONMENT = Object.freeze({
  FIREBASE_AUTH_EMULATOR_HOST: `${LOCAL_HOST}:${LOCAL_PORTS.auth}`,
  FIRESTORE_EMULATOR_HOST: `${LOCAL_HOST}:${LOCAL_PORTS.firestore}`,
  FIREBASE_STORAGE_EMULATOR_HOST: `${LOCAL_HOST}:${LOCAL_PORTS.storage}`,
  FIREBASE_EMULATOR_HUB: `${LOCAL_HOST}:${LOCAL_PORTS.hub}`
});

function configured(name) {
  const value = process.env[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function requireLocalEnvironmentVariables() {
  for (const name of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_CONFIG"]) {
    if (configured(name)) {
      throw new Error(`${name} recusado: o seed não aceita credencial ou configuração Firebase externa.`);
    }
  }

  for (const name of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT", "CLOUDSDK_CORE_PROJECT"]) {
    const value = configured(name);
    if (value && value !== LOCAL_PROJECT_ID) {
      throw new Error(`${name} recusado: esperado somente ${LOCAL_PROJECT_ID}.`);
    }
  }

  for (const [name, expected] of Object.entries(EXPECTED_ENVIRONMENT)) {
    const value = configured(name);
    if (value && value !== expected) {
      throw new Error(`${name} recusado: esperado somente ${expected}.`);
    }
  }
}

async function localJson(url, label) {
  let response;
  try {
    response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(3_000)
    });
  } catch (error) {
    throw new Error(`${label} local indisponível: ${error.message}`);
  }
  if (!response.ok) throw new Error(`${label} local indisponível (${response.status}).`);
  return response.json();
}

export async function preflightLocalEmulators() {
  requireLocalEnvironmentVariables();
  const [emulators, uiConfig] = await Promise.all([
    localJson(HUB_URL, "Hub"),
    localJson(UI_CONFIG_URL, "Configuração do Emulator Suite")
  ]);

  for (const name of ["auth", "firestore", "storage", "hub"]) {
    const expectedPort = LOCAL_PORTS[name];
    const running = emulators[name];
    if (running?.host !== LOCAL_HOST || running?.port !== expectedPort) {
      throw new Error(
        `Emulador ${name} recusado: esperado somente ${LOCAL_HOST}:${expectedPort}.`
      );
    }
  }
  if (uiConfig?.projectId !== LOCAL_PROJECT_ID) {
    throw new Error(
      `Projeto recusado: o Emulator Suite deve usar somente ${LOCAL_PROJECT_ID}.`
    );
  }

  return Object.freeze({
    [PREFLIGHT_TOKEN]: true,
    projectId: LOCAL_PROJECT_ID,
    host: LOCAL_HOST,
    ports: LOCAL_PORTS
  });
}

export async function resolveLocalPreflight(value) {
  if (value?.[PREFLIGHT_TOKEN] === true) return value;
  if (value !== undefined && value !== null) {
    throw new Error("Confirmação local inválida: execute o preflight oficial antes da fixture.");
  }
  return preflightLocalEmulators();
}

export function configureAdminEmulatorEnvironment(preflight) {
  if (preflight?.[PREFLIGHT_TOKEN] !== true) {
    throw new Error("Ambiente administrativo recusado sem preflight local confirmado.");
  }
  process.env.FIREBASE_AUTH_EMULATOR_HOST = EXPECTED_ENVIRONMENT.FIREBASE_AUTH_EMULATOR_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = EXPECTED_ENVIRONMENT.FIRESTORE_EMULATOR_HOST;
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = EXPECTED_ENVIRONMENT.FIREBASE_STORAGE_EMULATOR_HOST;
  process.env.GCLOUD_PROJECT = LOCAL_PROJECT_ID;
  process.env.GOOGLE_CLOUD_PROJECT = LOCAL_PROJECT_ID;
}
