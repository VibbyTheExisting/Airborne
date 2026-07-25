import { TILE } from "./constants";
import type { Rect } from "./utils";

export const enum Tile {
  Empty = 0,
  Solid = 1,
}

export type Orientation = "horizontal" | "vertical";

export interface SpikeRect extends Rect {}

export interface SpringDef {
  x: number;
  y: number;
}

export interface EmberDef {
  x: number;
  y: number;
}

export interface EnemyDef {
  x: number;
  y: number;
  rangeLeft: number;
  rangeRight: number;
  speed?: number;
}

export interface MovingPlatformDef {
  x: number;
  y: number;
  w: number;
  h: number;
  axis: "x" | "y";
  range: number;
  speed: number;
  phase: number;
}

export interface SwingAnchorDef {
  x: number;
  y: number;
}

export interface CheckpointDef {
  x: number;
  y: number;
}

export interface LevelData {
  widthTiles: number;
  heightTiles: number;
  orientation: Orientation;
  playerStart: { x: number; y: number };
  goal: { x: number; y: number };
  checkpoints: CheckpointDef[];
  spikes: SpikeRect[];
  springs: SpringDef[];
  embers: EmberDef[];
  enemies: EnemyDef[];
  movingPlatforms: MovingPlatformDef[];
  swingAnchors: SwingAnchorDef[];
}

function t(n: number): number {
  return n * TILE;
}

/**
 * The hand-tuned opening level (always level 1): teaches every mechanic —
 * gaps, the whip-swing shaft, a spring, a spike trap, moving platforms, a
 * chasm shortcut, patrol enemies, and the final staircase — before the
 * generator takes over with harder, procedurally built levels.
 */
export function buildTutorialLevel(): { level: Level; data: LevelData } {
  const widthTiles = 96;
  const heightTiles = 22;
  const floorRow = 17;

  const tiles: Tile[][] = Array.from({ length: heightTiles }, () =>
    new Array(widthTiles).fill(Tile.Empty)
  );

  const fillRect = (x0: number, x1: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x >= 0 && x < widthTiles && y >= 0 && y < heightTiles) tiles[y][x] = Tile.Solid;
      }
    }
  };

  // Ground A: gentle intro.
  fillRect(0, 9, floorRow, heightTiles - 1);
  // (pit at 10-13)
  // Ground B: platform, whip-swing shaft, spring section, spike trap.
  fillRect(14, 41, floorRow, heightTiles - 1);
  // (chasm at 42-54, crossed via moving platforms or a whip-swing shortcut)
  // Ground C: enemies + staircase to goal.
  fillRect(55, 95, floorRow, heightTiles - 1);

  // Floating platform reward above the first gap landing.
  fillRect(16, 17, floorRow - 4, floorRow - 4);

  // Slide-friendly corridor: two tall pillars rising from the ground.
  fillRect(19, 19, floorRow - 11, floorRow - 1);
  fillRect(23, 23, floorRow - 11, floorRow - 1);
  // High ledge reached by whip-swinging up from the anchor overhead.
  fillRect(24, 30, floorRow - 11, floorRow - 11);

  // Spring reward platform, high above the spring pad.
  fillRect(33, 38, floorRow - 14, floorRow - 14);

  // End-game staircase up to the goal pedestal.
  fillRect(78, 79, floorRow - 3, floorRow - 3);
  fillRect(81, 82, floorRow - 6, floorRow - 6);
  fillRect(84, 85, floorRow - 9, floorRow - 9);
  fillRect(87, 93, floorRow - 12, floorRow - 12);

  const spikes: SpikeRect[] = [
    { x: t(36), y: t(floorRow) - 6, w: t(1), h: 6 },
    { x: t(37), y: t(floorRow) - 6, w: t(1), h: 6 },
  ];

  const springs: SpringDef[] = [{ x: t(32) + TILE / 2, y: t(floorRow) }];

  const embers: EmberDef[] = [
    { x: t(5), y: t(floorRow - 3) },
    { x: t(6), y: t(floorRow - 3) },
    { x: t(7), y: t(floorRow - 3) },
    { x: t(16) + TILE / 2, y: t(floorRow - 5) },
    { x: t(26), y: t(floorRow - 12) },
    { x: t(27), y: t(floorRow - 12) },
    { x: t(28), y: t(floorRow - 12) },
    { x: t(34), y: t(floorRow - 15) },
    { x: t(35), y: t(floorRow - 15) },
    { x: t(36), y: t(floorRow - 15) },
    { x: t(57), y: t(floorRow - 2) },
    { x: t(63), y: t(floorRow - 2) },
    { x: t(70), y: t(floorRow - 2) },
    { x: t(78), y: t(floorRow - 4) },
    { x: t(81), y: t(floorRow - 7) },
    { x: t(84), y: t(floorRow - 10) },
  ];

  const enemies: EnemyDef[] = [
    { x: t(58), y: t(floorRow), rangeLeft: t(56), rangeRight: t(62) },
    { x: t(68), y: t(floorRow), rangeLeft: t(65), rangeRight: t(73) },
  ];

  const movingPlatforms: MovingPlatformDef[] = [
    { x: t(43), y: t(floorRow - 2), w: t(2), h: TILE, axis: "x", range: t(3), speed: 50, phase: 0 },
    { x: t(48), y: t(floorRow - 2), w: t(2), h: TILE, axis: "y", range: t(5), speed: 45, phase: 0.35 },
    { x: t(52), y: t(floorRow - 2), w: t(2), h: TILE, axis: "x", range: t(2.5), speed: 55, phase: 0.6 },
  ];

  // Octagonal whip anchors: grab with E/F and swing, release with Space for a boosted arc.
  const swingAnchors: SwingAnchorDef[] = [
    { x: t(21) + TILE / 2, y: t(floorRow - 9) + TILE / 2 },
    { x: t(47) + TILE / 2, y: t(floorRow - 8) + TILE / 2 },
  ];

  const checkpoints: CheckpointDef[] = [0, 14, 56, 77].map((tx) => ({
    x: t(tx),
    y: t(floorRow - 3),
  }));

  const data: LevelData = {
    widthTiles,
    heightTiles,
    orientation: "horizontal",
    playerStart: { x: t(2), y: t(floorRow - 3) },
    goal: { x: t(91), y: t(floorRow - 13) },
    checkpoints,
    spikes,
    springs,
    embers,
    enemies,
    movingPlatforms,
    swingAnchors,
  };

  return { level: new Level(tiles, widthTiles, heightTiles), data };
}

export class Level {
  readonly pixelWidth: number;
  readonly pixelHeight: number;

  constructor(
    private tiles: Tile[][],
    readonly widthTiles: number,
    readonly heightTiles: number
  ) {
    this.pixelWidth = widthTiles * TILE;
    this.pixelHeight = heightTiles * TILE;
  }

  isSolidTile(tx: number, ty: number): boolean {
    if (tx < 0 || tx >= this.widthTiles || ty < 0 || ty >= this.heightTiles) return false;
    return this.tiles[ty][tx] === Tile.Solid;
  }

  isSolidAtPixel(px: number, py: number): boolean {
    return this.isSolidTile(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  /** Returns true if any solid tile overlaps the given world-space rect. */
  rectCollides(r: Rect): boolean {
    const tx0 = Math.floor(r.x / TILE);
    const tx1 = Math.floor((r.x + r.w - 0.01) / TILE);
    const ty0 = Math.floor(r.y / TILE);
    const ty1 = Math.floor((r.y + r.h - 0.01) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this.isSolidTile(tx, ty)) return true;
      }
    }
    return false;
  }

  forEachSolidTileInView(x0: number, y0: number, x1: number, y1: number, fn: (tx: number, ty: number) => void): void {
    const tx0 = Math.max(0, Math.floor(x0 / TILE));
    const tx1 = Math.min(this.widthTiles - 1, Math.floor(x1 / TILE));
    const ty0 = Math.max(0, Math.floor(y0 / TILE));
    const ty1 = Math.min(this.heightTiles - 1, Math.floor(y1 / TILE));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this.tiles[ty][tx] === Tile.Solid) fn(tx, ty);
      }
    }
  }
}
