import "../styles/site.css";
import {
  hasActiveAdminAccess,
  requestPasswordReset,
  signInAdmin,
  signOutAdmin,
  waitForAdminSession
} from "../services/admin-auth.js";

const form = document.querySelector("[data-admin-login]");
const emailInput = document.querySelector("[data-admin-email]");
const passwordInput = document.querySelector("[data-admin-password]");
const submitButton = document.querySelector("[data-admin-submit]");
const resetButton = document.querySelector("[data-password-reset]");
const status = document.querySelector("[data-admin-status]");

function setStatus(message, kind = "info") {
  status.textContent = message;
  status.classList.toggle("placeholder-note--error", kind === "error");
  status.classList.toggle("placeholder-note--success", kind === "success");
}

function setBusy(busy) {
  form.setAttribute("aria-busy", String(busy));
  emailInput.disabled = busy;
  passwordInput.disabled = busy;
  submitButton.disabled = busy;
  resetButton.disabled = busy;
}

function redirectToPanel() {
  window.location.replace("/admin/painel");
}

async function authorize(user) {
  const allowed = await hasActiveAdminAccess(user);

  if (!allowed) {
    await signOutAdmin();
    setStatus("Esta conta não possui acesso administrativo ativo.", "error");
    return false;
  }

  setStatus("Acesso autorizado. Abrindo o painel…", "success");
  redirectToPanel();
  return true;
}

function messageFromRedirect() {
  const reason = new URLSearchParams(window.location.search).get("reason");

  if (reason === "logout") {
    return ["Sessão encerrada com segurança.", "success"];
  }

  if (reason === "access-denied") {
    return ["Esta conta não possui acesso administrativo ativo.", "error"];
  }

  if (reason === "unavailable") {
    return ["Não foi possível validar o acesso agora. Tente novamente.", "error"];
  }

  if (reason === "session-required") {
    return ["Entre com uma conta administrativa para continuar.", "info"];
  }

  return ["Use as credenciais administrativas fornecidas pela equipe responsável.", "info"];
}

async function initializeLogin() {
  setBusy(true);
  setStatus("Verificando a sessão…");

  try {
    const user = await waitForAdminSession();

    if (user) {
      setStatus("Validando o acesso administrativo…");
      if (await authorize(user)) return;
    } else {
      setStatus(...messageFromRedirect());
    }

    setBusy(false);
  } catch {
    await signOutAdmin().catch(() => {});
    setStatus("O serviço de autenticação está temporariamente indisponível.", "error");
    setBusy(false);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) return;

  setBusy(true);
  setStatus("Validando as credenciais…");

  try {
    const user = await signInAdmin(emailInput.value.trim(), passwordInput.value);
    if (await authorize(user)) return;
  } catch (error) {
    await signOutAdmin().catch(() => {});

    if (error?.code === "auth/too-many-requests" || error?.code === "auth/network-request-failed") {
      setStatus("Não foi possível entrar agora. Aguarde e tente novamente.", "error");
    } else {
      setStatus("Não foi possível entrar. Confira as credenciais e tente novamente.", "error");
    }
  }

  passwordInput.value = "";
  setBusy(false);
  passwordInput.focus();
});

resetButton.addEventListener("click", async () => {
  if (!emailInput.value.trim() || !emailInput.checkValidity()) {
    emailInput.reportValidity();
    emailInput.focus();
    return;
  }

  setBusy(true);
  setStatus("Solicitando a recuperação…");

  try {
    await requestPasswordReset(emailInput.value.trim());
    setStatus(
      "Se o endereço estiver cadastrado, as instruções de recuperação foram enviadas.",
      "success"
    );
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      setStatus(
        "Se o endereço estiver cadastrado, as instruções de recuperação foram enviadas.",
        "success"
      );
    } else {
      setStatus("Não foi possível solicitar a recuperação agora. Tente novamente.", "error");
    }
  }

  setBusy(false);
});

initializeLogin();
