import { CANVAS_H, CANVAS_W } from "./constants";
import { clamp, lerp } from "./utils";

export class Camera {
  x = 0;
  y = 0;
  shakeTime = 0;
  shakeMag = 0;

  constructor(private worldW: number, private worldH: number) {}

  follow(targetX: number, targetY: number, targetVx: number, dt: number): void {
    // Look slightly ahead in the direction of travel
    const lookAhead = clamp(targetVx * 0.15, -60, 60);
    const desiredX = targetX - CANVAS_W / 2 + lookAhead;
    const desiredY = targetY - CANVAS_H / 2 - 40;

    this.x = lerp(this.x, desiredX, 1 - Math.pow(0.001, dt));
    this.y = lerp(this.y, desiredY, 1 - Math.pow(0.0005, dt));

    this.x = clamp(this.x, 0, Math.max(0, this.worldW - CANVAS_W));
    this.y = clamp(this.y, 0, Math.max(0, this.worldH - CANVAS_H));

    if (this.shakeTime > 0) this.shakeTime -= dt;
  }

  shake(magnitude: number, duration: number): void {
    this.shakeMag = magnitude;
    this.shakeTime = duration;
  }

  get offset(): { x: number; y: number } {
    if (this.shakeTime <= 0) return { x: this.x, y: this.y };
    const t = this.shakeTime;
    const amt = this.shakeMag * (t > 0 ? 1 : 0);
    return {
      x: this.x + (Math.random() * 2 - 1) * amt,
      y: this.y + (Math.random() * 2 - 1) * amt,
    };
  }
}
