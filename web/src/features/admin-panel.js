import { firebaseClient } from "../config/firebase-client.js";
import { changeAdminPassword } from "../services/admin-auth.js";
import {
  ADMIN_METRICS,
  SiteSettingsValidationError,
  adminPanelErrorMessage,
  createAdminPanelDataService,
  loadedMetricState,
  normalizeSiteSettings
} from "../services/admin-panel-data.js";

const dataService = createAdminPanelDataService(firebaseClient.firestore);
const metricsContainer = document.querySelector("[data-admin-metrics]");
const metricsStatus = document.querySelector("[data-metrics-status]");
const metricsRefresh = document.querySelector("[data-metrics-refresh]");
const settingsForm = document.querySelector("[data-settings-form]");
const settingsFieldset = document.querySelector("[data-settings-fieldset]");
const settingsStatus = document.querySelector("[data-settings-status]");
const settingsRetry = document.querySelector("[data-settings-retry]");
const settingsSubmit = document.querySelector("[data-settings-submit]");
const settingsFields = Object.freeze({
  brandName: document.querySelector('[data-settings-field="brandName"]'),
  whatsappDigits: document.querySelector('[data-settings-field="whatsappDigits"]'),
  whatsappGreeting: document.querySelector('[data-settings-field="whatsappGreeting"]')
});
const passwordForm = document.querySelector("[data-password-form]");
const passwordFieldset = document.querySelector("[data-password-fieldset]");
const passwordStatus = document.querySelector("[data-password-status]");
const passwordSubmit = document.querySelector("[data-password-submit]");
const passwordFields = Object.freeze({
  current: document.querySelector('[data-password-field="current"]'),
  next: document.querySelector('[data-password-field="new"]'),
  confirm: document.querySelector('[data-password-field="confirm"]')
});

let initialized = false;
let settingsLoaded = false;
let activeUser;

function metricElements(metricKey) {
  const root = document.querySelector(`[data-admin-metric="${metricKey}"]`);
  return {
    root,
    value: root.querySelector("[data-metric-value]"),
    status: root.querySelector("[data-metric-status]")
  };
}

function renderMetricLoading(metricKey) {
  const elements = metricElements(metricKey);
  elements.root.setAttribute("aria-busy", "true");
  elements.root.classList.remove("admin-metric--empty", "admin-metric--error");
  elements.value.textContent = "…";
  elements.status.textContent = "Carregando…";
}

function renderMetricLoaded(metricKey, count) {
  const elements = metricElements(metricKey);
  const state = loadedMetricState(metricKey, count);
  elements.root.setAttribute("aria-busy", "false");
  elements.root.classList.toggle("admin-metric--empty", state.empty);
  elements.root.classList.remove("admin-metric--error");
  elements.value.textContent = state.value;
  elements.status.textContent = state.description;
}

function renderMetricError(metricKey, error) {
  const elements = metricElements(metricKey);
  elements.root.setAttribute("aria-busy", "false");
  elements.root.classList.remove("admin-metric--empty");
  elements.root.classList.add("admin-metric--error");
  elements.value.textContent = "—";
  elements.status.textContent = adminPanelErrorMessage(error);
}

async function refreshMetrics() {
  metricsRefresh.disabled = true;
  metricsContainer.setAttribute("aria-busy", "true");
  metricsStatus.textContent = "Carregando indicadores.";
  ADMIN_METRICS.forEach(({ key }) => renderMetricLoading(key));

  const outcomes = await Promise.allSettled(
    ADMIN_METRICS.map(({ key }) => dataService.count(key))
  );

  outcomes.forEach((outcome, index) => {
    const { key } = ADMIN_METRICS[index];

    if (outcome.status === "fulfilled") {
      renderMetricLoaded(key, outcome.value);
    } else {
      renderMetricError(key, outcome.reason);
    }
  });

  const failed = outcomes.filter((outcome) => outcome.status === "rejected").length;

  metricsContainer.setAttribute("aria-busy", "false");
  metricsRefresh.disabled = false;
  metricsStatus.textContent =
    failed === 0
      ? "Indicadores atualizados."
      : `${failed} de ${ADMIN_METRICS.length} indicadores não puderam ser carregados.`;
}

async function initializeAdoptions(user) {
  const { initializeAdminAdoptions } = await import("./admin-adoptions.js");
  await initializeAdminAdoptions(user);
}

async function initializeDonations(user) {
  const { initializeAdminDonations } = await import("./admin-donations.js");
  await initializeAdminDonations(user);
}

async function initializeProducts(user) {
  const { initializeAdminProducts } = await import("./admin-products.js");
  await initializeAdminProducts(user);
}

function setSettingsStatus(message, kind = "info") {
  settingsStatus.textContent = message;
  settingsStatus.setAttribute("role", kind === "error" ? "alert" : "status");
  settingsStatus.classList.toggle("placeholder-note--error", kind === "error");
  settingsStatus.classList.toggle("placeholder-note--success", kind === "success");
}

function setSettingsBusy(busy) {
  settingsForm.setAttribute("aria-busy", String(busy));
  settingsFieldset.disabled = busy;
  settingsSubmit.textContent = busy ? "Salvando…" : "Salvar configurações";
}

function writeSettingsFields(values) {
  for (const [name, field] of Object.entries(settingsFields)) {
    field.value = values?.[name] ?? "";
  }
}

function currentSettingsInput() {
  return Object.fromEntries(
    Object.entries(settingsFields).map(([name, field]) => [name, field.value])
  );
}

function clearSettingsValidity() {
  Object.values(settingsFields).forEach((field) => field.setCustomValidity(""));
}

function reportSettingsErrors(errors) {
  clearSettingsValidity();
  let firstInvalid;

  for (const [name, message] of Object.entries(errors)) {
    const field = settingsFields[name];
    field.setCustomValidity(message);
    firstInvalid ??= field;
  }

  setSettingsStatus("Revise os campos indicados antes de salvar.", "error");
  firstInvalid?.reportValidity();
  firstInvalid?.focus();
}

async function loadSettings() {
  settingsRetry.hidden = true;
  settingsFieldset.disabled = true;
  settingsForm.setAttribute("aria-busy", "true");
  setSettingsStatus("Carregando a configuração atual.");

  try {
    const settings = await dataService.readSiteSettings();
    writeSettingsFields(settings);
    settingsLoaded = true;
    settingsFieldset.disabled = false;
    setSettingsStatus(
      settings
        ? "Configuração atual carregada."
        : "A configuração pública ainda não existe. Preencha os campos para criá-la."
    );
  } catch (error) {
    settingsFieldset.disabled = !settingsLoaded;
    settingsRetry.hidden = false;
    setSettingsStatus(adminPanelErrorMessage(error), "error");
  } finally {
    settingsForm.setAttribute("aria-busy", "false");
  }
}

async function saveSettings(event) {
  event.preventDefault();
  clearSettingsValidity();

  const normalized = normalizeSiteSettings(currentSettingsInput());

  if (!normalized.valid) {
    reportSettingsErrors(normalized.errors);
    return;
  }

  setSettingsBusy(true);
  setSettingsStatus("Salvando a configuração pública.");

  try {
    const saved = await dataService.saveSiteSettings(activeUser.uid, normalized.values);
    writeSettingsFields(saved);
    settingsLoaded = true;
    settingsRetry.hidden = true;
    setSettingsStatus("Configurações salvas com sucesso.", "success");
  } catch (error) {
    if (error instanceof SiteSettingsValidationError) {
      reportSettingsErrors(error.errors);
    } else {
      setSettingsStatus(adminPanelErrorMessage(error, "save"), "error");
    }
  } finally {
    setSettingsBusy(false);
  }
}

function setupNavigation() {
  const links = [...document.querySelectorAll("[data-admin-nav]")];

  const updateCurrent = () => {
    const currentHash = window.location.hash || "#visao-geral";
    links.forEach((link) => {
      if (link.getAttribute("href") === currentHash) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  links.forEach((link) => link.addEventListener("click", updateCurrent));
  window.addEventListener("hashchange", updateCurrent);
  updateCurrent();
}

function setupSettingsForm() {
  settingsForm.addEventListener("submit", saveSettings);
  settingsRetry.addEventListener("click", loadSettings);
  Object.values(settingsFields).forEach((field) => {
    field.addEventListener("input", () => field.setCustomValidity(""));
  });
}

function setPasswordStatus(message, kind = "info") {
  passwordStatus.textContent = message;
  passwordStatus.setAttribute("role", kind === "error" ? "alert" : "status");
  passwordStatus.classList.toggle("placeholder-note--error", kind === "error");
  passwordStatus.classList.toggle("placeholder-note--success", kind === "success");
}

function setPasswordBusy(busy) {
  passwordForm.setAttribute("aria-busy", String(busy));
  passwordFieldset.disabled = busy;
  passwordSubmit.textContent = busy ? "Alterando…" : "Alterar senha";
}

function clearPasswordValidity() {
  Object.values(passwordFields).forEach((field) => field.setCustomValidity(""));
}

function passwordErrorMessage(error) {
  if (["auth/invalid-credential", "auth/wrong-password"].includes(error?.code)) {
    return "A senha atual está incorreta.";
  }
  if (error?.code === "auth/weak-password") {
    return "A nova senha não atende aos requisitos de segurança.";
  }
  if (error?.code === "auth/too-many-requests") {
    return "Muitas tentativas foram feitas. Aguarde um pouco e tente novamente.";
  }
  if (error?.code === "auth/network-request-failed") {
    return "Não foi possível acessar o serviço de autenticação. Confira a conexão.";
  }
  return "Não foi possível alterar a senha agora. Tente novamente.";
}

async function savePassword(event) {
  event.preventDefault();
  clearPasswordValidity();

  const currentPassword = passwordFields.current.value;
  const newPassword = passwordFields.next.value;
  const confirmation = passwordFields.confirm.value;

  if (newPassword.length < 12) {
    passwordFields.next.setCustomValidity("Use pelo menos 12 caracteres.");
    passwordFields.next.reportValidity();
    passwordFields.next.focus();
    return;
  }
  if (newPassword === currentPassword) {
    passwordFields.next.setCustomValidity("A nova senha deve ser diferente da senha atual.");
    passwordFields.next.reportValidity();
    passwordFields.next.focus();
    return;
  }
  if (confirmation !== newPassword) {
    passwordFields.confirm.setCustomValidity("As senhas não coincidem.");
    passwordFields.confirm.reportValidity();
    passwordFields.confirm.focus();
    return;
  }

  setPasswordBusy(true);
  setPasswordStatus("Alterando a senha…");

  try {
    await changeAdminPassword(currentPassword, newPassword);
    passwordForm.reset();
    setPasswordStatus("Senha alterada com sucesso. Use a nova senha no próximo acesso.", "success");
  } catch (error) {
    passwordFields.current.value = "";
    setPasswordStatus(passwordErrorMessage(error), "error");
    passwordFields.current.focus();
  } finally {
    setPasswordBusy(false);
  }
}

function setupPasswordForm() {
  passwordForm.addEventListener("submit", savePassword);
  Object.values(passwordFields).forEach((field) => {
    field.addEventListener("input", () => field.setCustomValidity(""));
  });
}

export async function initializeAdminPanel(user) {
  if (initialized) return;
  if (!user?.uid) throw new TypeError("Sessão administrativa obrigatória.");

  initialized = true;
  activeUser = user;
  setupNavigation();
  setupSettingsForm();
  setupPasswordForm();
  metricsRefresh.addEventListener("click", refreshMetrics);
  document.addEventListener("aufriends:metrics-refresh", refreshMetrics);
  await Promise.all([
    refreshMetrics(),
    loadSettings(),
    initializeAdoptions(user),
    initializeDonations(user),
    initializeProducts(user)
  ]);
}
