import { firebaseClient } from "../config/firebase-client.js";
import { createDonationAttemptStore } from "../services/donation-attempt.js";
import {
  DonationDataValidationError,
  createDonationsDataService,
  donationDataErrorMessage,
  normalizeDonationInput,
  validateDonationSubmissionGate
} from "../services/donations-data.js";

const service = createDonationsDataService(firebaseClient.firestore);
const form = document.querySelector("[data-donation-form]");
const fieldset = document.querySelector("[data-donation-fieldset]");
const submitButton = document.querySelector("[data-donation-submit]");
const status = document.querySelector("[data-donation-status]");
const loadedAt = Date.now();
let attempt;

function setStatus(message, kind = "info") {
  status.textContent = message;
  status.setAttribute("role", kind === "error" ? "alert" : "status");
  status.classList.toggle("placeholder-note--error", kind === "error");
  status.classList.toggle("placeholder-note--success", kind === "success");
}

function setBusy(busy) {
  form.setAttribute("aria-busy", String(busy));
  fieldset.disabled = busy;
  submitButton.textContent = busy ? "Enviando…" : "Enviar intenção de doação";
}

function valuesFromForm() {
  const data = new FormData(form);
  return {
    fullName: data.get("fullName"),
    email: data.get("email"),
    phoneE164: data.get("phoneE164"),
    type: data.get("type"),
    amountOrQuantity: data.get("amountOrQuantity"),
    deliveryMethod: data.get("deliveryMethod"),
    message: data.get("message"),
    privacyConsent: data.get("privacyConsent") === "on"
  };
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
  setStatus("Revise os campos indicados antes de enviar.", "error");
  firstInvalid?.reportValidity();
  firstInvalid?.focus();
}

function finish(message) {
  attempt.markCompleted();
  form.reset();
  form.setAttribute("aria-busy", "false");
  fieldset.disabled = true;
  submitButton.textContent = "Intenção enviada";
  setStatus(message, "success");
}

async function submitDonation(event) {
  event.preventDefault();
  clearValidity();
  if (!form.reportValidity()) return;

  const gate = validateDonationSubmissionGate({
    honeypot: form.elements.namedItem("website").value,
    elapsedMs: Date.now() - loadedAt
  });
  if (gate.bot) {
    finish("Intenção recebida. A equipe entrará em contato se necessário.");
    return;
  }
  if (!gate.allowed) {
    setStatus("Aguarde alguns instantes, confira os dados e tente novamente.", "error");
    return;
  }

  const normalized = normalizeDonationInput(valuesFromForm());
  if (!normalized.valid) {
    reportErrors(normalized.errors);
    return;
  }

  setBusy(true);
  setStatus("Enviando sua intenção de doação…");
  try {
    await service.submitDonation(attempt.current.id, normalized.values);
    finish("Intenção de doação enviada com sucesso. A equipe do AuFriends entrará em contato.");
  } catch (error) {
    if (error instanceof DonationDataValidationError) {
      setBusy(false);
      reportErrors(error.errors);
    } else {
      setStatus(donationDataErrorMessage(error, "save"), "error");
    }
  } finally {
    if (!attempt.current.completed) setBusy(false);
  }
}

function initialize() {
  try {
    attempt = createDonationAttemptStore(sessionStorage);
  } catch {
    fieldset.disabled = true;
    setStatus("Ative o armazenamento de sessão do navegador para enviar sua intenção.", "error");
    return;
  }

  if (attempt.current.completed) {
    fieldset.disabled = true;
    submitButton.textContent = "Intenção já enviada";
    setStatus("Uma intenção de doação já foi enviada nesta sessão.", "success");
    return;
  }

  form.addEventListener("submit", submitDonation);
  for (const field of form.elements) {
    field.addEventListener?.("input", () => field.setCustomValidity?.(""));
  }
}

initialize();
