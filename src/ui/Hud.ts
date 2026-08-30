// In-game HUD — round, points, health, weapon/ammo, interaction prompt, round
// banner, and the damage vignette. Pure DOM, updated from World each frame.

import type { World } from "../sim/World";
import type { ViewName } from "../render/ViewManager";
import { PERK_ORDER, getPerk } from "../data/perks";
import { REVIVE_TIME } from "../sim/Perks";

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
  private notice: HTMLElement;
  private intermission: HTMLElement;
  private perkRow: HTMLElement;
  private grenades: HTMLElement;
  private downed: HTMLElement;
  private viewTag: HTMLElement;
  private lookHint: HTMLElement;

  constructor(parent: HTMLElement) {
    this.crosshair = el("div", "", "crosshair");
    this.vignette = el("div", "", "dmg-vignette");

    this.root = document.createElement("div");
    this.root.id = "hud";
    this.root.innerHTML = `
      <div class="hud-round"><div class="rword">Round</div><div class="rnum">1</div></div>
      <div class="hud-intermission hidden"><span class="itag">Next wave in</span><b class="itime">0</b><span class="ikills"></span></div>
      <div class="hud-points"><span class="plabel">Points</span><span class="pval">500</span></div>
      <div class="hud-weapon"><div class="wname">M9 Sidearm</div><div class="wammo"><span class="mag">12</span> <span class="reserve">/ 96</span></div><div class="wnades">Frags <b>2</b></div></div>
      <div class="hud-health"><div class="hlabel">Vitals</div><div class="bar"><div class="fill"></div></div><div class="hud-perks"></div></div>
      <div class="hud-prompt hidden"></div>
      <div class="hud-banner"></div>
      <div class="hud-notice"></div>
      <div class="hud-downed hidden">DOWNED<span></span></div>
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
    this.notice = this.root.querySelector(".hud-notice")!;
    this.intermission = this.root.querySelector(".hud-intermission")!;
    this.perkRow = this.root.querySelector(".hud-perks")!;
    this.grenades = this.root.querySelector(".wnades")!;
    this.downed = this.root.querySelector(".hud-downed")!;
    this.buildPerkChips();
    this.lookHint = this.root.querySelector(".hud-lookhint")!;
    this.viewTag = this.root.querySelector(".hud-view-tag")!;
  }

  /** One chip per perk, dark until it is bought. Built once — only classes move. */
  private buildPerkChips(): void {
    this.perkRow.innerHTML = PERK_ORDER.map((id) => {
      const perk = getPerk(id);
      const color = "#" + (perk.color & 0xffffff).toString(16).padStart(6, "0");
      return `<span class="perk-chip" data-perk="${id}" style="--pc:${color}" title="${perk.name}">${perk.short}</span>`;
    }).join("");
  }

  update(world: World, view: ViewName, locked: boolean, touch = false): void {
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
    this.grenades.innerHTML = `Frags <b>${p.grenades}</b>`;
    this.grenades.classList.toggle("empty", p.grenades === 0);
    for (const chip of this.perkRow.querySelectorAll<HTMLElement>("[data-perk]")) {
      chip.classList.toggle("held", p.hasPerk(chip.dataset.perk!));
    }

    // Down but not out: the clock is the only thing the player can act on, so
    // it is the only thing the overlay shows.
    this.downed.classList.toggle("hidden", !p.downed);
    if (p.downed) {
      const secs = Math.max(0, p.downTimer).toFixed(1);
      this.downed.innerHTML = `DOWNED<span>Second Wind in ${secs}s</span>`;
      this.downed.style.setProperty("--k", String(1 - p.downTimer / REVIVE_TIME));
    }

    if (world.prompt) {
      this.prompt.classList.remove("hidden");
      const affordClass = world.prompt.affordable ? "" : "cant";
      this.prompt.className = `hud-prompt ${affordClass}`;
      const cost = world.prompt.cost > 0 ? ` <span class="cost">$${world.prompt.cost}</span>` : "";
      const key = world.prompt.hold ? "[Hold F]" : "[F]";
      this.prompt.innerHTML = `<span class="key">${key}</span> ${world.prompt.text}${cost}`;
    } else {
      this.prompt.classList.add("hidden");
    }

    this.updateIntermission(world);

    this.banner.textContent = world.banner.text;
    this.banner.classList.toggle("show", world.banner.ttl > 0);
    this.notice.textContent = world.notice.text;
    this.notice.classList.toggle("show", world.notice.ttl > 0);

    this.viewTag.innerHTML = `View <b>${view.toUpperCase()}</b> · <span style="color:#7bd651">T</span>`;
    this.crosshair.classList.toggle("hidden", view !== "3d");
    this.crosshair.classList.toggle("ads", world.ads);
    // Mouse-look needs pointer lock; without it the player can still turn on the
    // keyboard, so say so rather than leaving them stuck facing one way. On touch
    // there is no click to give and no lock to get, so the hint stays down.
    this.lookHint.classList.toggle("hidden", touch || !(view === "3d" && !locked));
    this.vignette.style.opacity = String(p.damageFlash * 0.7);
  }

  /**
   * The gap between waves is the only time the player can spend points, rebuild
   * barriers and reposition, so it gets a visible clock rather than being an
   * unmarked lull. The tally is for the wave that just ended.
   */
  private updateIntermission(world: World): void {
    const r = world.rounds;
    const between = r.phase === "intermission";
    this.intermission.classList.toggle("hidden", !between);
    if (!between) return;
    const secs = Math.max(0, Math.ceil(r.timer));
    this.intermission.querySelector(".itag")!.textContent = r.round === 0 ? "First wave in" : "Next wave in";
    this.intermission.querySelector(".itime")!.textContent = String(secs);
    const kills = world.lastRoundKills;
    this.intermission.querySelector(".ikills")!.textContent =
      r.round === 0 ? "" : `Round ${r.round} cleared · ${kills} ${kills === 1 ? "kill" : "kills"}`;
    // The last three seconds are the ones worth reacting to.
    this.intermission.classList.toggle("urgent", r.timer <= 3);
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
