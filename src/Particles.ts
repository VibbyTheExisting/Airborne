interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];

  spawn(p: Partial<Particle> & { x: number; y: number }): void {
    this.particles.push({
      vx: 0,
      vy: 0,
      life: 0.5,
      maxLife: 0.5,
      size: 3,
      color: "#ffffff",
      gravity: 0,
      ...p,
    });
  }

  burst(x: number, y: number, count: number, opts: { speed?: number; color?: string; spread?: number; gravity?: number; size?: number } = {}): void {
    const speed = opts.speed ?? 140;
    const spread = opts.spread ?? Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const angle = -spread / 2 + Math.random() * spread - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.spawn({
        x,
        y,
        vx: Math.cos(angle) * s,
        vy: Math.sin(angle) * s,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
        size: (opts.size ?? 3) * (0.7 + Math.random() * 0.6),
        color: opts.color ?? "#ffd27a",
        gravity: opts.gravity ?? 500,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillStyle = p.color;
      const s = p.size * (0.5 + t * 0.5);
      ctx.fillRect(p.x - camX - s / 2, p.y - camY - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
}
