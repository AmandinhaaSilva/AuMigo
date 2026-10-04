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
import { asCatalogMedia } from "./catalog-media.js";

export const PRODUCT_CATEGORIES = Object.freeze([
  "food",
  "treats",
  "accessories",
  "hygiene",
  "clothing",
  "toys"
]);
export const PRODUCT_PRICE_FILTERS = Object.freeze([
  "all",
  "up-to-3000",
  "3001-8000",
  "over-8000"
]);
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MONEY_INPUT = /^(0|[1-9][0-9]*)(?:[,.]([0-9]{1,2}))?$/;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);
const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

export class ProductDataValidationError extends Error {
  constructor(message, errors = {}) {
    super(message);
    this.name = "ProductDataValidationError";
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

export function isSafeProductId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function requireSafeId(value) {
  if (!isSafeProductId(value)) throw new ProductDataValidationError("Produto inválido.");
}

function requireAdminUid(uid) {
  if (typeof uid !== "string" || uid.length < 1 || uid.length > 128) {
    throw new ProductDataValidationError("Administrador inválido.");
  }
}

export function parseBRLToCents(value) {
  const normalized = text(value);
  const match = MONEY_INPUT.exec(normalized);
  if (!match) return Number.NaN;
  const reais = Number(match[1]);
  const centavos = Number((match[2] ?? "").padEnd(2, "0"));
  const result = reais * 100 + centavos;
  return Number.isSafeInteger(result) ? result : Number.NaN;
}

export function centsToBRLInput(value) {
  if (!Number.isSafeInteger(value) || value < 0) return "";
  return `${Math.floor(value / 100)},${String(value % 100).padStart(2, "0")}`;
}

export function formatBRL(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ProductDataValidationError("Preço inválido.");
  }
  return BRL.format(value / 100);
}

export function hasValidCompareAtPrice(product) {
  return Number.isSafeInteger(product?.compareAtPriceCents)
    && Number.isSafeInteger(product?.priceCents)
    && product.compareAtPriceCents >= 0
    && product.compareAtPriceCents > product.priceCents;
}

export function normalizeProductInput(input = {}) {
  const priceCents = parseBRLToCents(input.priceReais);
  const compareInput = text(input.compareAtPriceReais);
  const compareAtPriceCents = compareInput === "" ? null : parseBRLToCents(compareInput);
  const values = {
    name: text(input.name),
    description: text(input.description),
    category: text(input.category),
    priceCents,
    compareAtPriceCents,
    badge: text(input.badge),
    active: input.active === true,
    sortOrder: integer(input.sortOrder),
    imageAlt: text(input.imageAlt)
  };
  const errors = {};

  if (values.name.length < 1 || values.name.length > 120) {
    errors.name = "Informe um nome com até 120 caracteres.";
  }
  if (values.description.length < 1 || values.description.length > 1_500) {
    errors.description = "Informe uma descrição com até 1.500 caracteres.";
  }
  if (!PRODUCT_CATEGORIES.includes(values.category)) {
    errors.category = "Selecione uma categoria válida.";
  }
  if (!Number.isSafeInteger(values.priceCents) || values.priceCents < 0) {
    errors.priceReais = "Informe o preço em reais, sem milhar e com até duas casas decimais.";
  }
  if (values.compareAtPriceCents !== null
    && (!Number.isSafeInteger(values.compareAtPriceCents) || values.compareAtPriceCents < 0)) {
    errors.compareAtPriceReais = "Informe um comparativo válido ou deixe o campo vazio.";
  }
  if (values.badge.length > 40) errors.badge = "Use no máximo 40 caracteres.";
  if (!Number.isSafeInteger(values.sortOrder)) errors.sortOrder = "Informe uma ordem inteira.";
  if (values.imageAlt.length < 1 || values.imageAlt.length > 140) {
    errors.imageAlt = "Informe um texto alternativo com até 140 caracteres.";
  }

  return Object.freeze({
    valid: Object.keys(errors).length === 0,
    values: Object.freeze(values),
    errors: Object.freeze(errors)
  });
}

export function filterPublicProducts(products, filters = {}) {
  const category = filters.category ?? "all";
  const price = filters.price ?? "all";
  return products.filter((product) => {
    if (category !== "all" && product.category !== category) return false;
    if (price === "up-to-3000" && product.priceCents > 3_000) return false;
    if (price === "3001-8000" && (product.priceCents < 3_001 || product.priceCents > 8_000)) return false;
    if (price === "over-8000" && product.priceCents <= 8_000) return false;
    return true;
  });
}

export function validateProductImageFile(file) {
  const errors = {};
  if (!file || typeof file.size !== "number" || file.size <= 0) {
    errors.image = "Selecione uma imagem não vazia.";
  } else {
    if (!IMAGE_TYPES.has(file.type)) errors.image = "Use uma imagem JPEG, PNG ou WebP.";
    if (file.size > MAX_PRODUCT_IMAGE_BYTES) errors.image = "A imagem deve ter no máximo 5 MiB.";
  }
  return Object.freeze({ valid: Object.keys(errors).length === 0, errors: Object.freeze(errors) });
}

export async function optimizeProductImage(file) {
  const validation = validateProductImageFile(file);
  if (!validation.valid) {
    throw new ProductDataValidationError("Imagem inválida.", validation.errors);
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
    const optimized = new File(
      [blob],
      `${text(file.name).replace(/\.[^.]+$/, "") || "produto"}.webp`,
      { type: "image/webp" }
    );
    const optimizedValidation = validateProductImageFile(optimized);
    if (!optimizedValidation.valid) {
      throw new ProductDataValidationError("Imagem otimizada inválida.", optimizedValidation.errors);
    }
    return optimized;
  } catch (error) {
    if (error instanceof ProductDataValidationError) throw error;
    throw new ProductDataValidationError("Não foi possível processar esta imagem.", {
      image: "Escolha outro arquivo JPEG, PNG ou WebP."
    });
  } finally {
    bitmap?.close?.();
  }
}

function isMissingStorageObject(error) {
  return ["storage/object-not-found", "object-not-found"].includes(error?.code);
}

function productImagePath(productId, file) {
  return `public/products/${productId}/${crypto.randomUUID().toLowerCase()}.${IMAGE_TYPES.get(file.type)}`;
}

async function fileBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}

function productFromSnapshot(snapshot) {
  return Object.freeze({ id: snapshot.id, ...snapshot.data() });
}

async function withImageUrl(media, product) {
  try {
    return Object.freeze({
      ...product,
      imageUrl: await media.getUrl(product.imagePath),
      imageUnavailable: false
    });
  } catch {
    return Object.freeze({ ...product, imageUrl: null, imageUnavailable: true });
  }
}

export function productDataErrorMessage(error, action = "load") {
  if (error instanceof ProductDataValidationError) return error.message;
  const code = String(error?.code ?? "").replace(/^(firestore|storage)\//, "");
  if (code === "permission-denied" || code === "unauthorized") {
    return "A operação não foi autorizada. Seu acesso ou a disponibilidade do produto pode ter mudado.";
  }
  if (["unavailable", "deadline-exceeded", "network-request-failed", "retry-limit-exceeded"].includes(code)) {
    return "O serviço local está indisponível no momento. Tente novamente.";
  }
  if (action === "save") return "Não foi possível salvar. Os valores preenchidos foram mantidos.";
  return "Não foi possível carregar os produtos. Tente novamente.";
}

export function createProductsDataService(database, mediaSource) {
  if (!database || !mediaSource) throw new TypeError("Firestore e mídia são obrigatórios.");
  const media = asCatalogMedia(mediaSource);

  return Object.freeze({
    async listPublicProducts() {
      const snapshot = await getDocs(
        query(
          collection(database, "products"),
          where("active", "==", true),
          orderBy("sortOrder", "asc")
        )
      );
      return Promise.all(snapshot.docs.map((item) => withImageUrl(media, productFromSnapshot(item))));
    },

    async listAdminProducts() {
      const snapshot = await getDocs(query(collection(database, "products"), orderBy("sortOrder", "asc")));
      return Promise.all(snapshot.docs.map((item) => withImageUrl(media, productFromSnapshot(item))));
    },

    async saveProduct(uid, input, { current = null, imageFile = null } = {}) {
      requireAdminUid(uid);
      if (current) requireSafeId(current.id);
      const normalized = normalizeProductInput(input);
      if (!normalized.valid) {
        throw new ProductDataValidationError("Cadastro de produto inválido.", normalized.errors);
      }
      if (!current && !imageFile) {
        throw new ProductDataValidationError("A imagem do produto é obrigatória.", {
          image: "Selecione uma imagem JPEG, PNG ou WebP."
        });
      }
      if (imageFile) {
        const imageValidation = validateProductImageFile(imageFile);
        if (!imageValidation.valid) {
          throw new ProductDataValidationError("Imagem inválida.", imageValidation.errors);
        }
      }

      const reference = current
        ? doc(database, "products", current.id)
        : doc(collection(database, "products"));
      let nextImagePath = current?.imagePath ?? null;
      let uploadedPath = null;

      if (imageFile) {
        uploadedPath = productImagePath(reference.id, imageFile);
        await media.upload(uploadedPath, await fileBytes(imageFile), imageFile.type);
        nextImagePath = uploadedPath;
      }

      try {
        await setDoc(reference, {
          schemaVersion: 1,
          ...normalized.values,
          imagePath: nextImagePath,
          createdAt: current?.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: uid
        }, { merge: false });
      } catch (error) {
        if (uploadedPath) {
          try {
            await media.remove(uploadedPath);
          } catch (cleanupError) {
            if (!isMissingStorageObject(cleanupError)) error.orphanPath = uploadedPath;
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

      return Object.freeze({ id: reference.id, imagePath: nextImagePath, warning });
    },

    async setProductActive(uid, product, active) {
      requireAdminUid(uid);
      requireSafeId(product?.id);
      await updateDoc(doc(database, "products", product.id), {
        active: active === true,
        updatedAt: serverTimestamp(),
        updatedBy: uid
      });
    },

    async deleteProduct(uid, product) {
      requireAdminUid(uid);
      requireSafeId(product?.id);
      await deleteDoc(doc(database, "products", product.id));
      try {
        await media.remove(product.imagePath);
        return Object.freeze({ warning: null });
      } catch (error) {
        if (isMissingStorageObject(error)) return Object.freeze({ warning: null });
        return Object.freeze({
          warning: `O cadastro foi excluído, mas a mídia deve ser limpa manualmente: ${product.imagePath}`
        });
      }
    }
  });
}
