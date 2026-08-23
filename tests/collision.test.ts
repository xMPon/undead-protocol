import { describe, it, expect } from "vitest";
import {
  clampToZones,
  pointInObstacle,
  rayVsCircle,
  rayVsRect,
  resolveCircleRects,
  resolveCircleObstacles,
  supportHeight,
  nearestWallDist,
} from "../src/sim/collision";
import type { WallRect, Obstacle } from "../src/sim/types";

describe("ray vs circle", () => {
  it("hits a circle dead ahead at the near edge", () => {
    const t = rayVsCircle(0, 0, 1, 0, 5, 0, 0.5);
    expect(t).not.toBeNull();
    expect(t!).toBeCloseTo(4.5, 5);
  });

  it("misses a circle off the ray line", () => {
    expect(rayVsCircle(0, 0, 1, 0, 5, 3, 0.5)).toBeNull();
  });

  it("ignores circles behind the origin", () => {
    expect(rayVsCircle(0, 0, 1, 0, -5, 0, 0.5)).toBeNull();
  });
});

describe("ray vs rect", () => {
  const r: WallRect = { minX: 2, minY: -1, maxX: 3, maxY: 1 };
  it("enters at the near face", () => {
    expect(rayVsRect(0, 0, 1, 0, r)).toBeCloseTo(2, 5);
  });
  it("returns null for a rect behind the ray", () => {
    expect(rayVsRect(0, 0, 1, 0, { minX: -3, minY: -1, maxX: -2, maxY: 1 })).toBeNull();
  });
  it("nearestWallDist finds the closest of several", () => {
    const walls: WallRect[] = [
      { minX: 8, minY: -1, maxX: 9, maxY: 1 },
      { minX: 4, minY: -1, maxX: 5, maxY: 1 },
    ];
    expect(nearestWallDist(0, 0, 1, 0, walls)).toBeCloseTo(4, 5);
  });
});

describe("circle vs rect resolution", () => {
  it("pushes a circle out to a clear position", () => {
    const rect: WallRect = { minX: 0.3, minY: -1, maxX: 2, maxY: 1 };
    const out = resolveCircleRects({ x: 0, y: 0 }, 0.5, [rect]);
    // Closest face is the left edge at x=0.3; centre ejected to 0.3 - radius.
    expect(out.x).toBeCloseTo(-0.2, 5);
    expect(out.y).toBeCloseTo(0, 5);
  });

  it("leaves a circle that is already clear untouched", () => {
    const rect: WallRect = { minX: 5, minY: 5, maxX: 6, maxY: 6 };
    const out = resolveCircleRects({ x: 0, y: 0 }, 0.5, [rect]);
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it("ejects a circle whose centre is buried inside the rect", () => {
    const rect: WallRect = { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    const out = resolveCircleRects({ x: 0.2, y: 0.9 }, 0.4, [rect]);
    // Nearest face is the top (maxY=1); pushed above it.
    expect(out.y).toBeCloseTo(1.4, 5);
  });
});

describe("height-aware obstacles (jumping)", () => {
  const crate: Obstacle = { rect: { minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, top: 0.9 };

  it("blocks a grounded entity (feet below the top)", () => {
    const out = resolveCircleObstacles({ x: 0, y: 0 }, 0.4, 0, [crate]);
    expect(out.x !== 0 || out.y !== 0).toBe(true); // pushed off the crate
  });

  it("lets a jumper move across the top", () => {
    const out = resolveCircleObstacles({ x: 0, y: 0 }, 0.4, 1.2, [crate]);
    expect(out).toEqual({ x: 0, y: 0 }); // above the crate, unobstructed
  });

  it("supportHeight rests on the crate top when overhead", () => {
    expect(supportHeight({ x: 0, y: 0 }, 1.0, 0, [crate])).toBeCloseTo(0.9, 5);
  });

  it("supportHeight falls back to the ground beside the crate", () => {
    expect(supportHeight({ x: 2, y: 0 }, 0, 0, [crate])).toBe(0);
  });
});

describe("clampToZones", () => {
  // Two wings that overlap in a 1-unit band, the way a map's doorway joins them.
  const north = { minX: 0, minY: 0, maxX: 20, maxY: 10 };
  const south = { minX: 4, minY: 9, maxX: 16, maxY: 30 };
  const R = 0.5;

  it("leaves a position that already fits somewhere untouched", () => {
    const p = { x: 10, y: 5 };
    expect(clampToZones(p, R, [north, south])).toBe(p);
    expect(clampToZones({ x: 10, y: 25 }, R, [north, south])).toEqual({ x: 10, y: 25 });
  });

  it("keeps the doorway band legal so crossing never snaps you back", () => {
    for (let y = 8; y <= 11; y += 0.25) {
      expect(clampToZones({ x: 10, y }, R, [north, south])).toEqual({ x: 10, y });
    }
  });

  it("pulls an escaped position into the nearest zone", () => {
    expect(clampToZones({ x: 10, y: -4 }, R, [north, south])).toEqual({ x: 10, y: 0.5 });
    expect(clampToZones({ x: 25, y: 5 }, R, [north, south])).toEqual({ x: 19.5, y: 5 });
  });

  it("recovers into whichever zone is nearest, not the one you came from", () => {
    // (1,20) is beside the south wing, in the notch neither zone covers. The
    // shortest way back in is sideways into `south`, and that is what it picks —
    // this only ever fires as a backstop, since walls stop the player first.
    expect(clampToZones({ x: 1, y: 20 }, R, [north, south])).toEqual({ x: 4.5, y: 20 });
  });
});

describe("shaped obstacles", () => {
  const TALL = 1000;
  // A 4x1 box turned 45 degrees. Its AABB corners stick out ~1.06 units past the
  // real box — that overhang is exactly what used to snag the player.
  const spun = {
    rect: { minX: -1.77, minY: -1.77, maxX: 1.77, maxY: 1.77 },
    top: TALL,
    rot: Math.PI / 4,
    half: { x: 2, y: 0.5 },
  };

  it("lets a circle sit in the corner an AABB would have claimed", () => {
    const corner = { x: 1.5, y: -1.5 }; // inside the AABB, well clear of the real box
    expect(pointInObstacle(corner.x, corner.y, spun)).toBe(false);
    const out = resolveCircleObstacles(corner, 0.3, 0, [spun]);
    expect(out).toEqual(corner);
  });

  it("still ejects a circle that is inside the turned box", () => {
    const out = resolveCircleObstacles({ x: 0.2, y: 0.2 }, 0.3, 0, [spun]);
    // Pushed out across the box's short axis, which points north-west.
    expect(Math.hypot(out.x, out.y)).toBeGreaterThan(0.7);
    expect(pointInObstacle(out.x, out.y, spun)).toBe(false);
  });

  it("resolves round obstacles as discs, not squares", () => {
    const drum = { rect: { minX: -0.4, minY: -0.4, maxX: 0.4, maxY: 0.4 }, top: TALL, radius: 0.4 };
    // Diagonally out at the box corner: inside the square, outside the disc.
    const atCorner = { x: 0.38, y: 0.38 };
    expect(pointInObstacle(atCorner.x, atCorner.y, drum)).toBe(false);
    const touching = resolveCircleObstacles({ x: 0.5, y: 0 }, 0.3, 0, [drum]);
    expect(touching.x).toBeCloseTo(0.7, 6); // pushed to exactly radius + radius
    expect(touching.y).toBeCloseTo(0, 6);
  });

  it("ignores obstacles the feet are already above", () => {
    const lowCrate = { rect: { minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, top: 0.9 };
    expect(resolveCircleObstacles({ x: 0, y: 0 }, 0.3, 2, [lowCrate])).toEqual({ x: 0, y: 0 });
  });

  it("only supports a jumper over the real shape", () => {
    const drum = { rect: { minX: -0.4, minY: -0.4, maxX: 0.4, maxY: 0.4 }, top: 0.95, radius: 0.4 };
    expect(supportHeight({ x: 0, y: 0 }, 1.0, 0, [drum])).toBeCloseTo(0.95, 6);
    // The corner of its bounding box is thin air.
    expect(supportHeight({ x: 0.38, y: 0.38 }, 1.0, 0, [drum])).toBe(0);
  });
});
