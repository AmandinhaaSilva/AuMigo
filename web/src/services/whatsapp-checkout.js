import { doc, getDocFromServer } from "firebase/firestore";
import { sanitizeCartItems } from "./cart-store.js";
import { formatBRL } from "./products-data.js";

const WHATSAPP_DIGITS = /^\d{10,15}$/;
const PHONE_FORMAT = /^[0-9+().\s-]*$/;
const WHATSAPP_HOST = "wa.me";
const DELIVERY_AND_PIX_REQUEST =
  "Quero combinar a entrega e o pagamento via Pix com a equipe AuFriends.";

export class WhatsAppCheckoutValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "WhatsAppCheckoutValidationError";
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function singleLine(value) {
  return text(value).replace(/\s+/g, " ");
}

export function normalizeWhatsappDigits(value) {
  const raw = text(value);
  if (!PHONE_FORMAT.test(raw)) return "";
  const digits = raw.replace(/\D/g, "");
  return WHATSAPP_DIGITS.test(digits) ? digits : "";
}

export function normalizeCheckoutSettings(input = {}) {
  const whatsappDigits = normalizeWhatsappDigits(input.whatsappDigits);
  const whatsappGreeting = text(input.whatsappGreeting);
  if (!whatsappDigits || whatsappGreeting.length < 1 || whatsappGreeting.length > 300) {
    throw new WhatsAppCheckoutValidationError(
      "A finalização pelo WhatsApp está indisponível porque a configuração de contato não foi concluída."
    );
  }
  return Object.freeze({ whatsappDigits, whatsappGreeting });
}

function requireProduct(product, productId) {
  const name = singleLine(product?.name);
  if (
    product?.id !== productId
    || product?.active !== true
    || name.length < 1
    || name.length > 120
    || !Number.isSafeInteger(product?.priceCents)
    || product.priceCents < 0
  ) {
    throw new WhatsAppCheckoutValidationError(
      "Um produto do carrinho não está mais disponível. Atualize a página antes de finalizar."
    );
  }
  return name;
}

export function createCheckoutSummary(items, productsById) {
  const sanitized = sanitizeCartItems(items);
  if (sanitized.length === 0) {
    throw new WhatsAppCheckoutValidationError(
      "Adicione ao menos um produto ao carrinho antes de finalizar."
    );
  }

  let totalCents = 0;
  const summaryItems = sanitized.map((item) => {
    const product = productsById instanceof Map
      ? productsById.get(item.productId)
      : productsById?.[item.productId];
    const name = requireProduct(product, item.productId);
    const subtotalCents = product.priceCents * item.quantity;
    if (!Number.isSafeInteger(subtotalCents) || !Number.isSafeInteger(totalCents + subtotalCents)) {
      throw new WhatsAppCheckoutValidationError("Não foi possível calcular o total com segurança.");
    }
    totalCents += subtotalCents;
    const unitPriceLabel = formatBRL(product.priceCents);
    const subtotalLabel = formatBRL(subtotalCents);
    return Object.freeze({
      productId: item.productId,
      name,
      quantity: item.quantity,
      unitPriceCents: product.priceCents,
      unitPriceLabel,
      subtotalCents,
      subtotalLabel,
      line: `- ${name} — ${item.quantity} × ${unitPriceLabel} = ${subtotalLabel}`
    });
  });

  return Object.freeze({
    items: Object.freeze(summaryItems),
    totalCents,
    totalLabel: formatBRL(totalCents)
  });
}

export function buildWhatsAppCheckout(settingsInput, items, productsById) {
  const settings = normalizeCheckoutSettings(settingsInput);
  const summary = createCheckoutSummary(items, productsById);
  const message = [
    settings.whatsappGreeting,
    "",
    "Pedido AuFriends:",
    ...summary.items.map(({ line }) => line),
    "",
    `Total: ${summary.totalLabel}`,
    "",
    DELIVERY_AND_PIX_REQUEST
  ].join("\n");
  const url = `https://${WHATSAPP_HOST}/${settings.whatsappDigits}?text=${encodeURIComponent(message)}`;

  return Object.freeze({
    ...settings,
    summary,
    message,
    url
  });
}

function requireWhatsAppUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new WhatsAppCheckoutValidationError("O destino do WhatsApp é inválido.");
  }
  const digits = url.pathname.slice(1);
  const parameters = [...url.searchParams.keys()];
  if (
    url.protocol !== "https:"
    || url.hostname !== WHATSAPP_HOST
    || url.port !== ""
    || url.username !== ""
    || url.password !== ""
    || url.hash !== ""
    || !WHATSAPP_DIGITS.test(digits)
    || parameters.length !== 1
    || parameters[0] !== "text"
    || !url.searchParams.get("text")
  ) {
    throw new WhatsAppCheckoutValidationError("O destino do WhatsApp é inválido.");
  }
}

export function openWhatsAppCheckout(openWindow, url) {
  requireWhatsAppUrl(url);
  if (typeof openWindow !== "function") {
    throw new TypeError("A função de abertura da janela é obrigatória.");
  }

  let popup;
  try {
    popup = openWindow("about:blank", "_blank");
  } catch {
    return Object.freeze({ opened: false, reason: "blocked" });
  }
  if (!popup) return Object.freeze({ opened: false, reason: "blocked" });

  try {
    popup.opener = null;
    popup.location.replace(url);
    return Object.freeze({ opened: true, reason: null });
  } catch {
    try {
      popup.close();
    } catch {
      // A orientação acessível cobre navegadores que também impedem fechar a janela vazia.
    }
    return Object.freeze({ opened: false, reason: "navigation" });
  }
}

export function whatsappCheckoutErrorMessage(error) {
  if (error instanceof WhatsAppCheckoutValidationError) return error.message;
  const code = String(error?.code ?? "").replace(/^firestore\//, "");
  if (code === "permission-denied") {
    return "A configuração pública do WhatsApp não pôde ser lida. Tente novamente mais tarde.";
  }
  if (["unavailable", "deadline-exceeded", "network-request-failed"].includes(code)) {
    return "O serviço local está indisponível no momento. Tente carregar a configuração novamente.";
  }
  return "Não foi possível preparar a finalização pelo WhatsApp. Tente novamente.";
}

export function createCheckoutSettingsService(database) {
  if (!database) throw new TypeError("Firestore é obrigatório.");
  return Object.freeze({
    async readPublicSettings() {
      const snapshot = await getDocFromServer(doc(database, "siteSettings", "public"));
      if (!snapshot.exists()) {
        throw new WhatsAppCheckoutValidationError(
          "A finalização pelo WhatsApp está indisponível porque a configuração de contato não foi concluída."
        );
      }
      const data = snapshot.data();
      if (data.schemaVersion !== 1) {
        throw new WhatsAppCheckoutValidationError(
          "A finalização pelo WhatsApp está indisponível porque a configuração de contato não foi concluída."
        );
      }
      return normalizeCheckoutSettings(data);
    }
  });
}
