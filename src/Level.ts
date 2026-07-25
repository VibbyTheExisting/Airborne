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
