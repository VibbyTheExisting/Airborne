import { drawBackground } from "./Background";
import { Camera } from "./Camera";
import { CANVAS_H, CANVAS_W, JUMP_VELOCITY, TILE, WHIP_RANGE } from "./constants";
import { Ember, Enemy, MovingPlatform, Spring, overlaps } from "./Entities";
import { Input } from "./Input";
import { Level, type CheckpointDef, type LevelData } from "./Level";
import { getLevelForNumber } from "./LevelGenerator";
import { ParticleSystem } from "./Particles";
import { Player } from "./Player";
import { aabbIntersection, aabbOverlap, clamp, type Rect } from "./utils";

type GameState = "intro" | "playing" | "dead" | "won";

export class Game {
  private ctx: CanvasRenderingContext2D;
  private input = new Input();
  private level!: Level;
  private data!: LevelData;
  private player!: Player;
  private camera!: Camera;
  private particles = new ParticleSystem();

  private embers!: Ember[];
  private enemies!: Enemy[];
  private springs!: Spring[];
  private platforms!: MovingPlatform[];
  private activeCheckpoint!: CheckpointDef;
  private goalRect!: Rect;

  private readonly runSeed = 20260724;
  private levelNumber = 1;
  private started = false;
  private highestLevelReached = 1;
  private paused = false;

  private state: GameState = "intro";
  private elapsed = 0;
  private runTime = 0;
  private deaths = 0;
  private collectedEmbers = new Set<Ember>();
  private respawnTimer = 0;
  private winTimer = 0;

  private lastTime = 0;
  private accumulator = 0;
  private readonly fixedDt = 1 / 60;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
    this.loadLevel(1);
  }

  private loadLevel(levelNumber: number): void {
    this.levelNumber = levelNumber;
    this.highestLevelReached = Math.max(this.highestLevelReached, levelNumber);
    const built = getLevelForNumber(levelNumber, this.runSeed);
    this.level = built.level;
    this.data = built.data;

    this.player = new Player(this.data.playerStart.x, this.data.playerStart.y);
    this.camera = new Camera(this.level.pixelWidth, this.level.pixelHeight);

    this.embers = this.data.embers.map((e) => new Ember(e.x, e.y));
    this.enemies = this.data.enemies.map((e) => new Enemy(e));
    this.springs = this.data.springs.map((s) => new Spring(s));
    this.platforms = this.data.movingPlatforms.map((p) => new MovingPlatform(p));

    this.activeCheckpoint = this.data.checkpoints[0];
    this.goalRect = { x: this.data.goal.x - 4, y: this.data.goal.y - TILE, w: TILE + 8, h: TILE * 2 };

    this.collectedEmbers = new Set();
    this.respawnTimer = 0;
    this.runTime = 0;

    document.getElementById("ember-total")!.textContent = String(this.embers.length);
    document.getElementById("level-num")!.textContent = String(this.levelNumber);
    document.getElementById("timer")!.textContent = "0.0";
  }

  handleOverlayContinue(): void {
    if (!this.started) {
      this.started = true;
      this.start();
    } else if (this.state === "won") {
      this.advanceLevel();
    }
  }

  private advanceLevel(): void {
    this.loadLevel(this.levelNumber + 1);
    this.state = "playing";
  }

  openLevelSelect(): void {
    this.paused = true;
    this.populateLevelGrid();
    document.getElementById("overlay")!.classList.add("hidden");
    document.getElementById("level-select")!.classList.remove("hidden");
  }

  closeLevelSelect(): void {
    this.paused = false;
    document.getElementById("level-select")!.classList.add("hidden");
    if (!this.started || this.state === "won") {
      document.getElementById("overlay")!.classList.remove("hidden");
    }
  }

  selectLevel(levelNumber: number): void {
    document.getElementById("level-select")!.classList.add("hidden");
    document.getElementById("overlay")!.classList.add("hidden");
    this.loadLevel(levelNumber);
    this.paused = false;
    if (!this.started) {
      // The render loop only ever starts inside start() => if the level select was
      // opened before ever clicking Begin, nothing has been driving frames yet
      this.started = true;
      this.start();
    } else {
      this.state = "playing";
    }
  }

  private populateLevelGrid(): void {
    const grid = document.getElementById("level-grid")!;
    grid.innerHTML = "";
    const maxShown = Math.max(20, this.highestLevelReached + 5);
    for (let n = 1; n <= maxShown; n++) {
      const btn = document.createElement("button");
      btn.textContent = String(n);
      btn.className = "level-btn";
      if (n === this.levelNumber) btn.classList.add("current");
      else if (n <= this.highestLevelReached) btn.classList.add("visited");
      btn.addEventListener("click", () => {
        this.selectLevel(n);
        btn.blur(); // a focused-but-hidden button would re-fire on Space
      });
      grid.appendChild(btn);
    }
  }

  start(): void {
    this.state = "playing";
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    let delta = (now - this.lastTime) / 1000;
    this.lastTime = now;
    delta = Math.min(delta, 0.25);
    this.accumulator += delta;

    while (this.accumulator >= this.fixedDt) {
      this.update(this.fixedDt);
      this.accumulator -= this.fixedDt;
      this.input.endFrame();
    }

    this.render();
    requestAnimationFrame(this.frame);
  };

  private collidesAt = (r: Rect): boolean => {
    if (this.level.rectCollides(r)) return true;
    for (const p of this.platforms) {
      if (aabbOverlap(r, p.rect)) return true;
    }
    return false;
  };

  private update(dt: number): void {
    if (this.paused) return;
    this.elapsed += dt;
    for (const p of this.platforms) p.update(this.elapsed);

    if (this.state === "playing") {
      this.runTime += dt;

      if (this.input.restartPressed) {
        this.respawn();
        return;
      }

      this.resolvePlatformInteractions();

      this.player.update(dt, this.input, this.collidesAt, this.data.swingAnchors);
      this.handlePlayerEvents();
      this.updateEntities(dt);
      this.checkHazards();
      this.checkCollectibles();
      this.checkGoal();
      this.updateCheckpoint();

      if (this.player.y > this.level.pixelHeight + 200) {
        this.killPlayer();
      }
    } else if (this.state === "dead") {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
    } else if (this.state === "won") {
      this.winTimer += dt;
    }

    this.particles.update(dt);
    const vxForCamera = this.state === "playing" ? this.player.vx : 0;
    this.camera.follow(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, vxForCamera, dt);

    document.getElementById("ember-count")!.textContent = String(this.collectedEmbers.size);
    document.getElementById("death-count")!.textContent = String(this.deaths);
    document.getElementById("timer")!.textContent = this.runTime.toFixed(1);
  }

  private findRiddenPlatform(): MovingPlatform | null {
    if (!this.player.onGround) return null;
    const feet: Rect = { x: this.player.x, y: this.player.y + this.player.h, w: this.player.w, h: 3 };
    for (const p of this.platforms) {
      if (aabbOverlap(feet, { x: p.x, y: p.y - 1, w: p.w, h: 2 })) return p;
    }
    return null;
  }

  /**
   * Moving platforms are the thing that moves *into* the player, not the other way
   * around, so the player's own velocity-direction collision resolver (built for
   * static tiles) can't detect or fix that overlap -- it only ever looks for a safe
   * spot in the direction the player is already heading. This runs before the
   * player's own physics step to carry riders smoothly and push everyone else out
   * of any platform that just swept into them (side, underneath, or top).
   */
  private resolvePlatformInteractions(): void {
    const ridden = this.findRiddenPlatform();
    if (ridden) this.movePlayerSafely(ridden.deltaX, ridden.deltaY);

    for (const p of this.platforms) {
      if (p === ridden) continue;
      const overlap = aabbIntersection(this.player.rect, p.rect);
      if (!overlap) continue;

      const playerCenterX = this.player.x + this.player.w / 2;
      const playerCenterY = this.player.y + this.player.h / 2;
      const platCenterX = p.x + p.w / 2;
      const platCenterY = p.y + p.h / 2;

      if (overlap.x < overlap.y) {
        this.movePlayerSafely(playerCenterX >= platCenterX ? overlap.x : -overlap.x, 0);
        this.player.vx = 0;
      } else {
        const pushDown = playerCenterY >= platCenterY;
        this.movePlayerSafely(0, pushDown ? overlap.y : -overlap.y);
        if (pushDown) {
          if (this.player.vy < 0) this.player.vy = 0; // bonked head on a platform from below
        } else {
          this.player.vy = 0;
          this.player.onGround = true; // platform rose up to meet the player's feet
        }
      }
    }
  }

  /**
   * Moves the player by (dx, dy) but never into static solid ground. Used both to
   * carry a rider along with their platform and to push the player out of a platform
   * overlap -- either of which can otherwise shove the player straight through a wall
   * or floor if the platform's own position (or, with two overlapping platforms, a
   * second push in the same frame) happens to land it right next to one.
   */
  private movePlayerSafely(dx: number, dy: number): void {
    const w = this.player.w;
    const h = this.player.h;
    let safeDx = dx;
    if (dx !== 0 && this.level.rectCollides({ x: this.player.x + dx, y: this.player.y, w, h })) {
      safeDx = 0;
    }
    let safeDy = dy;
    if (dy !== 0 && this.level.rectCollides({ x: this.player.x + safeDx, y: this.player.y + dy, w, h })) {
      safeDy = 0;
    }
    this.player.applyCarry(safeDx, safeDy);
  }

  private handlePlayerEvents(): void {
    const e = this.player.events;
    const cx = this.player.x + this.player.w / 2;
    const cy = this.player.y + this.player.h;
    if (e.jumped) {
      this.particles.burst(cx, cy, 6, { color: "#f2e9dc", speed: 90, spread: Math.PI * 0.6, gravity: 400 });
    }
    if (e.doubleJumped) {
      this.particles.burst(cx, this.player.y + this.player.h / 2, 12, {
        color: "#7ad0ff",
        speed: 130,
        spread: Math.PI * 2,
        gravity: 200,
      });
    }
    if (e.swingAttached) {
      this.particles.burst(cx, this.player.y + this.player.h / 2, 8, {
        color: "#ffe27a",
        speed: 100,
        spread: Math.PI * 2,
        gravity: 0,
        size: 2,
      });
    }
    if (e.swingReleased) {
      this.particles.burst(cx, this.player.y + this.player.h / 2, 10, {
        color: "#ffd27a",
        speed: 150,
        spread: Math.PI * 0.8,
        gravity: 300,
      });
    }
    if (e.slingshot) {
      this.particles.burst(cx, this.player.y + this.player.h / 2, 22, {
        color: "#ffffff",
        speed: 260,
        spread: Math.PI * 0.5,
        gravity: 100,
        size: 3,
      });
      this.camera.shake(4, 0.15);
    }
    if (e.landed) {
      this.particles.burst(cx, cy, 8, { color: "#c9bfae", speed: 80, spread: Math.PI * 0.9, gravity: 500, size: 2.5 });
    }
    if (e.dashed) {
      this.camera.shake(2, 0.08);
    }
    if (this.player.isDashing) {
      this.particles.spawn({
        x: cx,
        y: this.player.y + this.player.h / 2,
        vx: -this.player.facing * 40,
        vy: 0,
        life: 0.2,
        maxLife: 0.2,
        size: 6,
        color: "#bfe9ff",
        gravity: 0,
      });
    }
    if (this.player.isCharging) {
      const c = this.player.center;
      this.particles.spawn({
        x: c.x + (Math.random() * 2 - 1) * 4,
        y: c.y + (Math.random() * 2 - 1) * 4,
        vx: 0,
        vy: -20,
        life: 0.25,
        maxLife: 0.25,
        size: 2.5,
        color: "#ff9ac2",
        gravity: 0,
      });
    }
  }

  private updateEntities(dt: number): void {
    for (const e of this.embers) e.update(dt);
    for (const en of this.enemies) en.update(dt);
    for (const s of this.springs) s.update(dt);
  }

  private checkHazards(): void {
    const pr = this.player.rect;

    for (const spike of this.data.spikes) {
      if (overlaps(pr, spike)) {
        this.killPlayer();
        return;
      }
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      if (this.player.vy > 40 && overlaps(pr, enemy.stompRect)) {
        enemy.kill();
        enemy.squash = 1;
        this.player.applyStompBounce(JUMP_VELOCITY * 0.62);
        this.particles.burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, 10, {
          color: "#8dffb0",
          speed: 120,
          gravity: 400,
        });
        this.camera.shake(2, 0.1);
        return;
      }
      if (overlaps(pr, enemy.rect)) {
        this.killPlayer();
        return;
      }
    }

    for (const spring of this.springs) {
      if (spring.triggerTimer <= 0 && this.player.vy >= 0 && overlaps(pr, spring.rect)) {
        spring.trigger();
        this.player.applySpring(760);
        this.particles.burst(spring.x, spring.y - spring.h, 14, {
          color: "#ffb0d0",
          speed: 180,
          spread: Math.PI * 0.5,
          gravity: 250,
        });
        this.camera.shake(3, 0.12);
      }
    }
  }

  private checkCollectibles(): void {
    const pr = this.player.rect;
    for (const ember of this.embers) {
      if (ember.collected) continue;
      if (overlaps(pr, ember.rect)) {
        ember.collected = true;
        this.collectedEmbers.add(ember);
        this.particles.burst(ember.x, ember.drawY, 10, { color: "#ffd27a", speed: 100, gravity: -20, size: 2.5 });
      }
    }
  }

  private checkGoal(): void {
    if (overlaps(this.player.rect, this.goalRect)) {
      this.state = "won";
      this.winTimer = 0;
      this.particles.burst(this.data.goal.x, this.data.goal.y, 40, {
        color: "#ffd27a",
        speed: 220,
        gravity: 250,
        size: 3.5,
      });
      this.showOverlay(
        `Level ${this.levelNumber} Complete!`,
        `Embers: ${this.collectedEmbers.size} / ${this.embers.length} · Time: ${this.runTime.toFixed(1)}s`,
        `Next Level (${this.levelNumber + 1}) →`
      );
    }
  }

  private updateCheckpoint(): void {
    if (!this.player.onGround) return;
    const vertical = this.data.orientation === "vertical";
    for (const cp of this.data.checkpoints) {
      const isFurther = vertical ? cp.y < this.activeCheckpoint.y : cp.x > this.activeCheckpoint.x;
      const isReached = vertical ? this.player.y <= cp.y : this.player.x >= cp.x;
      if (isFurther && isReached) this.activeCheckpoint = cp;
    }
  }

  private killPlayer(): void {
    if (this.state !== "playing") return;
    this.deaths++;
    this.state = "dead";
    this.respawnTimer = 0.6;
    this.camera.shake(6, 0.25);
    this.particles.burst(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, 24, {
      color: "#ff7a7a",
      speed: 200,
      gravity: 300,
      size: 3,
    });
  }

  private respawn(): void {
    this.player.teleport(this.activeCheckpoint.x, this.activeCheckpoint.y);
    this.state = "playing";
  }

  private showOverlay(title: string, sub: string, buttonLabel: string): void {
    const overlay = document.getElementById("overlay")!;
    document.getElementById("overlay-title")!.textContent = title;
    document.getElementById("overlay-sub")!.textContent = sub;
    document.getElementById("start-btn")!.textContent = buttonLabel;
    overlay.classList.remove("hidden");
  }

  // ---------- rendering ----------

  private render(): void {
    const ctx = this.ctx;
    const cam = this.camera.offset;
    const progress =
      this.data.orientation === "vertical"
        ? clamp(1 - this.camera.y / Math.max(1, this.level.pixelHeight - CANVAS_H), 0, 1)
        : clamp(this.camera.x / Math.max(1, this.level.pixelWidth - CANVAS_W), 0, 1);

    drawBackground(ctx, cam.x, progress, this.elapsed);

    this.drawTiles(cam);
    this.drawSpikes(cam);
    this.drawSprings(cam);
    this.drawPlatforms(cam);
    this.drawSwingAnchors(cam);
    this.drawEmbers(cam);
    this.drawEnemies(cam);
    this.drawGoal(cam);
    if (this.state !== "dead") this.drawPlayer(cam);
    this.particles.draw(ctx, cam.x, cam.y);

    if (this.state === "dead") {
      ctx.save();
      ctx.globalAlpha = clamp(1 - this.respawnTimer / 0.6, 0, 1) * 0.5;
      ctx.fillStyle = "#ff2e2e";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
    }
  }

  private drawTiles(cam: { x: number; y: number }): void {
    const ctx = this.ctx;
    this.level.forEachSolidTileInView(cam.x, cam.y, cam.x + CANVAS_W, cam.y + CANVAS_H, (tx, ty) => {
      const x = tx * TILE - cam.x;
      const y = ty * TILE - cam.y;
      const hasTopNeighbor = this.level.isSolidTile(tx, ty - 1);
      ctx.fillStyle = hasTopNeighbor ? "#4a3d55" : "#5c4a68";
      ctx.fillRect(x, y, TILE, TILE);
      if (!hasTopNeighbor) {
        ctx.fillStyle = "#8dd67a";
        ctx.fillRect(x, y, TILE, 5);
      }
    });
  }

  private drawSpikes(cam: { x: number; y: number }): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#d8455a";
    for (const s of this.data.spikes) {
      const x = s.x - cam.x;
      const y = s.y - cam.y;
      const teeth = Math.max(1, Math.round(s.w / 8));
      const tw = s.w / teeth;
      for (let i = 0; i < teeth; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * tw, y + s.h);
        ctx.lineTo(x + i * tw + tw / 2, y + s.h - 10);
        ctx.lineTo(x + i * tw + tw, y + s.h);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  private drawSprings(cam: { x: number; y: number }): void {
    const ctx = this.ctx;
    for (const s of this.springs) {
      const compressed = s.triggerTimer > 0;
      const h = compressed ? s.h * 0.5 : s.h;
      const x = s.x - s.w / 2 - cam.x;
      const y = s.y - h - cam.y;
      ctx.fillStyle = "#ff9ac2";
      ctx.fillRect(x, y, s.w, h);
      ctx.fillStyle = "#ffe0ee";
      ctx.fillRect(x, y, s.w, 3);
    }
  }

  private drawPlatforms(cam: { x: number; y: number }): void {
    const ctx = this.ctx;
    for (const p of this.platforms) {
      const x = p.x - cam.x;
      const y = p.y - cam.y;
      ctx.fillStyle = "#4a90d9";
      ctx.fillRect(x, y, p.w, p.h);
      ctx.fillStyle = "#a8d4f5";
      ctx.fillRect(x, y, p.w, 3);
    }
  }

  private drawSwingAnchors(cam: { x: number; y: number }): void {
    const ctx = this.ctx;
    const c = this.player.center;
    for (const a of this.data.swingAnchors) {
      const inRange = !this.player.isSwinging && Math.hypot(a.x - c.x, a.y - c.y) <= WHIP_RANGE;
      const x = a.x - cam.x;
      const y = a.y - cam.y;
      const pulse = 1 + Math.sin(this.elapsed * 4) * 0.08;
      const r = (inRange ? 9 : 7) * pulse;

      ctx.save();
      ctx.translate(x, y);
      if (inRange) {
        ctx.shadowColor = "#ffe27a";
        ctx.shadowBlur = 14;
      }
      ctx.fillStyle = inRange ? "#ffe27a" : "#8a7a9a";
      ctx.strokeStyle = "#2a2038";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI / 4) * i - Math.PI / 8;
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawEmbers(cam: { x: number; y: number }): void {
    const ctx = this.ctx;
    for (const e of this.embers) {
      if (e.collected) continue;
      const x = e.x - cam.x;
      const y = e.drawY - cam.y;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#ffd27a";
      ctx.shadowColor = "#ffb347";
      ctx.shadowBlur = 8;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    }
  }

  private drawEnemies(cam: { x: number; y: number }): void {
    const ctx = this.ctx;
    for (const en of this.enemies) {
      if (!en.alive) continue;
      const x = en.x - cam.x;
      const y = en.y - cam.y + en.bobOffset;
      const squashY = 1 - Math.max(0, en.squash) * 0.5;
      ctx.save();
      ctx.translate(x + en.w / 2, y + en.h);
      ctx.scale(1 + Math.max(0, en.squash) * 0.3, squashY);
      ctx.fillStyle = "#8a5cff";
      ctx.beginPath();
      ctx.ellipse(0, -en.h / 2, en.w / 2, en.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1c1030";
      const dir = en.vx >= 0 ? 1 : -1;
      ctx.beginPath();
      ctx.arc(dir * 3, -en.h / 2 - 2, 1.6, 0, Math.PI * 2);
      ctx.arc(dir * 3 + dir * 5, -en.h / 2 - 2, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawGoal(cam: { x: number; y: number }): void {
    const ctx = this.ctx;
    const gx = this.data.goal.x - cam.x;
    const gy = this.data.goal.y - cam.y;
    const wave = Math.sin(this.elapsed * 3) * 4;

    ctx.fillStyle = "#7c6a52";
    ctx.fillRect(gx - 2, gy, 4, TILE * 2);

    ctx.save();
    ctx.globalAlpha = 0.5 + Math.sin(this.elapsed * 4) * 0.15;
    ctx.fillStyle = "#ffd27a";
    ctx.shadowColor = "#ffd27a";
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(gx, gy - 6, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = this.state === "won" ? "#8dffb0" : "#ff9a62";
    ctx.beginPath();
    ctx.moveTo(gx + 2, gy);
    ctx.lineTo(gx + 26 + wave, gy + 8);
    ctx.lineTo(gx + 2, gy + 16);
    ctx.closePath();
    ctx.fill();
  }

  private drawSwingRope(cam: { x: number; y: number }): void {
    if (!this.player.swingAnchor) return;
    const ctx = this.ctx;
    const c = this.player.center;
    const a = this.player.swingAnchor;
    const charging = this.player.isCharging;
    ctx.save();
    ctx.strokeStyle = charging ? "#ff6a9a" : "#e8d9b0";
    ctx.lineWidth = charging ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(a.x - cam.x, a.y - cam.y);
    ctx.lineTo(c.x - cam.x, c.y - cam.y);
    ctx.stroke();
    ctx.restore();
  }

  private drawPlayer(cam: { x: number; y: number }): void {
    const ctx = this.ctx;
    const p = this.player;
    this.drawSwingRope(cam);
    const cx = p.x + p.w / 2 - cam.x;
    const cy = p.y + p.h - cam.y;
    const stretch = clamp(p.squash, 0.6, 1.6);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1 / Math.sqrt(stretch), stretch);

    ctx.fillStyle = p.isDashing ? "#bfe9ff" : "#ffce6b";
    ctx.beginPath();
    ctx.roundRect(-p.w / 2, -p.h, p.w, p.h, 5);
    ctx.fill();

    ctx.fillStyle = "#22160a";
    const eyeOffset = p.facing >= 0 ? 3 : -3;
    ctx.beginPath();
    ctx.arc(eyeOffset, -p.h * 0.65, 2, 0, Math.PI * 2);
    ctx.fill();

    if (p.wallSliding) {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillRect(p.wallDir > 0 ? p.w / 2 - 2 : -p.w / 2, -p.h, 2, p.h);
    }
    ctx.restore();
  }
}
