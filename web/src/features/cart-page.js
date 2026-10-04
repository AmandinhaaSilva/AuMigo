import { firebaseClient } from "../config/firebase-client.js";
import {
  CartValidationError,
  cartStore,
  reconcileCartItems
} from "../services/cart-store.js";
import {
  createProductsDataService,
  formatBRL,
  productDataErrorMessage
} from "../services/products-data.js";
import {
  buildWhatsAppCheckout,
  createCheckoutSettingsService,
  createCheckoutSummary,
  openWhatsAppCheckout,
  whatsappCheckoutErrorMessage
} from "../services/whatsapp-checkout.js";

const service = createProductsDataService(firebaseClient.firestore, firebaseClient.media);
const settingsService = createCheckoutSettingsService(firebaseClient.firestore);
const status = document.querySelector("[data-cart-status]");
const list = document.querySelector("[data-cart-list]");
const empty = document.querySelector("[data-cart-empty]");
const summary = document.querySelector("[data-cart-summary]");
const total = document.querySelector("[data-cart-total]");
const clear = document.querySelector("[data-cart-clear]");
const retry = document.querySelector("[data-cart-retry]");
const checkoutButton = document.querySelector("[data-cart-checkout]");
const checkoutStatus = document.querySelector("[data-checkout-status]");
const checkoutRetry = document.querySelector("[data-checkout-retry]");
const checkoutPreview = document.querySelector("[data-checkout-preview]");
const checkoutMessage = document.querySelector("[data-checkout-message]");

let productsById = null;
let reconciling = false;
let displayedSummary = null;
let checkoutSettings = null;
let checkoutSettingsLoading = true;
let checkoutSettingsError = null;
let preparedCheckout = null;

function node(name, className, content) {
  const element = document.createElement(name);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function setStatus(message, kind = "info") {
  status.textContent = message;
  status.setAttribute("role", kind === "error" ? "alert" : "status");
  status.classList.toggle("placeholder-note--error", kind === "error");
  status.classList.toggle("placeholder-note--success", kind === "success");
}

function setCheckoutStatus(message, kind = "info") {
  checkoutStatus.textContent = message;
  checkoutStatus.setAttribute("role", kind === "error" ? "alert" : "status");
  checkoutStatus.classList.toggle("placeholder-note--error", kind === "error");
  checkoutStatus.classList.toggle("placeholder-note--success", kind === "success");
}

function resetCheckoutPreview() {
  preparedCheckout = null;
  checkoutButton.disabled = true;
  checkoutPreview.hidden = true;
  checkoutMessage.textContent = "";
}

function updateCheckoutState() {
  resetCheckoutPreview();
  checkoutButton.setAttribute("aria-busy", checkoutSettingsLoading ? "true" : "false");
  checkoutRetry.hidden = !checkoutSettingsError;

  if (checkoutSettingsLoading) {
    setCheckoutStatus("Carregando a configuração pública do WhatsApp…");
    return;
  }
  if (checkoutSettingsError) {
    setCheckoutStatus(checkoutSettingsError, "error");
    return;
  }
  if (!productsById) {
    setCheckoutStatus("Aguarde os preços atuais do catálogo antes de finalizar.");
    return;
  }
  if (!displayedSummary) {
    setCheckoutStatus("Adicione ao menos um produto ao carrinho antes de finalizar.");
    return;
  }

  try {
    preparedCheckout = buildWhatsAppCheckout(
      checkoutSettings,
      cartStore.getItems(),
      productsById
    );
    checkoutMessage.textContent = preparedCheckout.message;
    checkoutPreview.hidden = false;
    checkoutButton.disabled = false;
    setCheckoutStatus(
      "Resumo pronto. O WhatsApp só será aberto quando você acionar o botão."
    );
  } catch (error) {
    setCheckoutStatus(whatsappCheckoutErrorMessage(error), "error");
  }
}

function productMedia(product, index) {
  const media = node("div", "cart-item__media");
  if (!product.imageUrl) {
    media.append(node("span", "product-media-placeholder", "Imagem indisponível"));
    return media;
  }
  const image = node("img");
  image.src = product.imageUrl;
  image.alt = product.imageAlt;
  image.loading = index < 3 ? "eager" : "lazy";
  image.decoding = "async";
  image.fetchPriority = index === 0 ? "high" : "auto";
  image.addEventListener("error", () => {
    image.remove();
    media.append(node("span", "product-media-placeholder", "Imagem indisponível"));
  }, { once: true });
  media.append(image);
  return media;
}

function updateQuantity(product, quantity, action) {
  try {
    action();
    setStatus(`Quantidade de ${product.name} atualizada.`, "success");
  } catch (error) {
    setStatus(
      error instanceof CartValidationError
        ? error.message
        : "Não foi possível atualizar o carrinho.",
      "error"
    );
    renderCart();
  }
}

function cartItem(item, summaryItem, index) {
  const product = productsById.get(item.productId);
  const article = node("article", "cart-item");
  const copy = node("div", "cart-item__copy");
  copy.append(
    node("h2", null, summaryItem.name),
    node("p", null, product.description),
    node("strong", "cart-item__unit-price", `${summaryItem.unitPriceLabel} por unidade`)
  );

  const quantity = node("div", "cart-quantity");
  const decrease = node("button", "cart-quantity__button", "−");
  decrease.type = "button";
  decrease.disabled = item.quantity === 1;
  decrease.setAttribute("aria-label", `Reduzir quantidade de ${product.name}`);
  decrease.addEventListener("click", () => updateQuantity(
    product,
    item.quantity - 1,
    () => cartStore.decrement(product.id)
  ));

  const input = node("input", "cart-quantity__input");
  input.type = "number";
  input.min = "1";
  input.max = "99";
  input.step = "1";
  input.value = String(item.quantity);
  input.setAttribute("aria-label", `Quantidade de ${product.name}`);
  input.addEventListener("change", () => {
    const next = Number(input.value);
    updateQuantity(product, next, () => cartStore.setQuantity(product.id, next));
  });

  const increase = node("button", "cart-quantity__button", "+");
  increase.type = "button";
  increase.disabled = item.quantity === 99;
  increase.setAttribute("aria-label", `Aumentar quantidade de ${product.name}`);
  increase.addEventListener("click", () => updateQuantity(
    product,
    item.quantity + 1,
    () => cartStore.increment(product.id)
  ));
  quantity.append(decrease, input, increase);

  const controls = node("div", "cart-item__controls");
  controls.append(quantity, node("strong", "cart-item__subtotal", summaryItem.subtotalLabel));
  const remove = node("button", "cart-item__remove", "Remover");
  remove.type = "button";
  remove.addEventListener("click", () => {
    cartStore.remove(product.id);
    setStatus(`${product.name} foi removido do carrinho.`, "success");
  });
  controls.append(remove);

  article.append(productMedia(product, index), copy, controls);
  return article;
}

function renderCart(message = null, kind = "info") {
  if (!productsById || reconciling) return;
  displayedSummary = null;
  const reconciliation = reconcileCartItems(cartStore.getItems(), new Set(productsById.keys()));
  let availabilityMessage = null;
  if (reconciliation.removed.length > 0) {
    reconciling = true;
    cartStore.removeMany(reconciliation.removed.map(({ productId }) => productId));
    reconciling = false;
    const removedQuantity = reconciliation.removed.reduce((sum, item) => sum + item.quantity, 0);
    availabilityMessage = `${removedQuantity} ${removedQuantity === 1 ? "item indisponível foi removido" : "itens indisponíveis foram removidos"} do carrinho.`;
  }

  const items = cartStore.getItems();
  list.setAttribute("aria-busy", "false");
  empty.hidden = items.length > 0;
  list.hidden = items.length === 0;
  summary.hidden = items.length === 0;
  clear.hidden = items.length === 0;

  if (items.length === 0) {
    list.replaceChildren();
    total.textContent = formatBRL(0);
    setStatus(availabilityMessage ?? message ?? "Seu carrinho está vazio.", availabilityMessage ? "error" : kind);
    updateCheckoutState();
    return;
  }

  try {
    displayedSummary = createCheckoutSummary(items, productsById);
  } catch {
    list.replaceChildren();
    list.hidden = true;
    summary.hidden = true;
    total.textContent = "—";
    setStatus("O catálogo contém dados inválidos. Atualize a página antes de continuar.", "error");
    updateCheckoutState();
    return;
  }

  const summaryById = new Map(
    displayedSummary.items.map((item) => [item.productId, item])
  );
  list.replaceChildren(...items.map((item, index) => cartItem(item, summaryById.get(item.productId), index)));
  total.textContent = displayedSummary.totalLabel;
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  setStatus(
    availabilityMessage ?? message ?? `${quantity} ${quantity === 1 ? "item" : "itens"} no carrinho.`,
    availabilityMessage ? "error" : kind
  );
  updateCheckoutState();
}

async function loadCartProducts() {
  displayedSummary = null;
  productsById = null;
  updateCheckoutState();
  retry.hidden = true;
  list.hidden = false;
  list.setAttribute("aria-busy", "true");
  list.replaceChildren();
  empty.hidden = true;
  summary.hidden = true;
  clear.hidden = true;
  setStatus("Carregando os preços atuais do catálogo…");
  try {
    const products = await service.listPublicProducts();
    productsById = new Map(products.map((product) => [product.id, product]));
    renderCart();
  } catch (error) {
    productsById = null;
    displayedSummary = null;
    list.setAttribute("aria-busy", "false");
    list.hidden = true;
    total.textContent = "—";
    retry.hidden = false;
    setStatus(productDataErrorMessage(error), "error");
    updateCheckoutState();
  }
}

async function loadCheckoutSettings() {
  checkoutSettings = null;
  checkoutSettingsError = null;
  checkoutSettingsLoading = true;
  updateCheckoutState();
  try {
    checkoutSettings = await settingsService.readPublicSettings();
  } catch (error) {
    checkoutSettingsError = whatsappCheckoutErrorMessage(error);
  } finally {
    checkoutSettingsLoading = false;
    updateCheckoutState();
  }
}

cartStore.subscribe(() => renderCart());
clear.addEventListener("click", () => {
  if (!window.confirm("Esvaziar todos os itens do carrinho?")) return;
  cartStore.clear();
  setStatus("Carrinho esvaziado.", "success");
});
retry.addEventListener("click", loadCartProducts);
checkoutRetry.addEventListener("click", loadCheckoutSettings);
checkoutButton.addEventListener("click", () => {
  if (!preparedCheckout) {
    updateCheckoutState();
    setCheckoutStatus(
      "A finalização ainda não está pronta. Confira o carrinho e a configuração do WhatsApp.",
      "error"
    );
    return;
  }

  const cartBeforeOpening = JSON.stringify(cartStore.getItems());
  const outcome = openWhatsAppCheckout(
    (url, target) => window.open(url, target),
    preparedCheckout.url
  );
  if (!outcome.opened) {
    setCheckoutStatus(
      outcome.reason === "blocked"
        ? "O navegador bloqueou a nova janela. Permita pop-ups para este site e tente novamente."
        : "Não foi possível abrir o WhatsApp. Verifique o bloqueio de pop-ups e tente novamente.",
      "error"
    );
    return;
  }

  if (JSON.stringify(cartStore.getItems()) !== cartBeforeOpening) {
    setCheckoutStatus("O carrinho mudou durante a abertura. Confira o resumo novamente.", "error");
    renderCart();
    return;
  }
  setCheckoutStatus("WhatsApp aberto com o resumo exibido. Seu carrinho foi mantido.", "success");
});

void Promise.all([loadCartProducts(), loadCheckoutSettings()]);
