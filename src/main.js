import "./style.css";
import { ParticleField } from "./particle-field.js";
import { DepthEstimator } from "./depth-client.js";
import { createArtisticDepth } from "./artistic-depth.js";
import { morphDuration } from "./photo-morph.js";

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
  quality: "high",
  duration: 8,
  loading: false,
  loadToken: 0,
  autoFactor: 1,
  adaptations: 0,
  frames: 0,
  frameMean: 16.7,
  relief: false,
  wave: false,
  volume: true,
  depthBusy: false,
  gallery: [],
  morph: null,
};
const depthEstimator = new DepthEstimator();
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
  updateEffectUI();
}

function updateEffectUI() {
  const unavailable = state.loading || !state.image || Boolean(state.morph);
  $("volume-button").disabled = unavailable;
  $("volume-button").classList.toggle("active", state.volume);
  $("volume-button").setAttribute("aria-pressed", String(state.volume));
  $("camera-home").disabled = state.loading || !state.image;
  $("relief-button").disabled = unavailable;
  $("relief-button").setAttribute("aria-pressed", String(state.relief));
  $("relief-button").setAttribute("aria-busy", String(state.depthBusy));
  $("relief-button").classList.toggle("active", state.relief);
  $("relief-label").textContent = "Relief IA";
  $("depth-retry").hidden =
    !state.image || state.image.depthKind !== "artistic" || state.depthBusy;
  $("wave-button").disabled = unavailable;
  $("wave-button").setAttribute("aria-pressed", String(state.wave));
  $("wave-button").classList.toggle("active", state.wave);
  $("burst-button").disabled = unavailable || state.progress < 0.999;
  $("burst-button").classList.toggle("active", Boolean(field?.exploding));
  $("wind-button").disabled = unavailable || state.progress < 0.999;
  $("wind-button").classList.toggle("active", Boolean(field?.windy));
  const busy = state.loading || Boolean(state.morph);
  for (const id of ["replay-button", "scatter-button", "upload-button", "mobile-upload", "remove-photo", "demo-button"])
    $(id).disabled = busy || !state.image && id !== "upload-button" && id !== "mobile-upload";
  for (const button of document.querySelectorAll("[data-quality], [data-photo]"))
    button.disabled = busy;
  $("previous-photo").disabled = busy || state.gallery.length < 2;
  $("next-photo").disabled = busy || state.gallery.length < 2;
}

async function toggleRelief() {
  if (!state.image || state.loading) return;
  if (state.image.depthMap) {
    state.relief = !state.relief;
    field.setRelief(state.relief);
    updateEffectUI();
    return;
  }
  const source = state.image;
  try {
    const map = createArtisticDepth(source.image);
    field.setDepthMap(map);
    source.depthMap = map;
    source.depthKind = "artistic";
    state.relief = true;
    field.setRelief(true);
    updateEffectUI();
  } catch (error) {
    console.warn("Lecture de la photo pour le relief :", error);
    toast(
      "Cette photo n’a pas pu être lue pour créer le relief. Essayez un fichier JPEG ou PNG.",
    );
    return;
  }
  void improveDepth();
}

async function improveDepth() {
  if (!state.image || state.loading || state.depthBusy) return;
  const source = state.image;
  state.depthBusy = true;
  updateEffectUI();
  $("depth-status").textContent =
    "Relief artistique actif · préparation de l’estimation IA…";
  try {
    const map = await depthEstimator.estimate(source.image, (progress) => {
      if (state.image !== source) return;
      const label =
        progress.stage === "downloading"
          ? `Relief artistique · modèle IA : ${Math.round(progress.progress || 0)} %`
          : progress.stage === "computing"
            ? "Calcul du relief sur cet appareil…"
            : "Chargement du modèle de profondeur…";
      if ($("depth-status").textContent !== label)
        $("depth-status").textContent = label;
    });
    if (state.image !== source) return;
    field.setDepthMap(map);
    source.depthMap = map;
    source.depthKind = "ai";
    field.setRelief(state.relief);
    $("depth-status").textContent =
      "Relief affiné par IA · calcul effectué sur cet appareil.";
  } catch (error) {
    if (state.image === source && error.name !== "AbortError") {
      console.warn("Estimation de profondeur indisponible :", error);
      $("depth-status").textContent =
        "Relief artistique disponible · l’estimation IA n’a pas abouti.";
    }
  } finally {
    if (state.image === source) {
      state.depthBusy = false;
      updateEffectUI();
    }
  }
}

function toggleWave() {
  if (!state.image || state.loading) return;
  state.wave = !state.wave;
  state.paused = false;
  field.setWave(state.wave);
  updateUI();
}

function triggerExplosion() {
  if (!state.image || state.loading || state.morph || state.progress < 0.999) return;
  state.paused = false;
  field.clearPointer();
  field.explode();
  updateUI();
}

function triggerWind() {
  if (!state.image || state.loading || state.morph || state.progress < 0.999) return;
  state.paused = false;
  field.clearPointer();
  field.blowWind();
  updateUI();
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
  $("progress-label").textContent = state.morph
    ? `${Math.round(state.morph.elapsed / state.morph.seconds * 100)} %`
    : state.transition ? `${percent} %` : "";
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
  let label = "Les étoiles se rassemblent";
  let phase = "forming";
  if (!state.image) {
    label = "Importez votre première photo";
    phase = "empty";
  } else if (state.paused) {
    label = "Le temps suspendu";
    phase = "paused";
  } else if (state.morph) {
    label = "D’une photo à l’autre";
    phase = "morphing";
  } else if (state.transition?.to === 0) {
    label = "L’image se libère";
    phase = "dispersing";
  } else if (field?.exploding) {
    label = "L’image éclate dans l’espace";
    phase = "exploding";
  } else if (field?.windy) {
    label = "Un souffle emporte les particules";
    phase = "wind";
  } else if (state.progress >= 0.999) {
    label = state.wave
      ? "Une vague traverse l’image"
      : "L’image a trouvé sa forme";
    phase = "formed";
  } else if (!state.transition) {
    label = "Un ciel de particules";
    phase = "scattered";
  }
  if ($("status-label").textContent !== label)
    $("status-label").textContent = label;
  $("scene").dataset.state = phase;
  updateEffectUI();
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
  if (!state.image || state.loading || state.morph) return;
  field.setZoom(1);
  field.clearPointer();
  field.resetExplosion();
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

function renderGallery() {
  const container = $("photo-gallery");
  container.replaceChildren();
  state.gallery.forEach((photo, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gallery-photo";
    button.dataset.photo = String(index);
    button.setAttribute("aria-label", `Afficher ${photo.name}`);
    button.setAttribute("aria-pressed", String(photo === state.image));
    button.title = photo.name;
    const image = document.createElement("img");
    image.src = photo.url;
    image.alt = "";
    button.append(image);
    button.addEventListener("click", () => selectPhoto(photo));
    container.append(button);
  });
  $("gallery-controls").hidden = state.gallery.length < 2;
  $("gallery-position").textContent = `${state.gallery.indexOf(state.image) + 1} / ${state.gallery.length}`;
  $("remove-photo").hidden = state.gallery.length < 2;
  updateEffectUI();
}

function activatePhoto(photo) {
  const morph = Boolean(state.image && state.progress >= 0.999);
  field.setImage(photo.image, budget(1), { morph });
  depthEstimator.cancel();
  state.image = photo;
  state.relief = false;
  state.depthBusy = false;
  if (photo.depthMap) field.setDepthMap(photo.depthMap);
  $("depth-status").textContent = photo.depthKind === "ai"
    ? "Relief affiné par IA · calcul effectué sur cet appareil."
    : "Relief artistique immédiat · affinage IA sur cet appareil si disponible.";
  state.autoFactor = 1;
  state.adaptations = 0;
  state.frames = 0;
  state.frameMean = 16.7;
  state.transition = null;
  state.paused = false;
  state.morph = morph ? { elapsed: 0, seconds: morphDuration(reducedMotion) } : null;
  state.progress = morph || reducedMotion ? 1 : 0;
  field.uniforms.uProgress.value = state.progress;
  if (!morph) field.setZoom(1);
  field.clearPointer();
  $("thumbnail").src = photo.url;
  $("image-name").textContent = photo.name;
  $("image-name").title = photo.name;
  $("image-dimensions").textContent =
    `${photo.image.naturalWidth} × ${photo.image.naturalHeight}${photo.isDemo ? " · Démonstration" : ""}`;
  $("demo-button").hidden = photo.isDemo;
  $("scene").setAttribute("aria-label", `Photo « ${photo.name} » reconstruite par des particules interactives`);
  updateCount();
  closeSettings();
  if (!morph && !reducedMotion) transitionTo(1, state.duration);
  else updateUI();
}

function selectPhoto(photo) {
  if (!field || state.loading || state.morph || photo === state.image) return;
  try {
    activatePhoto(photo);
    renderGallery();
  } catch (error) {
    console.warn("Changement de photo :", error);
    toast("Cette photo n’a pas pu être affichée.");
  }
}

function stepPhoto(direction) {
  const index = state.gallery.indexOf(state.image);
  selectPhoto(state.gallery[(index + direction + state.gallery.length) % state.gallery.length]);
}

function removePhoto() {
  if (state.loading || state.morph || state.gallery.length < 2) return;
  const photo = state.image;
  stepPhoto(1);
  if (state.image === photo) return;
  state.gallery.splice(state.gallery.indexOf(photo), 1);
  if (photo.ownedURL) URL.revokeObjectURL(photo.url);
  renderGallery();
}

async function loadPhotos(specs) {
  const token = ++state.loadToken;
  setLoading(true, "Lecture de vos images…");
  const photos = [];
  try {
    for (const { source, name, isDemo = false } of specs) {
      const ownedURL = typeof source !== "string";
      const url = ownedURL ? URL.createObjectURL(source) : source;
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        photos.push({ image, url, name, isDemo, ownedURL });
      } catch {
        if (ownedURL) URL.revokeObjectURL(url);
        if (token === state.loadToken) toast(`Impossible de lire « ${name} ». Essayez une photo JPEG, PNG ou WebP.`);
      }
      if (token !== state.loadToken) return;
    }
    if (!photos.length) return;
    // Paint the busy state before preparing the buffers.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (token !== state.loadToken) return;
    activatePhoto(photos[0]);
    state.gallery.push(...photos);
    renderGallery();
  } catch (error) {
    if (token === state.loadToken) toast(error.message?.includes("transparente")
      ? error.message : "Impossible de préparer cette photo. Essayez un autre fichier.");
  } finally {
    for (const photo of photos) {
      if (photo.ownedURL && !state.gallery.includes(photo)) URL.revokeObjectURL(photo.url);
    }
    if (token === state.loadToken) {
      setLoading(false);
      updateUI();
    }
  }
}

async function loadPhoto(source, name, isDemo = false) {
  if (state.morph) return;
  const existing = isDemo && state.gallery.find((photo) => photo.isDemo);
  if (existing) return selectPhoto(existing);
  if (state.gallery.length >= 8) {
    toast("Retirez une photo de la galerie pour retrouver l’image d’exemple.");
    return;
  }
  return loadPhotos([{ source, name, isDemo }]);
}

function importFiles(files) {
  if (state.morph) return;
  if (!field) {
    toast("La scène 3D n’est pas disponible dans ce navigateur.");
    return;
  }
  const available = 8 - state.gallery.length;
  const valid = [...files].filter((file) => {
    if (file.type && !file.type.startsWith("image/")) {
      toast("Choisissez un fichier image (JPEG, PNG ou WebP).");
      return false;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast("Cette photo dépasse 50 Mo. Utilisez une version plus légère.");
      return false;
    }
    return true;
  });
  if (!valid.length) return;
  if (valid.length > available) toast("La galerie contient au maximum 8 photos. Retirez-en une pour faire de la place.");
  const selected = valid.slice(0, available);
  if (selected.length) void loadPhotos(selected.map((source) => ({ source, name: source.name || "Votre photo" })));
}

async function changeQuality(quality) {
  if (state.loading || state.morph || quality === state.quality) return;
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
  $("volume-button").addEventListener("click", () => {
    if (!state.image || state.loading || state.morph) return;
    state.volume = !state.volume;
    field.setVolume(state.volume);
    updateUI();
  });
  $("camera-home").addEventListener("click", () => field?.resetCamera());
  $("upload-button").addEventListener("click", () => $("file-input").click());
  $("mobile-upload").addEventListener("click", () => $("file-input").click());
  $("file-input").addEventListener("change", (event) => {
    importFiles(event.target.files || []);
    event.target.value = "";
  });
  $("demo-button").addEventListener("click", () => {
    void loadPhoto("/demo-lac.jpg", "Lac de Braies", true);
  });
  $("replay-button").addEventListener("click", replay);
  $("relief-button").addEventListener("click", () => {
    void toggleRelief();
  });
  $("depth-retry").addEventListener("click", () => {
    void improveDepth();
  });
  $("wave-button").addEventListener("click", toggleWave);
  $("burst-button").addEventListener("click", triggerExplosion);
  $("wind-button").addEventListener("click", triggerWind);
  $("previous-photo").addEventListener("click", () => stepPhoto(-1));
  $("next-photo").addEventListener("click", () => stepPhoto(1));
  $("remove-photo").addEventListener("click", removePhoto);
  for (const id of ["depth-amount", "effect-intensity"]) {
    const input = $(id);
    const refresh = () => {
      input.style.setProperty("--fill", `${input.value}%`);
      $(`${id}-value`).textContent = `${input.value} %`;
      if (id === "depth-amount")
        field?.setDepthAmount(Number(input.value) / 100);
      else field?.setEffectIntensity(Number(input.value) / 100);
    };
    input.addEventListener("input", refresh);
    refresh();
  }
  $("pause-button").addEventListener("click", togglePause);
  $("scatter-button").addEventListener("click", () => {
    if (!state.image || state.loading || state.morph) return;
    if (
      (state.transition && state.transition.to === 0) ||
      (!state.transition && state.progress < 0.5)
    )
      form();
    else transitionTo(0, reducedMotion ? 0.3 : 2.2);
  });
  for (const input of document.querySelectorAll("#duration, #drift")) {
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
        $("drift-value").textContent = `${input.value} %`;
        if (field)
          field.uniforms.uDrift.value = Number(input.value) / 100;
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
    importFiles(event.dataTransfer?.files || []);
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
      "1 doigt : envol · 2 doigts : tourner / zoomer";
}

function setupPointer() {
  const canvas = field.canvas;
  const pointers = new Map();
  let pinchDistance = 0, pinchZoom = 1, centroid = null, tapStart = null, mouseDrag = null;
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const centre = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    tapStart = pointers.size ? null : { x: event.clientX, y: event.clientY, time: performance.now() };
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    if (pointers.size >= 2) {
      tapStart = null; mouseDrag = null;
      pinchDistance = distance(); pinchZoom = field.zoom; centroid = centre();
      field.setOrbitDragging(true);
    } else if (event.pointerType === "mouse") {
      mouseDrag = { x: event.clientX, y: event.clientY, moved: false };
      field.setOrbitDragging(true);
    } else field.setPointer(event.clientX, event.clientY);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      if (pinchDistance > 0) field.setZoom(pinchZoom * distance() / pinchDistance);
      const next = centre();
      if (centroid) field.orbitBy(next.x - centroid.x, next.y - centroid.y);
      centroid = next;
    } else if (mouseDrag && pointers.has(event.pointerId)) {
      if (mouseDrag.moved || Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y) > 5) {
        mouseDrag.moved = true;
        field.orbitBy(event.clientX - mouseDrag.x, event.clientY - mouseDrag.y);
      }
      mouseDrag.x = event.clientX; mouseDrag.y = event.clientY;
    } else if (event.pointerType === "mouse" || pointers.size === 1) field.setPointer(event.clientX, event.clientY);
  });
  const release = (event) => {
    const tapped = event.type === "pointerup" && pointers.size === 1 && tapStart && !mouseDrag?.moved &&
      performance.now() - tapStart.time < 500 && Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y) < 7;
    pointers.delete(event.pointerId);
    pinchDistance = 0; centroid = null; mouseDrag = null; tapStart = null;
    field.setOrbitDragging(false);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (tapped) triggerExplosion();
    else if (event.type === "pointerup" && event.pointerType === "mouse") field.setPointer(event.clientX, event.clientY);
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("lostpointercapture", () => {
    if (!pointers.size) { mouseDrag = null; field.setOrbitDragging(false); }
  });
  canvas.addEventListener("pointerleave", () => { if (!pointers.size) field.clearPointer(); });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault(); field.resettingZoom = false;
    field.setZoom(field.zoom * Math.exp(-event.deltaY * 0.001));
    field.setPointer(event.clientX, event.clientY);
  }, { passive: false });
  window.addEventListener("blur", () => {
    pointers.clear(); mouseDrag = null; tapStart = null; centroid = null;
    field.setOrbitDragging(false);
  });
}

function tick(now) {
  frameId = requestAnimationFrame(tick);
  const rawDelta = now - lastFrame;
  const delta = Math.min(0.05, Math.max(0, rawDelta / 1000));
  lastFrame = now;
  if (!state.paused && !state.loading && !field.contextLost) {
    state.time += delta;
    if (state.morph) {
      state.morph.elapsed += delta;
      const fraction = Math.min(1, state.morph.elapsed / state.morph.seconds);
      field.uniforms.uMorph.value = fraction;
      if (fraction >= 1) {
        state.morph = null;
        updateUI();
      }
    }
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
  if (state.image && !state.loading && !state.morph && !field.contextLost) {
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
    field.uniforms.uDrift.value = Number($("drift").value) / 100;
    field.setDepthAmount(Number($("depth-amount").value) / 100);
    field.setEffectIntensity(Number($("effect-intensity").value) / 100);
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
