// The touch layer is mostly DOM plumbing, but the part that decides how the
// game feels in the hand is the stick geometry — deadzone, clamping, and where
// sprint kicks in. That is pure, so it is tested here rather than by thumb.

import { describe, it, expect } from "vitest";
import { stickVector, prefersTouch, STICK_RADIUS, DEADZONE, SPRINT_AT, LOOK_PER_PX } from "../src/core/Touch";

const mag = (v: { x: number; y: number }): number => Math.hypot(v.x, v.y);

describe("stickVector", () => {
  it("reads nothing from a thumb that has not moved", () => {
    expect(stickVector(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("ignores movement inside the deadzone", () => {
    const inside = STICK_RADIUS * DEADZONE * 0.9;
    expect(mag(stickVector(inside, 0))).toBe(0);
  });

  it("starts from zero at the edge of the deadzone rather than jumping", () => {
    // A hair past the deadzone must produce a hair of movement, or the player
    // goes from standing still to a third of walking speed with no warning.
    const justPast = STICK_RADIUS * (DEADZONE + 0.02);
    const v = stickVector(justPast, 0);
    expect(v.x).toBeGreaterThan(0);
    expect(v.x).toBeLessThan(0.1);
  });

  it("reaches exactly full deflection at the stick's radius", () => {
    expect(mag(stickVector(STICK_RADIUS, 0))).toBeCloseTo(1, 6);
    expect(mag(stickVector(0, -STICK_RADIUS))).toBeCloseTo(1, 6);
  });

  it("clamps past the radius instead of running away", () => {
    // Thumbs slide off the stick constantly; that must not become 4x speed.
    const v = stickVector(STICK_RADIUS * 6, STICK_RADIUS * 6);
    expect(mag(v)).toBeCloseTo(1, 6);
  });

  it("keeps the direction the thumb is pointing", () => {
    const v = stickVector(-30, 40);
    expect(Math.atan2(v.y, v.x)).toBeCloseTo(Math.atan2(40, -30), 6);
  });

  it("only counts as a sprint near the edge", () => {
    const half = stickVector(STICK_RADIUS * 0.5, 0);
    const edge = stickVector(STICK_RADIUS, 0);
    expect(mag(half)).toBeLessThan(SPRINT_AT);
    expect(mag(edge)).toBeGreaterThanOrEqual(SPRINT_AT);
  });

  it("honours a custom radius, so the layout can change without new maths", () => {
    expect(mag(stickVector(40, 0, 40))).toBeCloseTo(1, 6);
  });
});

describe("touch detection", () => {
  it("does not assume a window exists", () => {
    // Imported by the sim tests' module graph and by any headless run.
    expect(typeof prefersTouch()).toBe("boolean");
  });
});

describe("look scale", () => {
  it("turns a full-screen drag into somewhat over half a turn", () => {
    // Sanity on the sensitivity constant: a 400px sweep should be a big look,
    // not a spin and not a nudge.
    const radians = 400 * LOOK_PER_PX;
    expect(radians).toBeGreaterThan(0.8);
    expect(radians).toBeLessThan(Math.PI);
  });
});
