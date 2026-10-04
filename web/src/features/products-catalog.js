import { firebaseClient } from "../config/firebase-client.js";
import { cartStore } from "../services/cart-store.js";
import {
  createProductsDataService,
  filterPublicProducts,
  formatBRL,
  hasValidCompareAtPrice,
  productDataErrorMessage
} from "../services/products-data.js";

const service = createProductsDataService(firebaseClient.firestore, firebaseClient.media);
const filtersForm = document.querySelector("[data-product-filters]");
const filtersFieldset = document.querySelector("[data-product-filter-fieldset]");
const filterStatus = document.querySelector("[data-product-filter-status]");
const productsStatus = document.querySelector("[data-products-status]");
const productsGrid = document.querySelector("[data-product-grid]");
const retry = document.querySelector("[data-products-retry]");
const reset = document.querySelector("[data-product-filter-reset]");

const categoryLabels = Object.freeze({
  food: "Ração",
  treats: "Petiscos",
  accessories: "Acessórios",
  hygiene: "Higiene",
  clothing: "Roupinhas",
  toys: "Brinquedos"
});
const priceLabels = Object.freeze({
  "up-to-3000": "até R$ 30,00",
  "3001-8000": "de R$ 30,01 a R$ 80,00",
  "over-8000": "acima de R$ 80,00"
});

let products = [];
let selectedCategory = "all";
let selectedPrice = "all";

function node(name, className, content) {
  const element = document.createElement(name);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function setProductsStatus(message, kind = "info") {
  productsStatus.textContent = message;
  productsStatus.setAttribute("role", kind === "error" ? "alert" : "status");
  productsStatus.classList.toggle("placeholder-note--error", kind === "error");
  productsStatus.classList.toggle("placeholder-note--success", kind === "success");
}

function updateFilterControls() {
  for (const button of filtersForm.querySelectorAll("[data-product-category]")) {
    button.setAttribute("aria-pressed", String(button.dataset.productCategory === selectedCategory));
  }
  for (const button of filtersForm.querySelectorAll("[data-product-price]")) {
    button.setAttribute("aria-pressed", String(button.dataset.productPrice === selectedPrice));
  }

  const active = [];
  if (selectedCategory !== "all") active.push(categoryLabels[selectedCategory]);
  if (selectedPrice !== "all") active.push(priceLabels[selectedPrice]);
  filterStatus.textContent = active.length === 0
    ? "Exibindo todas as categorias e preços."
    : `Filtros ativos: ${active.join("; ")}.`;
}

function productMedia(product, index) {
  const media = node("div", "product-card__media");
  if (!product.imageUrl) {
    media.append(node("span", "product-media-placeholder", "Imagem indisponível"));
    return media;
  }

  const image = node("img");
  image.src = product.imageUrl;
  image.alt = product.imageAlt;
  image.loading = index < 4 ? "eager" : "lazy";
  image.decoding = "async";
  image.fetchPriority = index < 2 ? "high" : "auto";
  image.addEventListener("error", () => {
    image.remove();
    media.append(node("span", "product-media-placeholder", "Imagem indisponível"));
  }, { once: true });
  media.append(image);
  return media;
}

function addProduct(product, button) {
  try {
    const changed = cartStore.add(product.id);
    if (!changed) {
      setProductsStatus(`${product.name} já está com a quantidade máxima de 99 no carrinho.`, "error");
      return;
    }
    const total = cartStore.getTotalQuantity();
    setProductsStatus(
      `${product.name} foi adicionado. O carrinho agora tem ${total} ${total === 1 ? "item" : "itens"}.`,
      "success"
    );
    button.textContent = "Adicionado";
    window.setTimeout(() => {
      button.textContent = "Comprar";
    }, 1_200);
  } catch {
    setProductsStatus("Não foi possível atualizar o carrinho neste navegador.", "error");
  }
}

function productCard(product, index) {
  const card = node("article", "product-card");
  if (product.badge) card.append(node("span", "product-card__badge", product.badge));
  card.append(productMedia(product, index));

  const body = node("div", "product-card__body");
  body.append(
    node("span", "product-card__brand", "AuFriends Pet"),
    node("h2", null, product.name),
    node("p", null, product.description)
  );
  if (hasValidCompareAtPrice(product)) {
    body.append(node("span", "product-card__old-price", formatBRL(product.compareAtPriceCents)));
  }
  body.append(node("span", "product-card__price", formatBRL(product.priceCents)));
  const buy = node("button", "button", "Comprar");
  buy.type = "button";
  buy.addEventListener("click", () => addProduct(product, buy));
  body.append(buy);
  card.append(body);
  return card;
}

function renderProducts() {
  const filtered = filterPublicProducts(products, {
    category: selectedCategory,
    price: selectedPrice
  });
  productsGrid.replaceChildren(...filtered.map(productCard));
  productsGrid.setAttribute("aria-busy", "false");
  setProductsStatus(
    filtered.length === 0
      ? "Nenhum produto ativo corresponde aos filtros escolhidos."
      : `${filtered.length} ${filtered.length === 1 ? "produto encontrado" : "produtos encontrados"}.`
  );
}

async function loadProducts() {
  retry.hidden = true;
  filtersFieldset.disabled = true;
  productsGrid.setAttribute("aria-busy", "true");
  productsGrid.replaceChildren();
  setProductsStatus("Carregando produtos…");
  try {
    products = await service.listPublicProducts();
    filtersFieldset.disabled = false;
    renderProducts();
  } catch (error) {
    productsGrid.setAttribute("aria-busy", "false");
    retry.hidden = false;
    setProductsStatus(productDataErrorMessage(error), "error");
  }
}

function selectFilter(event) {
  const category = event.target.closest("[data-product-category]")?.dataset.productCategory;
  const price = event.target.closest("[data-product-price]")?.dataset.productPrice;
  if (!category && !price) return;
  if (category) selectedCategory = selectedCategory === category ? "all" : category;
  if (price) selectedPrice = selectedPrice === price ? "all" : price;
  updateFilterControls();
  renderProducts();
}

filtersForm.addEventListener("click", selectFilter);
reset.addEventListener("click", () => {
  selectedCategory = "all";
  selectedPrice = "all";
  updateFilterControls();
  renderProducts();
});
retry.addEventListener("click", loadProducts);
updateFilterControls();
void loadProducts();
