// Bootstrap: build the world + renderers + UI, wire audio hooks, and run the
// state machine (menu → playing → paused/over). Exposes window.__up for
// headless verification, mirroring blockcraft's window.__bc handle.

import "./style.css";
import { World } from "./sim/World";
import { ViewManager } from "./render/ViewManager";
import type { ViewName } from "./render/ViewManager";
import { Input } from "./core/Input";
import { Sound } from "./core/Sound";
import { Loop } from "./core/Loop";
import { Hud } from "./ui/Hud";
import { Menu, PauseMenu } from "./ui/Menu";
import { GameOver } from "./ui/GameOver";
import { Store } from "./persist/Store";

type State = "menu" | "playing" | "paused" | "over";

const app = document.getElementById("app")!;

const world = new World();
const input = new Input();
input.attach(app);
const sound = new Sound();
const vm = new ViewManager("3d");
vm.mount(app);
const hud = new Hud(app);
const menu = new Menu(app);
const pause = new PauseMenu(app);
const gameover = new GameOver(app);

let state: State = "menu";
let groanTimer = 2;
hud.hide();

// ---- audio hooks ----
world.onShot = (id) => sound.shot(id);
world.onDryFire = () => sound.dryFire();
world.onReload = () => sound.reload();
world.onHitZombie = () => sound.hit();
world.onKill = () => sound.kill();
world.onHurt = () => sound.hurt();
world.onBuy = () => sound.buy();
world.onDenied = () => sound.denied();
world.onDoor = () => sound.door();
world.onRoundStart = () => sound.roundStart();
world.onDeath = () => sound.death();

// ---- state transitions ----
function startGame(view: ViewName): void {
  sound.resume();
  world.reset();
  vm.setActive(view, input);
  menu.hide();
  gameover.hide();
  pause.hide();
  hud.show();
  state = "playing";
}
function pauseGame(): void {
  if (state !== "playing") return;
  state = "paused";
  input.exitLock();
  pause.show();
}
function resumeGame(): void {
  if (state !== "paused") return;
  state = "playing";
  pause.hide();
  vm.active.onActivate(input);
}
function toMenu(): void {
  state = "menu";
  input.exitLock();
  pause.hide();
  gameover.hide();
  hud.hide();
  menu.show();
}
function toOver(): void {
  state = "over";
  input.exitLock();
  const reached = Math.max(1, world.rounds.round);
  const best = Store.submit(reached);
  gameover.show(reached, best);
}

// Escape in a pointer-locked 3D view never reaches the keyboard handler: the
// browser consumes it to release the mouse. Losing the lock mid-round *is* the
// player asking to stop, so pause on that instead of waiting for a key.
input.onLockChange = (locked) => {
  if (!locked && state === "playing" && vm.currentName() === "3d") pauseGame();
};

menu.onStart = (v) => startGame(v);
pause.onResume = () => resumeGame();
pause.onQuit = () => toMenu();
gameover.onRestart = () => startGame(vm.currentName());
gameover.onMenu = () => toMenu();

window.addEventListener("resize", () => vm.resize());

// ---- main loop ----
const loop = new Loop((dt) => {
  if (state === "playing") {
    if (input.wasPressed("KeyT")) vm.toggle(input);
    if (input.wasPressed("Escape")) pauseGame();
    // Re-acquire pointer lock on click in the 3D view. Pointer lock cannot be
    // re-requested immediately after the browser drops it, so this waits for a
    // deliberate click rather than fighting the browser for it.
    if (vm.currentName() === "3d" && !input.locked && input.left) input.requestLock();

    const intent = vm.buildIntent(world, input, dt);
    world.update(dt, intent);

    groanTimer -= dt;
    if (groanTimer <= 0) {
      if (world.aliveCount() > 0) sound.groan();
      groanTimer = 1.5 + Math.random() * 2.5;
    }
    if (world.gameOver) toOver();
  } else if (state === "paused") {
    if (input.wasPressed("Escape")) resumeGame();
  }

  vm.render(world, dt);
  if (state !== "menu") hud.update(world, vm.currentName(), input.locked);
  input.endFrame();
});
loop.start();

// ---- verification handle ----
(window as unknown as Record<string, unknown>).__up = {
  world,
  vm,
  input,
  hud,
  sound,
  loop,
  start: startGame,
  getState: () => state,
};
