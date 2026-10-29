import "./style.css";
import { ParticleField } from "./particle-field.js";

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const touchDevice = matchMedia("(pointer: coarse)").matches;
const formatter = new Intl.NumberFormat("fr-FR");
const state = {
  image: null,
  progress: 0,
  time: 0,
  paused: false,
  transition: null,
  quality: "auto",
  duration: 8,
  loading: false,
  loadToken: 0,
  autoFactor: 1,
  adaptations: 0,
  frames: 0,
  frameMean: 16.7,
};
let field;
let toastTimer;
let uiTime = 0;
let lastFrame = performance.now();
let frameId;

function toast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 5500);
}

function setLoading(value, label = "Les couleurs prennent place…") {
  state.loading = value;
  $("loading").hidden = !value;
  $("loading-label").textContent = label;
  for (const id of ["replay-button", "pause-button", "scatter-button"])
    $(id).disabled = value || !state.image;
  for (const button of document.querySelectorAll("[data-quality]"))
    button.disabled = value;
}

function budget(factor = state.autoFactor) {
  const mobile = touchDevice || innerWidth <= 900;
  if (state.quality === "eco") return mobile ? 26000 : 45000;
  if (state.quality === "high") return mobile ? 110000 : 240000;
  const base = mobile
    ? 55000
    : navigator.hardwareConcurrency && navigator.hardwareConcurrency < 6
      ? 90000
      : 145000;
  return Math.round(base * factor);
}

function updateCount() {
  $("particle-count").textContent =
    `${formatter.format(field.count || 0)} PARTICULES`;
}

function updateUI() {
  const percent = Math.round(state.progress * 100);
  $("timeline-fill").style.width = `${percent}%`;
  document
    .querySelector(".timeline")
    .setAttribute("aria-valuenow", String(percent));
  $("progress-label").textContent = state.transition ? `${percent} %` : "";
  const dispersed = state.transition
    ? state.transition.to === 0
    : state.progress < 0.5;
  $("scatter-label").textContent = dispersed ? "Recomposer" : "Disperser";
  $("scatter-icon").setAttribute(
    "href",
    dispersed ? "#i-gather" : "#i-scatter",
  );
  $("pause-icon").setAttribute("href", state.paused ? "#i-play" : "#i-pause");
  $("pause-button").setAttribute(
    "aria-label",
    state.paused ? "Reprendre l’animation" : "Mettre en pause",
  );
  $("pause-button").setAttribute("aria-pressed", String(state.paused));
  $("pause-button").title = state.paused
    ? "Reprendre (Espace)"
    : "Pause (Espace)";
  let label = "La lumière se rassemble";
  let phase = "forming";
  if (!state.image) {
    label = "Importez votre première photo";
    phase = "empty";
  } else if (state.paused) {
    label = "Le temps suspendu";
    phase = "paused";
  } else if (state.transition?.to === 0) {
    label = "L’image se libère";
    phase = "dispersing";
  } else if (state.progress >= 0.999) {
    label = "L’image a trouvé sa forme";
    phase = "formed";
  } else if (!state.transition) {
    label = "Les particules en liberté";
    phase = "scattered";
  }
  if ($("status-label").textContent !== label)
    $("status-label").textContent = label;
  $("scene").dataset.state = phase;
}

function transitionTo(to, seconds, after) {
  state.paused = false;
  state.transition = {
    from: state.progress,
    to,
    seconds: Math.max(0.1, seconds),
    elapsed: 0,
    after,
  };
  updateUI();
}

function form() {
  if (!state.image || state.loading) return;
  transitionTo(1, reducedMotion ? 1.5 : state.duration);
}

function replay() {
  if (!state.image || state.loading) return;
  field.setZoom(1);
  field.clearPointer();
  if (state.progress < 0.02) form();
  else transitionTo(0, reducedMotion ? 0.3 : 1.15, form);
}

function togglePause() {
  if (!state.image || state.loading) return;
  state.paused = !state.paused;
  updateUI();
}

function closeSettings() {
  $("controls").classList.remove("open");
  $("settings-button").setAttribute("aria-expanded", "false");
  $("settings-button").setAttribute("aria-label", "Ouvrir les réglages");
  $("drawer-scrim").hidden = true;
}

function showSettings() {
  const open = !$("controls").classList.contains("open");
  $("controls").classList.toggle("open", open);
  $("settings-button").setAttribute("aria-expanded", String(open));
  $("settings-button").setAttribute(
    "aria-label",
    open ? "Fermer les réglages" : "Ouvrir les réglages",
  );
  $("drawer-scrim").hidden = !open;
  field?.clearPointer();
}

async function loadPhoto(source, name, isDemo = false) {
  const token = ++state.loadToken;
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  const ownedURL = typeof source !== "string";
  setLoading(true, "Lecture de votre image…");
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (token !== state.loadToken) {
      if (ownedURL) URL.revokeObjectURL(url);
      return;
    }
    // Let the browser paint the busy state before preparing the particle buffers.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (token !== state.loadToken) {
      if (ownedURL) URL.revokeObjectURL(url);
      return;
    }
    field.setImage(image, budget(1));
    if (state.image?.ownedURL) URL.revokeObjectURL(state.image.url);
    state.image = { image, url, name, isDemo, ownedURL };
    state.autoFactor = 1;
    state.adaptations = 0;
    state.frames = 0;
    state.frameMean = 16.7;
    state.transition = null;
    state.paused = false;
    state.progress = reducedMotion ? 1 : 0;
    field.uniforms.uProgress.value = state.progress;
    field.setZoom(1);
    $("thumbnail").src = url;
    $("image-name").textContent = name;
    $("image-name").title = name;
    $("image-dimensions").textContent =
      `${image.naturalWidth} × ${image.naturalHeight}${isDemo ? " · Démonstration" : ""}`;
    $("demo-button").hidden = isDemo;
    $("scene").setAttribute(
      "aria-label",
      `Photo « ${name} » reconstruite par des particules interactives`,
    );
    updateCount();
    closeSettings();
    if (!reducedMotion) transitionTo(1, state.duration);
    else updateUI();
  } catch (error) {
    if (ownedURL) URL.revokeObjectURL(url);
    if (token === state.loadToken) {
      toast(
        error.message?.includes("transparente")
          ? error.message
          : "Impossible de lire cette image. Essayez une photo JPEG, PNG ou WebP.",
      );
      updateUI();
    }
  } finally {
    if (token === state.loadToken) setLoading(false);
  }
}

function importFile(file) {
  if (!file) return;
  if (file.type && !file.type.startsWith("image/")) {
    toast("Choisissez un fichier image (JPEG, PNG ou WebP).");
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    toast("Cette photo dépasse 50 Mo. Utilisez une version plus légère.");
    return;
  }
  if (!field) {
    toast("La scène 3D n’est pas disponible dans ce navigateur.");
    return;
  }
  void loadPhoto(file, file.name || "Votre photo");
}

async function changeQuality(quality) {
  if (state.loading || quality === state.quality) return;
  state.quality = quality;
  state.autoFactor = 1;
  state.adaptations = 0;
  state.frames = 0;
  state.frameMean = 16.7;
  for (const button of document.querySelectorAll("[data-quality]")) {
    const active = button.dataset.quality === quality;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  if (!state.image) return;
  setLoading(true, "Ajustement de la densité…");
  await new Promise((resolve) => setTimeout(resolve, 0));
  try {
    field.setImage(state.image.image, budget());
    updateCount();
  } catch {
    toast("Impossible de modifier la densité pour cette image.");
  } finally {
    setLoading(false);
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen)
      await document.documentElement.requestFullscreen();
    else toast("Le plein écran n’est pas disponible dans ce navigateur.");
  } catch {
    toast("Le navigateur n’a pas autorisé le plein écran.");
  }
}

function setupUI() {
  $("upload-button").addEventListener("click", () => $("file-input").click());
  $("mobile-upload").addEventListener("click", () => $("file-input").click());
  $("file-input").addEventListener("change", (event) => {
    importFile(event.target.files?.[0]);
    event.target.value = "";
  });
  $("demo-button").addEventListener("click", () => {
    void loadPhoto("/demo-lac.jpg", "Lac de Braies", true);
  });
  $("replay-button").addEventListener("click", replay);
  $("pause-button").addEventListener("click", togglePause);
  $("scatter-button").addEventListener("click", () => {
    if (!state.image || state.loading) return;
    if (
      (state.transition && state.transition.to === 0) ||
      (!state.transition && state.progress < 0.5)
    )
      form();
    else transitionTo(0, reducedMotion ? 0.3 : 2.2);
  });
  for (const input of document.querySelectorAll(".range")) {
    const refresh = () => {
      input.style.setProperty(
        "--fill",
        `${((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100}%`,
      );
      if (input.id === "duration") {
        const nextDuration = Number(input.value);
        if (state.transition?.to === 1 && !reducedMotion) {
          state.transition.elapsed *= nextDuration / state.transition.seconds;
          state.transition.seconds = nextDuration;
        }
        state.duration = nextDuration;
        $("duration-value").textContent = `${nextDuration} s`;
      } else {
        $("swirl-value").textContent = `${input.value} %`;
        if (field)
          field.uniforms.uSwirl.value = 0.2 + (Number(input.value) / 100) * 1.5;
      }
    };
    input.addEventListener("input", refresh);
    refresh();
  }
  for (const button of document.querySelectorAll("[data-quality]"))
    button.addEventListener("click", () => {
      void changeQuality(button.dataset.quality);
    });
  $("settings-button").addEventListener("click", showSettings);
  $("drawer-close").addEventListener("click", () => {
    closeSettings();
    $("settings-button").focus();
  });
  $("drawer-scrim").addEventListener("click", closeSettings);
  const dialog = $("info-dialog");
  $("info-button").addEventListener("click", () => {
    field?.clearPointer();
    dialog.showModal();
  });
  $("info-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dialog.close();
    }
  });
  $("fullscreen-button").addEventListener("click", () => {
    void toggleFullscreen();
  });
  document.addEventListener("fullscreenchange", () => {
    $("fullscreen-button").setAttribute(
      "aria-label",
      document.fullscreenElement
        ? "Quitter le plein écran"
        : "Passer en plein écran",
    );
    field?.resize();
  });
  $("reload-button").addEventListener("click", () => location.reload());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSettings();
    if (
      dialog.open ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.target.closest("input,button,a,select,textarea")
    )
      return;
    if (event.code === "Space") {
      event.preventDefault();
      togglePause();
    }
    if (event.key.toLowerCase() === "r") replay();
    if (event.key.toLowerCase() === "f") void toggleFullscreen();
  });
  let dragDepth = 0;
  document.addEventListener("dragenter", (event) => {
    if (![...(event.dataTransfer?.types || [])].includes("Files")) return;
    event.preventDefault();
    dragDepth++;
    $("drop-overlay").hidden = false;
  });
  document.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });
  document.addEventListener("dragleave", (event) => {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $("drop-overlay").hidden = true;
  });
  document.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    $("drop-overlay").hidden = true;
    importFile(event.dataTransfer?.files?.[0]);
  });
  window.addEventListener("blur", () => {
    $("drop-overlay").hidden = true;
    dragDepth = 0;
    field?.clearPointer();
  });
  window.addEventListener("resize", () => {
    field?.resize();
    if (innerWidth > 900) closeSettings();
  });
  if (touchDevice)
    $("interaction-hint").textContent =
      "Glissez pour faire s’envoler les particules · Pincez pour zoomer";
}

function setupPointer() {
  const canvas = field.canvas;
  const pointers = new Map();
  let pinchDistance = 0;
  let pinchZoom = 1;
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  canvas.addEventListener("pointerdown", (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      pinchDistance = distance();
      pinchZoom = field.zoom;
      field.clearPointer();
    } else field.setPointer(event.clientX, event.clientY);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (pointers.has(event.pointerId))
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      if (pinchDistance > 0)
        field.setZoom((pinchZoom * distance()) / pinchDistance);
      field.clearPointer();
    } else if (event.pointerType === "mouse" || pointers.size === 1)
      field.setPointer(event.clientX, event.clientY);
  });
  const release = (event) => {
    pointers.delete(event.pointerId);
    pinchDistance = 0;
    field.clearPointer();
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("pointerleave", () => {
    if (!pointers.size) field.clearPointer();
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      field.setZoom(field.zoom * Math.exp(-event.deltaY * 0.001));
      field.setPointer(event.clientX, event.clientY);
    },
    { passive: false },
  );
}

function tick(now) {
  frameId = requestAnimationFrame(tick);
  const rawDelta = now - lastFrame;
  const delta = Math.min(0.05, Math.max(0, rawDelta / 1000));
  lastFrame = now;
  if (!state.paused && !state.loading && !field.contextLost) {
    state.time += delta;
    if (state.transition) {
      const transition = state.transition;
      transition.elapsed += delta;
      const fraction = Math.min(1, transition.elapsed / transition.seconds);
      state.progress =
        transition.from + (transition.to - transition.from) * fraction;
      if (fraction >= 1) {
        state.progress = transition.to;
        state.transition = null;
        transition.after?.();
        updateUI();
      }
    }
  }
  field.uniforms.uProgress.value = state.progress;
  field.render(delta, state.time);
  if (now - uiTime > 90) {
    updateUI();
    uiTime = now;
  }
  if (state.image && !state.loading && !field.contextLost) {
    state.frames++;
    state.frameMean = state.frameMean * 0.97 + Math.min(rawDelta, 100) * 0.03;
    if (
      state.frames > 180 &&
      state.quality === "auto" &&
      state.frameMean > 36 &&
      state.adaptations < 2 &&
      field.count > 32000
    ) {
      state.autoFactor *= 0.64;
      state.adaptations++;
      state.frames = 0;
      state.frameMean = 16.7;
      field.setImage(state.image.image, budget());
      updateCount();
    }
  }
}

async function start() {
  setupUI();
  try {
    field = new ParticleField($("scene"), {
      reducedMotion,
      onContextLost: () => {
        $("renderer-error").hidden = false;
      },
      onContextRestored: () => {
        $("renderer-error").hidden = true;
        lastFrame = performance.now();
        field.resize();
      },
    });
    field.uniforms.uSwirl.value = 0.2 + (Number($("swirl").value) / 100) * 1.5;
    setupPointer();
    document.addEventListener("visibilitychange", () => {
      cancelAnimationFrame(frameId);
      field.clearPointer();
      if (!document.hidden) {
        lastFrame = performance.now();
        frameId = requestAnimationFrame(tick);
      }
    });
    lastFrame = performance.now();
    frameId = requestAnimationFrame(tick);
    await loadPhoto("/demo-lac.jpg", "Lac de Braies", true);
  } catch (error) {
    console.error("Initialisation de la scène impossible :", error);
    setLoading(false);
    $("renderer-error-message").textContent =
      "Ce navigateur ne peut pas lancer la scène WebGL. Vérifiez que l’accélération graphique est activée, ou essayez un autre navigateur.";
    $("renderer-error").hidden = false;
  }
}

void start();
