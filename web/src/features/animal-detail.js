import { firebaseClient } from "../config/firebase-client.js";
import { createAdoptionAttemptStore } from "../services/adoption-attempt.js";
import {
  AdoptionDataValidationError,
  adoptionDataErrorMessage,
  animalArticle,
  createAdoptionsDataService,
  formatAnimalAge,
  isSafeDocumentId,
  normalizeAdoptionRequest,
  validateSubmissionGate
} from "../services/adoptions-data.js";

const service = createAdoptionsDataService(firebaseClient.firestore, firebaseClient.media);
const detail = document.querySelector("[data-animal-detail]");
const detailStatus = document.querySelector("[data-animal-detail-status]");
const media = document.querySelector("[data-animal-media]");
const form = document.querySelector("[data-adoption-form]");
const fieldset = document.querySelector("[data-adoption-fieldset]");
const submitButton = document.querySelector("[data-adoption-submit]");
const formStatus = document.querySelector("[data-adoption-status]");
const loadedAt = Date.now();
const labels = Object.freeze({
  sex: Object.freeze({ female: "Fêmea", male: "Macho" }),
  size: Object.freeze({ small: "Pequeno", medium: "Médio", large: "Grande" }),
  species: Object.freeze({ dog: "cão", cat: "gato", other: "animal" })
});

let animal;
let attempt;

function setDetailError(message) {
  detail.hidden = true;
  detailStatus.hidden = false;
  detailStatus.textContent = message;
  detailStatus.setAttribute("role", "alert");
  document.title = "Animal indisponível | AuFriends";
}

function setFormStatus(message, kind = "info") {
  formStatus.textContent = message;
  formStatus.setAttribute("role", kind === "error" ? "alert" : "status");
  formStatus.classList.toggle("placeholder-note--error", kind === "error");
  formStatus.classList.toggle("placeholder-note--success", kind === "success");
}

function setBusy(busy) {
  form.setAttribute("aria-busy", String(busy));
  fieldset.disabled = busy;
  submitButton.textContent = busy ? "Enviando…" : "Enviar solicitação";
}

function renderAnimal(loadedAnimal) {
  const article = animalArticle(loadedAnimal);
  const sex = labels.sex[loadedAnimal.sex] ?? "Sexo não informado";
  const size = labels.size[loadedAnimal.size] ?? "Não informado";
  const species = labels.species[loadedAnimal.species] ?? "animal";
  document.title = `Adote ${article} ${loadedAnimal.name} | AuFriends`;
  document.querySelector("#animal-title").textContent = `Adote ${article} ${loadedAnimal.name}`;
  document.querySelector("#animal-sex").textContent = sex;
  document.querySelector("#animal-greeting").textContent = `Oi, eu sou ${article} ${loadedAnimal.name} 🐾`;
  document.querySelector("#animal-description").textContent = loadedAnimal.description;
  document.querySelector("#animal-age").textContent = formatAnimalAge(loadedAnimal.ageMonths);
  document.querySelector("#animal-size").textContent = size;
  document.querySelector("#animal-breed").textContent = loadedAnimal.breed || species;
  document.querySelector("#animal-request-name").textContent = `${article} ${loadedAnimal.name}`;

  const image = document.querySelector("#animal-image");
  if (loadedAnimal.imageUrl) {
    image.src = loadedAnimal.imageUrl;
    image.alt = loadedAnimal.imageAlt;
    image.loading = "eager";
    image.decoding = "async";
    image.fetchPriority = "high";
    image.addEventListener("error", () => {
      image.remove();
      const fallback = document.createElement("span");
      fallback.className = "animal-media-placeholder";
      fallback.textContent = "Imagem indisponível";
      media.append(fallback);
    }, { once: true });
  } else {
    image.remove();
    const fallback = document.createElement("span");
    fallback.className = "animal-media-placeholder";
    fallback.textContent = "Imagem indisponível";
    media.append(fallback);
  }

  detailStatus.hidden = true;
  detail.hidden = false;
}

function formValues() {
  const data = new FormData(form);
  return {
    fullName: data.get("fullName"),
    email: data.get("email"),
    phoneE164: data.get("phoneE164"),
    city: data.get("city"),
    state: data.get("state"),
    message: data.get("message"),
    privacyConsent: data.get("privacyConsent") === "on"
  };
}

function clearValidity() {
  for (const field of form.elements) field.setCustomValidity?.("");
}

function reportValidation(errors) {
  clearValidity();
  let firstInvalid;
  for (const [name, message] of Object.entries(errors)) {
    const field = form.elements.namedItem(name);
    if (!field?.setCustomValidity) continue;
    field.setCustomValidity(message);
    firstInvalid ??= field;
  }
  setFormStatus("Revise os campos indicados antes de enviar.", "error");
  firstInvalid?.reportValidity();
  firstInvalid?.focus();
}

function completeWithoutWrite() {
  attempt.markCompleted();
  fieldset.disabled = true;
  setFormStatus("Solicitação recebida. A equipe entrará em contato se necessário.", "success");
}

async function submitRequest(event) {
  event.preventDefault();
  clearValidity();

  if (!form.reportValidity()) return;

  const gate = validateSubmissionGate({
    honeypot: form.elements.namedItem("website").value,
    elapsedMs: Date.now() - loadedAt
  });

  if (gate.bot) {
    completeWithoutWrite();
    return;
  }
  if (!gate.allowed) {
    setFormStatus("Aguarde alguns instantes, confira os dados e tente novamente.", "error");
    return;
  }

  const normalized = normalizeAdoptionRequest(formValues());
  if (!normalized.valid) {
    reportValidation(normalized.errors);
    return;
  }

  setBusy(true);
  setFormStatus("Enviando sua solicitação…");

  try {
    await service.submitAdoptionRequest(attempt.current.id, animal.id, normalized.values);
    attempt.markCompleted();
    form.reset();
    form.setAttribute("aria-busy", "false");
    fieldset.disabled = true;
    submitButton.textContent = "Solicitação enviada";
    setFormStatus("Solicitação enviada com sucesso. A equipe do AuFriends entrará em contato.", "success");
  } catch (error) {
    if (error instanceof AdoptionDataValidationError) {
      setBusy(false);
      reportValidation(error.errors);
    } else {
      setFormStatus(adoptionDataErrorMessage(error, "save"), "error");
    }
  } finally {
    if (!attempt.current.completed) setBusy(false);
  }
}

function initializeForm() {
  try {
    attempt = createAdoptionAttemptStore(sessionStorage, animal.id);
  } catch {
    fieldset.disabled = true;
    setFormStatus("Ative o armazenamento de sessão do navegador para enviar uma solicitação.", "error");
    return;
  }

  if (attempt.current.completed) {
    fieldset.disabled = true;
    setFormStatus("Esta solicitação já foi enviada nesta sessão.", "success");
    return;
  }

  form.addEventListener("submit", submitRequest);
  for (const field of form.elements) {
    field.addEventListener?.("input", () => field.setCustomValidity?.(""));
  }
}

async function initializeDetail() {
  const animalId = new URLSearchParams(window.location.search).get("animal");
  if (!isSafeDocumentId(animalId)) {
    setDetailError("O perfil solicitado não existe ou não está disponível para adoção.");
    return;
  }

  try {
    animal = await service.getPublicAnimal(animalId);
    if (!animal || animal.adoptionStatus !== "available") {
      setDetailError("Este animal não existe, não está publicado ou não está mais disponível.");
      return;
    }
    renderAnimal(animal);
    initializeForm();
  } catch (error) {
    setDetailError(adoptionDataErrorMessage(error));
  }
}

void initializeDetail();
