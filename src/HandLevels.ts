import { PLAYER_H, TILE } from "./constants";
import {
  Level,
  Tile,
  type CheckpointDef,
  type EmberDef,
  type EnemyDef,
  type LevelData,
  type MovingPlatformDef,
  type SpikeRect,
  type SpringDef,
  type SwingAnchorDef,
} from "./Level";

function t(n: number): number {
  return n * TILE;
}

function makeTiles(width: number, height: number): Tile[][] {
  return Array.from({ length: height }, () => new Array<Tile>(width).fill(Tile.Empty));
}

function fillRect(tiles: Tile[][], x0: number, x1: number, y0: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x >= 0 && x < tiles[0].length && y >= 0 && y < tiles.length) tiles[y][x] = Tile.Solid;
    }
  }
}

// All horizontal hand levels share the generator's own floor row/height so they read as
// part of the same world rather than a visually distinct "tutorial" strip.
const FLOOR_ROW = 19;
const HEIGHT = 26;

function groundAt(tiles: Tile[][], x0: number, x1: number): void {
  fillRect(tiles, x0, x1, FLOOR_ROW, HEIGHT - 1);
}

/**
 * Level 1 -- "Trial by Fire": every mechanic from the old soft tutorial is still here
 * (gap jump, spikes, whip swing, enemies, spring, a second swing, a staircase). Gaps are
 * sized for the player's REAL kit, not a plain jump -- a jump chained into a late double
 * jump alone covers ~14-16 tiles, and adding a dash pushes that past 18-20 -- so anything
 * meant to force the whip or spring sits comfortably beyond that, not just past 8 tiles.
 */
export function buildLevel1(): { level: Level; data: LevelData } {
  const width = 183;
  const tiles = makeTiles(width, HEIGHT);

  groundAt(tiles, 0, 5);
  // gap 6-19 (14 tiles): the opener already expects a real double jump, not just a hop.
  groundAt(tiles, 20, 34);
  // gap 35-62 (28 tiles): far beyond any jump/dash combo -- the whip swing is mandatory.
  groundAt(tiles, 63, 87);
  // gap 88-109 (22 tiles), spring-only crossing, with a bonus ledge floating mid-pit.
  fillRect(tiles, 90, 92, 10, 10);
  groundAt(tiles, 110, 130);
  // gap 131-162 (32 tiles): a double swing-to-swing transfer, no ground beneath at all.
  groundAt(tiles, 163, 171);
  // Switchback finish: the climb folds back on itself, so reaching the goal means a
  // jump up-and-LEFT before the final push back right -- not everything here goes right.
  fillRect(tiles, 172, 173, 16, 16);
  fillRect(tiles, 169, 170, 13, 13);
  fillRect(tiles, 174, 175, 10, 10);
  fillRect(tiles, 176, 182, 7, 7);

  const spikes: SpikeRect[] = [{ x: t(27), y: t(FLOOR_ROW) - 6, w: t(3), h: 6 }];

  const springs: SpringDef[] = [{ x: t(86) + TILE / 2, y: t(FLOOR_ROW) }];

  const embers: EmberDef[] = [
    { x: t(2), y: t(16) },
    { x: t(3), y: t(16) },
    { x: t(4), y: t(16) },
    { x: t(70), y: t(17) },
    { x: t(76), y: t(17) },
    { x: t(82), y: t(17) },
    { x: t(90), y: t(9) },
    { x: t(91), y: t(9) },
    { x: t(92), y: t(9) },
    { x: t(172), y: t(15) },
    { x: t(169), y: t(12) },
    { x: t(174), y: t(9) },
    { x: t(176), y: t(6) },
    { x: t(177), y: t(6) },
    { x: t(181), y: t(6) },
  ];

  const enemies: EnemyDef[] = [
    { x: t(73), y: t(FLOOR_ROW), rangeLeft: t(70), rangeRight: t(77), speed: 90 },
    { x: t(80), y: t(FLOOR_ROW), rangeLeft: t(78), rangeRight: t(84), speed: 115 },
  ];

  const swingAnchors: SwingAnchorDef[] = [
    { x: t(49) + TILE / 2, y: t(11) + TILE / 2 },
    { x: t(138) + TILE / 2, y: t(11) + TILE / 2 },
    { x: t(144) + TILE / 2, y: t(11) + TILE / 2 },
  ];

  const checkpoints: CheckpointDef[] = [0, 34, 84, 125, 168].map((x) => ({ x: t(x), y: t(16) }));

  const data: LevelData = {
    widthTiles: width,
    heightTiles: HEIGHT,
    orientation: "horizontal",
    playerStart: { x: t(2), y: t(16) },
    goal: { x: t(179), y: t(6) },
    checkpoints,
    spikes,
    springs,
    embers,
    enemies,
    movingPlatforms: [],
    swingAnchors,
  };

  return { level: new Level(tiles, width, HEIGHT), data };
}

/**
 * Level 2 -- "Spike Alley": dense hazard sequencing over raw reach. A back-to-back
 * spike run, a wide double-jump gap, a moving-platform pit flanked by patrols, and a big
 * two-phase chasm split by a small solid island -- a patrolling enemy stands ON that
 * island (never floating in open air), so you either time around it or stomp it, but it
 * never IS the ground itself.
 */
export function buildLevel2(): { level: Level; data: LevelData } {
  const width = 110;
  const tiles = makeTiles(width, HEIGHT);

  groundAt(tiles, 0, 4);
  groundAt(tiles, 5, 24);
  // gap 25-39 (15 tiles): needs a real double jump, no bail-out.
  groundAt(tiles, 40, 44);
  // gap 45-60 (16 tiles): unclearable by jumping -- ride both moving platforms.
  groundAt(tiles, 61, 68);
  // gap 69-92 (24 tiles) in two 10-tile halves around a small floating island -- the
  // island is solid ground the enemy patrols on, not a hazard floating in mid-air.
  fillRect(tiles, 79, 82, 15, 15);
  groundAt(tiles, 93, 100);
  fillRect(tiles, 101, 102, 16, 16);
  fillRect(tiles, 104, 109, 13, 13);

  const spikes: SpikeRect[] = [
    { x: t(9), y: t(FLOOR_ROW) - 6, w: t(3), h: 6 },
    { x: t(16), y: t(FLOOR_ROW) - 6, w: t(4), h: 6 },
    { x: t(97), y: t(FLOOR_ROW) - 6, w: t(1), h: 6 },
  ];

  const embers: EmberDef[] = [
    { x: t(2), y: t(16) },
    { x: t(3), y: t(16) },
    { x: t(12), y: t(17) },
    { x: t(64), y: t(17) },
    { x: t(95), y: t(17) },
    { x: t(104), y: t(12) },
    { x: t(105), y: t(12) },
    { x: t(108), y: t(12) },
  ];

  const enemies: EnemyDef[] = [
    { x: t(64), y: t(FLOOR_ROW), rangeLeft: t(62), rangeRight: t(67), speed: 90 },
    { x: t(80), y: t(15), rangeLeft: t(79), rangeRight: t(82), speed: 60 },
  ];

  const movingPlatforms: MovingPlatformDef[] = [
    { x: t(48), y: t(15), w: t(2), h: TILE, axis: "x", range: t(4), speed: 70, phase: 0 },
    { x: t(54), y: t(15), w: t(2), h: TILE, axis: "y", range: t(4), speed: 65, phase: 0.5 },
  ];

  const checkpoints: CheckpointDef[] = [0, 24, 44, 68, 100].map((x) => ({ x: t(x), y: t(16) }));

  const data: LevelData = {
    widthTiles: width,
    heightTiles: HEIGHT,
    orientation: "horizontal",
    playerStart: { x: t(2), y: t(16) },
    goal: { x: t(106), y: t(12) },
    checkpoints,
    spikes,
    springs: [],
    embers,
    enemies,
    movingPlatforms,
    swingAnchors: [],
  };

  return { level: new Level(tiles, width, HEIGHT), data };
}

/**
 * Level 3 -- "High Wire": almost no floor. Two whip swings back-to-back, a moving-
 * platform elevator ride, and a final swing out to a goal pedestal with nothing but a
 * long drop underneath the whole level.
 */
export function buildLevel3(): { level: Level; data: LevelData } {
  const width = 102;
  const tiles = makeTiles(width, HEIGHT);

  groundAt(tiles, 0, 5);
  // gap 6-27 (22 tiles): swing only, no alternate platform.
  groundAt(tiles, 28, 31);
  // gap 32-51 (20 tiles): a second swing immediately after landing, no rest.
  groundAt(tiles, 52, 58);
  fillRect(tiles, 64, 70, 10, 10);
  // gap 71-94 (24 tiles) from the elevated ledge: a final swing straight to the goal.
  fillRect(tiles, 95, 101, 10, 10);

  const embers: EmberDef[] = [
    { x: t(2), y: t(16) },
    { x: t(3), y: t(16) },
    { x: t(29), y: t(17) },
    { x: t(54), y: t(17) },
    { x: t(66), y: t(9) },
    { x: t(67), y: t(9) },
    { x: t(96), y: t(9) },
    { x: t(97), y: t(9) },
    { x: t(100), y: t(9) },
  ];

  const movingPlatforms: MovingPlatformDef[] = [
    // Base sits at the ledge height and travels straight down to floor level, so it
    // must be caught at the bottom of its swing and ridden back up.
    { x: t(60), y: t(10), w: t(3), h: TILE, axis: "y", range: t(9), speed: 50, phase: 0 },
  ];

  const swingAnchors: SwingAnchorDef[] = [
    { x: t(16) + TILE / 2, y: t(10) + TILE / 2 },
    { x: t(41) + TILE / 2, y: t(10) + TILE / 2 },
    { x: t(82) + TILE / 2, y: t(2) + TILE / 2 },
  ];

  const checkpoints: CheckpointDef[] = [
    { x: t(0), y: t(16) },
    { x: t(31), y: t(16) },
    { x: t(58), y: t(16) },
    { x: t(70), y: t(7) },
  ];

  const data: LevelData = {
    widthTiles: width,
    heightTiles: HEIGHT,
    orientation: "horizontal",
    playerStart: { x: t(2), y: t(16) },
    goal: { x: t(98), y: t(9) },
    checkpoints,
    spikes: [],
    springs: [],
    embers,
    enemies: [],
    movingPlatforms,
    swingAnchors,
  };

  return { level: new Level(tiles, width, HEIGHT), data };
}

/**
 * Level 4 -- "The Shaft": a hand-tuned vertical climb, styled like the procedural
 * vertical generator but with every floor pinned to its hardest legal values (max
 * floor gap, max sideways offset, minimum platform width) instead of randomly rolled --
 * this is as tight as that generator's own safety budget ever allows. The zigzagging
 * ledges mean roughly half the climb is a jump back to the LEFT, and one floor (F6) is
 * a pure vertical gap one tile past double-jump range -- the whip swing there isn't
 * optional flavor, it's the only way up.
 */
export function buildLevel4(): { level: Level; data: LevelData } {
  const width = 15;
  const height = 70;
  const bottomRow = height - 1;
  const tiles = makeTiles(width, height);

  fillRect(tiles, 0, 0, 0, bottomRow);
  fillRect(tiles, width - 1, width - 1, 0, bottomRow);
  fillRect(tiles, 1, width - 2, bottomRow - 1, bottomRow);

  // Floors, bottom to top -- gap 6 (the generator's own MAX_FLOOR_GAP) between every
  // pair, offsets alternating at +-2 (its VERTICAL_REACH_BUDGET ceiling for that gap).
  fillRect(tiles, 7, 9, 62, 62); // F1: spike-guarded ledge, land left of the spike
  // F2 (row 56) is a moving platform only -- no static tile here, must be ridden.
  fillRect(tiles, 7, 9, 50, 50); // F3: plain rest before the spring
  fillRect(tiles, 6, 7, 44, 44); // F4: spring-assisted landing
  fillRect(tiles, 7, 9, 38, 38); // F5: spike-guarded ledge
  // F6 (row 29) is swing-only: a pure 9-tile vertical gap directly overhead, one tile
  // past this game's own double-jump ceiling, so there is no static landing here at all.
  fillRect(tiles, 8, 9, 26, 26); // F7: patrolled by an enemy
  // F8 (row 20) is a moving platform only -- must be ridden.
  fillRect(tiles, 7, 9, 14, 14); // F9: spike-guarded ledge
  fillRect(tiles, 6, 8, 8, 8); // F10: safe rest before the goal push
  fillRect(tiles, 4, 9, 2, 2); // goal pedestal

  const spikes: SpikeRect[] = [
    { x: t(9), y: t(62) - 6, w: t(1), h: 6 },
    { x: t(9), y: t(38) - 6, w: t(1), h: 6 },
    { x: t(9), y: t(14) - 6, w: t(1), h: 6 },
  ];

  const springs: SpringDef[] = [{ x: t(8.5), y: t(50) }];

  const swingAnchors: SwingAnchorDef[] = [{ x: t(8) + TILE / 2, y: t(33) + TILE / 2 }];

  const enemies: EnemyDef[] = [
    { x: t(9), y: t(26), rangeLeft: t(8), rangeRight: t(10), speed: 100 },
  ];

  const movingPlatforms: MovingPlatformDef[] = [
    { x: t(6), y: t(56), w: t(2), h: TILE, axis: "x", range: t(3), speed: 70, phase: 0 },
    { x: t(6), y: t(20), w: t(2), h: TILE, axis: "y", range: t(3), speed: 60, phase: 0.3 },
  ];

  const embers: EmberDef[] = [
    { x: t(8), y: t(61) },
    { x: t(8), y: t(49) },
    { x: t(6), y: t(43) },
    { x: t(8), y: t(37) },
    { x: t(8), y: t(31) },
    { x: t(9), y: t(25) },
    { x: t(8), y: t(13) },
    { x: t(6), y: t(7) },
    { x: t(8), y: t(7) },
  ];

  const playerStart = { x: t(7), y: t(bottomRow - 1) - PLAYER_H };
  const checkpoints: CheckpointDef[] = [
    playerStart,
    { x: t(8), y: t(47) },
    { x: t(9), y: t(23) },
    { x: t(7), y: t(5) },
  ];

  const data: LevelData = {
    widthTiles: width,
    heightTiles: height,
    orientation: "vertical",
    playerStart,
    goal: { x: t(7), y: t(1) },
    checkpoints,
    spikes,
    springs,
    embers,
    enemies,
    movingPlatforms,
    swingAnchors,
  };

  return { level: new Level(tiles, width, height), data };
}

/**
 * Level 5 -- "The Reckoning": the capstone. Every mechanic taught so far, chained back
 * to back with the least room for error yet -- a triple swing-to-swing transfer with no
 * ground below, an elevator-into-spring combo, and a finish that expects a charged
 * slingshot launch (attach and charge on the near side of the anchor, then release) to
 * clear a chasm nothing else reaches.
 */
export function buildLevel5(): { level: Level; data: LevelData } {
  const width = 166;
  const tiles = makeTiles(width, HEIGHT);

  groundAt(tiles, 0, 4);
  // gap 5-20 (16 tiles): a real double jump straight into a spike-lined gauntlet.
  groundAt(tiles, 21, 44);
  // gap 45-78 (34 tiles): triple swing transfer, no ground beneath any of it.
  groundAt(tiles, 79, 88);
  // A short 2-tile gap here separates the elevator's own columns from the ledge it
  // lifts you to, so the platform's sweep never touches the ledge's solid tiles.
  fillRect(tiles, 94, 100, 13, 13);
  // gap 101-118 (18 tiles) from the elevated ledge, cleared by the spring's arc.
  fillRect(tiles, 119, 128, 13, HEIGHT - 1);
  // gap 129-158 (30 tiles): only a charged slingshot launch reaches the far pedestal.
  fillRect(tiles, 159, 165, 13, HEIGHT - 1);

  const spikes: SpikeRect[] = [
    { x: t(25), y: t(FLOOR_ROW) - 6, w: t(2), h: 6 },
    { x: t(38), y: t(FLOOR_ROW) - 6, w: t(2), h: 6 },
  ];

  const springs: SpringDef[] = [{ x: t(97) + TILE / 2, y: t(13) }];

  const enemies: EnemyDef[] = [
    { x: t(33), y: t(FLOOR_ROW), rangeLeft: t(31), rangeRight: t(36), speed: 100 },
    { x: t(42), y: t(FLOOR_ROW), rangeLeft: t(40), rangeRight: t(44), speed: 120 },
  ];

  const swingAnchors: SwingAnchorDef[] = [
    { x: t(51) + TILE / 2, y: t(11) + TILE / 2 },
    { x: t(57) + TILE / 2, y: t(11) + TILE / 2 },
    { x: t(63) + TILE / 2, y: t(11) + TILE / 2 },
    { x: t(143) + TILE / 2, y: t(9) + TILE / 2 },
  ];

  const movingPlatforms: MovingPlatformDef[] = [
    { x: t(89), y: t(13), w: t(3), h: TILE, axis: "y", range: t(6), speed: 55, phase: 0.2 },
  ];

  const embers: EmberDef[] = [
    { x: t(2), y: t(16) },
    { x: t(3), y: t(16) },
    { x: t(33), y: t(17) },
    { x: t(42), y: t(17) },
    { x: t(96), y: t(12) },
    { x: t(98), y: t(12) },
    { x: t(121), y: t(12) },
    { x: t(123), y: t(12) },
    { x: t(126), y: t(12) },
    { x: t(159), y: t(12) },
    { x: t(160), y: t(12) },
    { x: t(164), y: t(12) },
  ];

  const checkpoints: CheckpointDef[] = [
    { x: t(0), y: t(16) },
    { x: t(44), y: t(16) },
    { x: t(81), y: t(16) },
    { x: t(124), y: t(10) },
  ];

  const data: LevelData = {
    widthTiles: width,
    heightTiles: HEIGHT,
    orientation: "horizontal",
    playerStart: { x: t(2), y: t(16) },
    goal: { x: t(162), y: t(12) },
    checkpoints,
    spikes,
    springs,
    embers,
    enemies,
    movingPlatforms,
    swingAnchors,
  };

  return { level: new Level(tiles, width, HEIGHT), data };
}
