// In-game HUD — round, points, health, weapon/ammo, interaction prompt, round
// banner, and the damage vignette. Pure DOM, updated from World each frame.

import type { World } from "../sim/World";
import type { ViewName } from "../render/ViewManager";

export class Hud {
  readonly root: HTMLDivElement;
  private crosshair: HTMLDivElement;
  private vignette: HTMLDivElement;
  private rword: HTMLElement;
  private rnum: HTMLElement;
  private points: HTMLElement;
  private wname: HTMLElement;
  private wammo: HTMLElement;
  private weaponBox: HTMLElement;
  private healthFill: HTMLElement;
  private prompt: HTMLElement;
  private banner: HTMLElement;
  private viewTag: HTMLElement;
  private lookHint: HTMLElement;

  constructor(parent: HTMLElement) {
    this.crosshair = el("div", "", "crosshair");
    this.vignette = el("div", "", "dmg-vignette");

    this.root = document.createElement("div");
    this.root.id = "hud";
    this.root.innerHTML = `
      <div class="hud-round"><div class="rword">Round</div><div class="rnum">1</div></div>
      <div class="hud-points"><span class="plabel">Points</span><span class="pval">500</span></div>
      <div class="hud-weapon"><div class="wname">M9 Sidearm</div><div class="wammo"><span class="mag">12</span> <span class="reserve">/ 96</span></div></div>
      <div class="hud-health"><div class="hlabel">Vitals</div><div class="bar"><div class="fill"></div></div></div>
      <div class="hud-prompt hidden"></div>
      <div class="hud-banner"></div>
      <div class="hud-view-tag">View <b>3D</b> · <span style="color:#7bd651">T</span></div>
      <div class="hud-lookhint hidden">Click to look around<br><b>Q</b> / <b>E</b> turn &nbsp;·&nbsp; <b>Esc</b> for sensitivity</div>
    `;

    parent.appendChild(this.crosshair);
    parent.appendChild(this.vignette);
    parent.appendChild(this.root);

    this.rword = this.root.querySelector(".rword")!;
    this.rnum = this.root.querySelector(".rnum")!;
    this.points = this.root.querySelector(".pval")!;
    this.wname = this.root.querySelector(".wname")!;
    this.wammo = this.root.querySelector(".wammo")!;
    this.weaponBox = this.root.querySelector(".hud-weapon")!;
    this.healthFill = this.root.querySelector(".fill")!;
    this.prompt = this.root.querySelector(".hud-prompt")!;
    this.banner = this.root.querySelector(".hud-banner")!;
    this.lookHint = this.root.querySelector(".hud-lookhint")!;
    this.viewTag = this.root.querySelector(".hud-view-tag")!;
  }

  update(world: World, view: ViewName, locked: boolean): void {
    const p = world.player;

    if (world.rounds.round === 0) {
      this.rword.textContent = "Prepare";
      this.rnum.textContent = "";
    } else {
      this.rword.textContent = "Round";
      this.rnum.textContent = String(world.rounds.round);
    }

    this.points.textContent = String(p.points);

    const def = p.def();
    const inst = p.weapon();
    this.wname.textContent = def.name;
    this.wammo.innerHTML = `<span class="mag">${inst.mag}</span> <span class="reserve">/ ${inst.reserve}</span>`;
    this.weaponBox.classList.toggle("reloading", p.reloadTimer > 0);
    this.weaponBox.classList.toggle("empty", inst.mag === 0 && inst.reserve === 0);

    this.healthFill.style.width = `${p.healthFrac() * 100}%`;

    if (world.prompt) {
      this.prompt.classList.remove("hidden");
      const affordClass = world.prompt.affordable ? "" : "cant";
      this.prompt.className = `hud-prompt ${affordClass}`;
      this.prompt.innerHTML = `<span class="key">[F]</span> ${world.prompt.text} <span class="cost">$${world.prompt.cost}</span>`;
    } else {
      this.prompt.classList.add("hidden");
    }

    this.banner.textContent = world.banner.text;
    this.banner.classList.toggle("show", world.banner.ttl > 0);

    this.viewTag.innerHTML = `View <b>${view.toUpperCase()}</b> · <span style="color:#7bd651">T</span>`;
    this.crosshair.classList.toggle("hidden", view !== "3d");
    // Mouse-look needs pointer lock; without it the player can still turn on the
    // keyboard, so say so rather than leaving them stuck facing one way.
    this.lookHint.classList.toggle("hidden", !(view === "3d" && !locked));
    this.vignette.style.opacity = String(p.damageFlash * 0.7);
  }

  show(): void {
    this.root.classList.remove("hidden");
    this.vignette.classList.remove("hidden");
  }
  hide(): void {
    this.root.classList.add("hidden");
    this.vignette.classList.add("hidden");
    this.crosshair.classList.add("hidden");
  }
}

function el(tag: string, cls: string, id?: string): HTMLDivElement {
  const e = document.createElement(tag) as HTMLDivElement;
  if (cls) e.className = cls;
  if (id) e.id = id;
  return e;
}
