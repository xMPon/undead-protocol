// A single undead. Pure data + tiny helpers; the World runs its steering,
// attacks, and death using the flow-field and player. DOM-free.

import type { Vec2 } from "../core/math";
import type { ZombieState } from "./types";

let NEXT_ID = 1;

export const ZOMBIE_RADIUS = 0.5;
export const ZOMBIE_TOUCH_DAMAGE = 24;
export const ZOMBIE_ATTACK_CADENCE = 0.9; // seconds between swipes
export const ZOMBIE_RISE_TIME = 0.85; // clawing up out of the barrier

export class Zombie {
  readonly id: number;
  pos: Vec2;
  vel: Vec2 = { x: 0, y: 0 };
  facing = 0;
  radius = ZOMBIE_RADIUS;

  /** Absolute height of the feet (world up). */
  footY = 0;
  vz = 0;
  onGround = true;
  /** Seconds spent barely moving while chasing — drives the unstuck nudge. */
  stuckTimer = 0;
  private stuckSign = 1;

  /** Toggle and read the sidestep direction used when unsticking. */
  nextStuckSign(): number {
    this.stuckSign = -this.stuckSign;
    return this.stuckSign;
  }

  maxHealth: number;
  health: number;
  speed: number;

  state: ZombieState = "rising";
  riseTimer = ZOMBIE_RISE_TIME;
  /** Index into `MapDef.barriers` of the boarded window it came through, or -1. */
  barrier = -1;
  /** Seconds until the next plank comes off, while `state` is "breaching". */
  breachTimer = 0;
  attackCooldown = 0;
  hitFlash = 0; // decays — drives white damage flash in renderers
  deadTimer = 0; // time since death, for the renderer's fade-out

  constructor(pos: Vec2, health: number, speed: number) {
    this.id = NEXT_ID++;
    this.pos = { x: pos.x, y: pos.y };
    this.maxHealth = health;
    this.health = health;
    this.speed = speed;
  }

  get isDead(): boolean {
    return this.state === "dead";
  }

  /** Apply damage; returns true if this hit was the kill. */
  damage(amount: number): boolean {
    if (this.state === "dead") return false;
    this.health -= amount;
    this.hitFlash = 1;
    if (this.health <= 0) {
      this.health = 0;
      this.state = "dead";
      return true;
    }
    return false;
  }
}
