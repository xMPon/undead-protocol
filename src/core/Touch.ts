// Touch controls: a twin-stick overlay for phones and tablets.
//
// This sits beside `Input` as a second raw-input device, not as a replacement:
// it produces the same view-independent quantities the renderers already read
// from the keyboard and mouse (a movement vector, look deltas, held buttons), so
// `buildIntent` merges it in and the simulation never learns that touch exists.
//
// The geometry helpers at the top are pure and unit-tested; everything below
// them is DOM plumbing.

import type { Vec2 } from "./math";

/** Pixels from a stick's origin that count as full deflection. */
export const STICK_RADIUS = 62;
/** Deflection below this is treated as no input — thumbs are not precise. */
export const DEADZONE = 0.14;
/** Deflection at or past this counts as a sprint, so sprint needs no button. */
export const SPRINT_AT = 0.85;
/** Look sensitivity in radians per pixel dragged, before the player's setting. */
export const LOOK_PER_PX = 0.0032;

/**
 * A stick offset in pixels, as a vector in [-1, 1] with the deadzone removed and
 * the magnitude clamped. Past the deadzone the response is rescaled so the first
 * usable movement is not a jump from nothing to 14%.
 */
export function stickVector(dx: number, dy: number, radius = STICK_RADIUS, deadzone = DEADZONE): Vec2 {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, y: 0 };
  const raw = Math.min(1, len / radius);
  if (raw <= deadzone) return { x: 0, y: 0 };
  const scaled = (raw - deadzone) / (1 - deadzone);
  return { x: (dx / len) * scaled, y: (dy / len) * scaled };
}

/** Whether this device should get touch controls by default. */
export function prefersTouch(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const touchPoints = navigator.maxTouchPoints > 0;
  // A touchscreen laptop reports both; the mouse is still the primary device
  // there, so only a coarse *primary* pointer opts in automatically.
  return coarse && touchPoints;
}

/** The buttons the overlay offers, in the order they are laid out. */
const BUTTONS: Array<{ id: string; label: string; cls: string }> = [
  { id: "fire", label: "FIRE", cls: "t-fire" },
  { id: "ads", label: "AIM", cls: "t-ads" },
  { id: "reload", label: "RELOAD", cls: "t-reload" },
  { id: "grenade", label: "FRAG", cls: "t-frag" },
  { id: "interact", label: "USE", cls: "t-use" },
  { id: "jump", label: "JUMP", cls: "t-jump" },
  { id: "swap", label: "SWAP", cls: "t-swap" },
  { id: "view", label: "2D", cls: "t-view" },
  { id: "pause", label: "II", cls: "t-pause" },
];

/** What a renderer reads. Mirrors the shape of `Input` for the same reason. */
export interface TouchState {
  /** Whether the overlay is up and driving input at all. */
  active: boolean;
  /** Movement stick, world-relative to the view, magnitude 0..1. */
  move: Vec2;
  /** True while the movement stick is pushed to its edge. */
  sprint: boolean;
  /** Look stick offset — direction is the aim heading in the 2D view. */
  look: Vec2;
  /** Look movement since the last frame, in pixels (the 3D view's mouse delta). */
  lookDX: number;
  lookDY: number;
  isDown(id: string): boolean;
  wasPressed(id: string): boolean;
}

export class TouchControls implements TouchState {
  active = false;
  move: Vec2 = { x: 0, y: 0 };
  sprint = false;
  look: Vec2 = { x: 0, y: 0 };
  lookDX = 0;
  lookDY = 0;

  /** Fired by the on-screen pause and view buttons, which have no key to press. */
  onPause?: () => void;
  onToggleView?: () => void;

  private root!: HTMLDivElement;
  private moveStick!: HTMLDivElement;
  private moveKnob!: HTMLDivElement;
  private lookStick!: HTMLDivElement;
  private lookKnob!: HTMLDivElement;
  private buttons = new Map<string, HTMLElement>();
  private held = new Set<string>();
  private pressed = new Set<string>();

  /** Pointer id currently driving each stick, or null when it is idle. */
  private movePointer: number | null = null;
  private lookPointer: number | null = null;
  private moveOrigin = { x: 0, y: 0 };
  private lookOrigin = { x: 0, y: 0 };
  private lookLast = { x: 0, y: 0 };
  /** With the mouse allowed, the overlay can be driven on a desktop for testing. */
  private allowMouse = false;

  mount(parent: HTMLElement): void {
    this.root = document.createElement("div");
    this.root.id = "touch";
    this.root.className = "hidden";
    this.root.innerHTML = `
      <div class="t-zone t-left"></div>
      <div class="t-zone t-right"></div>
      <div class="t-stick t-move"><div class="t-knob"></div></div>
      <div class="t-stick t-look"><div class="t-knob"></div></div>
      ${BUTTONS.map((b) => `<button class="t-btn ${b.cls}" data-btn="${b.id}">${b.label}</button>`).join("")}
    `;
    parent.appendChild(this.root);

    this.moveStick = this.root.querySelector(".t-move")!;
    this.moveKnob = this.moveStick.querySelector(".t-knob")!;
    this.lookStick = this.root.querySelector(".t-look")!;
    this.lookKnob = this.lookStick.querySelector(".t-knob")!;

    for (const el of this.root.querySelectorAll<HTMLElement>("[data-btn]")) {
      this.buttons.set(el.dataset.btn!, el);
      el.addEventListener("pointerdown", this.onButtonDown);
      el.addEventListener("pointerup", this.onButtonUp);
      el.addEventListener("pointercancel", this.onButtonUp);
      el.addEventListener("pointerleave", this.onButtonUp);
      // Stops a press on a button from also starting the stick underneath it.
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    const left = this.root.querySelector<HTMLElement>(".t-left")!;
    const right = this.root.querySelector<HTMLElement>(".t-right")!;
    left.addEventListener("pointerdown", (e) => this.startStick(e, "move"));
    right.addEventListener("pointerdown", (e) => this.startStick(e, "look"));
    for (const zone of [left, right]) {
      zone.addEventListener("pointermove", this.onPointerMove);
      zone.addEventListener("pointerup", this.onPointerUp);
      zone.addEventListener("pointercancel", this.onPointerUp);
    }
  }

  /** Show or hide the whole overlay. `allowMouse` is for trying it on a desktop. */
  setActive(on: boolean, allowMouse = false): void {
    this.active = on;
    this.allowMouse = allowMouse;
    this.root.classList.toggle("hidden", !on);
    if (!on) this.reset();
  }

  /** Hide the overlay without forgetting that touch is the input mode. */
  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !this.active || !visible);
    if (!visible) this.reset();
  }

  /** Label the view button with the view it will switch *to*. */
  setViewLabel(next: string): void {
    const btn = this.buttons.get("view");
    if (btn) btn.textContent = next.toUpperCase();
  }

  private reset(): void {
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.sprint = false;
    this.lookDX = this.lookDY = 0;
    this.movePointer = this.lookPointer = null;
    this.held.clear();
    this.pressed.clear();
    this.moveStick.classList.remove("on");
    this.lookStick.classList.remove("on");
    for (const el of this.buttons.values()) el.classList.remove("on");
  }

  isDown(id: string): boolean {
    return this.held.has(id);
  }
  wasPressed(id: string): boolean {
    return this.pressed.has(id);
  }

  /** Clear one-frame edges and consume look motion. Call once per frame, last. */
  endFrame(): void {
    this.pressed.clear();
    this.lookDX = 0;
    this.lookDY = 0;
  }

  private wanted(e: PointerEvent): boolean {
    return this.active && (this.allowMouse || e.pointerType !== "mouse");
  }

  private onButtonDown = (e: PointerEvent): void => {
    if (!this.wanted(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    const id = el.dataset.btn!;
    el.classList.add("on");
    // The two overlay-only actions fire on press and are never held.
    if (id === "pause") {
      this.onPause?.();
      return;
    }
    if (id === "view") {
      this.onToggleView?.();
      return;
    }
    this.held.add(id);
    this.pressed.add(id);
  };

  private onButtonUp = (e: PointerEvent): void => {
    const el = e.currentTarget as HTMLElement;
    el.classList.remove("on");
    this.held.delete(el.dataset.btn!);
  };

  /** Plant a floating stick wherever the thumb landed. */
  private startStick(e: PointerEvent, which: "move" | "look"): void {
    if (!this.wanted(e)) return;
    e.preventDefault();
    const zone = e.currentTarget as HTMLElement;
    zone.setPointerCapture(e.pointerId);
    const stick = which === "move" ? this.moveStick : this.lookStick;
    stick.classList.add("on");
    stick.style.left = `${e.clientX}px`;
    stick.style.top = `${e.clientY}px`;
    if (which === "move") {
      this.movePointer = e.pointerId;
      this.moveOrigin = { x: e.clientX, y: e.clientY };
      this.moveKnob.style.transform = "translate(-50%, -50%)";
    } else {
      this.lookPointer = e.pointerId;
      this.lookOrigin = { x: e.clientX, y: e.clientY };
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.lookKnob.style.transform = "translate(-50%, -50%)";
    }
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.active) return;
    if (e.pointerId === this.movePointer) {
      e.preventDefault();
      const dx = e.clientX - this.moveOrigin.x;
      const dy = e.clientY - this.moveOrigin.y;
      this.move = stickVector(dx, dy);
      this.sprint = Math.hypot(this.move.x, this.move.y) >= SPRINT_AT;
      this.placeKnob(this.moveKnob, dx, dy);
    } else if (e.pointerId === this.lookPointer) {
      e.preventDefault();
      // Deltas drive the 3D camera; the offset drives 2D aim. One gesture, both.
      this.lookDX += e.clientX - this.lookLast.x;
      this.lookDY += e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
      const dx = e.clientX - this.lookOrigin.x;
      const dy = e.clientY - this.lookOrigin.y;
      this.look = stickVector(dx, dy);
      this.placeKnob(this.lookKnob, dx, dy);
    }
  };

  private placeKnob(knob: HTMLElement, dx: number, dy: number): void {
    const len = Math.hypot(dx, dy);
    const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
    knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId === this.movePointer) {
      this.movePointer = null;
      this.move = { x: 0, y: 0 };
      this.sprint = false;
      this.moveStick.classList.remove("on");
    } else if (e.pointerId === this.lookPointer) {
      this.lookPointer = null;
      this.look = { x: 0, y: 0 };
      this.lookStick.classList.remove("on");
    }
  };
}
