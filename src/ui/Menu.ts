// Main menu + pause overlay. Plain DOM (mirrors blockcraft's UI approach — no
// framework). The main-menu Start button lets the player pick which view they
// spawn into; both are always available via the T key in-game.

import type { ViewName } from "../render/ViewManager";
import { settings, updateSettings, DEFAULT_SETTINGS } from "../persist/Store";
import { MAPS, getMap } from "../data/maps";

const CONTROLS: Array<[string, string]> = [
  ["Move", "W A S D"],
  ["Aim", "Mouse"],
  ["Turn", "Q / E or \u2190 \u2192"],
  ["Fire", "Left Click"],
  ["Aim (ADS)", "Right Click"],
  ["Grenade", "G"],
  ["Reload", "R"],
  ["Weapons", "1 / 2"],
  ["Buy / Open", "F"],
  ["Rebuild Barrier", "Hold F"],
  ["Sprint", "Shift"],
  ["Jump", "Space"],
  ["Toggle View", "T"],
  ["Pause / Settings", "Esc"],
];

export class Menu {
  readonly el: HTMLDivElement;
  private view: ViewName = "3d";
  private mapId = getMap(settings.mapId).id;
  private btn3d!: HTMLButtonElement;
  private btn2d!: HTMLButtonElement;
  onStart?: (view: ViewName, mapId: string) => void;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "overlay";
    this.el.innerHTML = `
      <h1>UNDEAD <span class="accent">PROTOCOL</span></h1>
      <div class="tagline">Survive the rounds. There is no evac.</div>
      <div class="map-picker">
        ${MAPS.map(
          (m) => `
          <button class="map-card" data-map="${m.id}">
            <span class="mname">${m.name}</span>
            <span class="mblurb">${m.blurb ?? ""}</span>
            <span class="mmeta">${m.startRegions.length + m.doors.length} areas · ${m.wallBuys.length} wall guns</span>
          </button>`,
        ).join("")}
      </div>
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
      <div class="credit">Phase 2 · ${MAPS.length} maps · perks · The Cache · <a href="./roadmap.html">Roadmap</a> · open-source (MIT)</div>
    `;
    parent.appendChild(this.el);

    this.btn3d = this.el.querySelector('[data-view="3d"]')!;
    this.btn2d = this.el.querySelector('[data-view="2d"]')!;
    this.btn3d.addEventListener("click", () => this.setView("3d"));
    this.btn2d.addEventListener("click", () => this.setView("2d"));
    for (const card of this.el.querySelectorAll<HTMLButtonElement>("[data-map]")) {
      card.addEventListener("click", () => this.setMap(card.dataset.map!));
    }
    this.el.querySelector("[data-start]")!.addEventListener("click", () => this.onStart?.(this.view, this.mapId));
    this.setView("3d");
    this.setMap(this.mapId);
  }

  private setMap(id: string): void {
    this.mapId = id;
    updateSettings({ mapId: id });
    for (const card of this.el.querySelectorAll<HTMLElement>("[data-map]")) {
      card.classList.toggle("selected", card.dataset.map === id);
    }
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

/**
 * Pause overlay, which doubles as the settings screen. Look sensitivity and turn
 * speed live here because they are the two things a player on a trackpad has to
 * change before the game is playable at all, and they persist via Store.
 */
export class PauseMenu {
  readonly el: HTMLDivElement;
  onResume?: () => void;
  onQuit?: () => void;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "overlay hidden";
    this.el.innerHTML = `
      <h1>PAUSED</h1>
      <div class="settings">
        <label>
          <span>Look sensitivity <b data-out="lookSensitivity"></b></span>
          <input type="range" data-set="lookSensitivity" min="0.2" max="4" step="0.1">
        </label>
        <label>
          <span>Turn speed (Q / E) <b data-out="turnSpeed"></b></span>
          <input type="range" data-set="turnSpeed" min="0.2" max="4" step="0.1">
        </label>
        <label class="row">
          <span>Invert look Y</span>
          <input type="checkbox" data-set="invertY">
        </label>
      </div>
      <div class="menu-btns">
        <button class="btn" data-resume>Resume</button>
        <button class="btn secondary" data-reset>Reset Controls</button>
        <button class="btn secondary" data-quit>Return to Menu</button>
      </div>
      <div class="credit">Trackpad? Turn with <b>Q</b> / <b>E</b> and push sensitivity up.</div>
    `;
    parent.appendChild(this.el);
    this.el.querySelector("[data-resume]")!.addEventListener("click", () => this.onResume?.());
    this.el.querySelector("[data-quit]")!.addEventListener("click", () => this.onQuit?.());
    this.el.querySelector("[data-reset]")!.addEventListener("click", () => {
      updateSettings({ ...DEFAULT_SETTINGS });
      this.syncControls();
    });

    for (const input of this.el.querySelectorAll<HTMLInputElement>("[data-set]")) {
      input.addEventListener("input", () => {
        const key = input.dataset.set as "lookSensitivity" | "turnSpeed" | "invertY";
        updateSettings(key === "invertY" ? { invertY: input.checked } : { [key]: Number(input.value) });
        this.syncControls();
      });
    }
    this.syncControls();
  }

  /** Push the live settings back into the widgets (also used after a reset). */
  private syncControls(): void {
    for (const input of this.el.querySelectorAll<HTMLInputElement>("[data-set]")) {
      const key = input.dataset.set as "lookSensitivity" | "turnSpeed" | "invertY";
      if (key === "invertY") input.checked = settings.invertY;
      else input.value = String(settings[key]);
    }
    for (const out of this.el.querySelectorAll<HTMLElement>("[data-out]")) {
      const key = out.dataset.out as "lookSensitivity" | "turnSpeed";
      out.textContent = `${settings[key].toFixed(1)}x`;
    }
  }

  show(): void {
    this.syncControls();
    this.el.classList.remove("hidden");
  }
  hide(): void {
    this.el.classList.add("hidden");
  }
}
