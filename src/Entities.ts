import type { Rect } from "./utils";
import { aabbOverlap } from "./utils";
import type { EmberDef, EnemyDef, MovingPlatformDef, SpringDef } from "./Level";

export class MovingPlatform {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  readonly w: number;
  readonly h: number;
  private readonly baseX: number;
  private readonly baseY: number;

  constructor(private def: MovingPlatformDef) {
    this.baseX = def.x;
    this.baseY = def.y;
    this.x = def.x;
    this.y = def.y;
    this.prevX = def.x;
    this.prevY = def.y;
    this.w = def.w;
    this.h = def.h;
  }

  update(elapsed: number): void {
    this.prevX = this.x;
    this.prevY = this.y;
    const { range, speed, phase, axis } = this.def;
    const cycle = range * 2;
    let pos = (elapsed * speed + phase * cycle) % cycle;
    if (pos < 0) pos += cycle;
    if (pos > range) pos = cycle - pos;
    if (axis === "x") {
      this.x = this.baseX + pos;
      this.y = this.baseY;
    } else {
      this.x = this.baseX;
      this.y = this.baseY + pos;
    }
  }

  get deltaX(): number {
    return this.x - this.prevX;
  }

  get deltaY(): number {
    return this.y - this.prevY;
  }

  get rect(): Rect {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }
}

export class Ember {
  collected = false;
  private bob = Math.random() * Math.PI * 2;

  constructor(public x: number, public y: number) {}

  get rect(): Rect {
    return { x: this.x - 5, y: this.y - 5, w: 10, h: 10 };
  }

  update(dt: number): void {
    this.bob += dt * 3;
  }

  get drawY(): number {
    return this.y + Math.sin(this.bob) * 3;
  }
}

export class Enemy {
  x: number;
  y: number;
  readonly w = 18;
  readonly h = 16;
  vx: number;
  alive = true;
  squash = 0;
  private walkT = 0;

  constructor(private def: EnemyDef) {
    this.x = def.x;
    this.y = def.y - this.h;
    this.vx = -(def.speed ?? 40);
  }

  get rect(): Rect {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  /** Slightly smaller rect for "landed on top" stomp detection. */
  get stompRect(): Rect {
    return { x: this.x + 2, y: this.y, w: this.w - 4, h: this.h * 0.5 };
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.walkT += dt;
    this.x += this.vx * dt;
    if (this.x <= this.def.rangeLeft) {
      this.x = this.def.rangeLeft;
      this.vx = Math.abs(this.vx);
    } else if (this.x + this.w >= this.def.rangeRight) {
      this.x = this.def.rangeRight - this.w;
      this.vx = -Math.abs(this.vx);
    }
    if (this.squash > 0) this.squash -= dt * 4;
  }

  get bobOffset(): number {
    return Math.sin(this.walkT * 8) * 1.5;
  }

  kill(): void {
    this.alive = false;
  }
}

export class Spring implements SpringDef {
  x: number;
  y: number;
  triggerTimer = 0;
  readonly w = 20;
  readonly h = 8;

  constructor(def: SpringDef) {
    this.x = def.x;
    this.y = def.y;
  }

  get rect(): Rect {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  }

  update(dt: number): void {
    if (this.triggerTimer > 0) this.triggerTimer -= dt;
  }

  trigger(): void {
    this.triggerTimer = 0.3;
  }
}

export function overlaps(a: Rect, b: Rect): boolean {
  return aabbOverlap(a, b);
}

export { type EmberDef };
