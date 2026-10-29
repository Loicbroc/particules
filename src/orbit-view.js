import { Euler, MathUtils, Quaternion, Vector3 } from "three";

// Rotate the original camera frame around the photograph's centre. Keeping its
// original framing (rather than lookAt(pivot)) makes Home exactly reproducible.
export class OrbitView {
  constructor() {
    this.yaw = this.pitch = this.targetYaw = this.targetPitch = 0;
    this.rotation = new Quaternion();
    this.euler = new Euler(0, 0, 0, "YXZ");
    this.offset = new Vector3();
    this.zoomLevel = this.targetZoomLevel = 0;
    this.pan = new Vector3();
    this.targetPan = new Vector3();
    this.step = new Vector3();
  }
  drag(dx, dy) {
    this.targetYaw -= dx * 0.006;
    this.targetPitch = MathUtils.clamp(this.targetPitch - dy * 0.006, -1.35, 1.35);
  }
  home() {
    this.targetYaw = this.yaw + Math.atan2(Math.sin(-this.yaw), Math.cos(-this.yaw));
    this.targetPitch = 0;
    this.targetZoomLevel = 0;
    this.targetPan.set(0, 0, 0);
  }
  setZoomLevel(level) { if (Number.isFinite(level)) this.targetZoomLevel = level; }
  zoomBy(amount) { this.setZoomLevel(this.targetZoomLevel + amount); }
  panBy(dx, dy, unitsPerPixel) {
    this.step.set(-dx * unitsPerPixel, dy * unitsPerPixel, 0).applyQuaternion(this.rotation);
    this.targetPan.add(this.step);
  }
  update(camera, pivot, delta) {
    this.yaw = MathUtils.damp(this.yaw, this.targetYaw, 9, delta);
    this.pitch = MathUtils.damp(this.pitch, this.targetPitch, 9, delta);
    if (Math.abs(this.yaw - this.targetYaw) < 0.00001) this.yaw = this.targetYaw;
    if (Math.abs(this.pitch - this.targetPitch) < 0.00001) this.pitch = this.targetPitch;
    this.zoomLevel = MathUtils.damp(this.zoomLevel, this.targetZoomLevel, 9, delta);
    if (Math.abs(this.zoomLevel - this.targetZoomLevel) < 0.00001) this.zoomLevel = this.targetZoomLevel;
    this.pan.lerp(this.targetPan, 1 - Math.exp(-delta * 9));
    if (this.pan.distanceToSquared(this.targetPan) < 1e-10) this.pan.copy(this.targetPan);
    this.rotation.setFromEuler(this.euler.set(this.pitch, this.yaw, 0, "YXZ"));
    // Logarithmic dolly has no application min/max distance. Geometry stays
    // fixed while the camera can enter the cloud or back away from it.
    const scale = Math.exp(-this.zoomLevel);
    this.offset.set(0, 0, 7).sub(pivot).multiplyScalar(scale).applyQuaternion(this.rotation).add(pivot).add(this.pan);
    if (![this.offset.x, this.offset.y, this.offset.z].every(Number.isFinite)) return;
    camera.position.copy(this.offset);
    camera.quaternion.copy(this.rotation);
    const far = Math.max(80, camera.position.length() + 80);
    if (far > camera.far || far < camera.far * 0.5) { camera.far = far; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld(true);
  }
}
