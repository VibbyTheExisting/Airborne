import { PLAYER_H, TILE } from "./constants";
import { buildLevel1, buildLevel2, buildLevel3, buildLevel4, buildLevel5 } from "./HandLevels";
import {
  Level,
  Tile,
  type CheckpointDef,
  type EmberDef,
  type EnemyDef,
  type LevelData,
  type MovingPlatformDef,
  type Orientation,
  type SpikeRect,
  type SpringDef,
  type SwingAnchorDef,
} from "./Level";
import { aabbOverlap, chance, clamp, createRng, hashSeed, pick, randInt, randRange, type Rng } from "./utils";

function t(n: number): number {
  return n * TILE;
}

/** Scales a base value by difficulty, clamped toward (but never past) the cap. */
function scaled(base: number, perLevel: number, cap: number, difficulty: number): number {
  const v = base + perLevel * difficulty;
  return perLevel >= 0 ? Math.min(v, cap) : Math.max(v, cap);
}

/**
 * Drops any checkpoint that would respawn the player on or right next to a spike --
 * a respawn should always feel safe. The very first checkpoint (the level's actual
 * start) is never near a hazard, so this never empties the list entirely.
 */
function pruneUnsafeCheckpoints(checkpoints: CheckpointDef[], spikes: SpikeRect[]): CheckpointDef[] {
  return checkpoints.filter((cp) => {
    const safeZone = { x: cp.x - 24, y: cp.y - 24, w: 48, h: 48 };
    return !spikes.some((s) => aabbOverlap(safeZone, s));
  });
}

// ---------------------------------------------------------------------------
// Horizontal generator: a chain of chunks, each assuming solid ground ends
// right before its start and guaranteeing solid ground right after its end,
// so any chunk can follow any other.
// ---------------------------------------------------------------------------

const H_FLOOR_ROW = 19;
const H_HEIGHT_TILES = 26;

interface HGenState {
  tiles: Tile[][];
  cursor: number;
  rng: Rng;
  difficulty: number;
  spikes: SpikeRect[];
  springs: SpringDef[];
  embers: EmberDef[];
  enemies: EnemyDef[];
  movingPlatforms: MovingPlatformDef[];
  swingAnchors: SwingAnchorDef[];
  checkpoints: CheckpointDef[];
}

function ensureWidth(tiles: Tile[][], width: number): void {
  for (const row of tiles) {
    while (row.length < width) row.push(Tile.Empty);
  }
}

function fillGround(state: HGenState, x0: number, x1: number): void {
  ensureWidth(state.tiles, x1 + 1);
  for (let y = H_FLOOR_ROW; y < H_HEIGHT_TILES; y++) {
    for (let x = x0; x <= x1; x++) state.tiles[y][x] = Tile.Solid;
  }
}

function fillPlatform(state: HGenState, x0: number, x1: number, y: number): void {
  ensureWidth(state.tiles, x1 + 1);
  for (let x = x0; x <= x1; x++) state.tiles[y][x] = Tile.Solid;
}

function fillWallColumn(state: HGenState, x: number, y0: number, y1: number): void {
  ensureWidth(state.tiles, x + 1);
  for (let y = y0; y <= y1; y++) state.tiles[y][x] = Tile.Solid;
}

function buildFlatGround(state: HGenState): void {
  const width = randInt(state.rng, 5, 9);
  const x0 = state.cursor;
  fillGround(state, x0, x0 + width - 1);
  if (chance(state.rng, 0.6)) {
    state.embers.push({ x: t(x0 + Math.floor(width / 2)), y: t(H_FLOOR_ROW - 3) });
  }
  state.cursor = x0 + width;
}

function buildGapJump(state: HGenState): void {
  const gap = Math.round(scaled(3, 0.35, 7, state.difficulty)) + randInt(state.rng, 0, 1);
  state.cursor += gap;
  const landWidth = randInt(state.rng, 4, 7);
  fillGround(state, state.cursor, state.cursor + landWidth - 1);
  state.cursor += landWidth;
}

function buildSpikeStrip(state: HGenState): void {
  const before = randInt(state.rng, 3, 5);
  const spikeLen = Math.min(1 + Math.floor(state.difficulty / 2.5), 4);
  const after = randInt(state.rng, 4, 6);
  const x0 = state.cursor;
  fillGround(state, x0, x0 + before + spikeLen + after - 1);
  state.spikes.push({ x: t(x0 + before), y: t(H_FLOOR_ROW) - 6, w: t(spikeLen), h: 6 });
  state.cursor = x0 + before + spikeLen + after;
}

function buildEnemyGauntlet(state: HGenState): void {
  const count = Math.min(1 + Math.floor(state.difficulty / 2.5), 5);
  const speed = Math.round(scaled(40, 8, 120, state.difficulty));
  const segWidth = 8;
  const width = segWidth * count + 4;
  const x0 = state.cursor;
  fillGround(state, x0, x0 + width - 1);
  for (let i = 0; i < count; i++) {
    const left = x0 + 2 + i * segWidth;
    const right = left + segWidth - 2;
    state.enemies.push({
      x: t(left + Math.floor((right - left) / 2)),
      y: t(H_FLOOR_ROW),
      rangeLeft: t(left),
      rangeRight: t(right),
      speed,
    });
  }
  state.cursor = x0 + width;
}

function buildMovingPlatformCrossing(state: HGenState): void {
  const gapWidth = Math.round(scaled(8, 1.5, 26, state.difficulty));
  const speed = Math.round(scaled(45, 6, 135, state.difficulty));
  const x0 = state.cursor;
  state.cursor += gapWidth;
  const count = Math.max(1, Math.round(gapWidth / 8));
  const step = gapWidth / (count + 1);
  for (let i = 0; i < count; i++) {
    const cx = x0 + step * (i + 1);
    const axis: "x" | "y" = chance(state.rng, 0.4) ? "y" : "x";
    const baseX = t(cx) - TILE;
    let range: number;
    if (axis === "x") {
      // The platform only ever travels rightward from its base -- keep it clear of
      // both the solid ground the chasm resumes into AND the next platform's own
      // base position, so it can never clip into the wall or sweep into a neighbor
      // (which neither one would notice, since platforms don't collide with each
      // other -- only the runtime player-push logic would, awkwardly). Never force
      // a minimum: if the safe room is small, the range should be small too.
      const chasmEndPx = t(x0 + gapWidth);
      let maxRangePx = Math.max(0, chasmEndPx - (baseX + t(2)) - TILE);
      if (i + 1 < count) {
        const nextBaseX = t(x0 + step * (i + 2)) - TILE;
        maxRangePx = Math.min(maxRangePx, Math.max(0, nextBaseX - (baseX + t(2)) - TILE));
      }
      range = Math.min(t(randRange(state.rng, 2, 3.5)), maxRangePx);
    } else {
      range = t(randRange(state.rng, 3, 6));
    }
    state.movingPlatforms.push({
      x: baseX,
      y: t(H_FLOOR_ROW - 2),
      w: t(2),
      h: TILE,
      axis,
      range,
      speed,
      phase: state.rng(),
    });
  }
  const landWidth = randInt(state.rng, 4, 7);
  fillGround(state, state.cursor, state.cursor + landWidth - 1);
  state.cursor += landWidth;
}

function buildSpringLaunch(state: HGenState): void {
  const x0 = state.cursor;
  fillGround(state, x0, x0 + 3);
  state.springs.push({ x: t(x0 + 2) + TILE / 2, y: t(H_FLOOR_ROW) });
  state.cursor = x0 + 4;

  const gap = Math.round(scaled(6, 0.6, 10, state.difficulty));
  state.cursor += gap;

  const landWidth = randInt(state.rng, 4, 7);
  fillGround(state, state.cursor, state.cursor + landWidth - 1);
  state.cursor += landWidth;

  if (chance(state.rng, 0.7)) {
    const platX0 = x0 + 6;
    const platY = H_FLOOR_ROW - randInt(state.rng, 10, 14);
    fillPlatform(state, platX0, platX0 + 4, platY);
    for (let i = 0; i < 3; i++) {
      state.embers.push({ x: t(platX0 + 1 + i), y: t(platY - 1) });
    }
  }
}

function buildWhipCrossing(state: HGenState): void {
  const gapWidth = Math.round(scaled(9, 1.8, 26, state.difficulty));
  const x0 = state.cursor;
  const includeAltPlatform = state.difficulty < 3;
  state.cursor += gapWidth;

  const anchorX = x0 + Math.floor(gapWidth / 2);
  const anchorY = H_FLOOR_ROW - randInt(state.rng, 6, 9);
  state.swingAnchors.push({ x: t(anchorX) + TILE / 2, y: t(anchorY) + TILE / 2 });

  if (includeAltPlatform) {
    const midX = anchorX - 1;
    fillPlatform(state, midX, midX + 1, H_FLOOR_ROW - 2);
  }

  const landWidth = randInt(state.rng, 4, 7);
  fillGround(state, state.cursor, state.cursor + landWidth - 1);
  state.cursor += landWidth;
}

function buildPillarShaft(state: HGenState): void {
  const x0 = state.cursor;
  const approach = 3;
  fillGround(state, x0, x0 + approach - 1);
  const corridorWidth = 3;
  const pillarX0 = x0 + approach;
  const pillarHeight = Math.min(8 + Math.floor(state.difficulty * 0.6), 16);
  fillWallColumn(state, pillarX0 - 1, H_FLOOR_ROW - pillarHeight, H_FLOOR_ROW - 1);
  fillWallColumn(state, pillarX0 + corridorWidth, H_FLOOR_ROW - pillarHeight, H_FLOOR_ROW - 1);
  fillGround(state, pillarX0, pillarX0 + corridorWidth - 1);

  const ledgeWidth = 4;
  fillPlatform(state, pillarX0 + corridorWidth + 1, pillarX0 + corridorWidth + ledgeWidth, H_FLOOR_ROW - pillarHeight);
  state.swingAnchors.push({
    x: t(pillarX0 + corridorWidth / 2) + TILE / 2,
    y: t(H_FLOOR_ROW - Math.round(pillarHeight * 0.7)) + TILE / 2,
  });
  const emberCount = randInt(state.rng, 1, 3);
  for (let i = 0; i < emberCount; i++) {
    state.embers.push({ x: t(pillarX0 + corridorWidth + 1 + i), y: t(H_FLOOR_ROW - pillarHeight - 1) });
  }

  const after = randInt(state.rng, 4, 7);
  fillGround(state, pillarX0 + corridorWidth, pillarX0 + corridorWidth + Math.max(after, ledgeWidth + 2) - 1);
  state.cursor = pillarX0 + corridorWidth + Math.max(after, ledgeWidth + 2);
}

function buildStaircaseAscent(state: HGenState): void {
  const x0 = state.cursor;
  fillGround(state, x0, x0 + 2);
  let cx = x0 + 3;
  let cy = H_FLOOR_ROW;
  const steps = randInt(state.rng, 2, 4);
  for (let i = 0; i < steps; i++) {
    cy -= 3;
    fillPlatform(state, cx, cx + 1, cy);
    if (chance(state.rng, 0.6)) state.embers.push({ x: t(cx), y: t(cy - 1) });
    cx += 3;
  }
  const after = randInt(state.rng, 5, 8);
  fillGround(state, cx, cx + after - 1);
  state.cursor = cx + after;
}

function buildGoalApproach(state: HGenState): { x: number; y: number } {
  const x0 = state.cursor;
  fillGround(state, x0, x0 + 3);
  let cx = x0 + 4;
  let cy = H_FLOOR_ROW;
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    cy -= 3;
    fillPlatform(state, cx, cx + 1, cy);
    state.embers.push({ x: t(cx), y: t(cy - 1) });
    cx += 3;
  }
  const pedestalWidth = 6;
  fillPlatform(state, cx, cx + pedestalWidth - 1, cy);
  const goal = { x: t(cx + Math.floor(pedestalWidth / 2)), y: t(cy - 1) };
  state.cursor = cx + pedestalWidth;
  return goal;
}

const HORIZONTAL_CHUNKS: Array<(s: HGenState) => void> = [
  buildGapJump,
  buildSpikeStrip,
  buildEnemyGauntlet,
  buildMovingPlatformCrossing,
  buildSpringLaunch,
  buildWhipCrossing,
  buildPillarShaft,
  buildStaircaseAscent,
];

export function generateHorizontalLevel(rng: Rng, difficulty: number): { level: Level; data: LevelData } {
  const state: HGenState = {
    tiles: Array.from({ length: H_HEIGHT_TILES }, () => [] as Tile[]),
    cursor: 0,
    rng,
    difficulty,
    spikes: [],
    springs: [],
    embers: [],
    enemies: [],
    movingPlatforms: [],
    swingAnchors: [],
    checkpoints: [],
  };

  const introWidth = 8;
  fillGround(state, 0, introWidth - 1);
  state.embers.push({ x: t(3), y: t(H_FLOOR_ROW - 3) });
  state.embers.push({ x: t(4), y: t(H_FLOOR_ROW - 3) });
  const playerStart = { x: t(2), y: t(H_FLOOR_ROW - 3) };
  state.checkpoints.push({ x: t(0), y: t(H_FLOOR_ROW - 3) });
  state.cursor = introWidth;

  const chunkCount = Math.min(6 + Math.floor(difficulty * 1.6), 22);
  let lastType: ((s: HGenState) => void) | null = null;
  for (let i = 0; i < chunkCount; i++) {
    let type = pick(rng, HORIZONTAL_CHUNKS);
    let tries = 0;
    while (type === lastType && tries < 4) {
      type = pick(rng, HORIZONTAL_CHUNKS);
      tries++;
    }
    type(state);
    lastType = type;
    if (i % 3 === 2) buildFlatGround(state);
    state.checkpoints.push({ x: t(state.cursor - 1), y: t(H_FLOOR_ROW - 3) });
  }

  const goal = buildGoalApproach(state);

  ensureWidth(state.tiles, state.cursor);
  const widthTiles = state.cursor;

  const data: LevelData = {
    widthTiles,
    heightTiles: H_HEIGHT_TILES,
    orientation: "horizontal",
    playerStart,
    goal,
    checkpoints: pruneUnsafeCheckpoints(state.checkpoints, state.spikes),
    spikes: state.spikes,
    springs: state.springs,
    embers: state.embers,
    enemies: state.enemies,
    movingPlatforms: state.movingPlatforms,
    swingAnchors: state.swingAnchors,
  };

  return { level: new Level(state.tiles, widthTiles, H_HEIGHT_TILES), data };
}

// ---------------------------------------------------------------------------
// Vertical generator: a walled shaft climbed floor by floor, each floor
// reached from the previous one by a jump, a moving platform, a spring
// boost, or a whip-swing across a wider gap.
// ---------------------------------------------------------------------------

const V_WIDTH_TILES = 15;
const V_INTERIOR_LO = 1;
const V_INTERIOR_HI = V_WIDTH_TILES - 2;

type FloorKind = "static" | "movingX" | "movingY" | "spring" | "swing";

interface FloorPlan {
  gapAbovePrev: number;
  platformX: number;
  platformWidth: number;
  kind: FloorKind;
  hasSpike: boolean;
  hasEnemy: boolean;
  emberCount: number;
}

/**
 * Total "reach" a jump (or jump + double-jump) can realistically spend on covering
 * vertical gap plus horizontal offset combined, in tiles. Climbing further eats into
 * how far sideways the next platform is allowed to be, since both draw from the same
 * limited air time. This is a fixed, physics-derived ceiling -- it must NOT scale with
 * difficulty, because the player's jump arc doesn't get longer just because the level
 * number went up.
 *
 * Crucially this is NOT the theoretical max-height double-jump (~9.7 tiles) -- that
 * number assumes holding jump all the way to its natural apex on both presses, which
 * variable jump height (the cut applied on early release) makes very punishing to
 * assume. A moderate, natural hold (~120-200ms, comfortably longer than an instinctive
 * tap but not an unnaturally long press) reliably reaches 5-6.5 tiles; this budget
 * stays under that with margin.
 */
const VERTICAL_REACH_BUDGET = 8;

/** Every floor-to-floor gap is capped well inside realistic double-jump range,
 * regardless of kind or difficulty -- springs/swings are a fun alternate route on an
 * otherwise ordinary gap, not a crutch for a gap that would be unreachable by jumping.
 * Kept above a floor to leave visible breathing room between platforms. */
const MIN_FLOOR_GAP = 4;
const MAX_FLOOR_GAP = 6;

function planVerticalFloors(rng: Rng, difficulty: number): FloorPlan[] {
  const numFloors = Math.min(6 + Math.floor(difficulty * 1.4), 26);
  const plans: FloorPlan[] = [];
  let prevCenter = (V_INTERIOR_LO + V_INTERIOR_HI + 1) / 2;

  for (let i = 0; i < numFloors; i++) {
    // Difficulty tightens precision (narrower platforms) rather than stretching
    // gaps past what's physically reachable.
    const minWidth = Math.max(2, 5 - Math.floor(difficulty / 4));
    const platformWidth = randInt(rng, minWidth, Math.max(minWidth + 1, 6));

    const movingChance = Math.min(0.12 + difficulty * 0.05, 0.55);
    const specialChance = Math.min(0.1 + difficulty * 0.035, 0.35);
    const r = rng();
    let kind: FloorKind = "static";
    if (r < specialChance * 0.5) kind = "swing";
    else if (r < specialChance) kind = "spring";
    else if (r < specialChance + movingChance) kind = chance(rng, 0.5) ? "movingX" : "movingY";

    const gap = randInt(rng, MIN_FLOOR_GAP, MAX_FLOOR_GAP);

    // Constrain how far sideways this floor can sit given how much of the reach
    // budget the vertical climb already used up.
    const maxOffset = Math.max(2, VERTICAL_REACH_BUDGET - gap);
    const lo = clamp(Math.round(prevCenter - maxOffset), V_INTERIOR_LO, V_INTERIOR_HI - platformWidth + 1);
    const hi = clamp(Math.round(prevCenter + maxOffset), V_INTERIOR_LO, V_INTERIOR_HI - platformWidth + 1);
    const platformX = lo <= hi ? randInt(rng, lo, hi) : randInt(rng, V_INTERIOR_LO, V_INTERIOR_HI - platformWidth + 1);

    const hasSpike = kind === "static" && chance(rng, Math.min(0.12 + difficulty * 0.035, 0.4));
    const hasEnemy = kind === "static" && !hasSpike && chance(rng, Math.min(0.1 + difficulty * 0.035, 0.35));
    const emberCount = chance(rng, 0.5) ? randInt(rng, 1, 2) : 0;

    plans.push({ gapAbovePrev: gap, platformX, platformWidth, kind, hasSpike, hasEnemy, emberCount });
    prevCenter = platformX + (platformWidth - 1) / 2;
  }
  return plans;
}

export function generateVerticalLevel(rng: Rng, difficulty: number): { level: Level; data: LevelData } {
  const widthTiles = V_WIDTH_TILES;
  const plans = planVerticalFloors(rng, difficulty);

  const startPad = 4;
  const topPad = randInt(rng, MIN_FLOOR_GAP, MAX_FLOOR_GAP);
  const totalClimb = plans.reduce((sum, p) => sum + p.gapAbovePrev, 0);
  const heightTiles = startPad + totalClimb + topPad;

  // The goal always sits at the shaft's fixed horizontal center, but the last
  // floor's position was chosen relative to the floor before it and could have
  // drifted toward an edge. Pull it back in if the final (unassisted) climb up to
  // the goal wouldn't leave enough reach budget to also cover that sideways gap.
  if (plans.length > 0) {
    const last = plans[plans.length - 1];
    const goalCenterCol = Math.floor(widthTiles / 2);
    const maxFinalOffset = Math.max(2, VERTICAL_REACH_BUDGET - topPad);
    const lastCenter = last.platformX + (last.platformWidth - 1) / 2;
    if (Math.abs(lastCenter - goalCenterCol) > maxFinalOffset) {
      const clampedCenter = clamp(lastCenter, goalCenterCol - maxFinalOffset, goalCenterCol + maxFinalOffset);
      last.platformX = clamp(
        Math.round(clampedCenter - (last.platformWidth - 1) / 2),
        V_INTERIOR_LO,
        V_INTERIOR_HI - last.platformWidth + 1
      );
    }
  }

  const tiles: Tile[][] = Array.from({ length: heightTiles }, () => new Array(widthTiles).fill(Tile.Empty));
  const fillRect = (x0: number, x1: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x >= 0 && x < widthTiles && y >= 0 && y < heightTiles) tiles[y][x] = Tile.Solid;
      }
    }
  };

  // Moving platforms aren't part of the static tile grid, so a plain tile scan can't
  // see them -- two adjacent floors that are both moving platforms would never be
  // checked against each other, letting their sweeps genuinely overlap in space.
  // Each one reserves its full swept footprint here so later floors steer clear of it.
  const occupiedZones: { x0: number; x1: number; row0: number; row1: number }[] = [];

  // Scans for the nearest solid row strictly below `fromRow` across the given column
  // range -- a descending platform's own columns might not overlap the previous floor
  // in the climbing sequence at all, and instead sit above some other floor further
  // down (static or another moving platform) that happens to share columns, at a
  // completely different distance. Only things already placed (everything below,
  // since generation proceeds bottom-up) are visible here, which is exactly what
  // matters for capping how far down is safe.
  const nearestSolidRowBelow = (x0: number, x1: number, fromRow: number): number => {
    let nearest = heightTiles;
    scan: for (let ty = fromRow + 1; ty < heightTiles; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (tiles[ty][tx] === Tile.Solid) {
          nearest = ty;
          break scan;
        }
      }
    }
    for (const z of occupiedZones) {
      if (z.row0 > fromRow && z.x0 <= x1 && z.x1 >= x0) {
        nearest = Math.min(nearest, z.row0);
      }
    }
    return nearest;
  };

  // Side walls bound the whole shaft so a missed landing doesn't just fall out of the level.
  fillRect(0, 0, 0, heightTiles - 1);
  fillRect(widthTiles - 1, widthTiles - 1, 0, heightTiles - 1);

  const bottomRow = heightTiles - 1;
  fillRect(1, widthTiles - 2, bottomRow - 1, bottomRow);

  const spikes: SpikeRect[] = [];
  const springs: SpringDef[] = [];
  const embers: EmberDef[] = [];
  const enemies: EnemyDef[] = [];
  const movingPlatforms: MovingPlatformDef[] = [];
  const swingAnchors: SwingAnchorDef[] = [];
  const checkpoints: CheckpointDef[] = [];

  // Stand exactly on the start-room floor's surface -- spawning a fixed few rows above
  // it (as before) could land inside the first climbable platform, since that platform
  // is allowed to be as few as MIN_FLOOR_GAP rows up, the same offset used here.
  const playerStart = { x: t(Math.floor(widthTiles / 2)), y: t(bottomRow - 1) - PLAYER_H };
  checkpoints.push({ x: playerStart.x, y: playerStart.y });

  let prevX0 = 1;
  let prevX1 = widthTiles - 2;
  let currentRow = bottomRow - 1;

  for (let i = 0; i < plans.length; i++) {
    const p = plans[i];
    currentRow -= p.gapAbovePrev;
    const px0 = p.platformX;
    const px1 = p.platformX + p.platformWidth - 1;

    if (p.kind === "spring") {
      springs.push({ x: t((prevX0 + prevX1 + 1) / 2), y: t(currentRow + p.gapAbovePrev) });
      fillRect(px0, px1, currentRow, currentRow);
    } else if (p.kind === "swing") {
      swingAnchors.push({
        x: t((px0 + px1 + 1) / 2) + TILE / 2,
        y: t(currentRow + Math.max(2, Math.floor(p.gapAbovePrev / 2))) + TILE / 2,
      });
      fillRect(px0, px1, currentRow, currentRow);
    } else if (p.kind === "movingX" && V_INTERIOR_HI - (px0 + p.platformWidth) + 1 < 1) {
      // No safe room to travel right without reaching the wall -- a forced minimum
      // range here would just push the platform into it, so fall back to static.
      fillRect(px0, px1, currentRow, currentRow);
    } else if (p.kind === "movingX" || p.kind === "movingY") {
      const speed = Math.round(scaled(40, 5, 120, difficulty));
      // These only ever travel in one direction from their base (right, or down) --
      // cap that travel so it can never reach the side wall or sink into the floor
      // below, which would otherwise let a rider clip straight through solid tile.
      // Never force a minimum here: if the safe room is small, the range should be
      // small too, not padded out into whatever's next to it.
      let range: number;
      if (p.kind === "movingX") {
        const maxRangeTiles = V_INTERIOR_HI - (px0 + p.platformWidth) + 1;
        range = t(Math.min(randRange(rng, 2, 4), maxRangeTiles));
      } else {
        // Cap against whatever is actually nearest below in this platform's own
        // column range (not just the previous floor in the climbing sequence, which
        // might not even share columns with it), leaving a full 2-tile buffer -- a
        // rider's hitbox is ~0.83 tiles tall, so anything tighter risks squeezing a
        // player standing on the floor below against the platform's descending
        // underside. The platform itself occupies one row, so the subtraction is
        // 3 (1 for its own row + 2 rows of clear buffer), not 2.
        const nearestRow = nearestSolidRowBelow(px0, px1, currentRow);
        const maxRangeTiles = Math.max(0, nearestRow - currentRow - 3);
        range = t(Math.min(randRange(rng, 3, 6), maxRangeTiles));
      }
      const rangeTiles = range / TILE;
      if (p.kind === "movingX") {
        occupiedZones.push({
          x0: px0,
          x1: px0 + p.platformWidth - 1 + rangeTiles,
          row0: currentRow,
          row1: currentRow,
        });
      } else {
        occupiedZones.push({ x0: px0, x1: px1, row0: currentRow, row1: currentRow + rangeTiles });
      }
      movingPlatforms.push({
        x: t(px0),
        y: t(currentRow),
        w: t(p.platformWidth),
        h: TILE,
        axis: p.kind === "movingX" ? "x" : "y",
        range,
        speed,
        phase: rng(),
      });
    } else {
      fillRect(px0, px1, currentRow, currentRow);
    }

    if (p.hasSpike) {
      const spikeX = px0 + Math.max(0, Math.floor(p.platformWidth / 2) - 1);
      spikes.push({ x: t(spikeX), y: t(currentRow) - 6, w: t(Math.min(2, p.platformWidth)), h: 6 });
    }
    if (p.hasEnemy) {
      enemies.push({
        x: t(px0 + Math.floor(p.platformWidth / 2)),
        y: t(currentRow),
        rangeLeft: t(px0),
        rangeRight: t(px1 + 1),
        speed: Math.round(scaled(35, 5, 95, difficulty)),
      });
    }
    for (let e = 0; e < p.emberCount; e++) {
      embers.push({ x: t(px0 + 0.5 + e * 1.2), y: t(currentRow - 1) });
    }
    if (i % 3 === 2 && !p.hasSpike) {
      checkpoints.push({ x: t((px0 + px1 + 1) / 2), y: t(currentRow - 3) });
    }

    prevX0 = px0;
    prevX1 = px1;
  }

  // Like every other floor, the goal pedestal must NOT span the full interior width --
  // a full-width row has no open column to rise through from below, making it a solid
  // ceiling rather than a landing platform (there is no jump height that gets you
  // through solid tile; you can only land on top of something by rising past its side).
  const goalRow = currentRow - topPad;
  const goalPedestalWidth = 6;
  const goalCenterCol = Math.floor(widthTiles / 2);
  const goalX0 = clamp(goalCenterCol - Math.floor(goalPedestalWidth / 2), V_INTERIOR_LO, V_INTERIOR_HI - goalPedestalWidth + 1);
  const goalX1 = goalX0 + goalPedestalWidth - 1;
  fillRect(goalX0, goalX1, goalRow, goalRow);
  const goal = { x: t(goalCenterCol), y: t(goalRow - 1) };
  checkpoints.push({ x: goal.x, y: t(goalRow - 3) });

  const data: LevelData = {
    widthTiles,
    heightTiles,
    orientation: "vertical",
    playerStart,
    goal,
    checkpoints: pruneUnsafeCheckpoints(checkpoints, spikes),
    spikes,
    springs,
    embers,
    enemies,
    movingPlatforms,
    swingAnchors,
  };

  return { level: new Level(tiles, widthTiles, heightTiles), data };
}

// ---------------------------------------------------------------------------
// Top-level dispatcher.
// ---------------------------------------------------------------------------

const HAND_LEVELS: Record<number, () => { level: Level; data: LevelData }> = {
  1: buildLevel1,
  2: buildLevel2,
  3: buildLevel3,
  4: buildLevel4,
  5: buildLevel5,
};

export function getLevelForNumber(levelNumber: number, runSeed: number): { level: Level; data: LevelData } {
  if (levelNumber <= 1) return buildLevel1();
  if (levelNumber <= 5) return HAND_LEVELS[levelNumber]();

  const rng = createRng(hashSeed(runSeed, levelNumber));
  const difficulty = levelNumber - 1;
  const verticalChance = levelNumber <= 2 ? 0 : Math.min(0.25 + (levelNumber - 2) * 0.05, 0.55);
  const orientation: Orientation = chance(rng, verticalChance) ? "vertical" : "horizontal";

  return orientation === "vertical" ? generateVerticalLevel(rng, difficulty) : generateHorizontalLevel(rng, difficulty);
}
