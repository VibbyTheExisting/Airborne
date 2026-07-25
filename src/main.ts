import "./style.css";
import { Game } from "./Game";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const overlay = document.getElementById("overlay")!;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const hudLevelBtn = document.getElementById("hud-level") as HTMLButtonElement;
const levelSelectOpenBtn = document.getElementById("level-select-open-btn") as HTMLButtonElement;
const levelSelectCloseBtn = document.getElementById("level-select-close-btn") as HTMLButtonElement;

const game = new Game(canvas);

const levelRouteMatch = window.location.pathname.match(/\/levels\/(\d+)/);
if (levelRouteMatch) {
  const levelNumber = Number(levelRouteMatch[1]);
  if (levelNumber >= 1) game.selectLevel(levelNumber);
}

// A clicked <button> keeps browser focus even after it's hidden (opacity/pointer-events
// don't blur it), so a later Space press meant for jumping in-game would otherwise
// natively re-activate it, silently re-firing its click handler. Blur after every use.
function blurActive(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

startBtn.addEventListener("click", () => {
  overlay.classList.add("hidden");
  game.handleOverlayContinue();
  blurActive();
});

hudLevelBtn.addEventListener("click", () => {
  game.openLevelSelect();
  blurActive();
});
levelSelectOpenBtn.addEventListener("click", () => {
  game.openLevelSelect();
  blurActive();
});
levelSelectCloseBtn.addEventListener("click", () => {
  game.closeLevelSelect();
  blurActive();
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !overlay.classList.contains("hidden")) {
    startBtn.click();
  }
});
