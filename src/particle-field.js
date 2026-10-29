import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  MathUtils,
  PerspectiveCamera,
  Plane,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { FlightBrush } from "./flight-brush.js";

const vertexShader = /* glsl */ `
  attribute vec4 aRandom;
  attribute float aOpacity;
  attribute vec4 aFlight;
  uniform float uTime;
  uniform float uProgress;
  uniform float uSwirl;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uInteractionTime;
  uniform float uMotion;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vFormed;

  void main() {
    float p = smoothstep(aRandom.w * 0.24, 1.0, uProgress);
    float remaining = 1.0 - p;
    float lane = floor(aRandom.y * 3.0);
    float radius = 0.24 + pow(aRandom.z, 0.75) * 3.7;
    float angle = lane * 2.0944 + radius * 1.65 + (aRandom.x - 0.5) * 0.34;
    angle += (uTime * 0.30 + remaining * 11.0) * uSwirl;
    vec3 vortex = vec3(
      cos(angle) * radius,
      sin(angle) * radius * 0.72,
      (aRandom.w - 0.5) * 0.75 + sin(angle + lane) * 0.8
    );
    vortex.y += sin(angle * 2.0 + lane) * 0.18;
    vec3 target = position;
    target.z += sin(uTime * 0.55 + position.x * 2.0 + position.y) * 0.012 * uMotion;
    vec3 pos = mix(vortex, target, p);
    float age = uInteractionTime - aFlight.x;
    float duration = 2.6 + aRandom.z * 1.8;
    float airborne = 0.0;
    if (aFlight.y > 0.0 && age >= 0.0 && age < duration) {
      float launchAngle = aRandom.x * 6.2831853;
      float speed = 0.45 + aRandom.y * 0.7;
      vec3 velocity = vec3(
        cos(launchAngle) * speed + aFlight.z * 0.16,
        0.6 + aRandom.w * 0.9 + sin(launchAngle) * 0.25 + aFlight.w * 0.10,
        (aRandom.y - 0.4) * 1.0
      );
      float departure = 1.0 - exp(-age * 3.0);
      float returnToImage = 1.0 - smoothstep(0.8, duration, age);
      vec3 flight = velocity * min(age, 1.2);
      flight.x += sin(age * 2.1 + aRandom.y * 6.2831853) * 0.12 * departure;
      flight.z += sin(age * 1.7 + aRandom.x * 6.2831853) * 0.16 * departure;
      flight *= aFlight.y * returnToImage * smoothstep(0.55, 0.95, p);
      pos += flight;
      airborne = clamp(length(flight), 0.0, 1.0);
    }
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(uSize * uPixelRatio * (7.0 / max(0.3, -mvPosition.z)) * mix(1.35, 1.0, p) * mix(1.0, 0.7, airborne), 1.0, 30.0);
    vColor = color;
    vOpacity = aOpacity * mix(0.62, 1.0, p);
    vFormed = p * (1.0 - airborne * 0.45);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vOpacity;
  varying float vFormed;
  void main() {
    float radius = length(gl_PointCoord - vec2(0.5));
    if (radius > 0.5) discard;
    float soft = exp(-radius * radius * 12.0) * (1.0 - smoothstep(0.4, 0.5, radius));
    float crisp = 1.0 - smoothstep(0.38, 0.5, radius);
    float alpha = mix(soft, crisp, vFormed) * vOpacity;
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
    this.group = new Group();
    this.scene.add(this.group);
    this.raycaster = new Raycaster();
    this.plane = new Plane(new Vector3(0, 0, 1), 0);
    this.hit = new Vector3();
    this.pointer = new Vector2(100, 100);
    this.pointerTarget = new Vector2(100, 100);
    this.pointerActive = 0;
    this.interactionTime = 0;
    this.lastBrush = null;
    this.zoom = 1;
    this.aspect = 1.5;
    this.gridWidth = 400;
    this.gridHeight = 267;
    this.uniforms = {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uSwirl: { value: 0.95 },
      uSize: { value: 2.4 },
      uPixelRatio: { value: this.renderer.getPixelRatio() },
      uInteractionTime: { value: 0 },
      uMotion: { value: reducedMotion ? 0 : 1 },
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

  setImage(image, budget) {
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
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geometry.setAttribute("aRandom", new Float32BufferAttribute(randoms, 4));
    geometry.setAttribute("aOpacity", new Float32BufferAttribute(opacities, 1));
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
    const desktop = width > 900;
    const sidebar = desktop ? (width > 1100 ? 330 : 290) : 0;
    const landscape = !desktop && height < 520;
    const availableWidth = width - sidebar - (desktop ? 70 : 34);
    const availableHeight = height - (landscape ? 150 : desktop ? 255 : 285);
    const imageWidth = Math.min(
      availableWidth,
      Math.max(60, availableHeight) * this.aspect,
    );
    const worldHeight = (imageWidth / this.aspect) * unit;
    this.baseScale = worldHeight / 2;
    this.group.scale.setScalar(this.baseScale * this.zoom);
    this.group.position.set(
      sidebar * 0.5 * unit,
      (landscape ? 2 : desktop ? 8 : 16) * unit,
      0,
    );
    this.group.updateMatrixWorld(true);
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
    const ndc = new Vector2(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.raycaster.ray.intersectPlane(this.plane, this.hit)) {
      this.group.worldToLocal(this.hit);
      if (!this.pointerActive) this.pointer.copy(this.hit);
      this.pointerTarget.set(this.hit.x, this.hit.y);
      this.pointerActive = 1;
    }
  }

  clearPointer() {
    this.pointerActive = 0;
    this.lastBrush = null;
  }

  render(delta, time) {
    if (this.contextLost) return;
    this.uniforms.uTime.value = time;
    this.interactionTime += delta;
    this.uniforms.uInteractionTime.value = this.interactionTime;
    this.pointer.lerp(this.pointerTarget, 1 - Math.exp(-delta * 20));
    if (
      this.pointerActive &&
      this.flightBrush &&
      this.uniforms.uProgress.value > 0.75
    ) {
      const start = this.lastBrush || this.pointer;
      const dx = this.pointer.x - start.x;
      const dy = this.pointer.y - start.y;
      const samples = Math.min(
        12,
        Math.max(1, Math.ceil(Math.hypot(dx, dy) / (this.brushRadius * 0.45))),
      );
      let first = Infinity;
      let last = -1;
      for (let sample = 1; sample <= samples; sample++) {
        const t = sample / samples;
        const changed = this.flightBrush.stamp(
          start.x + dx * t,
          start.y + dy * t,
          dx / Math.max(delta, 0.001),
          dy / Math.max(delta, 0.001),
          this.interactionTime,
          delta / Math.sqrt(samples),
          this.brushRadius,
        );
        if (changed) {
          first = Math.min(first, changed.start);
          last = Math.max(last, changed.start + changed.count);
        }
      }
      if (last >= 0) {
        this.flightAttribute.clearUpdateRanges();
        this.flightAttribute.addUpdateRange(first, last - first);
        this.flightAttribute.needsUpdate = true;
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
