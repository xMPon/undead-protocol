// Top-down 2D view. Draws the exact same World the 3D view does, straight onto
// a 2D canvas with the camera centred on the player. Movement is world-relative
// (W = north/up) and aim points at the cursor.

import type { Renderer } from "./Renderer";
import type { World } from "../sim/World";
import type { Input } from "../core/Input";
import type { Intent } from "../sim/types";
import { emptyIntent } from "../sim/types";
import { getWeapon } from "../data/weapons";

const SCALE = 26; // pixels per world unit

export class TopDown2D implements Renderer {
  readonly name = "2d" as const;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private px = 0;
  private py = 0;

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
    this.drawGrid(world);
    this.drawWalls(world);
    this.drawBarriers(world);
    this.drawWallBuys(world);
    this.drawTracers(world);
    this.drawZombies(world);
    this.drawPlayer(world);

    // Screen-space labels for wall-buys.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawLabels(world);
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

  private drawBarriers(world: World): void {
    const ctx = this.ctx;
    for (const barrier of world.map.activeBarriers()) {
      ctx.save();
      ctx.translate(barrier.pos.x, barrier.pos.y);
      ctx.rotate(Math.atan2(barrier.inward.y, barrier.inward.x));
      ctx.fillStyle = "#5a4a33";
      for (let i = -1; i <= 1; i++) ctx.fillRect(-0.15, i * 0.6 - 0.2, 0.3, 0.4);
      ctx.restore();
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

  private drawZombies(world: World): void {
    const ctx = this.ctx;
    for (const z of world.zombies) {
      ctx.save();
      let alpha = 1;
      if (z.isDead) alpha = Math.max(0, 1 - z.deadTimer / 0.6);
      ctx.globalAlpha = alpha;
      // body
      const flash = z.hitFlash;
      const g = Math.floor(120 + flash * 100);
      ctx.fillStyle = z.isDead ? "#4a4a44" : `rgb(${60 + flash * 160},${g},${60})`;
      ctx.beginPath();
      ctx.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2);
      ctx.fill();
      // facing tick
      if (!z.isDead) {
        ctx.strokeStyle = "#1a2a12";
        ctx.lineWidth = 0.12;
        ctx.beginPath();
        ctx.moveTo(z.pos.x, z.pos.y);
        ctx.lineTo(z.pos.x + Math.cos(z.facing) * z.radius, z.pos.y + Math.sin(z.facing) * z.radius);
        ctx.stroke();
        // health ring
        const frac = z.health / z.maxHealth;
        if (frac < 1) {
          ctx.strokeStyle = "#e23b3b";
          ctx.lineWidth = 0.1;
          ctx.beginPath();
          ctx.arc(z.pos.x, z.pos.y, z.radius + 0.15, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  private drawPlayer(world: World): void {
    const ctx = this.ctx;
    const p = world.player;
    ctx.fillStyle = "#4a7bd6";
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    // gun barrel / aim line
    ctx.strokeStyle = "#eef2ff";
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.moveTo(p.pos.x, p.pos.y);
    ctx.lineTo(p.pos.x + Math.cos(p.aim) * 1.1, p.pos.y + Math.sin(p.aim) * 1.1);
    ctx.stroke();
  }

  buildIntent(world: World, input: Input): Intent {
    const intent = emptyIntent();
    let mx = 0;
    let my = 0;
    if (input.isDown("KeyW")) my -= 1;
    if (input.isDown("KeyS")) my += 1;
    if (input.isDown("KeyA")) mx -= 1;
    if (input.isDown("KeyD")) mx += 1;
    intent.move = { x: mx, y: my };

    const wx = world.player.pos.x + (input.mouseX - this.w / 2) / SCALE;
    const wy = world.player.pos.y + (input.mouseY - this.h / 2) / SCALE;
    intent.aim = Math.atan2(wy - world.player.pos.y, wx - world.player.pos.x);

    intent.firing = input.left;
    intent.reload = input.isDown("KeyR");
    intent.interact = input.isDown("KeyF");
    intent.sprint = input.isDown("ShiftLeft") || input.isDown("ShiftRight");
    if (input.wasPressed("Digit1")) intent.switchTo = 0;
    else if (input.wasPressed("Digit2")) intent.switchTo = 1;
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
