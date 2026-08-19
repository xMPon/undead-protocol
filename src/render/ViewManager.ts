// Holds both renderers, mounts both canvases, and keeps exactly one visible.
// Toggling swaps which renderer receives render()/buildIntent() — the World is
// untouched, so 3D↔2D is seamless mid-round.

import type { Renderer } from "./Renderer";
import type { World } from "../sim/World";
import type { Input } from "../core/Input";
import type { Intent } from "../sim/types";
import { ThirdPerson3D } from "./ThirdPerson3D";
import { TopDown2D } from "./TopDown2D";

export type ViewName = "3d" | "2d";

export class ViewManager {
  readonly r3d = new ThirdPerson3D();
  readonly r2d = new TopDown2D();
  active: Renderer;

  constructor(defaultView: ViewName = "3d") {
    this.active = defaultView === "3d" ? this.r3d : this.r2d;
  }

  mount(container: HTMLElement): void {
    this.r3d.mount(container);
    this.r2d.mount(container);
    this.resize();
    this.applyVisibility();
  }

  private applyVisibility(): void {
    if (this.active === this.r3d) {
      this.r3d.show();
      this.r2d.hide();
    } else {
      this.r2d.show();
      this.r3d.hide();
    }
  }

  setActive(name: ViewName, input: Input): void {
    this.active = name === "3d" ? this.r3d : this.r2d;
    this.applyVisibility();
    this.resize();
    this.active.onActivate(input);
  }

  toggle(input: Input): void {
    this.setActive(this.active === this.r3d ? "2d" : "3d", input);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.r3d.resize(w, h);
    this.r2d.resize(w, h);
  }

  render(world: World, dt: number): void {
    this.active.render(world, dt);
  }
  buildIntent(world: World, input: Input): Intent {
    return this.active.buildIntent(world, input);
  }
  currentName(): ViewName {
    return this.active.name;
  }
}
