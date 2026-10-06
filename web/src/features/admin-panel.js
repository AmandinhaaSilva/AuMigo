import { firebaseClient } from "../config/firebase-client.js";
import { changeAdminPassword, reauthenticateAdmin } from "../services/admin-auth.js";
import {
  adminInvitationErrorMessage,
  createAdminManagementService,
  normalizeAdminInvitation
} from "../services/admin-management.js";
import {
  ADMIN_METRICS,
  SiteSettingsValidationError,
  adminPanelErrorMessage,
  createAdminPanelDataService,
  loadedMetricState,
  normalizeSiteSettings
} from "../services/admin-panel-data.js";

const dataService = createAdminPanelDataService(firebaseClient.firestore);
const adminManagementService = createAdminManagementService({
  app: firebaseClient.app,
  auth: firebaseClient.auth,
  firestore: firebaseClient.firestore,
  authEmulatorUrl: firebaseClient.useEmulators
    ? `http://${firebaseClient.emulatorHost}:${firebaseClient.ports.auth}`
    : null
});
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
const adminInviteForm = document.querySelector("[data-admin-invite-form]");
const adminInviteFieldset = document.querySelector("[data-admin-invite-fieldset]");
const adminInviteStatus = document.querySelector("[data-admin-invite-status]");
const adminInviteSubmit = document.querySelector("[data-admin-invite-submit]");
const adminInvitePassword = document.querySelector("[data-admin-invite-password]");
const adminInviteFields = Object.freeze({
  displayName: document.querySelector('[data-admin-invite-field="displayName"]'),
  email: document.querySelector('[data-admin-invite-field="email"]')
});
const adminList = document.querySelector("[data-admin-list]");
const adminListStatus = document.querySelector("[data-admin-list-status]");
const adminListRefresh = document.querySelector("[data-admin-list-refresh]");
const systemDataCollection = document.querySelector("[data-system-data-collection]");
const systemDataRefresh = document.querySelector("[data-system-data-refresh]");
const systemDataStatus = document.querySelector("[data-system-data-status]");
const systemDataList = document.querySelector("[data-system-data-list]");

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

function setAdminInviteStatus(message, kind = "info") {
  adminInviteStatus.textContent = message;
  adminInviteStatus.setAttribute("role", kind === "error" ? "alert" : "status");
  adminInviteStatus.classList.toggle("placeholder-note--error", kind === "error");
  adminInviteStatus.classList.toggle("placeholder-note--success", kind === "success");
}

function setAdminInviteBusy(busy) {
  adminInviteForm.setAttribute("aria-busy", String(busy));
  adminInviteFieldset.disabled = busy;
  adminInviteSubmit.textContent = busy ? "Enviando…" : "Enviar convite";
}

function clearAdminInviteValidity() {
  Object.values(adminInviteFields).forEach((field) => field.setCustomValidity(""));
  adminInvitePassword.setCustomValidity("");
}

function reportAdminInviteErrors(errors) {
  clearAdminInviteValidity();
  let firstInvalid;

  for (const [name, message] of Object.entries(errors)) {
    const field = adminInviteFields[name];
    field.setCustomValidity(message);
    firstInvalid ??= field;
  }

  setAdminInviteStatus("Revise os campos indicados antes de enviar.", "error");
  firstInvalid?.reportValidity();
  firstInvalid?.focus();
}

function renderAdminList(admins) {
  const fragment = document.createDocumentFragment();

  if (admins.length === 0) {
    const empty = document.createElement("p");
    empty.className = "admin-access-list__empty";
    empty.textContent = "Nenhum administrador foi encontrado.";
    fragment.append(empty);
  }

  for (const administrator of admins) {
    const card = document.createElement("article");
    card.className = "admin-access-card";

    const identity = document.createElement("div");
    identity.className = "admin-access-card__identity";
    const name = document.createElement("strong");
    name.textContent = administrator.displayName;
    const email = document.createElement("span");
    email.textContent = administrator.email || "E-mail não informado";
    identity.append(name, email);

    const badges = document.createElement("div");
    badges.className = "admin-access-card__badges";
    const access = document.createElement("span");
    access.className = administrator.active
      ? "admin-access-badge"
      : "admin-access-badge admin-access-badge--inactive";
    access.textContent = administrator.active ? "Acesso ativo" : "Acesso inativo";
    badges.append(access);

    if (administrator.uid === activeUser.uid) {
      const current = document.createElement("span");
      current.className = "admin-access-badge admin-access-badge--current";
      current.textContent = "Você";
      badges.append(current);
    }

    card.append(identity, badges);
    fragment.append(card);
  }

  adminList.replaceChildren(fragment);
}

async function loadAdmins() {
  adminListRefresh.disabled = true;
  adminList.setAttribute("aria-busy", "true");
  adminListStatus.textContent = "Carregando administradores…";
  adminListStatus.classList.remove("placeholder-note--error");
  adminListStatus.setAttribute("role", "status");

  try {
    const administrators = await adminManagementService.listAdmins();
    renderAdminList(administrators);
    adminListStatus.textContent = `${administrators.length} ${
      administrators.length === 1 ? "administrador encontrado" : "administradores encontrados"
    }.`;
  } catch (error) {
    adminListStatus.textContent = adminInvitationErrorMessage(error);
    adminListStatus.classList.add("placeholder-note--error");
    adminListStatus.setAttribute("role", "alert");
  } finally {
    adminList.setAttribute("aria-busy", "false");
    adminListRefresh.disabled = false;
  }
}

function renderSystemData(documents) {
  const fragment = document.createDocumentFragment();

  if (documents.length === 0) {
    const empty = document.createElement("p");
    empty.className = "admin-database-list__empty";
    empty.textContent = "Nenhum registro nesta coleção.";
    fragment.append(empty);
  }

  for (const record of documents) {
    const details = document.createElement("details");
    details.className = "admin-database-record";
    const summary = document.createElement("summary");
    summary.textContent = `Registro ${record.id}`;
    const content = document.createElement("pre");
    content.className = "admin-database-record__content";
    content.textContent = JSON.stringify(record.data, (_key, value) => {
      if (value && typeof value.toDate === "function") return value.toDate().toISOString();
      return value;
    }, 2);
    details.append(summary, content);
    fragment.append(details);
  }

  systemDataList.replaceChildren(fragment);
}

async function loadSystemData() {
  systemDataRefresh.disabled = true;
  systemDataList.setAttribute("aria-busy", "true");
  systemDataStatus.classList.remove("placeholder-note--error");
  systemDataStatus.setAttribute("role", "status");
  systemDataStatus.textContent = "Carregando registros…";

  try {
    const documents = await dataService.listDocuments(systemDataCollection.value);
    renderSystemData(documents);
    systemDataStatus.textContent = `${documents.length} ${documents.length === 1 ? "registro encontrado" : "registros encontrados"}.`;
  } catch (error) {
    systemDataList.replaceChildren();
    systemDataStatus.textContent = adminPanelErrorMessage(error);
    systemDataStatus.classList.add("placeholder-note--error");
    systemDataStatus.setAttribute("role", "alert");
  } finally {
    systemDataList.setAttribute("aria-busy", "false");
    systemDataRefresh.disabled = false;
  }
}

async function inviteAdministrator(event) {
  event.preventDefault();
  clearAdminInviteValidity();
  let focusTarget = null;

  if (!adminInviteForm.reportValidity()) return;

  const normalized = normalizeAdminInvitation({
    displayName: adminInviteFields.displayName.value,
    email: adminInviteFields.email.value
  });

  if (!normalized.valid) {
    reportAdminInviteErrors(normalized.errors);
    return;
  }

  setAdminInviteBusy(true);
  setAdminInviteStatus("Confirmando sua identidade e preparando o convite…");

  try {
    await reauthenticateAdmin(adminInvitePassword.value);
    const invited = await adminManagementService.inviteAdmin(activeUser.uid, normalized.values);
    adminInviteForm.reset();
    setAdminInviteStatus(
      `Acesso concedido a ${invited.email}. O link para definir a senha foi enviado.`,
      "success"
    );
    await loadAdmins();
  } catch (error) {
    setAdminInviteStatus(adminInvitationErrorMessage(error), "error");
    adminInvitePassword.value = "";

    if (["auth/invalid-credential", "auth/wrong-password"].includes(error?.code)) {
      focusTarget = adminInvitePassword;
    } else if (error?.code === "auth/email-already-in-use") {
      focusTarget = adminInviteFields.email;
    }
  } finally {
    setAdminInviteBusy(false);
    focusTarget?.focus();
  }
}

function setupAdminManagement() {
  adminInviteForm.addEventListener("submit", inviteAdministrator);
  adminListRefresh.addEventListener("click", loadAdmins);
  Object.values(adminInviteFields).forEach((field) => {
    field.addEventListener("input", () => field.setCustomValidity(""));
  });
  adminInvitePassword.addEventListener("input", () => {
    adminInvitePassword.setCustomValidity("");
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
  setupAdminManagement();
  setupPasswordForm();
  metricsRefresh.addEventListener("click", refreshMetrics);
  systemDataCollection.addEventListener("change", loadSystemData);
  systemDataRefresh.addEventListener("click", loadSystemData);
  document.addEventListener("aufriends:metrics-refresh", refreshMetrics);
  await Promise.all([
    refreshMetrics(),
    loadSystemData(),
    loadSettings(),
    loadAdmins(),
    initializeAdoptions(user),
    initializeDonations(user),
    initializeProducts(user)
  ]);
}
