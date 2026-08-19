// Main menu + pause overlay. Plain DOM (mirrors blockcraft's UI approach — no
// framework). The main-menu Start button lets the player pick which view they
// spawn into; both are always available via the T key in-game.

import type { ViewName } from "../render/ViewManager";

const CONTROLS: Array<[string, string]> = [
  ["Move", "W A S D"],
  ["Aim", "Mouse"],
  ["Fire", "Left Click"],
  ["Reload", "R"],
  ["Weapons", "1 / 2"],
  ["Buy / Open", "F"],
  ["Sprint", "Shift"],
  ["Toggle View", "T"],
  ["Pause", "Esc"],
];

export class Menu {
  readonly el: HTMLDivElement;
  private view: ViewName = "3d";
  private btn3d!: HTMLButtonElement;
  private btn2d!: HTMLButtonElement;
  onStart?: (view: ViewName) => void;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "overlay";
    this.el.innerHTML = `
      <h1>UNDEAD <span class="accent">PROTOCOL</span></h1>
      <div class="tagline">Survive the rounds. There is no evac.</div>
      <div class="menu-btns">
        <button class="btn" data-start>Deploy</button>
        <div style="display:flex;gap:10px">
          <button class="btn secondary" data-view="3d" style="flex:1">View: 3D</button>
          <button class="btn secondary" data-view="2d" style="flex:1">View: 2D</button>
        </div>
      </div>
      <div class="controls">
        ${CONTROLS.map(([k, v]) => `<div>${k}</div><div class="k">${v}</div>`).join("")}
      </div>
      <div class="credit">Phase 1 · Blacksite · open-source (MIT)</div>
    `;
    parent.appendChild(this.el);

    this.btn3d = this.el.querySelector('[data-view="3d"]')!;
    this.btn2d = this.el.querySelector('[data-view="2d"]')!;
    this.btn3d.addEventListener("click", () => this.setView("3d"));
    this.btn2d.addEventListener("click", () => this.setView("2d"));
    this.el.querySelector("[data-start]")!.addEventListener("click", () => this.onStart?.(this.view));
    this.setView("3d");
  }

  private setView(v: ViewName): void {
    this.view = v;
    this.btn3d.classList.toggle("secondary", v !== "3d");
    this.btn2d.classList.toggle("secondary", v !== "2d");
  }

  show(): void {
    this.el.classList.remove("hidden");
  }
  hide(): void {
    this.el.classList.add("hidden");
  }
}

export class PauseMenu {
  readonly el: HTMLDivElement;
  onResume?: () => void;
  onQuit?: () => void;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "overlay hidden";
    this.el.innerHTML = `
      <h1>PAUSED</h1>
      <div class="menu-btns">
        <button class="btn" data-resume>Resume</button>
        <button class="btn secondary" data-quit>Return to Menu</button>
      </div>
    `;
    parent.appendChild(this.el);
    this.el.querySelector("[data-resume]")!.addEventListener("click", () => this.onResume?.());
    this.el.querySelector("[data-quit]")!.addEventListener("click", () => this.onQuit?.());
  }

  show(): void {
    this.el.classList.remove("hidden");
  }
  hide(): void {
    this.el.classList.add("hidden");
  }
}
