export class Input {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private releasedThisFrame = new Set<string>();

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (!e.repeat && !this.down.has(e.code)) this.pressedThisFrame.add(e.code);
      this.down.add(e.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      this.down.delete(e.code);
      this.releasedThisFrame.add(e.code);
    });
    window.addEventListener("blur", () => {
      this.down.clear();
    });
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  wasPressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressedThisFrame.has(c));
  }

  wasReleased(...codes: string[]): boolean {
    return codes.some((c) => this.releasedThisFrame.has(c));
  }

  get moveAxis(): number {
    let axis = 0;
    if (this.isDown("KeyA", "ArrowLeft")) axis -= 1;
    if (this.isDown("KeyD", "ArrowRight")) axis += 1;
    return axis;
  }

  get jumpDown(): boolean {
    return this.isDown("Space", "KeyW", "ArrowUp");
  }

  get jumpPressed(): boolean {
    return this.wasPressed("Space", "KeyW", "ArrowUp");
  }

  get jumpReleased(): boolean {
    return this.wasReleased("Space", "KeyW", "ArrowUp");
  }

  get dashPressed(): boolean {
    return this.wasPressed("ShiftLeft", "ShiftRight");
  }

  get whipPressed(): boolean {
    return this.wasPressed("KeyE", "KeyF");
  }

  get whipHeld(): boolean {
    return this.isDown("KeyE", "KeyF");
  }

  get downHeld(): boolean {
    return this.isDown("KeyS", "ArrowDown");
  }

  get restartPressed(): boolean {
    return this.wasPressed("KeyR");
  }

  /** Call at the end of each frame to clear one-shot event sets. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
  }
}
