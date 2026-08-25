// Bootstrap: build the world + renderers + UI, wire audio hooks, and run the
// state machine (menu → playing → paused/over). Exposes window.__up for
// headless verification, mirroring blockcraft's window.__bc handle.

import "./style.css";
import { World } from "./sim/World";
import { ViewManager } from "./render/ViewManager";
import type { ViewName } from "./render/ViewManager";
import { Input } from "./core/Input";
import { TouchControls, prefersTouch } from "./core/Touch";
import { Sound } from "./core/Sound";
import { Loop } from "./core/Loop";
import { Hud } from "./ui/Hud";
import { Menu, PauseMenu } from "./ui/Menu";
import { GameOver } from "./ui/GameOver";
import { Store, settings } from "./persist/Store";
import { getMap } from "./data/maps";

type State = "menu" | "playing" | "paused" | "over";

const app = document.getElementById("app")!;

const world = new World();
const input = new Input();
input.attach(app);
// Touch is a second input device, not a second code path: it hangs off Input and
// the renderers merge it into the same Intent the keyboard produces.
const touch = new TouchControls();
touch.mount(app);
input.touch = touch;
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

/** Whether on-screen controls should be driving this session. */
function touchWanted(): boolean {
  const mode = settings.touchControls;
  return mode === "on" || (mode === "auto" && prefersTouch());
}

/** Re-read the setting and put the overlay in the right state for `state`. */
function syncTouch(): void {
  const on = touchWanted();
  // Forcing it on from a desktop is how you test the layout, so allow the mouse
  // to drive the sticks in that case only.
  touch.setActive(on, on && !prefersTouch());
  touch.setVisible(state === "playing");
  touch.setViewLabel(vm.currentName() === "3d" ? "2d" : "3d");
}
touch.onPause = () => pauseGame();
touch.onToggleView = () => {
  if (state !== "playing") return;
  vm.toggle(input);
  touch.setViewLabel(vm.currentName() === "3d" ? "2d" : "3d");
};

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
world.onPerk = () => sound.perk();
world.onCacheOpen = () => sound.cacheOpen();
world.onCacheReveal = () => sound.cacheReveal();
world.onCacheMove = () => sound.cacheMove();
world.onThrow = () => sound.throwGrenade();
world.onExplosion = () => sound.explosion();
world.onBoardTear = () => sound.board();
world.onRepair = () => sound.repair();
world.onRevive = () => sound.revive();

// ---- state transitions ----
function startGame(view: ViewName, mapId: string = world.def.id): void {
  sound.resume();
  const def = getMap(mapId);
  // loadMap rebuilds everything derived from the map; reset is the cheaper path
  // when redeploying to the one already loaded.
  if (def !== world.def) world.loadMap(def);
  else world.reset();
  vm.setActive(view, input);
  menu.hide();
  gameover.hide();
  pause.hide();
  hud.show();
  state = "playing";
  syncTouch();
}
function pauseGame(): void {
  if (state !== "playing") return;
  state = "paused";
  input.exitLock();
  pause.show();
  touch.setVisible(false);
}
function resumeGame(): void {
  if (state !== "paused") return;
  state = "playing";
  pause.hide();
  vm.active.onActivate(input);
  // The setting lives in the pause menu, so re-read it on the way out.
  syncTouch();
}
function toMenu(): void {
  state = "menu";
  input.exitLock();
  pause.hide();
  gameover.hide();
  hud.hide();
  menu.show();
  touch.setVisible(false);
}
function toOver(): void {
  state = "over";
  input.exitLock();
  touch.setVisible(false);
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

menu.onStart = (v, mapId) => startGame(v, mapId);
pause.onResume = () => resumeGame();
pause.onQuit = () => toMenu();
gameover.onRestart = () => startGame(vm.currentName());
gameover.onMenu = () => toMenu();

window.addEventListener("resize", () => vm.resize());

// ---- main loop ----
const loop = new Loop((dt) => {
  if (state === "playing") {
    if (input.wasPressed("KeyT")) {
      vm.toggle(input);
      touch.setViewLabel(vm.currentName() === "3d" ? "2d" : "3d");
    }
    if (input.wasPressed("Escape")) pauseGame();
    // Re-acquire pointer lock on click in the 3D view. Pointer lock cannot be
    // re-requested immediately after the browser drops it, so this waits for a
    // deliberate click rather than fighting the browser for it.
    if (vm.currentName() === "3d" && !input.locked && input.left && !touch.active) input.requestLock();

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
  if (state !== "menu") hud.update(world, vm.currentName(), input.locked, touch.active);
  input.endFrame();
  touch.endFrame();
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
  touch,
  start: startGame,
  getState: () => state,
};
