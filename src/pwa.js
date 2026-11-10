export function setupPWA({ toast }) {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const install = document.getElementById("install-button");
  const update = document.getElementById("update-button");
  const status = document.getElementById("pwa-status");
  let prompt = null, registration = null, reloading = false;
  let offlineReady = Boolean(navigator.serviceWorker.controller);
  const standalone = matchMedia("(display-mode: standalone)");
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const refresh = () => {
    install.hidden = standalone.matches || navigator.standalone || !(prompt || ios);
    update.hidden = !registration?.waiting;
    status.textContent = registration?.waiting
      ? "Mise à jour prête · recharger ferme la galerie actuelle."
      : offlineReady
        ? navigator.onLine ? "Application prête hors connexion." : "Hors connexion · vos photos restent utilisables."
        : "Préparation du mode hors connexion…";
  };
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    prompt = event;
    refresh();
  });
  window.addEventListener("appinstalled", () => {
    prompt = null;
    install.hidden = true;
    toast("Particules est installée sur cet appareil.");
  });
  standalone.addEventListener("change", refresh);
  window.addEventListener("online", refresh);
  window.addEventListener("offline", refresh);
  install.addEventListener("click", async () => {
    if (!prompt) {
      toast("Pour installer Particules : Partager, puis « Sur l’écran d’accueil ».");
      return;
    }
    const event = prompt;
    prompt = null;
    refresh();
    try {
      await event.prompt();
      await event.userChoice;
    } catch { toast("L’installation reste disponible dans le menu du navigateur."); }
  });
  update.addEventListener("click", () => {
    if (!registration?.waiting) return;
    reloading = true;
    update.disabled = true;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) location.reload();
    else { offlineReady = true; refresh(); }
  });
  refresh();
  const register = async () => {
    try {
      registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/", updateViaCache: "none",
      });
      const watch = (worker) => {
        if (!worker) return;
        worker.addEventListener("statechange", refresh);
      };
      watch(registration.installing);
      registration.addEventListener("updatefound", () => watch(registration.installing));
      refresh();
      void navigator.serviceWorker.ready.then(() => { offlineReady = true; refresh(); });
      // A failed update while offline must never prevent opening the app.
      void registration.update().catch(() => {});
    } catch (error) {
      console.warn("Mode hors connexion indisponible :", error);
      status.textContent = "Mode hors connexion indisponible dans ce navigateur.";
    }
  };
  if (document.readyState === "complete") void register();
  else window.addEventListener("load", () => void register(), { once: true });
}
