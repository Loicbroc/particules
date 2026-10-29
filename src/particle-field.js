import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Matrix4,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Raycaster,
  Ray,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { FlightBrush, updateFlowVelocity } from "./flight-brush.js";
import { remapCloud } from "./photo-morph.js";
import { OrbitView } from "./orbit-view.js";
import { ParticlePicker } from "./particle-picker.js";
import {
  explosionEnvelope,
  sampleDepth,
  validateDepthMap,
  waveHeight,
} from "./surface-effects.js";

export const vertexShader = /* glsl */ `
  attribute vec4 aRandom;
  attribute float aOpacity;
  attribute vec4 aFlight;
  attribute float aFlightZ;
  attribute float aDepth;
  attribute vec3 aFromPosition;
  attribute vec3 aFromColor;
  attribute float aFromOpacity;
  uniform float uTime;
  uniform float uProgress;
  uniform float uDrift;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uInteractionTime;
  uniform float uMotion;
  uniform float uDepth;
  uniform float uVolume;
  uniform float uWave;
  uniform float uBurst;
  uniform float uWorldScale;
  uniform vec2 uCenter;
  uniform float uMorph;
  uniform float uMorphMotion;
  uniform float uFromSize;
  uniform float uWindTime;
  uniform float uWindStrength;
  uniform float uAspect;
  uniform vec2 uViewport;
  uniform vec2 uSkyPointer;
  uniform float uStarFraction;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vFormed;
  varying float vWind;
  varying vec2 vFlow;
  varying float vSky;
  varying float vSparkle;

  void main() {
    float formation = clamp((uProgress - 0.12) / 0.88, 0.0, 1.0);
    float p = smoothstep(aRandom.w * 0.28, 1.0, formation);
    float remaining = 1.0 - p;
    vec3 target = position;
    float depth = clamp((aDepth - 0.5) * uDepth + (aRandom.z - 0.5) * uVolume, -2.5 / uWorldScale, 2.5 / uWorldScale);
    // Preserve the original photograph when viewed head-on, then reveal its
    // depth through a small orbit. Wave displacement remains uncompensated.
    target.xy = position.xy * (1.0 - depth * uWorldScale / 7.0) - uCenter * depth / 7.0;
    target.z = depth;
    float wavePhase = position.x * 3.2 + position.y * 1.1 - uTime * 1.65;
    target.z += sin(wavePhase) * uWave;
    target.y += cos(wavePhase) * uWave * 0.065;
    vec3 pos = target;
    float morph = smoothstep(0.0, 1.0, uMorph);
    float crossing = sin(morph * 3.14159265);
    vec3 passage = vec3(
      sin(aRandom.x * 6.2831853) * (0.5 + aRandom.z),
      (aRandom.y - 0.5) * 1.8 + sin(morph * 6.2831853 + aRandom.x * 6.2831853) * 0.3,
      (aRandom.w - 0.35) * 2.6
    );
    pos = mix(aFromPosition, pos, morph) + passage * crossing * uMorphMotion;
    float age = uInteractionTime - aFlight.x;
    float duration = 4.4 + aRandom.z * 2.4;
    float airborne = 0.0;
    float flightTrail = 0.0;
    vec2 flowDirection = vec2(1.0, 0.0);
    if (aFlight.y > 0.0 && age >= 0.0 && age < duration) {
      // Integrate a decaying velocity analytically: the mouse lends its actual
      // direction and momentum, which continue after it has left the image.
      float phase = position.x * 2.1 + position.y * 1.3 + aRandom.z * 1.6;
      vec3 velocity = vec3(aFlight.zw, aFlightZ) * 0.46 + vec3(cos(phase), sin(phase), 0.0) * 0.09;
      float drag = 0.72 + aRandom.y * 0.28;
      float travel = (1.0 - exp(-age * drag)) / drag;
      float floatIn = 1.0 - exp(-age * 1.3);
      float returnPhase = clamp((age - 1.25) / (duration - 1.25), 0.0, 1.0);
      float returnToImage = 1.0 - returnPhase * returnPhase * returnPhase * (returnPhase * (returnPhase * 6.0 - 15.0) + 10.0);
      vec3 flight = velocity * travel;
      flight.xy += vec2(sin(phase + age * 1.05), cos(phase + age * 0.85)) * 0.16 * floatIn;
      flight.y += (0.18 + aRandom.w * 0.18) * floatIn * floatIn;
      flight.z += ((aRandom.y - 0.4) * 0.5 + sin(phase + age * 0.8) * 0.18) * floatIn;
      flight *= aFlight.y * returnToImage * smoothstep(0.55, 0.95, p);
      pos += flight;
      airborne = clamp(length(flight), 0.0, 1.0);
      vec2 screenVelocity = (modelViewMatrix * vec4(velocity, 0.0)).xy;
      flowDirection = normalize(screenVelocity + vec2(0.00001, 0.0));
      flightTrail = min(0.8, length(vec3(aFlight.zw, aFlightZ)) * 0.12) * floatIn * returnToImage * aFlight.y;
    }
    if (uBurst > 0.0) {
      float theta = aRandom.x * 6.2831853;
      float zDirection = aRandom.y * 2.0 - 1.0;
      float ring = sqrt(max(0.0, 1.0 - zDirection * zDirection));
      vec3 direction = vec3(cos(theta) * ring, sin(theta) * ring, zDirection * 0.38);
      pos += direction * (1.7 + aRandom.z * 2.3) * uBurst * p;
      airborne = max(airborne, min(1.0, uBurst));
    }
    // A front crosses the photo. Every grain departs at its own time, drifts
    // downstream and settles back; no radial hole or permanent displacement.
    float windAge = uWindTime - (position.x / (2.0 * uAspect) + 0.5) * 1.9 - aRandom.x * 0.16;
    float wind = 0.0;
    if (windAge > 0.0 && windAge < 3.7) {
      float settle = 1.0 - smoothstep(1.25, 3.7, windAge);
      wind = smoothstep(0.0, 0.35, windAge) * settle * uWindStrength * p;
      float drift = min(windAge, 1.35);
      pos.x += (0.55 + aRandom.y * 1.25) * drift * wind;
      pos.y += (0.13 * drift + sin(windAge * 3.1 + aRandom.z * 6.2831853) * 0.2) * wind;
      pos.z += ((aRandom.w - 0.4) * 0.75 + sin(windAge * 2.2 + aRandom.x * 6.2831853) * 0.18) * wind;
      airborne = max(airborne, wind * 0.65);
    }
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    // Sample the camera frustum, not the photograph's bounds. The sky remains
    // immersive for a portrait, a panorama, a mobile screen or a changed zoom.
    float distance = 4.0 + aRandom.z * 15.0;
    vec2 sky = (aRandom.xy - 0.5) * 1.14;
    sky += vec2(sin(uTime * 0.065 + aRandom.z * 6.2831853), cos(uTime * 0.05 + aRandom.w * 6.2831853)) * 0.012 * uDrift * uMotion;
    sky += uSkyPointer * (1.0 - distance / 22.0) * vec2(-0.035, 0.025) * uMotion;
    vec3 skyPosition = vec3(sky * uViewport * (distance / 7.0), -distance);
    float skyWeight = remaining * morph;
    mvPosition.xyz = mix(mvPosition.xyz, skyPosition, skyWeight);
    // Slightly curved paths give the gathering a sense of volume without
    // imposing a shared spiral on the cloud.
    mvPosition.xy += vec2(sin(aRandom.w * 6.2831853), cos(aRandom.z * 6.2831853)) * sin(p * 3.14159265) * 0.18 * uDrift * uMotion * morph;
    gl_Position = projectionMatrix * mvPosition;
    float depthFootprint = mix(1.0, (7.0 - depth * uWorldScale) / 7.0, p);
    float streak = max(wind, flightTrail);
    float fromFootprint = (7.0 - aFromPosition.z * uWorldScale) / 7.0;
    float photoSize = mix(uFromSize * fromFootprint, uSize * depthFootprint, morph) * uPixelRatio * (7.0 / max(0.3, -mvPosition.z)) * mix(1.0, 0.7, airborne) * (1.0 + streak * 1.6);
    float starSeed = fract(aRandom.w * 19.19 + aRandom.z * 73.13);
    float magnitude = pow(fract(aRandom.x * 31.31 + aRandom.w * 7.17), 5.0);
    float starSize = (1.7 + magnitude * 6.5) * (1.25 - distance * 0.025) * uPixelRatio;
    gl_PointSize = clamp(mix(photoSize, starSize, skyWeight), 1.0, 30.0);
    float twinkle = 0.82 + sin(uTime * (0.7 + aRandom.z) + aRandom.w * 6.2831853) * 0.18 * uMotion;
    vec3 starlight = mix(vec3(0.62, 0.77, 1.0), vec3(1.0, 0.84, 0.64), aRandom.y) * (0.65 + magnitude * 1.8) * twinkle;
    vColor = mix(mix(aFromColor, color, morph), starlight, skyWeight);
    float starVisible = 1.0 - step(uStarFraction, starSeed);
    float reveal = mix(starVisible, 1.0, smoothstep(0.18, 0.9, p));
    vOpacity = mix(aFromOpacity, aOpacity, morph) * mix(1.0, reveal, morph) * mix(0.8, 1.0, p);
    vFormed = p * (1.0 - airborne * 0.45) * (1.0 - crossing * 0.6 * uMorphMotion);
    vWind = streak;
    vFlow = wind >= flightTrail ? vec2(1.0, 0.0) : flowDirection;
    vSky = skyWeight;
    vSparkle = step(0.93, magnitude) * skyWeight;
  }
`;

export const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vOpacity;
  varying float vFormed;
  varying float vWind;
  varying vec2 vFlow;
  varying float vSky;
  varying float vSparkle;
  void main() {
    if (vOpacity < 0.005) discard;
    vec2 grain = gl_PointCoord - vec2(0.5);
    // gl_PointCoord's Y direction is opposite to the projected velocity.
    vec2 direction = vec2(vFlow.x, -vFlow.y);
    grain = vec2(dot(grain, direction), dot(grain, vec2(-direction.y, direction.x)));
    grain.y *= 1.0 + vWind * 1.6;
    float radius = length(grain);
    if (radius > 0.5) discard;
    float soft = exp(-radius * radius * 12.0) * (1.0 - smoothstep(0.4, 0.5, radius));
    float crisp = 1.0 - smoothstep(0.38, 0.5, radius);
    float alpha = mix(soft, crisp, vFormed) * vOpacity;
    float starCore = exp(-radius * radius * 34.0);
    float halo = exp(-radius * radius * 8.0) * 0.24;
    float rays = (exp(-abs(grain.x) * 70.0) + exp(-abs(grain.y) * 70.0)) * exp(-radius * 5.0) * 0.24 * vSparkle;
    alpha = mix(alpha, (starCore + halo + rays) * vOpacity, vSky);
    vec3 light = vColor * mix(1.4, 1.0, vFormed);
    gl_FragColor = vec4(light, alpha);
    #include <colorspace_fragment>
  }
`;

const linear = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const n = i / 255;
  linear[i] = n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}

export class ParticleField {
  constructor(
    container,
    { reducedMotion = false, onContextLost, onContextRestored } = {},
  ) {
    this.container = container;
    this.renderer = new WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor("#070a0f", 1);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute("aria-hidden", "true");
    container.append(this.canvas);
    this.canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.contextLost = true;
      onContextLost?.();
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      this.contextLost = false;
      onContextRestored?.();
    });

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(42, 1, 0.1, 80);
    this.camera.position.set(0, 0, 7);
    this.orbit = new OrbitView();
    this.orbitDragging = false;
    this.pickMatrix = new Matrix4();
    this.pickDirty = true;
    this.pickTime = -100;
    this.flowVelocity = new Vector3();
    this.sampleNdc = new Vector2();
    this.group = new Group();
    this.scene.add(this.group);
    this.raycaster = new Raycaster();
    this.localRay = new Ray();
    this.inverseMatrix = new Matrix4();
    this.ndc = new Vector2();
    this.hit = new Vector3();
    this.pointer = new Vector2(100, 100);
    this.pointerTarget = new Vector2(100, 100);
    this.pointerActive = 0;
    this.interactionTime = 0;
    this.lastBrush = null;
    this.brushVelocity = new Vector2();
    this.view = new Vector2();
    this.viewTarget = new Vector2();
    this.viewAmount = 0;
    this.reducedMotion = reducedMotion;
    this.currentTime = 0;
    this.explosionStart = -100;
    this.windStart = -100;
    this.depthMap = null;
    this.sourceImage = null;
    this.effects = { volume: true, relief: false, wave: false, depth: 0.55, intensity: 0.65 };
    this.zoom = 1;
    this.aspect = 1.5;
    this.gridWidth = 400;
    this.gridHeight = 267;
    this.uniforms = {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uDrift: { value: 0.65 },
      uSize: { value: 2.4 },
      uPixelRatio: { value: this.renderer.getPixelRatio() },
      uInteractionTime: { value: 0 },
      uMotion: { value: reducedMotion ? 0 : 1 },
      uDepth: { value: 0 },
      uVolume: { value: 1.65 },
      uWave: { value: 0 },
      uBurst: { value: 0 },
      uWorldScale: { value: 1 },
      uCenter: { value: new Vector2() },
      uMorph: { value: 1 },
      uMorphMotion: { value: reducedMotion ? 0 : 1 },
      uFromSize: { value: 2.4 },
      uWindTime: { value: -100 },
      uWindStrength: { value: 0 },
      uAspect: { value: 1.5 },
      uViewport: { value: new Vector2() },
      uSkyPointer: { value: new Vector2() },
      uStarFraction: { value: 1 },
    };
    this.material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    this.addDust(reducedMotion);
    this.resize();
  }

  addDust(reducedMotion) {
    const positions = new Float32Array(700 * 3);
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = (Math.random() - 0.5) * 55;
      positions[i + 1] = (Math.random() - 0.5) * 30;
      positions[i + 2] = -4 - Math.random() * 12;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      color: new Color("#a3b6ad"),
      size: 0.018,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    this.dust = new Points(geometry, material);
    this.dust.userData.reducedMotion = reducedMotion;
    this.scene.add(this.dust);
  }

  setImage(image, budget, { morph = false } = {}) {
    const previous = morph && this.points?.geometry;
    const oldScale = this.baseScale * this.zoom;
    const oldSize = this.uniforms.uSize.value;
    let departing;
    if (previous) {
      const position = previous.getAttribute("position").array.slice();
      const depths = previous.getAttribute("aDepth").array;
      const randoms = previous.getAttribute("aRandom").array;
      for (let i = 0; i < depths.length; i++) {
        const x = position[i * 3], y = position[i * 3 + 1];
        const depth = MathUtils.clamp((depths[i] - 0.5) * this.uniforms.uDepth.value + (randoms[i * 4 + 2] - 0.5) * this.uniforms.uVolume.value, -2.5 / oldScale, 2.5 / oldScale);
        position[i * 3] = x * (1 - depth * oldScale / 7) - this.group.position.x * depth / 7;
        position[i * 3 + 1] = y * (1 - depth * oldScale / 7) - this.group.position.y * depth / 7;
        position[i * 3 + 2] = depth + waveHeight(x, y, this.currentTime, this.uniforms.uWave.value);
      }
      departing = { position, color: previous.getAttribute("color").array, opacity: previous.getAttribute("aOpacity").array };
    }
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height)
      throw new Error("Les dimensions de cette image sont invalides.");
    const aspect = width / height;
    const gridWidth = Math.max(
      1,
      Math.min(width, Math.floor(Math.sqrt(budget * aspect))),
    );
    const gridHeight = Math.max(
      1,
      Math.min(
        height,
        Math.floor(budget / gridWidth),
        Math.round(gridWidth / aspect),
      ),
    );
    const canvas = document.createElement("canvas");
    canvas.width = gridWidth;
    canvas.height = gridHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx)
      throw new Error("Impossible de lire les couleurs de cette photo.");
    ctx.drawImage(image, 0, 0, gridWidth, gridHeight);
    const { data } = ctx.getImageData(0, 0, gridWidth, gridHeight);
    const positions = [],
      colors = [],
      randoms = [],
      opacities = [];
    const cellIndices = new Int32Array(gridWidth * gridHeight).fill(-1);
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const index = (y * gridWidth + x) * 4;
        if (data[index + 3] < 8) continue;
        cellIndices[y * gridWidth + x] = opacities.length;
        positions.push(
          ((x + 0.5) / gridWidth - 0.5) * aspect * 2,
          (0.5 - (y + 0.5) / gridHeight) * 2,
          0,
        );
        colors.push(
          linear[data[index]],
          linear[data[index + 1]],
          linear[data[index + 2]],
        );
        randoms.push(
          Math.random(),
          Math.random(),
          Math.random(),
          Math.random(),
        );
        opacities.push(data[index + 3] / 255);
      }
    }
    if (!opacities.length)
      throw new Error(
        "Cette image est entièrement transparente. Choisissez une autre photo.",
      );
    this.aspect = aspect;
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    if (this.sourceImage !== image) {
      this.sourceImage = image;
      this.depthMap = null;
      this.effects.relief = false;
      this.explosionStart = -100;
      this.windStart = -100;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geometry.setAttribute("aRandom", new Float32BufferAttribute(randoms, 4));
    geometry.setAttribute("aOpacity", new Float32BufferAttribute(opacities, 1));
    // resize below establishes the scale of the arriving photograph.
    this.resize();
    const from = departing
      ? remapCloud(departing, opacities.length, oldScale / (this.baseScale * this.zoom))
      : { position: positions, color: colors, opacity: opacities };
    geometry.setAttribute("aFromPosition", new Float32BufferAttribute(from.position, 3));
    geometry.setAttribute("aFromColor", new Float32BufferAttribute(from.color, 3));
    geometry.setAttribute("aFromOpacity", new Float32BufferAttribute(from.opacity, 1));
    this.uniforms.uFromSize.value = departing ? oldSize : this.uniforms.uSize.value;
    this.uniforms.uMorph.value = departing ? 0 : 1;
    this.uniforms.uAspect.value = aspect;
    const depths = new Float32Array(opacities.length);
    for (let i = 0; i < depths.length; i++) {
      depths[i] = sampleDepth(
        this.depthMap,
        positions[i * 3] / (aspect * 2) + 0.5,
        0.5 - positions[i * 3 + 1] / 2,
      );
    }
    this.depthAttribute = new BufferAttribute(depths, 1);
    geometry.setAttribute("aDepth", this.depthAttribute);
    this.flightBrush = new FlightBrush(
      gridWidth,
      gridHeight,
      aspect,
      cellIndices,
      geometry.getAttribute("aRandom").array,
    );
    this.flightAttribute = new BufferAttribute(
      this.flightBrush.data,
      4,
    ).setUsage(DynamicDrawUsage);
    geometry.setAttribute("aFlight", this.flightAttribute);
    this.flightZAttribute = new BufferAttribute(this.flightBrush.zData, 1).setUsage(DynamicDrawUsage);
    geometry.setAttribute("aFlightZ", this.flightZAttribute);
    this.pickDirty = true;
    this.lastBrush = null;
    if (this.points) {
      this.group.remove(this.points);
      this.points.geometry.dispose();
    }
    this.points = new Points(geometry, this.material);
    // The shader moves points far outside their source image bounds.
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.count = opacities.length;
    this.uniforms.uStarFraction.value = Math.min(1, 3400 / this.count);
    this.container.dataset.particleCount = String(this.count);
    this.resize();
    this.renderer.compile(this.scene, this.camera);
    return this.count;
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const visibleHeight =
      2 * Math.tan(MathUtils.degToRad(this.camera.fov / 2)) * 7;
    const unit = visibleHeight / height;
    this.uniforms.uViewport.value.set(visibleHeight * width / height, visibleHeight);
    const desktop = width > 900;
    const sidebar = desktop ? (width > 1100 ? 330 : 290) : 0;
    const landscape = !desktop && height < 520;
    const availableWidth = width - sidebar - (desktop ? 70 : 34);
    const header = !desktop && document.querySelector(".header")?.getBoundingClientRect();
    const dock = !desktop && document.querySelector(".scene-bottom")?.getBoundingClientRect();
    const sceneTop = this.container.getBoundingClientRect().top;
    const imageTop = !desktop ? Math.max(68, (header?.bottom || 68) - sceneTop) + 12 : 0;
    const imageBottom = !desktop ? (dock?.top ? dock.top - sceneTop : height - 130) - 12 : 0;
    const availableHeight = desktop ? height - 465 : imageBottom - imageTop;
    const imageWidth = Math.min(
      availableWidth,
      Math.max(60, availableHeight) * this.aspect,
    );
    const worldHeight = (imageWidth / this.aspect) * unit;
    this.baseScale = worldHeight / 2;
    this.group.scale.setScalar(this.baseScale * this.zoom);
    this.group.position.set(
      sidebar * 0.5 * unit,
      (desktop ? 63 : height / 2 - (imageTop + imageBottom) / 2) * unit,
      0,
    );
    this.group.updateMatrixWorld(true);
    this.uniforms.uWorldScale.value = this.baseScale * this.zoom;
    this.uniforms.uCenter.value.set(
      this.group.position.x,
      this.group.position.y,
    );
    this.pickDirty = true;
    // Slightly overlapping discs keep the completed image readable.
    this.uniforms.uSize.value =
      Math.max(1.0, (imageWidth / this.gridWidth) * 1.65) * this.zoom;
    this.brushRadius = MathUtils.clamp(
      100 / Math.max(1, (imageWidth / this.aspect) * this.zoom),
      0.12,
      0.42,
    );
  }

  setZoom(zoom) {
    this.zoom = MathUtils.clamp(zoom, 0.6, 1.7);
    this.resize();
  }

  setPointer(clientX, clientY) {
    const bounds = this.container.getBoundingClientRect();
    this.ndc.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    const sidebar = this.width > 900 ? (this.width > 1100 ? 330 : 290) : 0;
    this.viewTarget.set(
      MathUtils.clamp(
        (clientX - bounds.left - (bounds.width + sidebar) / 2) /
          Math.max(1, (bounds.width - sidebar) / 2),
        -1,
        1,
      ),
      MathUtils.clamp(
        (clientY - bounds.top - bounds.height / 2) / (bounds.height / 2),
        -1,
        1,
      ),
    );
    const wasActive = this.pointerActive;
    this.pointerActive = 1;
    if (!wasActive) this.pointer.copy(this.ndc);
  }

  projectPointer(ndc = this.ndc) {
    this.camera.updateMatrixWorld();
    this.group.updateMatrixWorld(true);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.localRay.copy(this.raycaster.ray)
      .applyMatrix4(this.inverseMatrix.copy(this.group.matrixWorld).invert());
    this.pickMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
      .multiply(this.group.matrixWorld);
  }

  setDepthMap(map) {
    this.depthMap = validateDepthMap(map);
    if (!this.points) return;
    const positions = this.points.geometry.getAttribute("position").array;
    for (let i = 0; i < this.depthAttribute.count; i++) {
      this.depthAttribute.array[i] = sampleDepth(
        map,
        positions[i * 3] / (this.aspect * 2) + 0.5,
        0.5 - positions[i * 3 + 1] / 2,
      );
    }
    this.depthAttribute.needsUpdate = true;
    this.pickDirty = true;
  }

  setVolume(enabled) { this.effects.volume = Boolean(enabled); }
  setOrbitDragging(active) {
    this.orbitDragging = Boolean(active);
    this.canvas.classList.toggle("orbiting", this.orbitDragging);
    this.clearPointer();
  }
  orbitBy(dx, dy) { this.resettingZoom = false; this.orbit.drag(dx, dy); }
  resetCamera() {
    this.orbit.home();
    this.resettingZoom = true;
    this.clearPointer();
  }

  rebuildPicker() {
    const geometry = this.points.geometry;
    const source = geometry.getAttribute("position").array;
    const depths = geometry.getAttribute("aDepth").array;
    const seeds = geometry.getAttribute("aRandom").array;
    const positions = new Float32Array(source.length);
    const scale = this.uniforms.uWorldScale.value;
    const amount = this.uniforms.uDepth.value, volume = this.uniforms.uVolume.value;
    const wave = this.uniforms.uWave.value;
    for (let i = 0; i < depths.length; i++) {
      const x = source[i * 3], y = source[i * 3 + 1];
      const depth = MathUtils.clamp((depths[i] - 0.5) * amount + (seeds[i * 4 + 2] - 0.5) * volume, -2.5 / scale, 2.5 / scale);
      positions[i * 3] = x * (1 - depth * scale / 7) - this.group.position.x * depth / 7;
      positions[i * 3 + 1] = y * (1 - depth * scale / 7) - this.group.position.y * depth / 7 + Math.cos(x * 3.2 + y * 1.1 - this.currentTime * 1.65) * wave * 0.065;
      positions[i * 3 + 2] = depth + waveHeight(x, y, this.currentTime, wave);
    }
    if (this.picker) this.picker.rebuild(positions);
    else this.picker = new ParticlePicker(positions);
    this.pickDepth = amount; this.pickVolume = volume; this.pickWave = wave;
    this.pickTime = this.interactionTime; this.pickDirty = false;
  }

  setRelief(enabled) {
    this.effects.relief = Boolean(enabled && this.depthMap);
  }
  setWave(enabled) {
    this.effects.wave = Boolean(enabled);
  }
  setDepthAmount(value) {
    this.effects.depth = MathUtils.clamp(value, 0, 1);
  }
  setEffectIntensity(value) {
    this.effects.intensity = MathUtils.clamp(value, 0, 1);
  }
  resetExplosion() {
    this.explosionStart = -100;
    this.windStart = -100;
  }
  blowWind() {
    if (!this.points || this.uniforms.uProgress.value < 0.97 || this.uniforms.uMorph.value < 1) return false;
    this.windStart = this.currentTime;
    return true;
  }
  get windy() {
    const age = this.currentTime - this.windStart;
    return age >= 0 && age < 5.8;
  }
  explode() {
    if (!this.points || this.uniforms.uProgress.value < 0.97) return false;
    this.explosionStart = this.currentTime;
    return true;
  }
  get exploding() {
    const age = this.currentTime - this.explosionStart;
    return age >= 0 && age < 5.8;
  }

  clearPointer() {
    this.pointerActive = 0;
    this.lastBrush = null;
    this.brushVelocity.set(0, 0);
  }

  render(delta, time) {
    if (this.contextLost) return;
    this.uniforms.uTime.value = time;
    this.currentTime = time;
    this.uniforms.uWindTime.value = time - this.windStart;
    this.uniforms.uWindStrength.value = 0.4 + this.effects.intensity * 0.9;
    this.uniforms.uDepth.value = MathUtils.damp(
      this.uniforms.uDepth.value,
      this.effects.relief ? this.effects.depth * 1.05 : 0,
      5,
      delta,
    );
    this.uniforms.uVolume.value = MathUtils.damp(
      this.uniforms.uVolume.value, this.effects.volume ? this.effects.depth * 3 : 0, 5, delta,
    );
    this.uniforms.uWave.value = MathUtils.damp(
      this.uniforms.uWave.value,
      this.effects.wave ? 0.13 + this.effects.intensity * 0.4 : 0,
      5,
      delta,
    );
    this.uniforms.uBurst.value =
      explosionEnvelope(time - this.explosionStart) *
      (0.45 + this.effects.intensity * 0.85);
    const orbitX = this.reducedMotion ? 0 : Math.sin(time * 0.32) * 0.5;
    const orbitY = this.reducedMotion ? 0 : Math.cos(time * 0.25) * 0.28;
    const viewX = this.pointerActive ? this.viewTarget.x : orbitX;
    const viewY = this.pointerActive ? this.viewTarget.y : orbitY;
    this.view.x = MathUtils.damp(this.view.x, viewX, 4, delta);
    this.view.y = MathUtils.damp(this.view.y, viewY, 4, delta);
    this.uniforms.uSkyPointer.value.copy(this.view);
    this.group.rotation.set(0, 0, 0);
    if (this.resettingZoom) {
      const next = MathUtils.damp(this.zoom, 1, 9, delta);
      this.setZoom(Math.abs(next - 1) < 0.0001 ? 1 : next);
      if (this.zoom === 1) this.resettingZoom = false;
    }
    this.orbit.update(this.camera, this.group.position, delta);
    this.interactionTime += delta;
    this.uniforms.uInteractionTime.value = this.interactionTime;
    if (this.pointerActive) this.pointer.lerp(this.ndc, 1 - Math.exp(-delta * 20));
    if (
      this.pointerActive && !this.orbitDragging && this.flightBrush &&
      !this.exploding && !this.windy && this.uniforms.uMorph.value >= 1 &&
      this.uniforms.uProgress.value > 0.999
    ) {
      const elapsed = this.interactionTime - this.pickTime;
      if (this.pickDirty || !this.picker || elapsed > 0.07 && (
        Math.abs(this.pickDepth - this.uniforms.uDepth.value) > 0.003 ||
        Math.abs(this.pickVolume - this.uniforms.uVolume.value) > 0.003 ||
        Math.abs(this.pickWave - this.uniforms.uWave.value) > 0.003 ||
        this.uniforms.uWave.value > 0.001
      )) this.rebuildPicker();
      const start = this.lastBrush || this.pointer;
      const dx = this.pointer.x - start.x, dy = this.pointer.y - start.y;
      const scale = this.uniforms.uWorldScale.value;
      updateFlowVelocity(this.brushVelocity,
        dx * this.uniforms.uViewport.value.x / (2 * scale),
        dy * this.uniforms.uViewport.value.y / (2 * scale), delta);
      this.flowVelocity.set(this.brushVelocity.x, this.brushVelocity.y, 0).applyQuaternion(this.camera.quaternion);
      // Query the swept footprint once, so fast gestures do not multiply the
      // cost of traversing a dense 3D cloud.
      this.sampleNdc.copy(start).add(this.pointer).multiplyScalar(0.5);
      this.projectPointer(this.sampleNdc);
      const radius = 54 + Math.hypot(dx * this.width / 2, dy * this.height / 2) / 2;
      let first = Infinity, last = -1;
      this.picker.query(this.localRay, this.pickMatrix, this.sampleNdc, this.width, this.height, radius, (index, falloff) => {
        if (this.flightBrush.kick(index, falloff, this.flowVelocity.x, this.flowVelocity.y, this.flowVelocity.z,
          this.interactionTime, delta)) {
          first = Math.min(first, index * 4); last = Math.max(last, index * 4 + 4);
        }
      }, { from: start, to: this.pointer, radius: 54 });
      if (last >= 0) {
        this.flightAttribute.clearUpdateRanges();
        this.flightAttribute.addUpdateRange(first, last - first);
        this.flightAttribute.needsUpdate = true;
        this.flightZAttribute.clearUpdateRanges();
        this.flightZAttribute.addUpdateRange(first / 4, (last - first) / 4);
        this.flightZAttribute.needsUpdate = true;
      }
      if (!this.lastBrush) this.lastBrush = new Vector2();
      this.lastBrush.copy(this.pointer);
    }
    if (!this.dust.userData.reducedMotion)
      this.dust.rotation.z = Math.sin(time * 0.025) * 0.025;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.points?.geometry.dispose();
    this.material.dispose();
    this.dust.geometry.dispose();
    this.dust.material.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
