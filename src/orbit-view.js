import { Euler, MathUtils, Quaternion, Vector3 } from "three";

// Rotate the original camera frame around the photograph's centre. Keeping its
// original framing (rather than lookAt(pivot)) makes Home exactly reproducible.
export class OrbitView {
  constructor() {
    this.yaw = this.pitch = this.targetYaw = this.targetPitch = 0;
    this.rotation = new Quaternion();
    this.euler = new Euler(0, 0, 0, "YXZ");
    this.offset = new Vector3();
  }
  drag(dx, dy) {
    this.targetYaw -= dx * 0.006;
    this.targetPitch = MathUtils.clamp(this.targetPitch - dy * 0.006, -1.35, 1.35);
  }
  home() {
    this.targetYaw = this.yaw + Math.atan2(Math.sin(-this.yaw), Math.cos(-this.yaw));
    this.targetPitch = 0;
  }
  update(camera, pivot, delta) {
    this.yaw = MathUtils.damp(this.yaw, this.targetYaw, 9, delta);
    this.pitch = MathUtils.damp(this.pitch, this.targetPitch, 9, delta);
    if (Math.abs(this.yaw - this.targetYaw) < 0.00001) this.yaw = this.targetYaw;
    if (Math.abs(this.pitch - this.targetPitch) < 0.00001) this.pitch = this.targetPitch;
    this.rotation.setFromEuler(this.euler.set(this.pitch, this.yaw, 0, "YXZ"));
    camera.position.copy(this.offset.set(0, 0, 7).sub(pivot).applyQuaternion(this.rotation).add(pivot));
    camera.quaternion.copy(this.rotation);
    camera.updateMatrixWorld(true);
  }
}
