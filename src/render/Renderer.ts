// Contract every view implements. A renderer owns its own canvas, translates
// raw Input into a view-specific Intent, and draws the shared World — but never
// mutates it. Swapping renderers changes nothing about the simulation.

import type { World } from "../sim/World";
import type { Input } from "../core/Input";
import type { Intent } from "../sim/types";

export interface Renderer {
  readonly name: "3d" | "2d";
  mount(container: HTMLElement): void;
  show(): void;
  hide(): void;
  resize(w: number, h: number): void;
  render(world: World, dt: number): void;
  /** Read Input (+ world, for player-relative aim) into a view-independent Intent. */
  buildIntent(world: World, input: Input): Intent;
  /** Called when this view becomes active — a hook for pointer-lock etc. */
  onActivate(input: Input): void;
  dispose(): void;
}
