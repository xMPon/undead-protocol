// @vitest-environment happy-dom

// The overlay itself, driven by real pointer events against a real DOM. This is
// the only way any of this gets exercised without a phone in hand: mount it,
// press it, drag it, and check the state the renderers will read.

import { describe, it, expect, beforeEach } from "vitest";
import { TouchControls, STICK_RADIUS } from "../src/core/Touch";

/** A pointer event happy-dom will route like a browser does. */
function pointer(type: string, x: number, y: number, id = 1, pointerType = "touch"): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { clientX: x, clientY: y, pointerId: id, pointerType });
  return e;
}

let app: HTMLElement;
let touch: TouchControls;

beforeEach(() => {
  document.body.innerHTML = "";
  app = document.createElement("div");
  document.body.appendChild(app);
  touch = new TouchControls();
  touch.mount(app);
  touch.setActive(true);
});

const zone = (side: "left" | "right"): HTMLElement => app.querySelector(`.t-${side}`)!;
const button = (id: string): HTMLElement => app.querySelector(`[data-btn="${id}"]`)!;

describe("touch overlay — sticks", () => {
  it("stays silent until a thumb lands on it", () => {
    expect(touch.move).toEqual({ x: 0, y: 0 });
    expect(touch.sprint).toBe(false);
  });

  it("walks in the direction the left thumb drags", () => {
    zone("left").dispatchEvent(pointer("pointerdown", 200, 400));
    zone("left").dispatchEvent(pointer("pointermove", 200, 400 - STICK_RADIUS));
    expect(touch.move.y).toBeCloseTo(-1, 5); // up the screen = forward
    expect(touch.move.x).toBeCloseTo(0, 5);
  });

  it("sprints only once the stick is pushed to its edge", () => {
    zone("left").dispatchEvent(pointer("pointerdown", 200, 400));
    zone("left").dispatchEvent(pointer("pointermove", 200 + STICK_RADIUS * 0.4, 400));
    expect(touch.sprint).toBe(false);
    zone("left").dispatchEvent(pointer("pointermove", 200 + STICK_RADIUS, 400));
    expect(touch.sprint).toBe(true);
  });

  it("lets go cleanly when the thumb lifts", () => {
    zone("left").dispatchEvent(pointer("pointerdown", 200, 400));
    zone("left").dispatchEvent(pointer("pointermove", 260, 400));
    zone("left").dispatchEvent(pointer("pointerup", 260, 400));
    expect(touch.move).toEqual({ x: 0, y: 0 });
    expect(touch.sprint).toBe(false);
  });

  it("turns a right-thumb drag into look deltas and an aim heading", () => {
    zone("right").dispatchEvent(pointer("pointerdown", 600, 400, 2));
    zone("right").dispatchEvent(pointer("pointermove", 640, 400, 2));
    expect(touch.lookDX).toBe(40); // the 3D view reads this as a mouse delta
    expect(touch.look.x).toBeGreaterThan(0); // the 2D view reads this as aim
    expect(touch.look.y).toBeCloseTo(0, 5);
  });

  it("accumulates look motion within a frame and clears it on endFrame", () => {
    zone("right").dispatchEvent(pointer("pointerdown", 600, 400, 2));
    zone("right").dispatchEvent(pointer("pointermove", 610, 400, 2));
    zone("right").dispatchEvent(pointer("pointermove", 625, 400, 2));
    expect(touch.lookDX).toBe(25);
    touch.endFrame();
    expect(touch.lookDX).toBe(0);
  });

  it("drives both sticks at once, which is the entire point", () => {
    zone("left").dispatchEvent(pointer("pointerdown", 150, 500, 1));
    zone("right").dispatchEvent(pointer("pointerdown", 700, 500, 2));
    zone("left").dispatchEvent(pointer("pointermove", 150, 500 - STICK_RADIUS, 1));
    zone("right").dispatchEvent(pointer("pointermove", 760, 500, 2));
    expect(touch.move.y).toBeCloseTo(-1, 5);
    expect(touch.lookDX).toBe(60);
    // Lifting one thumb must not cancel the other.
    zone("right").dispatchEvent(pointer("pointerup", 760, 500, 2));
    expect(touch.move.y).toBeCloseTo(-1, 5);
  });
});

describe("touch overlay — buttons", () => {
  it("holds while pressed and releases on lift", () => {
    button("fire").dispatchEvent(pointer("pointerdown", 700, 600, 3));
    expect(touch.isDown("fire")).toBe(true);
    button("fire").dispatchEvent(pointer("pointerup", 700, 600, 3));
    expect(touch.isDown("fire")).toBe(false);
  });

  it("reports a press as a one-frame edge", () => {
    button("swap").dispatchEvent(pointer("pointerdown", 120, 600, 3));
    expect(touch.wasPressed("swap")).toBe(true);
    touch.endFrame();
    expect(touch.wasPressed("swap")).toBe(false);
    expect(touch.isDown("swap")).toBe(true); // still held, just no longer new
  });

  it("offers every control the keyboard has", () => {
    for (const id of ["fire", "ads", "reload", "grenade", "interact", "jump", "swap"]) {
      expect.soft(button(id), `no ${id} button`).toBeTruthy();
    }
  });

  it("fires pause and view as callbacks, not as held buttons", () => {
    let paused = 0;
    let toggled = 0;
    touch.onPause = () => paused++;
    touch.onToggleView = () => toggled++;
    button("pause").dispatchEvent(pointer("pointerdown", 30, 30, 4));
    button("view").dispatchEvent(pointer("pointerdown", 700, 90, 5));
    expect(paused).toBe(1);
    expect(toggled).toBe(1);
    expect(touch.isDown("pause")).toBe(false);
  });

  it("labels the view button with the view it switches to", () => {
    touch.setViewLabel("2d");
    expect(button("view").textContent).toBe("2D");
  });
});

describe("touch overlay — activation", () => {
  it("ignores the mouse on a real touch device", () => {
    zone("left").dispatchEvent(pointer("pointerdown", 200, 400, 1, "mouse"));
    zone("left").dispatchEvent(pointer("pointermove", 260, 400, 1, "mouse"));
    expect(touch.move).toEqual({ x: 0, y: 0 });
  });

  it("accepts the mouse when the controls are forced on, for testing on a desktop", () => {
    touch.setActive(true, true);
    zone("left").dispatchEvent(pointer("pointerdown", 200, 400, 1, "mouse"));
    zone("left").dispatchEvent(pointer("pointermove", 200 + STICK_RADIUS, 400, 1, "mouse"));
    expect(touch.move.x).toBeCloseTo(1, 5);
  });

  it("drops every held input when it is switched off mid-press", () => {
    button("fire").dispatchEvent(pointer("pointerdown", 700, 600, 3));
    zone("left").dispatchEvent(pointer("pointerdown", 200, 400));
    zone("left").dispatchEvent(pointer("pointermove", 260, 400));
    touch.setActive(false);
    expect(touch.isDown("fire")).toBe(false);
    expect(touch.move).toEqual({ x: 0, y: 0 });
    expect(touch.active).toBe(false);
  });

  it("hides while the game is paused without forgetting it is the input mode", () => {
    touch.setVisible(false);
    expect(touch.active).toBe(true);
    expect(app.querySelector("#touch")!.classList.contains("hidden")).toBe(true);
    touch.setVisible(true);
    expect(app.querySelector("#touch")!.classList.contains("hidden")).toBe(false);
  });
});
