import { CANVAS_H, CANVAS_W } from "./constants";
import { clamp, lerp } from "./utils";

interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixColor(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(lerp(ca.r, cb.r, t));
  const g = Math.round(lerp(ca.g, cb.g, t));
  const bl = Math.round(lerp(ca.b, cb.b, t));
  return `rgb(${r}, ${g}, ${bl})`;
}

function ridgeHeight(x: number, baseline: number, amp1: number, amp2: number, f1: number, f2: number): number {
  return baseline + Math.sin(x * f1) * amp1 + Math.sin(x * f2 + 1.7) * amp2;
}

const STAR_COUNT = 90;
const stars: { x: number; y: number; r: number; twinkle: number }[] = [];
{
  let s = 1337;
  const rnd = () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({ x: rnd() * 4000, y: rnd() * 300, r: rnd() * 1.4 + 0.3, twinkle: rnd() * Math.PI * 2 });
  }
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  camX: number,
  progress: number,
  time: number
): void {
  const skyTop = mixColor("#ff9a62", "#0a1128", progress);
  const skyBottom = mixColor("#ffd27a", "#1b2650", progress);
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0, skyTop);
  grad.addColorStop(1, skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Sun/moon that sinks as you travel right.
  const sunX = CANVAS_W * 0.8 - camX * 0.05;
  const sunY = 90 + progress * 260;
  const sunColor = mixColor("#ffe1a8", "#dfe8ff", progress);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = sunColor;
  ctx.shadowColor = sunColor;
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.arc(((sunX % (CANVAS_W + 200)) + CANVAS_W + 200) % (CANVAS_W + 200) - 100, sunY, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Stars fade in with night progress.
  const starAlpha = clamp((progress - 0.35) / 0.4, 0, 1);
  if (starAlpha > 0) {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    const parX = camX * 0.05;
    for (const star of stars) {
      const sx = ((star.x - parX) % 4000 + 4000) % 4000;
      if (sx > CANVAS_W + 10) continue;
      const tw = 0.6 + 0.4 * Math.sin(time * 2 + star.twinkle);
      ctx.globalAlpha = starAlpha * tw;
      ctx.beginPath();
      ctx.arc(sx, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Far mountain ridge.
  drawRidge(ctx, camX, 0.18, 210, 46, 22, 0.004, 0.011, mixColor("#5a4a7a", "#141a33", progress));
  // Mid hills.
  drawRidge(ctx, camX, 0.32, 260, 34, 16, 0.006, 0.017, mixColor("#3d3560", "#0e1226", progress));
  // Near silhouette hills.
  drawRidge(ctx, camX, 0.55, 320, 40, 10, 0.01, 0.023, mixColor("#231c3d", "#080a16", progress));
}

function drawRidge(
  ctx: CanvasRenderingContext2D,
  camX: number,
  parallax: number,
  baseline: number,
  amp1: number,
  amp2: number,
  f1: number,
  f2: number,
  color: string
): void {
  const offset = camX * parallax;
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_H);
  const step = 24;
  for (let sx = -step; sx <= CANVAS_W + step; sx += step) {
    const worldX = sx + offset;
    const h = ridgeHeight(worldX, baseline, amp1, amp2, f1, f2);
    ctx.lineTo(sx, CANVAS_H - h);
  }
  ctx.lineTo(CANVAS_W, CANVAS_H);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
