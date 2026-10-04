import { firebaseClient } from "../config/firebase-client.js";
import {
  ProductDataValidationError,
  centsToBRLInput,
  createProductsDataService,
  formatBRL,
  hasValidCompareAtPrice,
  normalizeProductInput,
  optimizeProductImage,
  productDataErrorMessage
} from "../services/products-data.js";

const service = createProductsDataService(firebaseClient.firestore, firebaseClient.media);
const status = document.querySelector("[data-admin-products-status]");
const list = document.querySelector("[data-admin-products-list]");
const create = document.querySelector("[data-product-new]");
const form = document.querySelector("[data-product-form]");
const fieldset = document.querySelector("[data-product-fieldset]");
const formTitle = document.querySelector("[data-product-form-title]");
const save = document.querySelector("[data-product-save]");
const cancel = document.querySelector("[data-product-cancel]");
const imageNote = document.querySelector("[data-product-image-note]");

const categoryLabels = Object.freeze({
  food: "Ração",
  treats: "Petiscos",
  accessories: "Acessórios",
  hygiene: "Higiene",
  clothing: "Roupinhas",
  toys: "Brinquedos"
});

let initialized = false;
let activeUser;
let products = [];
let editingProduct = null;

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

function notifyMetricRefresh() {
  document.dispatchEvent(new CustomEvent("aufriends:metrics-refresh"));
}

function setFormBusy(busy, message = null) {
  form.setAttribute("aria-busy", String(busy));
  fieldset.disabled = busy;
  save.textContent = busy ? "Salvando…" : "Salvar produto";
  if (message) setStatus(message);
}

function clearValidity() {
  for (const field of form.elements) field.setCustomValidity?.("");
}

function reportErrors(errors) {
  clearValidity();
  let firstInvalid;
  for (const [name, message] of Object.entries(errors)) {
    const field = form.elements.namedItem(name);
    if (!field?.setCustomValidity) continue;
    field.setCustomValidity(message);
    firstInvalid ??= field;
  }
  setStatus("Revise os campos indicados antes de salvar.", "error");
  firstInvalid?.reportValidity();
  firstInvalid?.focus();
}

function openForm(current = null) {
  editingProduct = current;
  form.reset();
  clearValidity();
  form.hidden = false;
  formTitle.textContent = current ? `Editar ${current.name}` : "Novo produto";
  imageNote.textContent = current
    ? "Opcional. Escolha um arquivo somente para substituir a imagem atual."
    : "Obrigatória no cadastro. JPEG, PNG ou WebP de até 5 MiB; a maior dimensão será limitada a 1600 px.";
  const image = form.elements.namedItem("image");
  image.required = !current;

  if (current) {
    for (const name of ["name", "description", "category", "badge", "sortOrder", "imageAlt"]) {
      form.elements.namedItem(name).value = current[name] ?? "";
    }
    form.elements.namedItem("priceReais").value = centsToBRLInput(current.priceCents);
    form.elements.namedItem("compareAtPriceReais").value = current.compareAtPriceCents === null
      ? ""
      : centsToBRLInput(current.compareAtPriceCents);
    form.elements.namedItem("active").checked = current.active === true;
  } else {
    form.elements.namedItem("sortOrder").value = "0";
    form.elements.namedItem("active").checked = true;
  }

  setStatus(current ? "Edite os dados e salve as alterações." : "Preencha o novo produto.");
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  form.elements.namedItem("name").focus();
}

function closeForm() {
  editingProduct = null;
  fieldset.disabled = false;
  save.textContent = "Salvar produto";
  form.setAttribute("aria-busy", "false");
  form.hidden = true;
  form.reset();
  clearValidity();
}

function productInput() {
  return {
    name: form.elements.namedItem("name").value,
    description: form.elements.namedItem("description").value,
    category: form.elements.namedItem("category").value,
    priceReais: form.elements.namedItem("priceReais").value,
    compareAtPriceReais: form.elements.namedItem("compareAtPriceReais").value,
    badge: form.elements.namedItem("badge").value,
    active: form.elements.namedItem("active").checked,
    sortOrder: form.elements.namedItem("sortOrder").value,
    imageAlt: form.elements.namedItem("imageAlt").value
  };
}

function productMedia(product) {
  const media = node("div", "admin-resource-card__media");
  if (!product.imageUrl) {
    media.append(node("span", "animal-media-placeholder", "Imagem indisponível"));
    return media;
  }
  const image = node("img");
  image.src = product.imageUrl;
  image.alt = product.imageAlt;
  image.loading = "lazy";
  image.addEventListener("error", () => {
    image.remove();
    media.append(node("span", "animal-media-placeholder", "Imagem indisponível"));
  }, { once: true });
  media.append(image);
  return media;
}

async function runAction(card, message, action) {
  card.setAttribute("aria-busy", "true");
  setStatus(message);
  try {
    const outcome = await action();
    await loadProducts();
    notifyMetricRefresh();
    setStatus(
      outcome?.warning ?? "Operação concluída.",
      outcome?.warning ? "error" : "success"
    );
  } catch (error) {
    card.setAttribute("aria-busy", "false");
    setStatus(productDataErrorMessage(error, "save"), "error");
  }
}

function productCard(product) {
  const card = node("article", "admin-resource-card");
  const copy = node("div", "admin-resource-card__copy");
  const heading = node("h3", null, product.name);
  const description = node("p", null, product.description);
  const prices = hasValidCompareAtPrice(product)
    ? `${formatBRL(product.priceCents)} (de ${formatBRL(product.compareAtPriceCents)})`
    : formatBRL(product.priceCents);
  const badges = node("div", "admin-resource-badges");
  badges.append(
    node("span", null, categoryLabels[product.category] ?? product.category),
    node("span", null, prices),
    node("span", null, product.active ? "Ativo" : "Inativo"),
    node("span", null, `Ordem ${product.sortOrder}`)
  );

  const actions = node("div", "admin-resource-actions");
  const edit = node("button", "button button--compact", "Editar");
  edit.type = "button";
  edit.addEventListener("click", () => openForm(product));
  const toggle = node(
    "button",
    "button button--compact button--secondary",
    product.active ? "Desativar" : "Ativar"
  );
  toggle.type = "button";
  toggle.addEventListener("click", () => runAction(
    card,
    `${product.active ? "Desativando" : "Ativando"} ${product.name}…`,
    () => service.setProductActive(activeUser.uid, product, !product.active)
  ));
  const remove = node("button", "button button--compact admin-button--danger", "Excluir");
  remove.type = "button";
  remove.addEventListener("click", () => {
    if (!window.confirm(`Excluir definitivamente o produto ${product.name}?`)) return;
    void runAction(card, `Excluindo ${product.name}…`, () => service.deleteProduct(activeUser.uid, product));
  });
  actions.append(edit, toggle, remove);
  copy.append(heading, description, badges, actions);
  card.append(productMedia(product), copy);
  return card;
}

function renderProducts() {
  list.replaceChildren(...products.map(productCard));
  list.setAttribute("aria-busy", "false");
  setStatus(
    products.length === 0
      ? "Nenhum produto cadastrado."
      : `${products.length} ${products.length === 1 ? "produto cadastrado" : "produtos cadastrados"}.`
  );
}

async function loadProducts() {
  list.setAttribute("aria-busy", "true");
  setStatus("Carregando produtos…");
  try {
    products = await service.listAdminProducts();
    renderProducts();
  } catch (error) {
    list.setAttribute("aria-busy", "false");
    setStatus(productDataErrorMessage(error), "error");
  }
}

async function saveProduct(event) {
  event.preventDefault();
  clearValidity();
  if (!form.reportValidity()) return;

  const input = productInput();
  const normalized = normalizeProductInput(input);
  if (!normalized.valid) {
    reportErrors(normalized.errors);
    return;
  }

  const selectedFile = form.elements.namedItem("image").files[0] ?? null;
  setFormBusy(true, selectedFile ? "Otimizando e salvando a imagem…" : "Salvando o produto…");
  try {
    const preparedFile = selectedFile ? await optimizeProductImage(selectedFile) : null;
    const outcome = await service.saveProduct(activeUser.uid, input, {
      current: editingProduct,
      imageFile: preparedFile
    });
    closeForm();
    await loadProducts();
    notifyMetricRefresh();
    setStatus(
      outcome.warning ?? "Produto salvo com sucesso.",
      outcome.warning ? "error" : "success"
    );
  } catch (error) {
    if (error instanceof ProductDataValidationError) {
      setFormBusy(false);
      reportErrors(error.errors);
    } else {
      const orphan = error?.orphanPath
        ? ` A mídia órfã deve ser limpa manualmente: ${error.orphanPath}`
        : "";
      setStatus(`${productDataErrorMessage(error, "save")}${orphan}`, "error");
    }
  } finally {
    if (!form.hidden) setFormBusy(false);
  }
}

function setupEvents() {
  create.addEventListener("click", () => openForm());
  cancel.addEventListener("click", closeForm);
  form.addEventListener("submit", saveProduct);
  for (const field of form.elements) {
    field.addEventListener?.("input", () => field.setCustomValidity?.(""));
  }
}

export async function initializeAdminProducts(user) {
  if (initialized) return;
  if (!user?.uid) throw new TypeError("Sessão administrativa obrigatória.");
  initialized = true;
  activeUser = user;
  setupEvents();
  await loadProducts();
}
