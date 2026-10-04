import {
  collection,
  doc,
  getCountFromServer,
  getDocFromServer,
  serverTimestamp,
  setDoc
} from "firebase/firestore";

export const ADMIN_METRICS = Object.freeze([
  Object.freeze({
    key: "animals",
    singular: "animal cadastrado",
    plural: "animais cadastrados",
    empty: "Nenhum animal cadastrado"
  }),
  Object.freeze({
    key: "products",
    singular: "produto cadastrado",
    plural: "produtos cadastrados",
    empty: "Nenhum produto cadastrado"
  }),
  Object.freeze({
    key: "adoptionRequests",
    singular: "pedido de adoção recebido",
    plural: "pedidos de adoção recebidos",
    empty: "Nenhum pedido de adoção"
  }),
  Object.freeze({
    key: "donations",
    singular: "doação registrada",
    plural: "doações registradas",
    empty: "Nenhuma doação registrada"
  })
]);

const METRICS_BY_KEY = new Map(ADMIN_METRICS.map((metric) => [metric.key, metric]));
const PHONE_FORMAT = /^[0-9+().\s-]*$/;

export class SiteSettingsValidationError extends Error {
  constructor(errors) {
    super("Configuração pública inválida.");
    this.name = "SiteSettingsValidationError";
    this.errors = errors;
  }
}

export function normalizeSiteSettings(input = {}) {
  const brandName = typeof input.brandName === "string" ? input.brandName.trim() : "";
  const rawWhatsapp =
    typeof input.whatsappDigits === "string" ? input.whatsappDigits.trim() : "";
  const whatsappDigits = rawWhatsapp.replace(/\D/g, "");
  const whatsappGreeting =
    typeof input.whatsappGreeting === "string" ? input.whatsappGreeting.trim() : "";
  const errors = {};

  if (brandName.length < 1 || brandName.length > 80) {
    errors.brandName = "Informe um nome da marca com até 80 caracteres.";
  }

  if (!PHONE_FORMAT.test(rawWhatsapp)) {
    errors.whatsappDigits = "Use apenas números, espaços e sinais comuns de telefone.";
  } else if (!/^[0-9]{10,15}$/.test(whatsappDigits)) {
    errors.whatsappDigits = "Informe um WhatsApp com 10 a 15 dígitos.";
  }

  if (whatsappGreeting.length < 1 || whatsappGreeting.length > 300) {
    errors.whatsappGreeting = "Informe uma saudação com até 300 caracteres.";
  }

  return Object.freeze({
    valid: Object.keys(errors).length === 0,
    values: Object.freeze({ brandName, whatsappDigits, whatsappGreeting }),
    errors: Object.freeze(errors)
  });
}

export function loadedMetricState(metricKey, count) {
  const metric = METRICS_BY_KEY.get(metricKey);

  if (!metric || !Number.isSafeInteger(count) || count < 0) {
    throw new TypeError("Indicador administrativo inválido.");
  }

  const description =
    count === 0 ? metric.empty : `${count} ${count === 1 ? metric.singular : metric.plural}`;

  return Object.freeze({
    value: String(count),
    description,
    empty: count === 0
  });
}

export function adminPanelErrorMessage(error, action = "load") {
  const code = String(error?.code ?? "").replace(/^firestore\//, "");

  if (code === "permission-denied") {
    return "Seu acesso administrativo não está mais disponível. Aguarde o redirecionamento.";
  }

  if (["unavailable", "deadline-exceeded", "network-request-failed"].includes(code)) {
    return "O serviço local está indisponível no momento. Tente novamente.";
  }

  if (action === "save") {
    return "Não foi possível salvar. Os valores preenchidos foram mantidos.";
  }

  return "Não foi possível carregar estes dados. Tente novamente.";
}

function readSettingsDocument(snapshot) {
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  const fields = ["brandName", "whatsappDigits", "whatsappGreeting"];

  if (fields.some((field) => typeof data[field] !== "string")) {
    const error = new Error("Documento siteSettings/public incompatível.");
    error.code = "data-loss";
    throw error;
  }

  return Object.freeze({
    brandName: data.brandName,
    whatsappDigits: data.whatsappDigits,
    whatsappGreeting: data.whatsappGreeting
  });
}

export function createAdminPanelDataService(database) {
  if (!database) throw new TypeError("Firestore é obrigatório.");

  const settingsReference = doc(database, "siteSettings", "public");

  return Object.freeze({
    async count(collectionName) {
      if (!METRICS_BY_KEY.has(collectionName)) {
        throw new TypeError("Coleção administrativa não permitida.");
      }

      const snapshot = await getCountFromServer(collection(database, collectionName));
      return snapshot.data().count;
    },

    async readSiteSettings() {
      return readSettingsDocument(await getDocFromServer(settingsReference));
    },

    async saveSiteSettings(uid, input) {
      if (typeof uid !== "string" || uid.length < 1 || uid.length > 128) {
        throw new TypeError("Administrador inválido.");
      }

      const normalized = normalizeSiteSettings(input);

      if (!normalized.valid) {
        throw new SiteSettingsValidationError(normalized.errors);
      }

      await setDoc(
        settingsReference,
        {
          schemaVersion: 1,
          ...normalized.values,
          updatedAt: serverTimestamp(),
          updatedBy: uid
        },
        { merge: false }
      );

      return normalized.values;
    }
  });
}
