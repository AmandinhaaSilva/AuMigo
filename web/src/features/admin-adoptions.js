import { firebaseClient } from "../config/firebase-client.js";
import {
  AdoptionDataValidationError,
  adoptionDataErrorMessage,
  allowedAdoptionRequestStatuses,
  allowedAnimalStatuses,
  createAdoptionsDataService,
  formatAnimalAge,
  normalizeAnimalInput,
  optimizeCatalogImage
} from "../services/adoptions-data.js";

const service = createAdoptionsDataService(firebaseClient.firestore, firebaseClient.media);
const animalStatus = document.querySelector("[data-admin-animals-status]");
const animalList = document.querySelector("[data-admin-animals-list]");
const animalNew = document.querySelector("[data-animal-new]");
const animalForm = document.querySelector("[data-animal-form]");
const animalFieldset = document.querySelector("[data-animal-fieldset]");
const animalFormTitle = document.querySelector("[data-animal-form-title]");
const animalSave = document.querySelector("[data-animal-save]");
const animalCancel = document.querySelector("[data-animal-cancel]");
const animalImageNote = document.querySelector("[data-animal-image-note]");
const requestStatus = document.querySelector("[data-admin-requests-status]");
const requestList = document.querySelector("[data-admin-requests-list]");
const requestFilter = document.querySelector("[data-request-filter]");
const requestRefresh = document.querySelector("[data-requests-refresh]");

const animalLabels = Object.freeze({
  species: Object.freeze({ dog: "Cão", cat: "Gato", other: "Outro" }),
  sex: Object.freeze({ female: "Fêmea", male: "Macho" }),
  size: Object.freeze({ small: "Pequeno", medium: "Médio", large: "Grande" }),
  status: Object.freeze({ available: "Disponível", in_process: "Em processo", adopted: "Adotado" })
});
const requestLabels = Object.freeze({
  pending: "Pendente",
  contacting: "Em contato",
  approved: "Aprovada",
  rejected: "Rejeitada"
});

let initialized = false;
let activeUser;
let animals = [];
let editingAnimal = null;

function node(name, className, content) {
  const element = document.createElement(name);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function setStatus(element, message, kind = "info") {
  element.textContent = message;
  element.setAttribute("role", kind === "error" ? "alert" : "status");
  element.classList.toggle("placeholder-note--error", kind === "error");
  element.classList.toggle("placeholder-note--success", kind === "success");
}

function notifyMetricRefresh() {
  document.dispatchEvent(new CustomEvent("aufriends:metrics-refresh"));
}

function setAnimalFormBusy(busy, message = null) {
  animalForm.setAttribute("aria-busy", String(busy));
  animalFieldset.disabled = busy;
  animalSave.textContent = busy ? "Salvando…" : "Salvar animal";
  if (message) setStatus(animalStatus, message);
}

function clearAnimalValidity() {
  for (const field of animalForm.elements) field.setCustomValidity?.("");
}

function reportAnimalErrors(errors) {
  clearAnimalValidity();
  let firstInvalid;
  for (const [name, message] of Object.entries(errors)) {
    const field = animalForm.elements.namedItem(name);
    if (!field?.setCustomValidity) continue;
    field.setCustomValidity(message);
    firstInvalid ??= field;
  }
  setStatus(animalStatus, "Revise os campos indicados antes de salvar.", "error");
  firstInvalid?.reportValidity();
  firstInvalid?.focus();
}

function replaceOptions(select, statuses, labels, selected) {
  select.replaceChildren(...statuses.map((status) => {
    const option = node("option", null, labels[status] ?? status);
    option.value = status;
    option.selected = status === selected;
    return option;
  }));
}

function openAnimalForm(current = null) {
  editingAnimal = current;
  animalForm.reset();
  clearAnimalValidity();
  animalForm.hidden = false;
  animalFormTitle.textContent = current ? `Editar ${current.name}` : "Novo animal";
  animalImageNote.textContent = current
    ? "Opcional. Selecione um arquivo somente para substituir a imagem atual."
    : "Obrigatória no cadastro. JPEG, PNG ou WebP de até 5 MiB.";
  const imageInput = animalForm.elements.namedItem("image");
  imageInput.required = !current;

  if (current) {
    for (const name of [
      "name", "species", "breed", "ageMonths", "sex", "size", "color",
      "description", "sortOrder", "imageAlt"
    ]) {
      animalForm.elements.namedItem(name).value = current[name] ?? "";
    }
    animalForm.elements.namedItem("published").checked = current.published === true;
    replaceOptions(
      animalForm.elements.namedItem("adoptionStatus"),
      allowedAnimalStatuses(current.adoptionStatus),
      animalLabels.status,
      current.adoptionStatus
    );
  } else {
    animalForm.elements.namedItem("sortOrder").value = "0";
    replaceOptions(
      animalForm.elements.namedItem("adoptionStatus"),
      ["available"],
      animalLabels.status,
      "available"
    );
  }

  setStatus(animalStatus, current ? "Edite os dados e salve as alterações." : "Preencha o novo perfil de adoção.");
  animalForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  animalForm.elements.namedItem("name").focus();
}

function closeAnimalForm() {
  editingAnimal = null;
  animalFieldset.disabled = false;
  animalSave.textContent = "Salvar animal";
  animalForm.setAttribute("aria-busy", "false");
  animalForm.hidden = true;
  animalForm.reset();
  clearAnimalValidity();
}

function animalInput() {
  return {
    name: animalForm.elements.namedItem("name").value,
    species: animalForm.elements.namedItem("species").value,
    breed: animalForm.elements.namedItem("breed").value,
    ageMonths: animalForm.elements.namedItem("ageMonths").value,
    sex: animalForm.elements.namedItem("sex").value,
    size: animalForm.elements.namedItem("size").value,
    color: animalForm.elements.namedItem("color").value,
    description: animalForm.elements.namedItem("description").value,
    adoptionStatus: animalForm.elements.namedItem("adoptionStatus").value,
    published: animalForm.elements.namedItem("published").checked,
    sortOrder: animalForm.elements.namedItem("sortOrder").value,
    imageAlt: animalForm.elements.namedItem("imageAlt").value
  };
}

function mediaFor(animal) {
  const media = node("div", "admin-resource-card__media");
  if (animal.imageUrl) {
    const image = node("img");
    image.src = animal.imageUrl;
    image.alt = animal.imageAlt;
    image.loading = "lazy";
    image.addEventListener("error", () => {
      image.remove();
      media.append(node("span", "animal-media-placeholder", "Imagem indisponível"));
    }, { once: true });
    media.append(image);
  } else {
    media.append(node("span", "animal-media-placeholder", "Imagem indisponível"));
  }
  return media;
}

async function runAnimalAction(card, message, action) {
  card.setAttribute("aria-busy", "true");
  setStatus(animalStatus, message);
  try {
    const outcome = await action();
    await loadAnimals();
    notifyMetricRefresh();
    setStatus(animalStatus, outcome?.warning ?? "Operação concluída.", outcome?.warning ? "error" : "success");
  } catch (error) {
    setStatus(animalStatus, adoptionDataErrorMessage(error, "save"), "error");
    card.setAttribute("aria-busy", "false");
  }
}

function animalCard(animal) {
  const card = node("article", "admin-resource-card");
  const copy = node("div", "admin-resource-card__copy");
  const heading = node("h3", null, animal.name);
  const description = node(
    "p",
    null,
    `${animalLabels.species[animal.species]} • ${animalLabels.sex[animal.sex]} • ${animalLabels.size[animal.size]} • ${formatAnimalAge(animal.ageMonths)}`
  );
  const badges = node("div", "admin-resource-badges");
  badges.append(
    node("span", null, animalLabels.status[animal.adoptionStatus]),
    node("span", null, animal.published ? "Publicado" : "Oculto"),
    node("span", null, `Ordem ${animal.sortOrder}`)
  );

  const statusControls = node("div", "admin-inline-controls");
  const statusSelect = node("select");
  statusSelect.setAttribute("aria-label", `Status de ${animal.name}`);
  replaceOptions(
    statusSelect,
    allowedAnimalStatuses(animal.adoptionStatus),
    animalLabels.status,
    animal.adoptionStatus
  );
  const statusButton = node("button", "button button--compact button--secondary", "Atualizar status");
  statusButton.type = "button";
  statusButton.addEventListener("click", () => runAnimalAction(
    card,
    `Atualizando o status de ${animal.name}…`,
    () => service.setAnimalStatus(activeUser.uid, animal, statusSelect.value)
  ));
  statusControls.append(statusSelect, statusButton);

  const actions = node("div", "admin-resource-actions");
  const edit = node("button", "button button--compact", "Editar");
  edit.type = "button";
  edit.addEventListener("click", () => openAnimalForm(animal));
  const publish = node(
    "button",
    "button button--compact button--secondary",
    animal.published ? "Ocultar" : "Publicar"
  );
  publish.type = "button";
  publish.addEventListener("click", () => runAnimalAction(
    card,
    `${animal.published ? "Ocultando" : "Publicando"} ${animal.name}…`,
    () => service.setAnimalPublished(activeUser.uid, animal, !animal.published)
  ));
  const remove = node("button", "button button--compact admin-button--danger", "Excluir");
  remove.type = "button";
  remove.addEventListener("click", () => {
    if (!window.confirm(`Excluir definitivamente o cadastro de ${animal.name}?`)) return;
    void runAnimalAction(card, `Excluindo ${animal.name}…`, () => service.deleteAnimal(activeUser.uid, animal));
  });
  actions.append(edit, publish, remove);
  copy.append(heading, description, badges, statusControls, actions);
  card.append(mediaFor(animal), copy);
  return card;
}

function renderAnimals() {
  animalList.replaceChildren(...animals.map(animalCard));
  animalList.setAttribute("aria-busy", "false");
  setStatus(
    animalStatus,
    animals.length === 0
      ? "Nenhum animal cadastrado."
      : `${animals.length} ${animals.length === 1 ? "animal cadastrado" : "animais cadastrados"}.`
  );
}

async function loadAnimals() {
  animalList.setAttribute("aria-busy", "true");
  setStatus(animalStatus, "Carregando animais…");
  try {
    animals = await service.listAdminAnimals();
    renderAnimals();
  } catch (error) {
    animalList.setAttribute("aria-busy", "false");
    setStatus(animalStatus, adoptionDataErrorMessage(error), "error");
  }
}

async function saveAnimal(event) {
  event.preventDefault();
  clearAnimalValidity();
  if (!animalForm.reportValidity()) return;

  const normalized = normalizeAnimalInput(animalInput());
  if (!normalized.valid) {
    reportAnimalErrors(normalized.errors);
    return;
  }

  const selectedFile = animalForm.elements.namedItem("image").files[0] ?? null;
  setAnimalFormBusy(true, selectedFile ? "Processando e salvando a imagem…" : "Salvando o animal…");

  try {
    const preparedFile = selectedFile ? await optimizeCatalogImage(selectedFile) : null;
    const outcome = await service.saveAnimal(activeUser.uid, normalized.values, {
      current: editingAnimal,
      imageFile: preparedFile
    });
    closeAnimalForm();
    await loadAnimals();
    notifyMetricRefresh();
    setStatus(
      animalStatus,
      outcome.warning ?? "Animal salvo com sucesso.",
      outcome.warning ? "error" : "success"
    );
  } catch (error) {
    if (error instanceof AdoptionDataValidationError) {
      setAnimalFormBusy(false);
      reportAnimalErrors(error.errors);
    } else {
      const orphan = error?.orphanPath
        ? " Uma mídia temporária pode exigir limpeza manual."
        : "";
      setStatus(animalStatus, `${adoptionDataErrorMessage(error, "save")}${orphan}`, "error");
    }
  } finally {
    if (!animalForm.hidden) setAnimalFormBusy(false);
  }
}

function formattedDate(value) {
  try {
    return value?.toDate?.().toLocaleString("pt-BR") ?? "Data indisponível";
  } catch {
    return "Data indisponível";
  }
}

function requestField(term, value) {
  const wrapper = node("div");
  wrapper.append(node("dt", null, term), node("dd", null, value || "Não informado"));
  return wrapper;
}

async function runRequestAction(card, message, action) {
  card.setAttribute("aria-busy", "true");
  setStatus(requestStatus, message);
  try {
    await action();
    await loadRequests();
    notifyMetricRefresh();
    setStatus(requestStatus, "Solicitação atualizada com sucesso.", "success");
  } catch (error) {
    card.setAttribute("aria-busy", "false");
    setStatus(requestStatus, adoptionDataErrorMessage(error, "save"), "error");
  }
}

function requestCard(request) {
  const card = node("details", "admin-request-card");
  const animalName = animals.find((animal) => animal.id === request.animalId)?.name ?? request.animalId;
  const summary = node("summary");
  summary.append(
    node("strong", null, request.fullName),
    node("span", null, `${animalName} • ${requestLabels[request.status] ?? request.status}`)
  );
  const content = node("div", "admin-request-card__content");
  const fields = node("dl", "admin-request-fields");
  fields.append(
    requestField("Animal", animalName),
    requestField("E-mail", request.email),
    requestField("Telefone", request.phoneE164),
    requestField("Cidade/UF", `${request.city}/${request.state}`),
    requestField("Recebida em", formattedDate(request.createdAt)),
    requestField("Mensagem", request.message || "Sem mensagem")
  );

  const statusField = node("div", "form-field");
  const statusLabel = node("label", null, "Status");
  const statusSelect = node("select");
  const selectId = `request-status-${request.id}`;
  statusLabel.htmlFor = selectId;
  statusSelect.id = selectId;
  replaceOptions(
    statusSelect,
    allowedAdoptionRequestStatuses(request.status),
    requestLabels,
    request.status
  );
  statusField.append(statusLabel, statusSelect);

  const notesField = node("div", "form-field admin-request-notes");
  const notesLabel = node("label", null, "Observações administrativas");
  const notes = node("textarea");
  const notesId = `request-notes-${request.id}`;
  notesLabel.htmlFor = notesId;
  notes.id = notesId;
  notes.rows = 4;
  notes.maxLength = 2_000;
  notes.value = request.adminNotes;
  notesField.append(notesLabel, notes);

  const actions = node("div", "admin-resource-actions");
  const save = node("button", "button button--compact", "Salvar tratamento");
  save.type = "button";
  save.addEventListener("click", () => runRequestAction(
    card,
    "Salvando o tratamento da solicitação…",
    () => service.updateAdoptionRequest(activeUser.uid, request, {
      status: statusSelect.value,
      adminNotes: notes.value
    })
  ));
  const remove = node("button", "button button--compact admin-button--danger", "Excluir solicitação");
  remove.type = "button";
  remove.addEventListener("click", () => {
    if (!window.confirm(`Excluir definitivamente a solicitação de ${request.fullName}?`)) return;
    void runRequestAction(
      card,
      "Excluindo a solicitação…",
      () => service.deleteAdoptionRequest(activeUser.uid, request.id)
    );
  });
  actions.append(save, remove);
  content.append(fields, statusField, notesField, actions);
  card.append(summary, content);
  return card;
}

async function loadRequests() {
  requestRefresh.disabled = true;
  requestList.setAttribute("aria-busy", "true");
  setStatus(requestStatus, "Carregando solicitações…");
  try {
    const requests = await service.listAdminAdoptionRequests(requestFilter.value);
    requestList.replaceChildren(...requests.map(requestCard));
    requestList.setAttribute("aria-busy", "false");
    setStatus(
      requestStatus,
      requests.length === 0
        ? "Nenhuma solicitação neste filtro."
        : `${requests.length} ${requests.length === 1 ? "solicitação encontrada" : "solicitações encontradas"}.`
    );
  } catch (error) {
    requestList.setAttribute("aria-busy", "false");
    setStatus(requestStatus, adoptionDataErrorMessage(error), "error");
  } finally {
    requestRefresh.disabled = false;
  }
}

function setupEvents() {
  animalNew.addEventListener("click", () => openAnimalForm());
  animalCancel.addEventListener("click", closeAnimalForm);
  animalForm.addEventListener("submit", saveAnimal);
  for (const field of animalForm.elements) {
    field.addEventListener?.("input", () => field.setCustomValidity?.(""));
  }
  requestFilter.addEventListener("change", loadRequests);
  requestRefresh.addEventListener("click", loadRequests);
}

export async function initializeAdminAdoptions(user) {
  if (initialized) return;
  if (!user?.uid) throw new TypeError("Sessão administrativa obrigatória.");
  initialized = true;
  activeUser = user;
  setupEvents();
  await loadAnimals();
  await loadRequests();
}
