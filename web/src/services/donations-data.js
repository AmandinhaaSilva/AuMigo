import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";

export const DONATION_STATUSES = Object.freeze(["received", "contacting", "completed"]);
export const DONATION_TYPES = Object.freeze([
  "money",
  "food",
  "hygiene",
  "clothing",
  "blanket",
  "other"
]);
export const DELIVERY_METHODS = Object.freeze(["dropoff", "pickup", "arrange"]);
export const MIN_DONATION_SUBMISSION_MS = 1_500;

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const EMAIL = /^[^@ ]+@[^@ ]+\.[^@ ]+$/;
const PHONE_INPUT = /^[0-9+().\s-]+$/;
const DONATION_TRANSITIONS = Object.freeze({
  received: Object.freeze(["received", "contacting"]),
  contacting: Object.freeze(["contacting", "completed"]),
  completed: Object.freeze(["completed", "contacting"])
});

export class DonationDataValidationError extends Error {
  constructor(message, errors = {}) {
    super(message);
    this.name = "DonationDataValidationError";
    this.errors = Object.freeze({ ...errors });
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isSafeDonationId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function requireSafeId(value, label) {
  if (!isSafeDonationId(value)) throw new DonationDataValidationError(`${label} inválido.`);
}

function requireAdminUid(uid) {
  if (typeof uid !== "string" || uid.length < 1 || uid.length > 128) {
    throw new DonationDataValidationError("Administrador inválido.");
  }
}

export function normalizeOptionalPhoneE164(value) {
  const raw = text(value);
  if (raw === "") return "";
  if (!PHONE_INPUT.test(raw)) return null;

  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!raw.startsWith("+") && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }

  return /^[0-9]{10,15}$/.test(digits) ? `+${digits}` : null;
}

export function normalizeDonationInput(input = {}) {
  const normalizedPhone = normalizeOptionalPhoneE164(input.phoneE164);
  const values = {
    fullName: text(input.fullName),
    email: text(input.email).toLowerCase(),
    phoneE164: normalizedPhone ?? "",
    type: text(input.type),
    amountOrQuantity: text(input.amountOrQuantity),
    deliveryMethod: text(input.deliveryMethod),
    message: text(input.message),
    privacyConsent: input.privacyConsent === true
  };
  const errors = {};

  if (values.fullName.length < 2 || values.fullName.length > 120) {
    errors.fullName = "Informe seu nome com 2 a 120 caracteres.";
  }
  if (values.email.length < 5 || values.email.length > 254 || !EMAIL.test(values.email)) {
    errors.email = "Informe um e-mail válido.";
  }
  if (normalizedPhone === null) {
    errors.phoneE164 = "Informe um telefone válido com DDD ou deixe o campo vazio.";
  }
  if (!DONATION_TYPES.includes(values.type)) {
    errors.type = "Selecione um tipo de doação válido.";
  }
  if (values.amountOrQuantity.length < 1 || values.amountOrQuantity.length > 160) {
    errors.amountOrQuantity = "Informe o valor ou a quantidade com até 160 caracteres.";
  }
  if (!DELIVERY_METHODS.includes(values.deliveryMethod)) {
    errors.deliveryMethod = "Selecione uma forma de entrega válida.";
  }
  if (values.message.length > 1_500) {
    errors.message = "Use no máximo 1.500 caracteres.";
  }
  if (!values.privacyConsent) {
    errors.privacyConsent = "Confirme o uso dos dados para contato sobre a doação.";
  }

  return Object.freeze({
    valid: Object.keys(errors).length === 0,
    values: Object.freeze(values),
    errors: Object.freeze(errors)
  });
}

export function validateDonationSubmissionGate({ honeypot = "", elapsedMs = 0 } = {}) {
  if (text(honeypot)) return Object.freeze({ allowed: false, bot: true, reason: "honeypot" });
  if (!Number.isFinite(elapsedMs) || elapsedMs < MIN_DONATION_SUBMISSION_MS) {
    return Object.freeze({ allowed: false, bot: false, reason: "too-fast" });
  }
  return Object.freeze({ allowed: true, bot: false, reason: null });
}

export function allowedDonationStatuses(currentStatus) {
  return DONATION_TRANSITIONS[currentStatus] ?? Object.freeze([]);
}

function assertTransition(before, after) {
  if (!allowedDonationStatuses(before).includes(after)) {
    throw new DonationDataValidationError("Transição da doação não permitida.", {
      status: "Escolha uma transição permitida pelo contrato."
    });
  }
}

export function donationDataErrorMessage(error, action = "load") {
  if (error instanceof DonationDataValidationError) return error.message;
  const code = String(error?.code ?? "").replace(/^firestore\//, "");
  if (code === "permission-denied") {
    return "A operação não foi autorizada. Seu acesso pode ter mudado.";
  }
  if (["unavailable", "deadline-exceeded", "network-request-failed"].includes(code)) {
    return "O serviço local está indisponível no momento. Tente novamente.";
  }
  if (action === "save") return "Não foi possível salvar. Os valores preenchidos foram mantidos.";
  return "Não foi possível carregar estes dados. Tente novamente.";
}

export function createDonationsDataService(database) {
  if (!database) throw new TypeError("Firestore é obrigatório.");

  return Object.freeze({
    async submitDonation(donationId, input) {
      requireSafeId(donationId, "Tentativa");
      const normalized = normalizeDonationInput(input);
      if (!normalized.valid) {
        throw new DonationDataValidationError("Intenção de doação inválida.", normalized.errors);
      }

      await setDoc(doc(database, "donations", donationId), {
        schemaVersion: 1,
        ...normalized.values,
        status: "received",
        adminNotes: "",
        handledBy: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return normalized.values;
    },

    async listAdminDonations(status = "all") {
      if (status !== "all" && !DONATION_STATUSES.includes(status)) {
        throw new DonationDataValidationError("Filtro de doação inválido.");
      }
      const donationQuery = status === "all"
        ? query(collection(database, "donations"), orderBy("createdAt", "desc"))
        : query(
            collection(database, "donations"),
            where("status", "==", status),
            orderBy("createdAt", "desc")
          );
      const snapshot = await getDocs(donationQuery);
      return snapshot.docs.map((item) => Object.freeze({ id: item.id, ...item.data() }));
    },

    async updateDonation(uid, donation, input = {}) {
      requireAdminUid(uid);
      requireSafeId(donation?.id, "Doação");
      const status = text(input.status);
      const adminNotes = text(input.adminNotes);
      assertTransition(donation.status, status);
      if (adminNotes.length > 2_000) {
        throw new DonationDataValidationError("Observação administrativa inválida.", {
          adminNotes: "Use no máximo 2.000 caracteres."
        });
      }
      await updateDoc(doc(database, "donations", donation.id), {
        status,
        adminNotes,
        handledBy: uid,
        updatedAt: serverTimestamp()
      });
    },

    async deleteDonation(uid, donationId) {
      requireAdminUid(uid);
      requireSafeId(donationId, "Doação");
      await deleteDoc(doc(database, "donations", donationId));
    }
  });
}
