import "./styles/site.css";
import { mountSiteShell } from "./components/site-shell.js";

document.documentElement.classList.add("js");
mountSiteShell();

function prepareRemoteMediaConnection() {
  if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname)) return;
  if (document.querySelector('link[data-aufriends-media-origin]')) return;

  const preconnect = document.createElement("link");
  preconnect.rel = "preconnect";
  preconnect.href = "https://aufriends-media-api.aufriends.workers.dev";
  preconnect.crossOrigin = "anonymous";
  preconnect.dataset.aufriendsMediaOrigin = "true";
  document.head.append(preconnect);
}

function scheduleImageWarmup() {
  const start = () => {
    const run = () => import("./services/site-image-preloader.js")
      .then(({ preloadSiteImages }) => preloadSiteImages())
      .catch(() => {});

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 800 });
    } else {
      window.setTimeout(run, 0);
    }
  };

  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

prepareRemoteMediaConnection();
scheduleImageWarmup();

document.querySelectorAll("[data-static-form]").forEach((form) => {
  form.addEventListener("submit", (event) => event.preventDefault());
});
