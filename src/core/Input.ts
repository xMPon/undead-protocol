// Raw keyboard + mouse state. Renderers translate this into a view-specific
// Intent; the simulation never sees Input directly. Tracks held keys, one-frame
// "just pressed" edges, mouse position (for top-down aim), accumulated mouse
// deltas (for 3D mouselook under pointer lock), and buttons.

export class Input {
  readonly keys = new Set<string>(); // e.code of held keys
  private pressed = new Set<string>(); // edges since last endFrame()
  mouseX = 0;
  mouseY = 0;
  mouseDX = 0;
  mouseDY = 0;
  left = false;
  right = false;
  locked = false;

  private el: HTMLElement | null = null;

  attach(el: HTMLElement): void {
    this.el = el;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("contextmenu", this.onContextMenu);
    document.addEventListener("pointerlockchange", this.onLockChange);
  }

  detach(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("contextmenu", this.onContextMenu);
    document.removeEventListener("pointerlockchange", this.onLockChange);
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Clear one-frame edges and consume accumulated mouse motion. Call last. */
  endFrame(): void {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  requestLock(): void {
    const el = this.el;
    if (!el?.requestPointerLock) return;
    // In some embedded/sandboxed contexts pointer lock is disallowed and the
    // returned promise rejects — swallow it rather than leak an unhandled error.
    const res = el.requestPointerLock() as unknown as Promise<void> | undefined;
    if (res && typeof res.catch === "function") res.catch(() => {});
  }
  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!e.repeat && !this.keys.has(e.code)) this.pressed.add(e.code);
    this.keys.add(e.code);
    // Keep the browser from scrolling on space / arrows during play.
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };
  private onMouseMove = (e: MouseEvent): void => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    if (this.locked) {
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    }
  };
  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) this.left = true;
    if (e.button === 2) this.right = true;
  };
  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.left = false;
    if (e.button === 2) this.right = false;
  };
  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };
  private onLockChange = (): void => {
    this.locked = document.pointerLockElement === this.el;
  };
}
