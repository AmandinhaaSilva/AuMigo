import "../styles/site.css";
import {
  hasActiveAdminAccess,
  signOutAdmin,
  waitForAdminSession,
  watchActiveAdminAccess,
  watchAdminSession
} from "../services/admin-auth.js";

const loading = document.querySelector("[data-admin-loading]");
const protectedContent = document.querySelector("[data-admin-protected]");
const identity = document.querySelector("[data-admin-identity]");
const logoutButton = document.querySelector("[data-admin-logout]");
const panelStatus = document.querySelector("[data-admin-panel-status]");

let redirecting = false;
let stopAuthWatch = () => {};
let stopAdminWatch = () => {};

function redirectToLogin(reason) {
  if (redirecting) return;
  redirecting = true;
  stopAuthWatch();
  stopAdminWatch();
  window.location.replace(`/admin?reason=${encodeURIComponent(reason)}`);
}

async function endSession(reason) {
  if (redirecting) return;
  redirecting = true;
  stopAuthWatch();
  stopAdminWatch();
  await signOutAdmin().catch(() => {});
  window.location.replace(`/admin?reason=${encodeURIComponent(reason)}`);
}

function revealPanel(user) {
  identity.textContent = user.displayName || user.email || "Administrador ativo";
  protectedContent.hidden = false;
  loading.hidden = true;
}

async function startProtectedPanel(user) {
  try {
    const { initializeAdminPanel } = await import("./admin-panel.js");
    await initializeAdminPanel(user);
    panelStatus.textContent =
      "Sessão autenticada. Consulte abaixo o estado atualizado de cada seção.";
  } catch {
    panelStatus.textContent =
      "A sessão permanece protegida, mas não foi possível iniciar os dados do painel.";
    panelStatus.classList.add("placeholder-note--error");
    panelStatus.setAttribute("role", "alert");
  }
}

async function initializeGuard() {
  try {
    const user = await waitForAdminSession();

    if (!user) {
      redirectToLogin("session-required");
      return;
    }

    if (!(await hasActiveAdminAccess(user))) {
      await endSession("access-denied");
      return;
    }

    revealPanel(user);

    stopAuthWatch = watchAdminSession(
      (nextUser) => {
        if (!nextUser || nextUser.uid !== user.uid) redirectToLogin("session-required");
      },
      () => endSession("unavailable")
    );

    stopAdminWatch = watchActiveAdminAccess(
      user,
      () => endSession("access-denied"),
      () => endSession("unavailable")
    );

    void startProtectedPanel(user);
  } catch {
    await endSession("unavailable");
  }
}

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  await endSession("logout");
});

initializeGuard();
