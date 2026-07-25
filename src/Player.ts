import {
  AIR_CONTROL,
  COYOTE_TIME,
  DASH_COOLDOWN,
  DASH_SPEED,
  DASH_TIME,
  DOUBLE_JUMP_VELOCITY,
  GRAVITY,
  JUMP_BUFFER_TIME,
  JUMP_CUT_MULTIPLIER,
  JUMP_VELOCITY,
  MAX_FALL_SPEED,
  MAX_MOVE_SPEED,
  MOVE_ACCEL,
  MOVE_DECEL,
  PLAYER_H,
  PLAYER_W,
  SLINGSHOT_CHARGE_TIME,
  SLINGSHOT_MAX_BONUS,
  SLINGSHOT_MIN_SPEED,
  SLINGSHOT_MOMENTUM_AIR_CONTROL,
  SLINGSHOT_MOMENTUM_TIME,
  SWING_GRAVITY_SCALE,
  SWING_RELEASE_BOOST,
  WALL_SLIDE_SPEED,
  WHIP_MIN_LENGTH,
  WHIP_RANGE,
} from "./constants";
import type { Input } from "./Input";
import { approach, clamp, type Rect } from "./utils";

export type CollisionTest = (r: Rect) => boolean;

export interface AnchorPoint {
  x: number;
  y: number;
}

export interface PlayerEvents {
  jumped: boolean;
  doubleJumped: boolean;
  landed: boolean;
  dashed: boolean;
  wallSlideStarted: boolean;
  swingAttached: boolean;
  swingReleased: boolean;
  slingshot: boolean;
}

export class Player {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  facing = 1;
  onGround = false;
  wallDir = 0; // -1 left wall touching, 1 right wall touching, 0 none
  wallSliding = false;

  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private doubleJumpUsed = false;
  private wasOnGround = false;
  /** Which wall (-1/1) we're currently adjacent to, independent of vy; gates the once-per-approach refill. */
  private wallContactSide = 0;

  canDash = true;
  private dashActiveTimer = 0;
  private dashDir = 1;
  private dashCooldownTimer = 0;

  swingAnchor: AnchorPoint | null = null;
  private swingLength = 0;
  private chargeTimer = 0;
  /** While active, horizontal air control is greatly reduced so a slingshot launch
   * carries through instead of bleeding off into normal air deceleration. */
  private momentumTimer = 0;

  dead = false;
  squash = 1; // vertical squash/stretch factor for landing/jump juice

  readonly w = PLAYER_W;
  readonly h = PLAYER_H;

  events: PlayerEvents = {
    jumped: false,
    doubleJumped: false,
    landed: false,
    dashed: false,
    wallSlideStarted: false,
    swingAttached: false,
    swingReleased: false,
    slingshot: false,
  };

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  get rect(): Rect {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  get center(): AnchorPoint {
    return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
  }

  get isDashing(): boolean {
    return this.dashActiveTimer > 0;
  }

  get isSwinging(): boolean {
    return this.swingAnchor !== null;
  }

  get isCharging(): boolean {
    return this.swingAnchor !== null && this.chargeTimer > 0;
  }

  teleport(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.dashActiveTimer = 0;
    this.wallSliding = false;
    this.wallContactSide = 0;
    this.swingAnchor = null;
    this.chargeTimer = 0;
    this.momentumTimer = 0;
  }

  private resetJumpState(): void {
    this.doubleJumpUsed = false;
    this.canDash = true;
  }

  update(dt: number, input: Input, collides: CollisionTest, anchors: AnchorPoint[]): void {
    this.events = {
      jumped: false,
      doubleJumped: false,
      landed: false,
      dashed: false,
      wallSlideStarted: false,
      swingAttached: false,
      swingReleased: false,
      slingshot: false,
    };

    this.coyoteTimer -= dt;
    this.jumpBufferTimer -= dt;
    this.dashCooldownTimer -= dt;
    if (this.momentumTimer > 0) this.momentumTimer -= dt;

    if (input.jumpPressed) this.jumpBufferTimer = JUMP_BUFFER_TIME;
    if (input.dashPressed) this.tryDash(input);
    if (input.whipPressed && !this.swingAnchor) this.tryAttachWhip(anchors);

    if (this.swingAnchor) {
      if (input.downHeld) {
        this.chargeTimer = Math.min(this.chargeTimer + dt, SLINGSHOT_CHARGE_TIME);
      } else {
        this.chargeTimer = 0;
      }
      this.updateSwingPhysics(dt);

      if (!input.whipHeld) {
        this.releaseWhip();
      } else if (this.jumpBufferTimer > 0) {
        this.releaseSwing(true);
        this.jumpBufferTimer = 0;
      }
    } else if (this.dashActiveTimer > 0) {
      this.dashActiveTimer -= dt;
      this.vx = this.dashDir * DASH_SPEED;
      this.vy = 0;
      if (this.dashActiveTimer <= 0) {
        this.vx = this.dashDir * MAX_MOVE_SPEED;
      }
    } else {
      this.applyHorizontalMovement(dt, input);
      this.applyGravity(dt);
      this.tryConsumeJump();
      if (input.jumpReleased && this.vy < 0) {
        this.vy *= JUMP_CUT_MULTIPLIER;
      }
    }

    this.moveAndCollide(dt, collides);
    this.updateWallState(collides, input);

    if (this.swingAnchor && this.onGround) {
      this.swingAnchor = null;
      this.chargeTimer = 0;
    }

    if (this.onGround && !this.wasOnGround) {
      this.events.landed = true;
      this.squash = 1.4;
    }
    this.squash = approach(this.squash, 1, dt * 6);
    this.wasOnGround = this.onGround;
  }

  private tryDash(input: Input): void {
    if (this.swingAnchor) return;
    if (!this.canDash || this.dashActiveTimer > 0 || this.dashCooldownTimer > 0) return;
    const axis = input.moveAxis;
    this.dashDir = axis !== 0 ? axis : this.facing;
    this.dashActiveTimer = DASH_TIME;
    this.dashCooldownTimer = DASH_COOLDOWN;
    this.canDash = false;
    this.doubleJumpUsed = false;
    this.events.dashed = true;
  }

  private tryAttachWhip(anchors: AnchorPoint[]): void {
    const c = this.center;
    let best: AnchorPoint | null = null;
    let bestDist = WHIP_RANGE;
    for (const a of anchors) {
      const d = Math.hypot(a.x - c.x, a.y - c.y);
      if (d <= bestDist) {
        bestDist = d;
        best = a;
      }
    }
    if (best) {
      this.swingAnchor = best;
      this.swingLength = clamp(bestDist, WHIP_MIN_LENGTH, WHIP_RANGE);
      this.chargeTimer = 0;
      this.canDash = true;
      this.doubleJumpUsed = false;
      this.events.swingAttached = true;
    }
  }

  /** Called when the whip key is let go: either a normal release-jump, or a charged slingshot launch. */
  private releaseWhip(): void {
    if (!this.swingAnchor) return;
    if (this.chargeTimer > 0.05) {
      this.launchSlingshot();
    } else {
      this.releaseSwing(true);
    }
  }

  private releaseSwing(boost: boolean): void {
    if (!this.swingAnchor) return;
    this.swingAnchor = null;
    this.chargeTimer = 0;
    if (boost) {
      this.vy -= SWING_RELEASE_BOOST;
    }
    this.canDash = true;
    this.doubleJumpUsed = false;
    this.events.swingReleased = true;
  }

  /** Launches the player back through the anchor point, opposite the direction they'd fly off the rope. */
  private launchSlingshot(): void {
    const anchor = this.swingAnchor;
    if (!anchor) return;
    const c = this.center;
    const dx = anchor.x - c.x;
    const dy = anchor.y - c.y;
    const dist = Math.hypot(dx, dy) || 1;
    const power = clamp(this.chargeTimer / SLINGSHOT_CHARGE_TIME, 0, 1);
    const speed = SLINGSHOT_MIN_SPEED + power * SLINGSHOT_MAX_BONUS;
    this.vx = (dx / dist) * speed;
    this.vy = (dy / dist) * speed;
    this.swingAnchor = null;
    this.chargeTimer = 0;
    this.canDash = true;
    this.doubleJumpUsed = false;
    this.momentumTimer = SLINGSHOT_MOMENTUM_TIME;
    this.events.slingshot = true;
  }

  /** Pure gravity pendulum: no player steering, left/right and Down don't affect the arc itself. */
  private updateSwingPhysics(dt: number): void {
    const anchor = this.swingAnchor;
    if (!anchor) return;

    this.vy += GRAVITY * SWING_GRAVITY_SCALE * dt;

    // Integrate, then constrain the player's center to the rope circle.
    const c = this.center;
    const px = c.x + this.vx * dt;
    const py = c.y + this.vy * dt;
    const ndx = px - anchor.x;
    const ndy = py - anchor.y;
    const ndist = Math.hypot(ndx, ndy) || 1;
    const scale = this.swingLength / ndist;
    const finalCx = anchor.x + ndx * scale;
    const finalCy = anchor.y + ndy * scale;

    const finalX = finalCx - this.w / 2;
    const finalY = finalCy - this.h / 2;
    this.vx = (finalX - this.x) / dt;
    this.vy = (finalY - this.y) / dt;
    if (this.vx !== 0) this.facing = Math.sign(this.vx);
  }

  private applyHorizontalMovement(dt: number, input: Input): void {
    const axis = input.moveAxis;
    if (axis !== 0) this.facing = axis;
    const control = this.onGround ? 1 : AIR_CONTROL * (this.momentumTimer > 0 ? SLINGSHOT_MOMENTUM_AIR_CONTROL : 1);
    const target = axis * MAX_MOVE_SPEED;
    const rate = (axis !== 0 ? MOVE_ACCEL : MOVE_DECEL) * control;
    this.vx = approach(this.vx, target, rate * dt);
  }

  private applyGravity(dt: number): void {
    if (this.wallSliding && this.vy > WALL_SLIDE_SPEED) {
      this.vy = WALL_SLIDE_SPEED;
    } else {
      this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL_SPEED);
    }
  }

  private tryConsumeJump(): void {
    if (this.jumpBufferTimer <= 0) return;
    if (this.onGround || this.coyoteTimer > 0) {
      this.vy = -JUMP_VELOCITY;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.onGround = false;
      this.resetJumpState();
      this.squash = 0.7;
      this.events.jumped = true;
    } else if (!this.doubleJumpUsed) {
      this.vy = -DOUBLE_JUMP_VELOCITY;
      this.doubleJumpUsed = true;
      this.jumpBufferTimer = 0;
      this.squash = 0.7;
      this.events.doubleJumped = true;
    }
  }

  /** Bounce off a spring pad, refreshing air abilities like a fresh takeoff. */
  applySpring(velocity: number): void {
    this.vy = -velocity;
    this.resetJumpState();
    this.jumpBufferTimer = 0;
    this.squash = 0.5;
  }

  /** Small bounce after stomping an enemy. */
  applyStompBounce(velocity: number): void {
    this.vy = -velocity;
    this.doubleJumpUsed = false;
  }

  private moveAndCollide(dt: number, collides: CollisionTest): void {
    // Horizontal pass.
    let newX = this.x + this.vx * dt;
    let testRect: Rect = { x: newX, y: this.y, w: this.w, h: this.h };
    if (collides(testRect)) {
      // Step back to the nearest non-colliding pixel along the direction of travel.
      const dir = Math.sign(this.vx);
      let x = this.x;
      while (dir !== 0 && !collides({ x: x + dir, y: this.y, w: this.w, h: this.h })) {
        x += dir;
      }
      newX = x;
      this.vx = 0;
    }
    this.x = newX;

    // Vertical pass.
    let newY = this.y + this.vy * dt;
    testRect = { x: this.x, y: newY, w: this.w, h: this.h };
    this.onGround = false;
    if (collides(testRect)) {
      const dir = Math.sign(this.vy);
      let y = this.y;
      while (dir !== 0 && !collides({ x: this.x, y: y + dir, w: this.w, h: this.h })) {
        y += dir;
      }
      newY = y;
      if (this.vy > 0) {
        this.onGround = true;
        this.coyoteTimer = COYOTE_TIME;
      }
      this.vy = 0;
    }
    this.y = newY;

    if (this.onGround) this.resetJumpState();
  }

  private updateWallState(collides: CollisionTest, input: Input): void {
    if (this.onGround || this.swingAnchor) {
      this.wallDir = 0;
      this.wallSliding = false;
      this.wallContactSide = 0;
      return;
    }

    const probeLeft = collides({ x: this.x - 2, y: this.y + 2, w: 2, h: this.h - 4 });
    const probeRight = collides({ x: this.x + this.w, y: this.y + 2, w: 2, h: this.h - 4 });

    let side = 0;
    if (probeLeft) side = -1;
    else if (probeRight) side = 1;

    if (side === 0) {
      // Not adjacent to any wall: fully detached, ready to refill again on the next approach.
      this.wallContactSide = 0;
      this.wallSliding = false;
      this.wallDir = 0;
      return;
    }

    const axis = input.moveAxis;
    const pressingIn = (side === -1 && axis < 0) || (side === 1 && axis > 0);
    const falling = this.vy >= 0;

    if (pressingIn && falling) {
      this.wallSliding = true;
      this.wallDir = side;
    } else {
      this.wallSliding = false;
      this.wallDir = 0;
    }

    // Refill once per continuous adjacency (not every frame), so you can't chain infinite
    // air jumps by repeatedly sliding on the same wall.
    if (side !== this.wallContactSide) {
      if (pressingIn) {
        this.resetJumpState();
        this.events.wallSlideStarted = true;
      }
      this.wallContactSide = side;
    }
  }

  applyCarry(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }
}
