import { describe, it, expect } from "vitest";
import { rayVsCircle, rayVsRect, resolveCircleRects, nearestWallDist } from "../src/sim/collision";
import type { WallRect } from "../src/sim/types";

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
