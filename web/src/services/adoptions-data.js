import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { asCatalogMedia } from "./catalog-media.js";

export const ANIMAL_STATUSES = Object.freeze(["available", "in_process", "adopted"]);
export const ADOPTION_REQUEST_STATUSES = Object.freeze([
  "pending",
  "contacting",
  "approved",
  "rejected"
]);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MIN_ADOPTION_SUBMISSION_MS = 1_500;

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const EMAIL = /^[^@ ]+@[^@ ]+\.[^@ ]+$/;
const PHONE_INPUT = /^[0-9+().\s-]+$/;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);
const ANIMAL_TRANSITIONS = Object.freeze({
  available: Object.freeze(["available", "in_process"]),
  in_process: Object.freeze(["in_process", "available", "adopted"]),
  adopted: Object.freeze(["adopted", "available"])
});
const REQUEST_TRANSITIONS = Object.freeze({
  pending: Object.freeze(["pending", "contacting"]),
  contacting: Object.freeze(["contacting", "approved", "rejected"]),
  approved: Object.freeze(["approved", "contacting"]),
  rejected: Object.freeze(["rejected", "contacting"])
});

export class AdoptionDataValidationError extends Error {
  constructor(message, errors = {}) {
    super(message);
    this.name = "AdoptionDataValidationError";
    this.errors = Object.freeze({ ...errors });
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function integer(value) {
  if (typeof value === "string" && value.trim() === "") return Number.NaN;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}

export function isSafeDocumentId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function requireSafeId(value, label) {
  if (!isSafeDocumentId(value)) {
    throw new AdoptionDataValidationError(`${label} inválido.`);
  }
}

function requireAdminUid(uid) {
  if (typeof uid !== "string" || uid.length < 1 || uid.length > 128) {
    throw new AdoptionDataValidationError("Administrador inválido.");
  }
}

export function animalArticle(animal) {
  return animal?.sex === "female" ? "a" : "o";
}

export function formatAnimalAge(ageMonths) {
  if (!Number.isSafeInteger(ageMonths) || ageMonths < 0) return "Idade não informada";
  if (ageMonths < 12) return `${ageMonths} ${ageMonths === 1 ? "mês" : "meses"}`;

  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  const yearText = `${years} ${years === 1 ? "ano" : "anos"}`;
  return months === 0
    ? yearText
    : `${yearText} e ${months} ${months === 1 ? "mês" : "meses"}`;
}

export function filterPublicAnimals(animals, filters = {}) {
  const sex = filters.sex ?? "all";
  const size = filters.size ?? "all";
  const age = filters.age ?? "all";

  return animals.filter((animal) => {
    if (sex !== "all" && animal.sex !== sex) return false;
    if (size !== "all" && animal.size !== size) return false;
    if (age === "puppy" && animal.ageMonths > 12) return false;
    if (age === "adult" && (animal.ageMonths <= 12 || animal.ageMonths > 60)) return false;
    if (age === "senior" && animal.ageMonths <= 60) return false;
    return true;
  });
}

export function normalizeAnimalInput(input = {}) {
  const values = {
    name: text(input.name),
    species: text(input.species),
    breed: text(input.breed),
    ageMonths: integer(input.ageMonths),
    sex: text(input.sex),
    size: text(input.size),
    color: text(input.color),
    description: text(input.description),
    adoptionStatus: text(input.adoptionStatus),
    published: input.published === true,
    sortOrder: integer(input.sortOrder),
    imageAlt: text(input.imageAlt)
  };
  const errors = {};

  if (values.name.length < 1 || values.name.length > 80) {
    errors.name = "Informe um nome com até 80 caracteres.";
  }
  if (!['dog', 'cat', 'other'].includes(values.species)) {
    errors.species = "Selecione uma espécie válida.";
  }
  if (values.breed.length > 80) errors.breed = "Use no máximo 80 caracteres.";
  if (!Number.isSafeInteger(values.ageMonths) || values.ageMonths < 0 || values.ageMonths > 360) {
    errors.ageMonths = "Informe a idade entre 0 e 360 meses.";
  }
  if (!['male', 'female'].includes(values.sex)) errors.sex = "Selecione o sexo.";
  if (!['small', 'medium', 'large'].includes(values.size)) errors.size = "Selecione o porte.";
  if (values.color.length > 60) errors.color = "Use no máximo 60 caracteres.";
  if (values.description.length < 1 || values.description.length > 2_000) {
    errors.description = "Informe uma descrição com até 2.000 caracteres.";
  }
  if (!ANIMAL_STATUSES.includes(values.adoptionStatus)) {
    errors.adoptionStatus = "Selecione um status de adoção válido.";
  }
  if (!Number.isSafeInteger(values.sortOrder)) {
    errors.sortOrder = "Informe uma ordem inteira.";
  }
  if (values.imageAlt.length < 1 || values.imageAlt.length > 140) {
    errors.imageAlt = "Informe um texto alternativo com até 140 caracteres.";
  }

  return Object.freeze({
    valid: Object.keys(errors).length === 0,
    values: Object.freeze(values),
    errors: Object.freeze(errors)
  });
}

export function normalizePhoneE164(value) {
  const raw = text(value);
  if (!PHONE_INPUT.test(raw)) return "";

  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!raw.startsWith("+") && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }

  return /^[0-9]{10,15}$/.test(digits) ? `+${digits}` : "";
}

export function normalizeAdoptionRequest(input = {}) {
  const values = {
    fullName: text(input.fullName),
    email: text(input.email).toLowerCase(),
    phoneE164: normalizePhoneE164(input.phoneE164),
    city: text(input.city),
    state: text(input.state).toUpperCase(),
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
  if (!values.phoneE164) {
    errors.phoneE164 = "Informe um telefone válido com DDD.";
  }
  if (values.city.length < 2 || values.city.length > 100) {
    errors.city = "Informe uma cidade com 2 a 100 caracteres.";
  }
  if (!/^[A-Z]{2}$/.test(values.state)) {
    errors.state = "Informe a UF com duas letras.";
  }
  if (values.message.length > 1_500) {
    errors.message = "Use no máximo 1.500 caracteres.";
  }
  if (!values.privacyConsent) {
    errors.privacyConsent = "Confirme o uso dos dados para contato sobre a adoção.";
  }

  return Object.freeze({
    valid: Object.keys(errors).length === 0,
    values: Object.freeze(values),
    errors: Object.freeze(errors)
  });
}

export function validateSubmissionGate({ honeypot = "", elapsedMs = 0 } = {}) {
  if (text(honeypot)) return Object.freeze({ allowed: false, bot: true, reason: "honeypot" });
  if (!Number.isFinite(elapsedMs) || elapsedMs < MIN_ADOPTION_SUBMISSION_MS) {
    return Object.freeze({ allowed: false, bot: false, reason: "too-fast" });
  }
  return Object.freeze({ allowed: true, bot: false, reason: null });
}

export function allowedAnimalStatuses(currentStatus) {
  return ANIMAL_TRANSITIONS[currentStatus] ?? Object.freeze([]);
}

export function allowedAdoptionRequestStatuses(currentStatus) {
  return REQUEST_TRANSITIONS[currentStatus] ?? Object.freeze([]);
}

export function validateImageFile(file) {
  const errors = {};
  if (!file || typeof file.size !== "number" || file.size <= 0) {
    errors.image = "Selecione uma imagem não vazia.";
  } else {
    if (!IMAGE_TYPES.has(file.type)) errors.image = "Use uma imagem JPEG, PNG ou WebP.";
    if (file.size > MAX_IMAGE_BYTES) errors.image = "A imagem deve ter no máximo 5 MiB.";
  }
  return Object.freeze({ valid: Object.keys(errors).length === 0, errors: Object.freeze(errors) });
}

export async function optimizeCatalogImage(file) {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new AdoptionDataValidationError("Imagem inválida.", validation.errors);
  }

  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1_600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d", { alpha: true }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
    if (!blob) throw new Error("Falha ao converter a imagem.");
    const optimized = new File([blob], `${text(file.name).replace(/\.[^.]+$/, "") || "animal"}.webp`, {
      type: "image/webp"
    });
    const optimizedValidation = validateImageFile(optimized);
    if (!optimizedValidation.valid) {
      throw new AdoptionDataValidationError("Imagem otimizada inválida.", optimizedValidation.errors);
    }
    return optimized;
  } catch (error) {
    if (error instanceof AdoptionDataValidationError) throw error;
    throw new AdoptionDataValidationError("Não foi possível processar esta imagem.", {
      image: "Escolha outro arquivo JPEG, PNG ou WebP."
    });
  } finally {
    bitmap?.close?.();
  }
}

function isPermissionDenied(error) {
  return ["permission-denied", "firestore/permission-denied"].includes(error?.code);
}

function isMissingStorageObject(error) {
  return ["storage/object-not-found", "object-not-found"].includes(error?.code);
}

function imagePath(animalId, file) {
  const extension = IMAGE_TYPES.get(file.type);
  return `public/animals/${animalId}/${crypto.randomUUID().toLowerCase()}.${extension}`;
}

async function fileBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}

function animalFromSnapshot(snapshot) {
  return Object.freeze({ id: snapshot.id, ...snapshot.data() });
}

async function withImageUrl(media, animal) {
  try {
    return Object.freeze({
      ...animal,
      imageUrl: await media.getUrl(animal.imagePath),
      imageUnavailable: false
    });
  } catch {
    return Object.freeze({ ...animal, imageUrl: null, imageUnavailable: true });
  }
}

function assertAnimalTransition(before, after) {
  if (!allowedAnimalStatuses(before).includes(after)) {
    throw new AdoptionDataValidationError("Transição de status do animal não permitida.", {
      adoptionStatus: "Escolha uma transição permitida pelo contrato."
    });
  }
}

function assertRequestTransition(before, after) {
  if (!allowedAdoptionRequestStatuses(before).includes(after)) {
    throw new AdoptionDataValidationError("Transição da solicitação não permitida.", {
      status: "Escolha uma transição permitida pelo contrato."
    });
  }
}

export function adoptionDataErrorMessage(error, action = "load") {
  if (error instanceof AdoptionDataValidationError) return error.message;
  const code = String(error?.code ?? "").replace(/^(firestore|storage)\//, "");
  if (code === "permission-denied" || code === "unauthorized") {
    return "A operação não foi autorizada. Seu acesso ou a disponibilidade do animal pode ter mudado.";
  }
  if (error?.service === "media" && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  if (["unavailable", "deadline-exceeded", "network-request-failed", "retry-limit-exceeded"].includes(code)) {
    return "O serviço está temporariamente indisponível. Tente novamente.";
  }
  if (action === "save") return "Não foi possível salvar. Os valores preenchidos foram mantidos.";
  return "Não foi possível carregar estes dados. Tente novamente.";
}

export function createAdoptionsDataService(database, mediaSource) {
  if (!database || !mediaSource) throw new TypeError("Firestore e mídia são obrigatórios.");
  const media = asCatalogMedia(mediaSource);

  return Object.freeze({
    async listPublicAnimals() {
      const snapshot = await getDocs(
        query(
          collection(database, "animals"),
          where("published", "==", true),
          where("adoptionStatus", "==", "available"),
          orderBy("sortOrder", "asc")
        )
      );
      return Promise.all(snapshot.docs.map((item) => withImageUrl(media, animalFromSnapshot(item))));
    },

    async getPublicAnimal(animalId) {
      requireSafeId(animalId, "Animal");
      try {
        const snapshot = await getDocFromServer(doc(database, "animals", animalId));
        if (!snapshot.exists()) return null;
        return withImageUrl(media, animalFromSnapshot(snapshot));
      } catch (error) {
        if (isPermissionDenied(error)) return null;
        throw error;
      }
    },

    async submitAdoptionRequest(requestId, animalId, input) {
      requireSafeId(requestId, "Tentativa");
      requireSafeId(animalId, "Animal");
      const normalized = normalizeAdoptionRequest(input);
      if (!normalized.valid) {
        throw new AdoptionDataValidationError("Solicitação inválida.", normalized.errors);
      }

      await setDoc(doc(database, "adoptionRequests", requestId), {
        schemaVersion: 1,
        animalId,
        ...normalized.values,
        status: "pending",
        adminNotes: "",
        handledBy: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return normalized.values;
    },

    async listAdminAnimals() {
      const snapshot = await getDocs(query(collection(database, "animals"), orderBy("sortOrder", "asc")));
      return Promise.all(snapshot.docs.map((item) => withImageUrl(media, animalFromSnapshot(item))));
    },

    async saveAnimal(uid, input, { current = null, imageFile = null } = {}) {
      requireAdminUid(uid);
      if (current) requireSafeId(current.id, "Animal");
      const normalized = normalizeAnimalInput(input);
      if (!normalized.valid) {
        throw new AdoptionDataValidationError("Cadastro de animal inválido.", normalized.errors);
      }
      if (current) assertAnimalTransition(current.adoptionStatus, normalized.values.adoptionStatus);
      if (!current && normalized.values.adoptionStatus !== "available") {
        throw new AdoptionDataValidationError("Novo animal deve iniciar como disponível.", {
          adoptionStatus: "Cadastre o animal como disponível."
        });
      }
      if (!current && !imageFile) {
        throw new AdoptionDataValidationError("A imagem do animal é obrigatória.", {
          image: "Selecione uma imagem JPEG, PNG ou WebP."
        });
      }
      if (imageFile) {
        const validation = validateImageFile(imageFile);
        if (!validation.valid) {
          throw new AdoptionDataValidationError("Imagem inválida.", validation.errors);
        }
      }

      const reference = current
        ? doc(database, "animals", current.id)
        : doc(collection(database, "animals"));
      const animalId = reference.id;
      let nextImagePath = current?.imagePath ?? null;
      let uploadedPath = null;

      if (imageFile) {
        uploadedPath = imagePath(animalId, imageFile);
        await media.upload(uploadedPath, await fileBytes(imageFile), imageFile.type);
        nextImagePath = uploadedPath;
      }

      try {
        await setDoc(
          reference,
          {
            schemaVersion: 1,
            ...normalized.values,
            imagePath: nextImagePath,
            createdAt: current?.createdAt ?? serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedBy: uid
          },
          { merge: false }
        );
      } catch (error) {
        if (uploadedPath) {
          try {
            await media.remove(uploadedPath);
          } catch (cleanupError) {
            if (!isMissingStorageObject(cleanupError)) {
              error.orphanPath = uploadedPath;
            }
          }
        }
        throw error;
      }

      let warning = null;
      if (uploadedPath && current?.imagePath && current.imagePath !== uploadedPath) {
        try {
          await media.remove(current.imagePath);
        } catch (error) {
          if (!isMissingStorageObject(error)) {
            warning = `A imagem anterior não pôde ser removida: ${current.imagePath}`;
          }
        }
      }

      return Object.freeze({ id: animalId, imagePath: nextImagePath, warning });
    },

    async setAnimalPublished(uid, animal, published) {
      requireAdminUid(uid);
      requireSafeId(animal?.id, "Animal");
      await updateDoc(doc(database, "animals", animal.id), {
        published: published === true,
        updatedAt: serverTimestamp(),
        updatedBy: uid
      });
    },

    async setAnimalStatus(uid, animal, nextStatus) {
      requireAdminUid(uid);
      requireSafeId(animal?.id, "Animal");
      assertAnimalTransition(animal.adoptionStatus, nextStatus);
      await updateDoc(doc(database, "animals", animal.id), {
        adoptionStatus: nextStatus,
        updatedAt: serverTimestamp(),
        updatedBy: uid
      });
    },

    async deleteAnimal(uid, animal) {
      requireAdminUid(uid);
      requireSafeId(animal?.id, "Animal");
      await deleteDoc(doc(database, "animals", animal.id));
      try {
        await media.remove(animal.imagePath);
        return Object.freeze({ warning: null });
      } catch (error) {
        if (isMissingStorageObject(error)) return Object.freeze({ warning: null });
        return Object.freeze({
          warning: `O cadastro foi excluído, mas a mídia deve ser limpa manualmente: ${animal.imagePath}`
        });
      }
    },

    async listAdminAdoptionRequests(status = "all") {
      if (status !== "all" && !ADOPTION_REQUEST_STATUSES.includes(status)) {
        throw new AdoptionDataValidationError("Filtro de solicitação inválido.");
      }
      const requestQuery = status === "all"
        ? query(collection(database, "adoptionRequests"), orderBy("createdAt", "desc"))
        : query(
            collection(database, "adoptionRequests"),
            where("status", "==", status),
            orderBy("createdAt", "desc")
          );
      const snapshot = await getDocs(requestQuery);
      return snapshot.docs.map((item) => Object.freeze({ id: item.id, ...item.data() }));
    },

    async updateAdoptionRequest(uid, request, input = {}) {
      requireAdminUid(uid);
      requireSafeId(request?.id, "Solicitação");
      const status = text(input.status);
      const adminNotes = text(input.adminNotes);
      assertRequestTransition(request.status, status);
      if (adminNotes.length > 2_000) {
        throw new AdoptionDataValidationError("Observação administrativa inválida.", {
          adminNotes: "Use no máximo 2.000 caracteres."
        });
      }
      await updateDoc(doc(database, "adoptionRequests", request.id), {
        status,
        adminNotes,
        handledBy: uid,
        updatedAt: serverTimestamp()
      });
    },

    async deleteAdoptionRequest(uid, requestId) {
      requireAdminUid(uid);
      requireSafeId(requestId, "Solicitação");
      await deleteDoc(doc(database, "adoptionRequests", requestId));
    }
  });
}
