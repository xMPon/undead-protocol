// Top-down 2D view. Draws the exact same World the 3D view does, straight onto
// a 2D canvas with the camera centred on the player. Movement is world-relative
// (W = north/up) and aim points at the cursor.

import type { Renderer } from "./Renderer";
import type { World } from "../sim/World";
import type { Input } from "../core/Input";
import type { Intent, GroundKind, PropKind } from "../sim/types";
import { emptyIntent } from "../sim/types";
import { PROP_SPECS, isSolidProp } from "../sim/props";
import { PERK_MACHINE, CACHE_BOX, SUPPLY_CRATE } from "../sim/fixtures";
import { MAX_BOARDS } from "../sim/Barriers";
import { GRENADE_RADIUS } from "../sim/Grenade";
import { getWeapon } from "../data/weapons";
import { getPerk } from "../data/perks";
import { CACHE_COST } from "../sim/Cache";

const SCALE = 18; // pixels per world unit

// Base RGB per ground kind for the 2D hillshade.
const GROUND2D: Record<GroundKind, [number, number, number]> = {
  concrete: [40, 46, 44],
  snow: [150, 165, 185],
  sand: [120, 100, 66],
  dock: [42, 50, 52],
  quarry: [80, 72, 60],
  grass: [40, 52, 34],
};


const hex = (n: number): string => "#" + (n & 0xffffff).toString(16).padStart(6, "0");
const rgba = (n: number, a: number): string => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;

export class TopDown2D implements Renderer {
  readonly name = "2d" as const;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private px = 0;
  private py = 0;
  /** Last aim heading, held while no pointer or stick is steering it. */
  private aim = 0;

  mount(container: HTMLElement): void {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "view-2d";
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
  }

  private worldTransform(): void {
    this.ctx.setTransform(SCALE, 0, 0, SCALE, this.w / 2 - this.px * SCALE, this.h / 2 - this.py * SCALE);
  }
  private toScreen(wx: number, wy: number): [number, number] {
    return [this.w / 2 + (wx - this.px) * SCALE, this.h / 2 + (wy - this.py) * SCALE];
  }

  render(world: World, _dt: number): void {
    const ctx = this.ctx;
    this.px = world.player.pos.x;
    this.py = world.player.pos.y;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, this.w, this.h);

    this.worldTransform();
    this.drawTerrain(world);
    this.drawFloorDecals(world);
    this.drawGrid(world);
    ctx.globalCompositeOperation = "lighter";
    this.drawLights(world);
    ctx.globalCompositeOperation = "source-over";
    this.drawWalls(world);
    this.drawProps(world);
    this.drawBarriers(world);
    this.drawWallBuys(world);
    this.drawFixtures(world);
    this.drawTracers(world);
    this.drawGrenades(world);
    this.drawZombies(world);
    this.drawPlayer(world);
    this.drawBlasts(world);

    // Screen-space labels for wall-buys.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawLabels(world);
  }

  private drawTerrain(world: World): void {
    const ctx = this.ctx;
    const b = world.def.bounds;
    const base = GROUND2D[world.def.theme?.ground ?? "concrete"];
    const step = 1.0;
    for (let y = b.minY; y < b.maxY; y += step) {
      for (let x = b.minX; x < b.maxX; x += step) {
        const cx = x + step / 2;
        const cy = y + step / 2;
        const h = world.terrain.heightAt(cx, cy);
        // Slope shading: brighten west-facing, darken east-facing.
        const hx = world.terrain.heightAt(cx + 0.5, cy) - world.terrain.heightAt(cx - 0.5, cy);
        const f = Math.max(0.4, Math.min(1.35, 0.72 + h * 0.12 - hx * 0.6));
        ctx.fillStyle = `rgb(${(base[0] * f) | 0},${(base[1] * f) | 0},${(base[2] * f) | 0})`;
        ctx.fillRect(x, y, step + 0.03, step + 0.03);
      }
    }
  }

  /** Floor stains only — wall graffiti has no meaning in a top-down view. */
  private drawFloorDecals(world: World): void {
    const ctx = this.ctx;
    for (const d of world.def.decals ?? []) {
      if ((d.height ?? 1.5) > 0.001) continue;
      const r = (d.scale ?? 1) * 1.3;
      ctx.save();
      ctx.globalAlpha = d.kind === "scorch" ? 0.5 : 0.4;
      ctx.fillStyle = d.kind === "scorch" ? "#141210" : "#5e0d0d";
      ctx.beginPath();
      ctx.ellipse(d.pos.x, d.pos.y, r, r * 0.8, d.rot ?? 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private glow(x: number, y: number, r: number, color: number, a: number): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawLights(world: World): void {
    // Explicit atmosphere lights.
    for (const L of world.def.lights ?? []) this.glow(L.pos.x, L.pos.y, L.range * 0.5, L.color, 0.5);
    // Diegetic sources: pooled under the fixture, thrown forward if it is aimed.
    for (const p of world.def.props ?? []) {
      const s = p.scale ?? 1;
      const dx = Math.cos(p.rot ?? 0);
      const dy = Math.sin(p.rot ?? 0);
      switch (p.kind) {
        case "lamp":
          this.glow(p.pos.x, p.pos.y, 10 * s, p.color ?? PROP_SPECS.lamp.color, 0.5);
          break;
        case "car":
          this.glow(p.pos.x + dx * 4, p.pos.y + dy * 4, 7, 0xfff4e0, 0.45);
          break;
        case "firebarrel":
          this.glow(p.pos.x, p.pos.y, 6 * s, 0xff8a20, 0.6);
          break;
        case "floodlight":
          this.glow(p.pos.x + dx * 4, p.pos.y + dy * 4, 9 * s, p.color ?? 0xfff0cc, 0.5);
          break;
        case "tower":
          this.glow(p.pos.x + dx * 6, p.pos.y + dy * 6, 13 * s, 0xfff0cc, 0.45);
          break;
        case "generator":
          this.glow(p.pos.x, p.pos.y, 2.2 * s, 0x4cff88, 0.35);
          break;
        case "blockhouse":
          this.glow(p.pos.x + dx * 1.4, p.pos.y + dy * 1.4, 4 * s, 0xffd9a0, 0.4);
          break;
        default:
          break;
      }
    }
  }

  private drawProps(world: World): void {
    const ctx = this.ctx;
    ctx.lineWidth = 0.06;
    for (const p of world.def.props ?? []) {
      const s = p.scale ?? 1;
      const spec = PROP_SPECS[p.kind];
      const hx = spec.hx * s;
      const hy = spec.hy * s;
      const blocking = isSolidProp(p);
      ctx.save();
      ctx.translate(p.pos.x, p.pos.y);
      ctx.rotate(p.rot ?? 0);
      // Pass-through dressing is drawn faint, so "solid = cover" stays readable.
      ctx.globalAlpha = blocking ? 1 : 0.4;
      ctx.strokeStyle = blocking ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.25)";
      ctx.fillStyle = p.color !== undefined ? hex(p.color) : hex(spec.color);

      if (spec.parts) {
        // Draw the pieces, not the bounding box — the gap between a tower's legs
        // or through a blockhouse doorway is exactly what the player needs to see.
        for (const part of spec.parts) {
          ctx.fillRect((part.dx - part.hx) * s, (part.dy - part.hy) * s, part.hx * 2 * s, part.hy * 2 * s);
          ctx.strokeRect((part.dx - part.hx) * s, (part.dy - part.hy) * s, part.hx * 2 * s, part.hy * 2 * s);
        }
      } else if (p.kind === "puddle") {
        ctx.beginPath();
        ctx.ellipse(0, 0, hx, hy, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (spec.round) {
        ctx.beginPath();
        ctx.arc(0, 0, hx, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(-hx, -hy, hx * 2, hy * 2);
        ctx.strokeRect(-hx, -hy, hx * 2, hy * 2);
      }

      this.drawPropDetail(p.kind, hx, hy, s);
      ctx.restore();
    }
  }

  /** Per-kind marking drawn in the prop's local frame (+x = its facing). */
  private drawPropDetail(kind: PropKind, hx: number, hy: number, s: number): void {
    const ctx = this.ctx;
    switch (kind) {
      case "car":
        ctx.fillStyle = "#fff4e0";
        ctx.fillRect(hx - 0.12 * s, -hy, 0.12 * s, hy * 2);
        break;
      case "firebarrel":
        ctx.fillStyle = "#ff9a30";
        ctx.beginPath();
        ctx.arc(0, 0, hx * 0.55, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "fence":
        // Chain-link ticks so a fence line reads differently from a wall.
        ctx.strokeStyle = "rgba(200,210,216,0.5)";
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        for (let t = -hx; t <= hx; t += 0.35) {
          ctx.moveTo(t, -hy - 0.12);
          ctx.lineTo(t, hy + 0.12);
        }
        ctx.stroke();
        break;
      case "tower":
        ctx.strokeStyle = "rgba(220,226,232,0.55)";
        ctx.lineWidth = 0.08;
        ctx.beginPath();
        ctx.moveTo(-hx, -hy);
        ctx.lineTo(hx, hy);
        ctx.moveTo(hx, -hy);
        ctx.lineTo(-hx, hy);
        ctx.stroke();
        break;
      case "generator":
        ctx.fillStyle = "#4cff88";
        ctx.fillRect(hx * 0.4, -0.08, 0.16, 0.16);
        break;
      case "concreteBarrier":
        ctx.fillStyle = "#d8b32a";
        for (const dx of [-0.6 * s, 0.6 * s]) ctx.fillRect(dx - 0.16 * s, -hy, 0.32 * s, 0.08);
        break;
      case "wreck":
        ctx.strokeStyle = "rgba(200,90,40,0.5)";
        ctx.lineWidth = 0.07;
        ctx.beginPath();
        ctx.moveTo(-hx * 0.6, -hy * 0.6);
        ctx.lineTo(hx * 0.6, hy * 0.6);
        ctx.stroke();
        break;
      default:
        break;
    }
  }

  private drawGrid(world: World): void {
    const ctx = this.ctx;
    const b = world.def.bounds;
    ctx.strokeStyle = "rgba(80,120,90,0.10)";
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    for (let x = Math.ceil(b.minX); x <= b.maxX; x += 2) {
      ctx.moveTo(x, b.minY);
      ctx.lineTo(x, b.maxY);
    }
    for (let y = Math.ceil(b.minY); y <= b.maxY; y += 2) {
      ctx.moveTo(b.minX, y);
      ctx.lineTo(b.maxX, y);
    }
    ctx.stroke();
  }

  private drawWalls(world: World): void {
    const ctx = this.ctx;
    for (const w of world.def.walls) {
      ctx.fillStyle = "#2c2824";
      ctx.fillRect(w.minX, w.minY, w.maxX - w.minX, w.maxY - w.minY);
    }
    // Closed door
    for (const d of world.def.doors) {
      if (world.map.openedDoors.has(d.id)) continue;
      ctx.fillStyle = "#7a3b1a";
      ctx.fillRect(d.blocks.minX, d.blocks.minY, d.blocks.maxX - d.blocks.minX, d.blocks.maxY - d.blocks.minY);
    }
  }

  /** Barriers, drawn as the planks that are actually still on them. */
  private drawBarriers(world: World): void {
    const ctx = this.ctx;
    world.def.barriers.forEach((barrier, index) => {
      if (!world.map.isRegionActive(barrier.region)) return;
      const left = world.map.boards.at(index);
      ctx.save();
      ctx.translate(barrier.pos.x, barrier.pos.y);
      ctx.rotate(Math.atan2(barrier.inward.y, barrier.inward.x));
      for (let i = 0; i < MAX_BOARDS; i++) {
        const t = (i - (MAX_BOARDS - 1) / 2) * 0.44;
        // Torn planks stay drawn, faintly: the gap is the information.
        ctx.fillStyle = i < left ? "#8a6a3a" : "rgba(90,74,51,0.18)";
        ctx.fillRect(-0.16, t - 0.16, 0.32, 0.32);
      }
      ctx.restore();
    });
  }

  /** Perk machines, The Cache and supply crates, in their real footprints. */
  private drawFixtures(world: World): void {
    const ctx = this.ctx;
    ctx.lineWidth = 0.06;

    for (const m of world.def.perkMachines ?? []) {
      const live = world.map.isRegionActive(m.region);
      const perk = getPerk(m.perkId);
      const held = world.player.hasPerk(m.perkId);
      ctx.save();
      ctx.translate(m.pos.x, m.pos.y);
      ctx.rotate(m.rot ?? 0);
      ctx.globalAlpha = live ? 1 : 0.35;
      ctx.fillStyle = held ? "#3a4a3a" : hex(perk.color);
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(-PERK_MACHINE.hx, -PERK_MACHINE.hy, PERK_MACHINE.hx * 2, PERK_MACHINE.hy * 2);
      ctx.strokeRect(-PERK_MACHINE.hx, -PERK_MACHINE.hy, PERK_MACHINE.hx * 2, PERK_MACHINE.hy * 2);
      // A tick on the face it serves from, so you can see which way to approach.
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillRect(PERK_MACHINE.hx - 0.12, -PERK_MACHINE.hy * 0.6, 0.12, PERK_MACHINE.hy * 1.2);
      ctx.restore();
    }

    for (const crate of world.def.supplies ?? []) {
      if (!world.map.isRegionActive(crate.region)) continue;
      ctx.save();
      ctx.translate(crate.pos.x, crate.pos.y);
      ctx.rotate(crate.rot ?? 0);
      ctx.fillStyle = "#4a5335";
      ctx.strokeStyle = "#d8b32a";
      ctx.fillRect(-SUPPLY_CRATE.hx, -SUPPLY_CRATE.hy, SUPPLY_CRATE.hx * 2, SUPPLY_CRATE.hy * 2);
      ctx.strokeRect(-SUPPLY_CRATE.hx, -SUPPLY_CRATE.hy, SUPPLY_CRATE.hx * 2, SUPPLY_CRATE.hy * 2);
      ctx.restore();
    }

    const site = world.cacheSite();
    if (site && world.map.isRegionActive(site.region)) {
      const open = world.cache.state === "spinning" || world.cache.state === "offering";
      ctx.save();
      ctx.translate(site.pos.x, site.pos.y);
      ctx.rotate(site.rot ?? 0);
      if (open) this.glow(0, 0, 4, 0xffd166, 0.5);
      ctx.fillStyle = "#6b4f2a";
      ctx.strokeStyle = open ? "#ffd166" : "rgba(0,0,0,0.55)";
      ctx.lineWidth = open ? 0.12 : 0.06;
      ctx.fillRect(-CACHE_BOX.hx, -CACHE_BOX.hy, CACHE_BOX.hx * 2, CACHE_BOX.hy * 2);
      ctx.strokeRect(-CACHE_BOX.hx, -CACHE_BOX.hy, CACHE_BOX.hx * 2, CACHE_BOX.hy * 2);
      ctx.restore();
    }
  }

  private drawGrenades(world: World): void {
    const ctx = this.ctx;
    for (const g of world.grenades) {
      const oy = this.liftOf(world, g.pos.x, g.pos.y, g.footY, 0.3);
      ctx.fillStyle = "#c8d24a";
      ctx.beginPath();
      ctx.arc(g.pos.x, g.pos.y + oy, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Detonations, as a ring that expands over the blast's short life. */
  private drawBlasts(world: World): void {
    const ctx = this.ctx;
    for (const b of world.blasts) {
      const k = Math.max(0, Math.min(1, b.ttl / 0.5));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      this.glow(b.pos.x, b.pos.y, GRENADE_RADIUS * (1.1 - k * 0.6), 0xffb340, k * 0.7);
      ctx.restore();
      ctx.strokeStyle = `rgba(255,220,150,${k})`;
      ctx.lineWidth = 0.14;
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, GRENADE_RADIUS * (1 - k * 0.55), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawWallBuys(world: World): void {
    const ctx = this.ctx;
    for (const wb of world.map.activeWallBuys()) {
      ctx.fillStyle = "#3a7a2a";
      ctx.strokeStyle = "#7bd651";
      ctx.lineWidth = 0.06;
      ctx.fillRect(wb.pos.x - 0.5, wb.pos.y - 0.3, 1.0, 0.6);
      ctx.strokeRect(wb.pos.x - 0.5, wb.pos.y - 0.3, 1.0, 0.6);
    }
  }

  private drawLabels(world: World): void {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.font = "bold 13px Rajdhani, sans-serif";
    for (const wb of world.map.activeWallBuys()) {
      const def = getWeapon(wb.weaponId);
      const [sx, sy] = this.toScreen(wb.pos.x, wb.pos.y - 0.6);
      ctx.fillStyle = "#efe7d8";
      ctx.fillText(def.name, sx, sy - 6);
      ctx.fillStyle = "#ffb43a";
      ctx.fillText(`$${def.wallCost || def.ammoCost}`, sx, sy + 8);
    }

    for (const m of world.map.activePerkMachines()) {
      const perk = getPerk(m.perkId);
      const [sx, sy] = this.toScreen(m.pos.x, m.pos.y - 1);
      ctx.fillStyle = "#efe7d8";
      ctx.fillText(perk.name, sx, sy - 6);
      ctx.fillStyle = world.player.hasPerk(perk.id) ? "#7bd651" : "#ffb43a";
      ctx.fillText(world.player.hasPerk(perk.id) ? "HELD" : `$${perk.cost}`, sx, sy + 8);
    }

    const site = world.cacheSite();
    if (site && world.map.isRegionActive(site.region)) {
      const [sx, sy] = this.toScreen(site.pos.x, site.pos.y - 1);
      ctx.fillStyle = "#efe7d8";
      ctx.fillText("The Cache", sx, sy - 6);
      ctx.fillStyle = "#ffd166";
      const showing = world.cache.state === "idle" ? `$${CACHE_COST}` : getWeapon(world.cache.display).name;
      ctx.fillText(showing, sx, sy + 8);
    }
  }

  private drawTracers(world: World): void {
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(255,242,160,0.9)";
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    for (const t of world.tracers) {
      ctx.moveTo(t.from.x, t.from.y);
      ctx.lineTo(t.to.x, t.to.y);
    }
    ctx.stroke();
  }

  /** Shadow + upward screen offset that fakes an entity's jump height. */
  private liftOf(world: World, x: number, y: number, footY: number, radius: number): number {
    const lift = Math.max(0, footY - world.terrain.heightAt(x, y));
    if (lift > 0.05) {
      const ctx = this.ctx;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 0.9, radius * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return -lift * 0.6;
  }

  private drawZombies(world: World): void {
    const ctx = this.ctx;
    for (const z of world.zombies) {
      const oy = z.isDead ? 0 : this.liftOf(world, z.pos.x, z.pos.y, z.footY, z.radius);
      ctx.save();
      let alpha = 1;
      if (z.isDead) alpha = Math.max(0, 1 - z.deadTimer / 0.6);
      ctx.globalAlpha = alpha;
      // body
      const flash = z.hitFlash;
      const g = Math.floor(120 + flash * 100);
      ctx.fillStyle = z.isDead ? "#4a4a44" : `rgb(${60 + flash * 160},${g},${60})`;
      ctx.beginPath();
      ctx.arc(z.pos.x, z.pos.y + oy, z.radius, 0, Math.PI * 2);
      ctx.fill();
      // facing tick
      if (!z.isDead) {
        ctx.strokeStyle = "#1a2a12";
        ctx.lineWidth = 0.12;
        ctx.beginPath();
        ctx.moveTo(z.pos.x, z.pos.y + oy);
        ctx.lineTo(z.pos.x + Math.cos(z.facing) * z.radius, z.pos.y + oy + Math.sin(z.facing) * z.radius);
        ctx.stroke();
        // health ring
        const frac = z.health / z.maxHealth;
        if (frac < 1) {
          ctx.strokeStyle = "#e23b3b";
          ctx.lineWidth = 0.1;
          ctx.beginPath();
          ctx.arc(z.pos.x, z.pos.y + oy, z.radius + 0.15, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  private drawPlayer(world: World): void {
    const ctx = this.ctx;
    const p = world.player;
    const oy = this.liftOf(world, p.pos.x, p.pos.y, p.footY, p.radius);
    ctx.fillStyle = "#4a7bd6";
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y + oy, p.radius, 0, Math.PI * 2);
    ctx.fill();
    // gun barrel / aim line
    ctx.strokeStyle = "#eef2ff";
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.moveTo(p.pos.x, p.pos.y + oy);
    ctx.lineTo(p.pos.x + Math.cos(p.aim) * 1.1, p.pos.y + oy + Math.sin(p.aim) * 1.1);
    ctx.stroke();
  }

  buildIntent(world: World, input: Input, _dt: number): Intent {
    const intent = emptyIntent();
    const touch = input.touch?.active ? input.touch : null;
    let mx = 0;
    let my = 0;
    if (input.isDown("KeyW")) my -= 1;
    if (input.isDown("KeyS")) my += 1;
    if (input.isDown("KeyA")) mx -= 1;
    if (input.isDown("KeyD")) mx += 1;
    // The top-down view is world-relative, so the stick maps straight onto it.
    if (touch) {
      mx += touch.move.x;
      my += touch.move.y;
    }
    intent.move = { x: mx, y: my };

    // Twin-stick aim: where the right stick points is where the player aims, and
    // the last heading is held when the thumb lifts rather than snapping east.
    const look = touch?.look;
    if (look && (look.x !== 0 || look.y !== 0)) {
      this.aim = Math.atan2(look.y, look.x);
    } else if (!touch) {
      const wx = world.player.pos.x + (input.mouseX - this.w / 2) / SCALE;
      const wy = world.player.pos.y + (input.mouseY - this.h / 2) / SCALE;
      this.aim = Math.atan2(wy - world.player.pos.y, wx - world.player.pos.x);
    }
    intent.aim = this.aim;

    intent.firing = input.left || !!touch?.isDown("fire");
    intent.reload = input.isDown("KeyR") || !!touch?.isDown("reload");
    intent.interact = input.isDown("KeyF") || !!touch?.isDown("interact");
    intent.sprint = input.isDown("ShiftLeft") || input.isDown("ShiftRight") || !!touch?.sprint;
    intent.jump = input.isDown("Space") || !!touch?.isDown("jump");
    intent.ads = input.right || !!touch?.isDown("ads");
    intent.grenade = input.isDown("KeyG") || !!touch?.isDown("grenade");
    if (input.wasPressed("Digit1")) intent.switchTo = 0;
    else if (input.wasPressed("Digit2")) intent.switchTo = 1;
    else if (touch?.wasPressed("swap") && world.player.weapons.length > 1) {
      intent.switchTo = (world.player.current + 1) % world.player.weapons.length;
    }
    return intent;
  }

  onActivate(input: Input): void {
    input.exitLock();
  }

  show(): void {
    this.canvas.classList.remove("hidden");
  }
  hide(): void {
    this.canvas.classList.add("hidden");
  }
  dispose(): void {}
}
