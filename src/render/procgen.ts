// Procedural three.js assets — albedo + normal-mapped materials, a gradient sky
// dome, and prop meshes, all drawn to offscreen canvases at runtime (no asset
// files). Textures and normal maps are cached module-side and shared across every
// user, so the whole map costs only a handful of GPU textures — the
// performance/beauty balance point: real surface detail without per-object cost.

import * as THREE from "three";
import { hash01 } from "../core/rng";
import type { WallRect, GroundKind, PropKind, WeaponDef, DecalDef, DecalKind } from "../sim/types";

// ---------- low-level canvas helpers ----------

const clamp8 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/** A smooth value-noise sampler over [0,1]² backed by a low-res random grid. */
function smoothNoise(cells: number): (u: number, v: number) => number {
  const g = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < g.length; i++) g[i] = Math.random();
  const at = (x: number, y: number): number => g[y * (cells + 1) + x];
  return (u, v) => {
    const x = u * cells;
    const y = v * cells;
    const x0 = Math.floor(x) % cells;
    const y0 = Math.floor(y) % cells;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/** Build a tangent-space normal map from a height function h(u,v) in [0,1]². */
function normalMapFrom(size: number, h: (u: number, v: number) => number, strength: number): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  const e = 1 / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = i / size;
      const v = j / size;
      const hx = h(u + e, v) - h(u - e, v);
      const hy = h(u, v + e) - h(u, v - e);
      let nx = -hx * strength;
      let ny = -hy * strength;
      const nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv;
      ny *= inv;
      const o = (j * size + i) * 4;
      img.data[o] = clamp8((nx * 0.5 + 0.5) * 255);
      img.data[o + 1] = clamp8((ny * 0.5 + 0.5) * 255);
      img.data[o + 2] = clamp8((nz * inv * 0.5 + 0.5) * 255);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function albedo(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckle(g: CanvasRenderingContext2D, s: number, count: number, base: [number, number, number], jitter: number): void {
  for (let i = 0; i < count; i++) {
    const d = Math.floor((Math.random() - 0.5) * jitter);
    g.fillStyle = `rgb(${clamp8(base[0] + d)},${clamp8(base[1] + d)},${clamp8(base[2] + d)})`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
}

// ---------- cached materials ----------

const GROUND_BASE: Record<GroundKind, [number, number, number]> = {
  concrete: [58, 62, 66],
  snow: [200, 210, 224],
  sand: [156, 128, 84],
  dock: [46, 52, 54],
  quarry: [96, 86, 74],
  grass: [46, 58, 38],
};

let _groundNormal: THREE.Texture | null = null;
const groundNormal = (): THREE.Texture => (_groundNormal ??= normalMapFrom(256, smoothNoise(80), 2.2));

const _groundAlbedo: Partial<Record<GroundKind, THREE.Texture>> = {};
function groundAlbedo(kind: GroundKind): THREE.Texture {
  return (_groundAlbedo[kind] ??= albedo(512, (g, s) => {
    const base = GROUND_BASE[kind];
    g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
    g.fillRect(0, 0, s, s);
    speckle(g, s, 6000, base, 40);
    // aggregate flecks
    for (let i = 0; i < 500; i++) {
      const v = 40 + Math.floor(Math.random() * 60);
      g.fillStyle = `rgba(${v},${v},${v},0.5)`;
      g.beginPath();
      g.arc(Math.random() * s, Math.random() * s, Math.random() * 2 + 0.5, 0, Math.PI * 2);
      g.fill();
    }
    // cracks + oil stains for hard surfaces
    if (kind === "concrete" || kind === "dock" || kind === "quarry") {
      g.strokeStyle = "rgba(0,0,0,0.35)";
      g.lineWidth = 1;
      for (let i = 0; i < 18; i++) {
        g.beginPath();
        let x = Math.random() * s;
        let y = Math.random() * s;
        g.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += (Math.random() - 0.5) * 60;
          y += (Math.random() - 0.5) * 60;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      for (let i = 0; i < 10; i++) {
        g.fillStyle = "rgba(10,10,12,0.18)";
        g.beginPath();
        g.arc(Math.random() * s, Math.random() * s, Math.random() * 30 + 10, 0, Math.PI * 2);
        g.fill();
      }
    }
  }));
}

export function groundMaterial(kind: GroundKind): THREE.MeshStandardMaterial {
  const map = groundAlbedo(kind);
  map.repeat.set(1, 1); // terrain sets per-vertex UVs in world units
  return new THREE.MeshStandardMaterial({
    map,
    normalMap: groundNormal(),
    normalScale: new THREE.Vector2(0.7, 0.7),
    vertexColors: true,
    roughness: 0.97,
    metalness: 0.0,
  });
}

let _wallMap: THREE.Texture | null = null;
let _wallNormal: THREE.Texture | null = null;
export function wallMaterial(): THREE.MeshStandardMaterial {
  _wallMap ??= albedo(256, (g, s) => {
    g.fillStyle = "#5b5f63";
    g.fillRect(0, 0, s, s);
    speckle(g, s, 2600, [91, 95, 99], 34);
    // horizontal form-board lines + streaks
    g.strokeStyle = "rgba(0,0,0,0.18)";
    g.lineWidth = 2;
    for (let y = 0; y < s; y += 64) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(s, y);
      g.stroke();
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = "rgba(30,26,22,0.10)";
      g.fillRect(Math.random() * s, Math.random() * s, 2, Math.random() * 40 + 10);
    }
  });
  _wallNormal ??= normalMapFrom(256, smoothNoise(64), 1.6);
  return new THREE.MeshStandardMaterial({
    map: _wallMap,
    normalMap: _wallNormal,
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.95,
    metalness: 0.02,
  });
}

// Prop textures (shared; colour comes from material.color so the map stays neutral).
let _crateMap: THREE.Texture | null = null;
let _crateNormal: THREE.Texture | null = null;
let _containerMap: THREE.Texture | null = null;
let _containerNormal: THREE.Texture | null = null;
let _metalMap: THREE.Texture | null = null;
let _metalNormal: THREE.Texture | null = null;

function crateMaterial(color?: number): THREE.MeshStandardMaterial {
  _crateMap ??= albedo(256, (g, s) => {
    g.fillStyle = "#caa876"; // neutral-ish wood so tint reads
    g.fillRect(0, 0, s, s);
    const planks = 5;
    const pw = s / planks;
    for (let p = 0; p < planks; p++) {
      // plank grain
      for (let i = 0; i < 60; i++) {
        g.strokeStyle = `rgba(120,90,50,${0.15 + Math.random() * 0.2})`;
        g.lineWidth = 1;
        g.beginPath();
        const y = p * pw + Math.random() * pw;
        g.moveTo(0, y);
        g.bezierCurveTo(s * 0.3, y + (Math.random() - 0.5) * 6, s * 0.6, y + (Math.random() - 0.5) * 6, s, y);
        g.stroke();
      }
      // groove between planks
      g.fillStyle = "rgba(40,26,12,0.55)";
      g.fillRect(0, p * pw - 1, s, 2);
    }
    // corner bolts
    g.fillStyle = "#3a3a3a";
    for (const [bx, by] of [[8, 8], [s - 8, 8], [8, s - 8], [s - 8, s - 8]]) {
      g.beginPath();
      g.arc(bx, by, 4, 0, Math.PI * 2);
      g.fill();
    }
  });
  _crateNormal ??= normalMapFrom(256, (u, v) => {
    const planks = 5;
    const groove = Math.abs(((v * planks) % 1) - 0.0) < 0.06 ? 0 : 0.5;
    return groove + Math.sin(u * Math.PI * 40) * 0.02;
  }, 2.4);
  return new THREE.MeshStandardMaterial({
    map: _crateMap,
    normalMap: _crateNormal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    color: color ?? 0xffffff,
    roughness: 0.85,
    metalness: 0.05,
  });
}

function containerMaterial(color?: number): THREE.MeshStandardMaterial {
  _containerMap ??= albedo(256, (g, s) => {
    g.fillStyle = "#b9bec0"; // neutral metal; material.color tints it
    g.fillRect(0, 0, s, s);
    // vertical rib shading
    const ribs = 18;
    const rw = s / ribs;
    for (let r = 0; r < ribs; r++) {
      const x = r * rw;
      g.fillStyle = "rgba(0,0,0,0.10)";
      g.fillRect(x, 0, rw * 0.4, s);
      g.fillStyle = "rgba(255,255,255,0.06)";
      g.fillRect(x + rw * 0.5, 0, rw * 0.3, s);
    }
    // top/bottom rails
    g.fillStyle = "rgba(0,0,0,0.22)";
    g.fillRect(0, 0, s, 10);
    g.fillRect(0, s - 10, s, 10);
    // rust streaks
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * s;
      const h = Math.random() * 60 + 20;
      g.fillStyle = `rgba(${90 + Math.random() * 40},${45 + Math.random() * 25},20,${0.12 + Math.random() * 0.18})`;
      g.fillRect(x, Math.random() * (s - h), 2 + Math.random() * 2, h);
    }
  });
  _containerNormal ??= normalMapFrom(256, (u) => 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 18), 3.0);
  return new THREE.MeshStandardMaterial({
    map: _containerMap,
    normalMap: _containerNormal,
    normalScale: new THREE.Vector2(1.0, 1.0),
    color: color ?? 0x3a6a8a,
    roughness: 0.55,
    metalness: 0.45,
  });
}

function metalMaterial(color?: number, rough = 0.5): THREE.MeshStandardMaterial {
  _metalMap ??= albedo(128, (g, s) => {
    g.fillStyle = "#9a9ea0";
    g.fillRect(0, 0, s, s);
    speckle(g, s, 900, [154, 158, 160], 40);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = `rgba(${100 + Math.random() * 40},${55 + Math.random() * 25},25,0.2)`;
      g.beginPath();
      g.arc(Math.random() * s, Math.random() * s, Math.random() * 6 + 2, 0, Math.PI * 2);
      g.fill();
    }
  });
  _metalNormal ??= normalMapFrom(128, smoothNoise(40), 1.2);
  return new THREE.MeshStandardMaterial({
    map: _metalMap,
    normalMap: _metalNormal,
    color: color ?? 0xffffff,
    roughness: rough,
    metalness: 0.6,
  });
}

// ---------- terrain, sky, labels ----------

export interface TerrainMeshOpts {
  /**
   * How far the ground keeps going past `bounds` before it ends, in world
   * units. Make it longer than the theme's `fogFar` and the apron has dissolved
   * into haze before its rim, so the level never reads as a slab in the sky.
   */
  apron?: number;
  /** How far the far rim sags below the play area, so it falls out of view. */
  droop?: number;
  /** How deep the rim's vertical skirt hangs, so there is no seeing under it. */
  skirt?: number;
}

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** Smooth value noise on the integer lattice, in [0, 1). Used for far relief. */
function vnoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v00 = hash01(x0, y0, seed);
  const v10 = hash01(x0 + 1, y0, seed);
  const v01 = hash01(x0, y0 + 1, seed);
  const v11 = hash01(x0 + 1, y0 + 1, seed);
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
}

/**
 * Grid lines for one axis: `cell`-spaced across the play area, then geometrically
 * widening steps outward to `apron` on both sides. The apron is most of the
 * ground by area but a handful of rings by vertex count, because nothing out
 * there is ever nearer than the fog.
 */
export function terrainAxis(min: number, max: number, cell: number, apron: number): number[] {
  const outward: number[] = [];
  let step = cell * 2;
  let d = 0;
  while (d < apron - 1e-6) {
    d = Math.min(apron, d + step);
    outward.push(d);
    step *= 1.55;
  }
  const out: number[] = [];
  for (let i = outward.length - 1; i >= 0; i--) out.push(min - outward[i]);
  const n = Math.max(1, Math.ceil((max - min) / cell));
  for (let i = 0; i <= n; i++) out.push(Math.min(max, min + i * cell));
  for (const dd of outward) out.push(max + dd);
  return out;
}

/**
 * Ground height anywhere on the plane, inside `bounds` or out on the apron, plus
 * `t` — how far out it is, 0 at the play area's edge and 1 at the apron's rim.
 *
 * Outside, the height is the nearest edge height blended toward what the world
 * settles to out there. That keeps the seam exact (at `t = 0` it *is* the edge
 * height, so there is no cliff around the level) while letting the distance be
 * its own quiet shape. The far level and its relief come from the map's own
 * perimeter, so the apron continues the ground it is attached to: a rolling yard
 * keeps rolling, and a harbour stays flat water rather than sprouting hills.
 */
export function apronSampler(
  bounds: WallRect,
  heightAt: (x: number, y: number) => number,
  apron: number,
  droop = 5,
): (x: number, y: number) => { h: number; t: number } {
  let sum = 0;
  let sum2 = 0;
  let count = 0;
  const SAMPLES = 48;
  for (let i = 0; i <= SAMPLES; i++) {
    const u = i / SAMPLES;
    const px = bounds.minX + (bounds.maxX - bounds.minX) * u;
    const py = bounds.minY + (bounds.maxY - bounds.minY) * u;
    const edge = [
      heightAt(px, bounds.minY),
      heightAt(px, bounds.maxY),
      heightAt(bounds.minX, py),
      heightAt(bounds.maxX, py),
    ];
    for (const h of edge) {
      sum += h;
      sum2 += h * h;
      count++;
    }
  }
  const farLevel = sum / count;
  const spread = Math.sqrt(Math.max(0, sum2 / count - farLevel * farLevel));
  // Ground with a dead-level perimeter is level on purpose — a harbour, a
  // flooded basin — so its distance stays level too. Anything else gets rolling
  // relief scaled to the map, because a horizon with no shape in it is a
  // backdrop, and a backdrop is the thing that makes a level look pasted on.
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  const relief = spread < 0.02 ? 0 : Math.min(6, Math.max(1.5, spread * 3, span * 0.045));

  return (wx: number, wy: number) => {
    const cx = Math.min(Math.max(wx, bounds.minX), bounds.maxX);
    const cy = Math.min(Math.max(wy, bounds.minY), bounds.maxY);
    const inner = heightAt(cx, cy);
    if (apron <= 0 || (cx === wx && cy === wy)) return { h: inner, t: 0 };
    const t = smoothstep(Math.min(1, Math.hypot(wx - cx, wy - cy) / apron));
    const far =
      farLevel +
      relief * ((vnoise(wx / 62, wy / 62, 911) - 0.5) * 1.5 + (vnoise(wx / 23, wy / 23, 912) - 0.5) * 0.5) -
      droop * t * t;
    return { h: inner + (far - inner) * t, t };
  };
}

export function buildTerrainMesh(
  bounds: WallRect,
  heightAt: (x: number, y: number) => number,
  ground: GroundKind,
  cell = 1,
  opts: TerrainMeshOpts = {},
): THREE.Mesh {
  const apron = Math.max(0, opts.apron ?? 0);
  const skirt = opts.skirt ?? 60;
  const [br, bg, bb] = GROUND_BASE[ground];
  const uvScale = 0.14;

  const sample = apronSampler(bounds, heightAt, apron, opts.droop ?? 5);
  const xs = terrainAxis(bounds.minX, bounds.maxX, cell, apron);
  const ys = terrainAxis(bounds.minY, bounds.maxY, cell, apron);
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  for (const wy of ys) {
    for (const wx of xs) {
      const { h, t } = sample(wx, wy);
      positions.push(wx, h, wy);
      uvs.push(wx * uvScale, wy * uvScale);
      // Height shading, flattened with distance so the apron does not band.
      const f = Math.max(0.5, Math.min(1.15, 0.78 + h * 0.11)) * (1 - 0.18 * t);
      colors.push((br / 255) * f, (bg / 255) * f, (bb / 255) * f);
    }
  }
  const indices: number[] = [];
  const stride = xs.length;
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < stride - 1; i++) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  // A vertical skirt hanging off the rim. The apron is already lost in fog by
  // the time it ends, but from a rooftop or a gallery you can look down past it,
  // and ground you can see the underside of is ground that floats.
  if (apron > 0 && skirt > 0) {
    const last = ys.length - 1;
    const rim: number[] = [];
    for (let i = 0; i < stride; i++) rim.push(i);
    for (let j = 1; j < ys.length; j++) rim.push(j * stride + stride - 1);
    for (let i = stride - 2; i >= 0; i--) rim.push(last * stride + i);
    for (let j = ys.length - 2; j >= 0; j--) rim.push(j * stride);
    const base = positions.length / 3;
    for (const v of rim) {
      positions.push(positions[v * 3], positions[v * 3 + 1] - skirt, positions[v * 3 + 2]);
      uvs.push(uvs[v * 2], uvs[v * 2 + 1]);
      colors.push(colors[v * 3] * 0.55, colors[v * 3 + 1] * 0.55, colors[v * 3 + 2] * 0.55);
    }
    for (let k = 0; k < rim.length - 1; k++) {
      indices.push(rim[k], base + k, rim[k + 1], rim[k + 1], base + k, base + k + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, groundMaterial(ground));
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A large gradient sky dome, unaffected by fog: the horizon glow steeped in
 * `hazeHex` low down, clearing into it a few degrees up, then the sky colour
 * overhead. `hazeHex` is the theme's fog colour — what distant ground fades to
 * — so the two are within a shade of each other where they meet and the level
 * ends in a horizon rather than at an edge.
 */
export function makeSkyDome(topHex: number, horizonHex: number, hazeHex: number, radius = 400): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 32, 48);
  const top = new THREE.Color(topHex);
  const horizon = new THREE.Color(horizonHex);
  const haze = new THREE.Color(hazeHex);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / radius; // -1..1
    // Haze thins with elevation: heaviest on the horizon, gone by the time the
    // eye is up in the sky proper. It only tints the glow rather than replacing
    // it, because a sky that goes *darker* toward the horizon reads as a
    // painted backdrop — the land is what goes dark with distance, not the air
    // above it. Below the eye line the mix holds, so distant ground and the sky
    // it stands against stay within a shade of each other and meet in a horizon.
    c.copy(haze).lerp(horizon, 0.35 + 0.65 * smoothstep(Math.max(0, Math.min(1, y / 0.16))));
    c.lerp(top, Math.pow(Math.max(0, (y - 0.1) / 0.9), 0.7));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1;
  return mesh;
}

export function makeLabelSprite(title: string, sub: string): THREE.Sprite {
  const w = 256;
  const h = 96;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(8,10,9,0.82)";
  roundRect(g, 2, 2, w - 4, h - 4, 10);
  g.fill();
  g.strokeStyle = "rgba(123,214,81,0.5)";
  g.lineWidth = 2;
  roundRect(g, 2, 2, w - 4, h - 4, 10);
  g.stroke();
  g.textAlign = "center";
  g.fillStyle = "#efe7d8";
  g.font = "bold 30px Rajdhani, sans-serif";
  g.fillText(title, w / 2, 42);
  g.fillStyle = "#ffb43a";
  g.font = "bold 26px Rajdhani, sans-serif";
  g.fillText(sub, w / 2, 76);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 0.9, 1);
  return sprite;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}


// ---------- atmosphere ----------

let _dotTex: THREE.Texture | null = null;
/** Soft round particle sprite — shared by dust, smoke, and stars. */
function dotTexture(): THREE.Texture {
  return (_dotTex ??= albedo(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }));
}

/**
 * A fake volumetric light shaft: an additive cone that reads as haze in the
 * beam. Cheap (one transparent mesh) and the single biggest dusk-atmosphere win
 * per draw call, so lamps/floodlights/tower heads all get one.
 */
export function makeLightCone(
  topRadius: number,
  bottomRadius: number,
  height: number,
  color: number,
  opacity = 0.09,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const geo = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 16, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

/**
 * Drifting dust/ash motes. The cloud is a fixed-size box that the renderer
 * re-centres on the camera each frame, so a few hundred points cover the whole
 * map without ever thinning out.
 */
export function makeDustField(count: number, spread: number, height: number, color = 0xb8b09a): THREE.Points {
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread;
    pos[i * 3 + 1] = Math.random() * height;
    pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
    seeds[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("seed", new THREE.Float32BufferAttribute(seeds, 1));
  const mat = new THREE.PointsMaterial({
    size: 0.07,
    map: dotTexture(),
    color,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/** Faint stars for the dusk sky. Sits inside the sky dome, ignores fog. */
export function makeStarField(count: number, radius: number): THREE.Points {
  const pos = new Float32Array(count * 3);
  let written = 0;
  while (written < count) {
    // Rejection-sample the upper hemisphere so stars never sit under the map.
    const x = Math.random() * 2 - 1;
    const y = Math.random();
    const z = Math.random() * 2 - 1;
    const l = Math.hypot(x, y, z);
    if (l < 0.2) continue;
    pos[written * 3] = (x / l) * radius;
    pos[written * 3 + 1] = (y / l) * radius;
    pos[written * 3 + 2] = (z / l) * radius;
    written++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.6,
    map: dotTexture(),
    color: 0xdfe6ff,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = -1;
  return pts;
}

/**
 * A rising smoke column. Particles carry a `seed` attribute; the renderer walks
 * them up and recycles them at the base, so one geometry animates forever with
 * no allocation.
 */
export function makeSmokePlume(count: number, radius: number, height: number, color = 0x2c2a28): THREE.Points {
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * radius;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * height;
    pos[i * 3 + 2] = Math.sin(a) * r;
    seeds[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("seed", new THREE.Float32BufferAttribute(seeds, 1));
  const mat = new THREE.PointsMaterial({
    size: 1.1,
    map: dotTexture(),
    color,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------- props ----------

// Chain-link: one alpha-cut plane instead of thousands of wire cylinders. The
// same canvas feeds map and alphaMap, so the diamonds read as real mesh from
// both sides at a single draw call.
let _chainMap: THREE.Texture | null = null;
function chainlinkMaterial(): THREE.MeshStandardMaterial {
  if (!_chainMap) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = "#b9c0c6";
    g.lineWidth = 2.5;
    g.beginPath();
    for (let i = -128; i < 256; i += 16) {
      g.moveTo(i, 0);
      g.lineTo(i + 128, 128);
      g.moveTo(i, 128);
      g.lineTo(i + 128, 0);
    }
    g.stroke();
    _chainMap = new THREE.CanvasTexture(c);
    _chainMap.wrapS = _chainMap.wrapT = THREE.RepeatWrapping;
    _chainMap.colorSpace = THREE.SRGBColorSpace;
    _chainMap.repeat.set(4, 3);
  }
  return new THREE.MeshStandardMaterial({
    map: _chainMap,
    alphaMap: _chainMap,
    transparent: true,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    color: 0x9aa2a8,
    roughness: 0.7,
    metalness: 0.5,
  });
}

let _signMap: THREE.Texture | null = null;
function signMaterial(): THREE.MeshStandardMaterial {
  _signMap ??= albedo(128, (g, s) => {
    g.fillStyle = "#d8b32a";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#1a1a16";
    g.lineWidth = 6;
    g.strokeRect(6, 6, s - 12, s - 12);
    g.fillStyle = "#1a1a16";
    g.beginPath();
    g.moveTo(s / 2, 24);
    g.lineTo(s - 26, s - 28);
    g.lineTo(26, s - 28);
    g.closePath();
    g.fill();
    g.fillStyle = "#d8b32a";
    g.fillRect(s / 2 - 4, s * 0.42, 8, s * 0.26);
    g.beginPath();
    g.arc(s / 2, s * 0.79, 5, 0, Math.PI * 2);
    g.fill();
  });
  return new THREE.MeshStandardMaterial({ map: _signMap, roughness: 0.8, metalness: 0.1 });
}

const charredMaterial = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.98, metalness: 0.15, flatShading: true });

/** A cover prop whose origin sits on the ground. All meshes cast/receive shadow. */
export function makePropMesh(kind: PropKind, scale = 1, color?: number): THREE.Group {
  const group = new THREE.Group();
  const add = (m: THREE.Mesh): THREE.Mesh => {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  /** Add `m` at a scale-multiplied local position. */
  const at = (m: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh => {
    m.position.set(x * scale, y * scale, z * scale);
    return add(m);
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh =>
    new THREE.Mesh(new THREE.BoxGeometry(w * scale, h * scale, d * scale), mat);
  const cyl = (rt: number, rb: number, h: number, mat: THREE.Material, seg = 12): THREE.Mesh =>
    new THREE.Mesh(new THREE.CylinderGeometry(rt * scale, rb * scale, h * scale, seg), mat);
  const emissive = (hex: number, intensity: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: intensity });

  switch (kind) {
    case "lamp": {
      const poleMat = metalMaterial(0x2a2e33, 0.6);
      at(cyl(0.09, 0.13, 4.0, poleMat, 8), 0, 2.0, 0);
      at(box(0.7, 0.12, 0.12, poleMat), 0.3, 3.95, 0);
      const head = box(0.5, 0.22, 0.4, emissive(color ?? 0xffe0b0, 1.6));
      head.position.set(0.62 * scale, 3.88 * scale, 0);
      head.name = "glow";
      group.add(head);
      return group;
    }
    case "car": {
      const body = metalMaterial(color ?? 0x8a2a2a, 0.35);
      at(box(2.3, 0.55, 1.05, body), 0, 0.5, 0);
      at(box(1.2, 0.5, 0.95, body), -0.15, 0.98, 0);
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.15, metalness: 0.4 });
      at(box(0.06, 0.42, 0.85, glassMat), 0.46, 0.98, 0);
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.9 });
      for (const wx of [-0.8, 0.8]) {
        for (const wz of [-0.52, 0.52]) {
          const wheel = cyl(0.32, 0.32, 0.2, wheelMat);
          wheel.rotation.x = Math.PI / 2;
          at(wheel, wx, 0.32, wz);
        }
      }
      const glow = emissive(0xfff4e0, 1.8);
      for (const sz of [-0.34, 0.34]) {
        const hl = cyl(0.12, 0.12, 0.08, glow);
        hl.rotation.z = Math.PI / 2;
        hl.position.set(1.17 * scale, 0.5 * scale, sz * scale);
        group.add(hl);
      }
      return group;
    }
    case "wreck": {
      // A burnt-out shell: the car silhouette, stripped and slumped.
      const shell = charredMaterial();
      at(box(2.3, 0.5, 1.05, shell), 0, 0.42, 0);
      const cabin = box(1.15, 0.42, 0.9, shell);
      cabin.rotation.z = 0.09;
      at(cabin, -0.15, 0.84, 0);
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 1 });
      // One wheel gone — that corner rests on the rim.
      for (const [wx, wz] of [[-0.8, -0.52], [-0.8, 0.52], [0.8, 0.52]] as const) {
        const wheel = cyl(0.3, 0.3, 0.18, wheelMat);
        wheel.rotation.x = Math.PI / 2;
        at(wheel, wx, 0.28, wz);
      }
      at(box(0.5, 0.1, 0.5, shell), 0.8, 0.12, -0.52);
      const smoke = new THREE.Object3D();
      smoke.name = "smoke";
      smoke.position.set(-0.1 * scale, 1.0 * scale, 0);
      group.add(smoke);
      return group;
    }
    case "barrel": {
      at(cyl(0.35, 0.35, 0.95, metalMaterial(color ?? 0x6e7a52, 0.5), 16), 0, 0.475, 0);
      for (const ry of [0.28, 0.67]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.36 * scale, 0.03 * scale, 6, 16), metalMaterial(0x30302c, 0.7));
        band.rotation.x = Math.PI / 2;
        at(band, 0, ry, 0);
      }
      return group;
    }
    case "firebarrel": {
      // Charred drum with a fire in it; the renderer animates flame + smoke.
      at(cyl(0.35, 0.35, 0.9, metalMaterial(color ?? 0x4a3a2a, 0.95), 16), 0, 0.45, 0);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.35 * scale, 0.04 * scale, 6, 16), metalMaterial(0x241d18, 0.9));
      rim.rotation.x = Math.PI / 2;
      at(rim, 0, 0.9, 0);
      const flame = new THREE.Group();
      flame.name = "flame";
      flame.position.set(0, 0.92 * scale, 0);
      for (const [r, h, hex, op] of [[0.3, 0.9, 0xff8a20, 0.85], [0.18, 1.3, 0xffd070, 0.7]] as const) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(r * scale, h * scale, 8),
          new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        cone.position.y = (h / 2) * scale;
        flame.add(cone);
      }
      group.add(flame);
      const smoke = new THREE.Object3D();
      smoke.name = "smoke";
      smoke.position.set(0, 1.6 * scale, 0);
      group.add(smoke);
      return group;
    }
    case "rock": {
      at(
        new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.6 * scale, 0),
          new THREE.MeshStandardMaterial({ color: color ?? 0x565550, roughness: 1, flatShading: true }),
        ),
        0,
        0.4,
        0,
      );
      return group;
    }
    case "rubble": {
      const mat = new THREE.MeshStandardMaterial({ color: color ?? 0x5a5650, roughness: 1, flatShading: true });
      for (let i = 0; i < 9; i++) {
        const r = 0.13 + Math.random() * 0.22;
        const chunk = new THREE.Mesh(new THREE.IcosahedronGeometry(r * scale, 0), mat);
        chunk.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        at(chunk, (Math.random() - 0.5) * 1.6, r * 0.7, (Math.random() - 0.5) * 1.2);
      }
      const rebarMat = metalMaterial(0x4a3a2a, 0.95);
      for (let i = 0; i < 3; i++) {
        const bar = cyl(0.025, 0.025, 0.9, rebarMat, 5);
        bar.rotation.set(Math.random() * 0.8 - 0.4, Math.random() * 3, 1.1 + Math.random() * 0.5);
        at(bar, (Math.random() - 0.5) * 1.2, 0.3, (Math.random() - 0.5) * 0.8);
      }
      return group;
    }
    case "sandbag": {
      at(box(1.0, 0.42, 0.6, new THREE.MeshStandardMaterial({ color: color ?? 0x8a7a4a, roughness: 0.98 })), 0, 0.21, 0);
      return group;
    }
    case "container": {
      at(box(3.0, 2.4, 1.2, containerMaterial(color)), 0, 1.2, 0);
      return group;
    }
    case "pallet": {
      const wood = crateMaterial(color ?? 0xb08a52);
      for (const dz of [-0.42, 0, 0.42]) at(box(1.2, 0.05, 0.14, wood), 0, 0.03, dz);
      for (const dx of [-0.5, 0, 0.5]) at(box(0.16, 0.16, 1.0, wood), dx, 0.13, 0);
      for (const dz of [-0.44, -0.22, 0, 0.22, 0.44]) at(box(1.2, 0.05, 0.16, wood), 0, 0.24, dz);
      return group;
    }
    case "pipe": {
      // Open-ended so you can see straight through the bore.
      const mat = metalMaterial(color ?? 0x4a5054, 0.85);
      const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * scale, 0.55 * scale, 4.0 * scale, 20, 1, true), mat);
      outer.rotation.z = Math.PI / 2;
      at(outer, 0, 0.55, 0);
      const bore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.47 * scale, 0.47 * scale, 4.0 * scale, 20, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x1c2024, roughness: 1, side: THREE.BackSide }),
      );
      bore.rotation.z = Math.PI / 2;
      at(bore, 0, 0.55, 0);
      for (const dx of [-1.4, 1.4]) at(box(0.16, 0.34, 1.2, metalMaterial(0x3a3f42, 0.9)), dx, 0.17, 0);
      return group;
    }
    case "dumpster": {
      const shell = metalMaterial(color ?? 0x2f5a3a, 0.75);
      at(box(2.0, 1.0, 1.05, shell), 0, 0.55, 0);
      const lid = box(2.05, 0.09, 1.12, metalMaterial(0x24402c, 0.8));
      lid.rotation.z = -0.06;
      at(lid, 0, 1.1, 0);
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 1 });
      for (const wx of [-0.8, 0.8]) {
        for (const wz of [-0.45, 0.45]) {
          const w = cyl(0.11, 0.11, 0.08, wheelMat, 8);
          w.rotation.x = Math.PI / 2;
          at(w, wx, 0.06, wz);
        }
      }
      return group;
    }
    case "concreteBarrier": {
      // Jersey barrier: wide foot, narrow crown, hazard stripes on the face.
      const mat = wallMaterial();
      mat.color.setHex(color ?? 0x9a9992);
      at(box(2.0, 0.3, 0.64, mat), 0, 0.15, 0);
      at(box(2.0, 0.55, 0.34, mat), 0, 0.575, 0);
      const stripe = new THREE.MeshStandardMaterial({ color: 0xd8b32a, roughness: 0.8, emissive: 0x3a2c06 });
      for (const dx of [-0.6, 0.6]) at(box(0.34, 0.4, 0.02, stripe), dx, 0.5, 0.18);
      return group;
    }
    case "deadTree": {
      const bark = new THREE.MeshStandardMaterial({ color: color ?? 0x3b3128, roughness: 1, flatShading: true });
      at(cyl(0.13, 0.3, 3.2, bark, 7), 0, 1.6, 0);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
        const branchLen = 0.9 + Math.random() * 0.8;
        const branch = cyl(0.04, 0.09, branchLen, bark, 5);
        branch.rotation.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9);
        at(branch, Math.cos(a) * 0.4, 2.4 + i * 0.24, Math.sin(a) * 0.4);
      }
      return group;
    }
    case "fence": {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.2 * scale, 2.2 * scale), chainlinkMaterial());
      panel.position.y = 1.15 * scale;
      group.add(panel); // alpha-cut: no shadow casting, it would read as a solid slab
      const postMat = metalMaterial(0x555b60, 0.7);
      for (const px of [-1.6, 0, 1.6]) at(cyl(0.06, 0.06, 2.4, postMat, 6), px, 1.2, 0);
      const rail = cyl(0.05, 0.05, 3.2, postMat, 6);
      rail.rotation.z = Math.PI / 2;
      at(rail, 0, 2.3, 0);
      // Barbed-wire arm leaning outward.
      for (let i = 0; i < 3; i++) {
        const wire = cyl(0.015, 0.015, 3.2, postMat, 4);
        wire.rotation.z = Math.PI / 2;
        at(wire, 0, 2.42 + i * 0.13, -0.06 - i * 0.09);
      }
      return group;
    }
    case "generator": {
      const shell = metalMaterial(color ?? 0x5a6a4a, 0.7);
      at(box(2.2, 1.15, 1.2, shell), 0, 0.575, 0);
      at(box(2.24, 0.12, 1.24, metalMaterial(0x3a4434, 0.8)), 0, 1.2, 0);
      // Radiator grille + exhaust stack.
      const grille = new THREE.MeshStandardMaterial({ color: 0x1c201a, roughness: 1 });
      for (let i = 0; i < 6; i++) at(box(0.02, 0.7, 0.1, grille), 1.11, 0.6, -0.4 + i * 0.16);
      at(cyl(0.09, 0.11, 0.9, metalMaterial(0x2c2c28, 0.9), 8), -0.8, 1.6, -0.4);
      at(box(0.5, 0.36, 0.03, new THREE.MeshStandardMaterial({ color: 0x14181a, roughness: 0.5 })), 0.3, 0.72, 0.61);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.06 * scale, 8, 6), emissive(0x4cff88, 2.2));
      led.name = "glow";
      led.position.set(0.5 * scale, 0.86 * scale, 0.63 * scale);
      group.add(led);
      return group;
    }
    case "tank": {
      const shell = metalMaterial(color ?? 0x7d7f78, 0.6);
      at(cyl(0.95, 0.95, 3.2, shell, 20), 0, 1.9, 0);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.95 * scale, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), shell);
      at(dome, 0, 3.5, 0);
      for (const [lx, lz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]] as const) {
        at(cyl(0.09, 0.09, 0.4, metalMaterial(0x3a3f42, 0.8), 6), lx, 0.2, lz);
      }
      // Service ladder up the side.
      const railMat = metalMaterial(0x4a5054, 0.8);
      for (const dz of [-0.16, 0.16]) at(cyl(0.035, 0.035, 3.4, railMat, 5), 1.0, 1.9, dz);
      for (let i = 0; i < 9; i++) {
        const rung = cyl(0.025, 0.025, 0.32, railMat, 5);
        rung.rotation.x = Math.PI / 2;
        at(rung, 1.0, 0.5 + i * 0.35, 0);
      }
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.96 * scale, 0.05 * scale, 6, 20), metalMaterial(0x50554f, 0.8));
      band.rotation.x = Math.PI / 2;
      at(band, 0, 2.2, 0);
      return group;
    }
    case "tower": {
      // Guard tower: legs + braces + railed platform + roof, floodlit underneath.
      const steel = metalMaterial(color ?? 0x50565c, 0.7);
      for (const [lx, lz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]] as const) {
        at(cyl(0.11, 0.14, 4.4, steel, 6), lx, 2.2, lz);
      }
      for (const [bx, bz, ry] of [[0, -1.3, 0], [0, 1.3, 0], [-1.3, 0, Math.PI / 2], [1.3, 0, Math.PI / 2]] as const) {
        for (const tilt of [0.42, -0.42]) {
          const brace = box(3.2, 0.09, 0.09, steel);
          brace.rotation.set(0, ry, tilt);
          at(brace, bx, 2.2, bz);
        }
      }
      at(box(3.2, 0.16, 3.2, metalMaterial(0x3e444a, 0.85)), 0, 4.5, 0);
      const railMat = metalMaterial(0x4a5054, 0.8);
      for (const [rx, rz, w, d] of [[0, -1.55, 3.2, 0.08], [0, 1.55, 3.2, 0.08], [-1.55, 0, 0.08, 3.2], [1.55, 0, 0.08, 3.2]] as const) {
        at(box(w, 0.08, d, railMat), rx, 5.4, rz);
        at(box(w, 0.08, d, railMat), rx, 4.95, rz);
      }
      for (const [px, pz] of [[-1.55, -1.55], [1.55, -1.55], [-1.55, 1.55], [1.55, 1.55]] as const) {
        at(cyl(0.05, 0.05, 1.0, railMat, 5), px, 5.1, pz);
      }
      at(box(3.5, 0.14, 3.5, metalMaterial(0x33383d, 0.9)), 0, 6.3, 0);
      for (const [px, pz] of [[-1.55, -1.55], [1.55, 1.55]] as const) at(cyl(0.06, 0.06, 1.1, railMat, 5), px, 5.75, pz);
      const head = box(0.5, 0.3, 0.7, emissive(0xfff0cc, 1.8));
      head.name = "glow";
      head.position.set(1.3 * scale, 6.05 * scale, 0);
      group.add(head);
      return group;
    }
    case "antenna": {
      // Lattice mast: three legs + rungs, a dish, and a red aircraft beacon.
      const steel = metalMaterial(color ?? 0x585e64, 0.7);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        at(cyl(0.05, 0.07, 9.0, steel, 5), Math.cos(a) * 0.3, 4.5, Math.sin(a) * 0.3);
      }
      for (let i = 0; i < 12; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3 * scale, 0.022 * scale, 4, 3), steel);
        ring.rotation.x = Math.PI / 2;
        at(ring, 0, 0.6 + i * 0.72, 0);
      }
      const dish = cyl(0.6, 0.6, 0.09, metalMaterial(0xb9bec0, 0.5), 16);
      dish.rotation.set(Math.PI / 2, 0, 0.5);
      at(dish, 0.5, 6.2, 0);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14 * scale, 8, 6), emissive(0xff3020, 2.4));
      beacon.name = "beacon";
      beacon.position.y = 9.3 * scale;
      group.add(beacon);
      return group;
    }
    case "floodlight": {
      const steel = metalMaterial(0x44494e, 0.7);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = cyl(0.04, 0.05, 2.0, steel, 5);
        leg.rotation.set(Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28);
        at(leg, Math.cos(a) * 0.28, 1.0, Math.sin(a) * 0.28);
      }
      at(cyl(0.06, 0.06, 0.5, steel, 6), 0, 2.05, 0);
      const housing = box(0.4, 0.55, 0.8, steel);
      housing.rotation.z = -0.3;
      at(housing, 0, 2.35, 0);
      const lens = box(0.05, 0.44, 0.68, emissive(color ?? 0xfff0cc, 2.4));
      lens.rotation.z = -0.3;
      lens.name = "glow";
      lens.position.set(0.24 * scale, 2.28 * scale, 0);
      group.add(lens);
      return group;
    }
    case "blockhouse": {
      // A walk-in outbuilding. The shell is modelled as separate wall slabs so
      // the doorway is a real gap you can see through, matching the collider.
      const shell = wallMaterial();
      shell.color.setHex(color ?? 0x6a6963);
      const h = 3.0;
      at(box(0.3, h, 3.6, shell), -1.85, h / 2, 0); // back
      at(box(4.0, h, 0.3, shell), 0, h / 2, -1.65); // left
      at(box(4.0, h, 0.3, shell), 0, h / 2, 1.65); // right
      at(box(0.3, h, 0.7, shell), 1.85, h / 2, -1.45); // front, either side
      at(box(0.3, h, 0.7, shell), 1.85, h / 2, 1.45); //   of the doorway
      // Lintel over the opening, and a flat roof with a lip.
      at(box(0.3, 0.55, 2.2, shell), 1.85, h - 0.28, 0);
      const roof = box(4.3, 0.22, 3.9, metalMaterial(0x4a4e52, 0.85));
      at(roof, 0, h + 0.11, 0);
      at(box(4.5, 0.14, 4.1, shell), 0, h + 0.28, 0);
      // Dark interior floor so the inside reads as sheltered, not painted-on.
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4 * scale, 3.0 * scale),
        new THREE.MeshStandardMaterial({ color: 0x2a2926, roughness: 1 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.02 * scale;
      floor.receiveShadow = true;
      group.add(floor);
      // Barred window on the back wall, and a lamp inside the doorway.
      const barMat = metalMaterial(0x3a3f42, 0.8);
      at(box(0.06, 0.7, 1.1, new THREE.MeshStandardMaterial({ color: 0x11161a, roughness: 0.3, metalness: 0.4 })), -1.98, 1.9, 0);
      for (let i = 0; i < 4; i++) at(cyl(0.03, 0.03, 0.75, barMat, 5), -2.02, 1.9, -0.45 + i * 0.3);
      const lamp = box(0.3, 0.12, 0.5, emissive(0xffd9a0, 1.8));
      lamp.name = "glow";
      lamp.position.set(1.3 * scale, 2.7 * scale, 0);
      group.add(lamp);
      return group;
    }
    case "cone": {
      const orange = new THREE.MeshStandardMaterial({ color: color ?? 0xd85a1e, roughness: 0.85 });
      at(box(0.44, 0.05, 0.44, orange), 0, 0.025, 0);
      at(new THREE.Mesh(new THREE.ConeGeometry(0.17 * scale, 0.5 * scale, 10), orange), 0, 0.3, 0);
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.12 * scale, 0.03 * scale, 5, 10),
        new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.7 }),
      );
      band.rotation.x = Math.PI / 2;
      at(band, 0, 0.3, 0);
      return group;
    }
    case "sign": {
      const postMat = metalMaterial(0x50565c, 0.8);
      for (const dx of [-0.42, 0.42]) at(cyl(0.04, 0.04, 1.9, postMat, 5), dx, 0.95, 0);
      at(box(1.1, 0.85, 0.05, signMaterial()), 0, 1.5, 0);
      return group;
    }
    case "puddle": {
      // Near-mirror roughness so lamps and headlights streak across it.
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1.2 * scale, 20),
        new THREE.MeshStandardMaterial({ color: color ?? 0x10161a, roughness: 0.06, metalness: 0.75, transparent: true, opacity: 0.85 }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.scale.set(1, 0.75, 1);
      disc.position.y = 0.02 * scale;
      disc.receiveShadow = true;
      group.add(disc);
      return group;
    }
    default: {
      at(box(0.9, 0.9, 0.9, crateMaterial(color)), 0, 0.45, 0);
      return group;
    }
  }
}

/**
 * A point-gated door: steel double leaves in a frame, hazard chevrons, a keypad
 * with a live LED, and the price on a sign above it. Built spanning local X with
 * its thickness in Z — the renderer turns it to match the wall gap it fills.
 */
export function makeDoorMesh(width: number, height: number, thickness: number, name: string, cost: number): THREE.Group {
  const g = new THREE.Group();
  const steel = metalMaterial(0x6a4a2c, 0.55);
  const dark = new THREE.MeshStandardMaterial({ color: 0x24211d, roughness: 0.8, metalness: 0.4 });

  const frame = new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), steel);
  frame.castShadow = true;
  frame.receiveShadow = true;
  g.add(frame);

  // Two leaves with a seam down the middle and a recessed panel each.
  const leafW = width * 0.46;
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, height * 0.82, thickness * 1.5), steel);
    leaf.position.set(side * width * 0.24, -height * 0.05, 0);
    leaf.castShadow = true;
    g.add(leaf);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(leafW * 0.7, height * 0.4, thickness * 0.4), dark);
    panel.position.set(side * width * 0.24, height * 0.12, thickness * 0.9);
    g.add(panel);
    // Wired-glass viewport.
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(leafW * 0.42, height * 0.13, thickness * 0.3),
      new THREE.MeshStandardMaterial({ color: 0x1b2a22, roughness: 0.25, metalness: 0.3, emissive: 0x0a1a12 }),
    );
    glass.position.set(side * width * 0.24, height * 0.3, thickness * 1.0);
    g.add(glass);
  }

  // Hazard chevrons along the bottom rail.
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xd8b32a, roughness: 0.75, emissive: 0x3a2c06 });
  const stripes = Math.max(3, Math.floor(width / 0.42));
  for (let i = 0; i < stripes; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(width / stripes * 0.45, height * 0.1, thickness * 0.25), stripeMat);
    stripe.position.set(-width / 2 + (i + 0.5) * (width / stripes), -height * 0.38, thickness * 0.95);
    stripe.rotation.z = 0.5;
    g.add(stripe);
  }

  // Keypad — the thing you actually press F on.
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.1), dark);
  pad.position.set(width * 0.5 + 0.14, 0.1, thickness * 0.6);
  g.add(pad);
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff3020, emissiveIntensity: 2.5 }),
  );
  led.name = "led";
  led.position.set(width * 0.5 + 0.14, 0.22, thickness * 0.6 + 0.05);
  g.add(led);

  const label = makeLabelSprite(name.replace(/^Open\s+/i, "").toUpperCase(), `$${cost}`);
  label.position.set(0, height * 0.62, 0);
  g.add(label);
  return g;
}

// ---------- phase 2 fixtures ----------

/**
 * A perk machine: a lit cabinet with a glowing face, a livery band in the perk's
 * colour, and its name over the top. Its front is local +x, matching props, so
 * the map's `rot` points it into the room the same way everything else does.
 */
export function makePerkMachineMesh(color: number, name: string, short: string, cost: number): THREE.Group {
  const g = new THREE.Group();
  const shell = metalMaterial(0x2b2f33, 0.55);
  // Sized from PERK_MACHINE (hx 0.55 across the sim x axis, hy 0.45 across y).
  // Three's z is the sim's y, so the wide side is x and the shallow side is z —
  // get these the wrong way round and the cabinet you see is 90 degrees out from
  // the box that stops you.
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.9), shell);
  body.position.y = 1.05;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Glowing display face on the +x side, dimmed and brightened by the light rig.
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 1.15),
    new THREE.MeshStandardMaterial({
      map: perkFaceTexture(color, short),
      emissive: color,
      emissiveIntensity: 0.9,
      roughness: 0.4,
      transparent: false,
    }),
  );
  face.name = "glow";
  face.position.set(0.56, 1.28, 0);
  face.rotation.y = Math.PI / 2;
  g.add(face);

  // Kick plate and a colour band round the shoulders, so it reads from behind too.
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(1.14, 0.16, 0.94),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.5 }),
  );
  band.position.y = 1.98;
  g.add(band);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 1.0), metalMaterial(0x1a1d20, 0.7));
  foot.position.y = 0.06;
  foot.receiveShadow = true;
  g.add(foot);

  const label = makeLabelSprite(name.toUpperCase(), `$${cost}`);
  label.position.set(0, 2.55, 0);
  g.add(label);
  return g;
}

const _perkFaces = new Map<string, THREE.Texture>();
/** The cabinet's front: a big initial over a wash of the perk's colour. */
function perkFaceTexture(color: number, short: string): THREE.Texture {
  const key = `${color}:${short}`;
  const hit = _perkFaces.get(key);
  if (hit) return hit;
  const hex = "#" + (color & 0xffffff).toString(16).padStart(6, "0");
  const tex = albedo(128, (g, size) => {
    const grad = g.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, hex);
    grad.addColorStop(1, "#0d0f11");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = 6;
    g.strokeRect(3, 3, size - 6, size - 6);
    g.fillStyle = "#0a0b0c";
    g.textAlign = "center";
    g.font = "bold 76px Rajdhani, sans-serif";
    g.fillText(short, size / 2, size * 0.66);
  });
  _perkFaces.set(key, tex);
  return tex;
}

/**
 * The Cache: a strapped crate whose lid lifts. `lid` is a pivot the renderer
 * rotates open, and `beam` is the shaft of light that only shows while it is.
 */
export function makeCacheMesh(): THREE.Group {
  const g = new THREE.Group();
  const timber = crateMaterial(0xb08a56);
  const iron = metalMaterial(0x3a3d40, 0.6);

  const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 1.24), timber);
  box.position.y = 0.4;
  box.castShadow = true;
  box.receiveShadow = true;
  g.add(box);
  for (const dx of [-0.62, 0.62]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.86, 1.3), iron);
    strap.position.set(dx, 0.4, 0);
    g.add(strap);
  }

  // Lid hinged along the back edge (−z), so it opens toward the player.
  const lid = new THREE.Group();
  lid.name = "lid";
  lid.position.set(0, 0.8, -0.62);
  const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.12, 1.28), timber);
  lidMesh.position.set(0, 0.06, 0.62);
  lidMesh.castShadow = true;
  lid.add(lidMesh);
  g.add(lid);

  const beam = makeLightCone(1.1, 0.55, 3.2, 0xffd166, 0.14);
  beam.name = "beam";
  beam.position.y = 2.4;
  beam.visible = false;
  g.add(beam);

  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.05, 1.05),
    new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 1.4 }),
  );
  glow.name = "glow";
  glow.position.y = 0.79;
  g.add(glow);
  return g;
}

/** A grenade resupply crate: low, olive, stencilled. */
export function makeSupplyMesh(): THREE.Group {
  const g = new THREE.Group();
  const olive = new THREE.MeshStandardMaterial({ color: 0x4a5335, roughness: 0.85, metalness: 0.1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.62, 0.9), olive);
  body.position.y = 0.31;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.1, 0.96), metalMaterial(0x39412a, 0.7));
  lid.position.y = 0.66;
  g.add(lid);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(1.22, 0.1, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xd8b32a, emissive: 0x3a2c06, roughness: 0.7 }),
  );
  stripe.position.set(0, 0.36, 0.46);
  g.add(stripe);
  return g;
}

/** A single frag grenade — a body the renderer spins as it flies. */
export function makeGrenadeMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x3d4a2c, roughness: 0.7, metalness: 0.3 }),
  );
  mesh.castShadow = true;
  mesh.visible = false;
  return mesh;
}

/**
 * One plank on a barrier. The renderer builds `MAX_BOARDS` of them per barrier
 * and hides them as they are torn off, so a stripped window reads at a glance.
 */
export function makeBoardMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.24, 0.12), crateMaterial(0xa07a44));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** The flash of a detonation: a shell the renderer scales up and fades out. */
export function makeExplosionMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffb340, transparent: true, opacity: 0, depthWrite: false }),
  );
  mesh.visible = false;
  return mesh;
}

// ---------- characters ----------

/**
 * A jointed body the renderer can pose. Limbs hang off pivot Groups placed at
 * the joint, so animating is a matter of setting rotations — no skinning, no
 * skeleton, and nothing to load.
 */
export interface CharacterRig {
  group: THREE.Group;
  /** Everything above the hips; leaned and bobbed as a unit. */
  upper: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  /** Materials tinted for the hit flash. */
  flesh: THREE.MeshStandardMaterial[];
  /** Where a held weapon is parented (right hand). */
  hand: THREE.Group;
}

/** A limb: a pivot Group at the joint with the limb hanging below it. */
function limb(length: number, radius: number, mat: THREE.Material, taper = 0.85): THREE.Group {
  const pivot = new THREE.Group();
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length * 0.5, 3, 6), mat);
  upper.position.y = -length * 0.27;
  upper.castShadow = true;
  pivot.add(upper);
  const lower = new THREE.Mesh(new THREE.CapsuleGeometry(radius * taper, length * 0.45, 3, 6), mat);
  lower.position.y = -length * 0.75;
  lower.castShadow = true;
  pivot.add(lower);
  return pivot;
}

const HAIR_COLORS = [0x2b2118, 0x4a3a28, 0x6b6257, 0x1c1a18, 0x87765c];
const ZOMBIE_CLOTH = [0x35404a, 0x4a4438, 0x2f3a33, 0x53433c, 0x3b3f52, 0x5a5148];

/**
 * A shambler. Every one is built a little differently — height, skin, clothing,
 * hair, and one in six missing an arm — so a horde never reads as one model
 * repeated. `seed` picks the variant deterministically enough for variety.
 */
export function makeZombieRig(): CharacterRig {
  const group = new THREE.Group();
  const scale = 0.92 + Math.random() * 0.22;
  group.scale.setScalar(scale);

  const skin = new THREE.Color().setHSL(0.26 + (Math.random() - 0.5) * 0.08, 0.3, 0.24 + Math.random() * 0.06);
  const fleshMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.94 });
  const faceMat = new THREE.MeshStandardMaterial({ color: skin.clone().lerp(new THREE.Color(0xc7b48a), 0.3), roughness: 0.88 });
  const cloth = ZOMBIE_CLOTH[Math.floor(Math.random() * ZOMBIE_CLOTH.length)];
  const clothMat = new THREE.MeshStandardMaterial({ color: cloth, roughness: 1 });
  const trouserMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(cloth).multiplyScalar(0.6), roughness: 1 });

  // --- lower body: legs hang from the hips ---
  const legL = limb(0.86, 0.11, trouserMat);
  const legR = limb(0.86, 0.11, trouserMat);
  legL.position.set(-0.16, 0.9, 0);
  legR.position.set(0.16, 0.9, 0);
  group.add(legL, legR);
  for (const [leg, side] of [[legL, -1], [legR, 1]] as const) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.11, 0.3), trouserMat);
    boot.position.set(0, -0.86, 0.05);
    boot.castShadow = true;
    leg.add(boot);
    void side;
  }

  // --- upper body ---
  const upper = new THREE.Group();
  upper.position.y = 0.9;
  group.add(upper);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 10), clothMat);
  torso.position.y = 0.3;
  torso.castShadow = true;
  upper.add(torso);

  // A ragged, flapping hem below the shirt.
  const hem = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.26, 8, 1, true), clothMat);
  hem.position.y = 0.04;
  hem.rotation.x = Math.PI;
  hem.castShadow = true;
  upper.add(hem);

  // Old wound on the chest — the reason it is walking about.
  const wound = new THREE.Mesh(
    new THREE.CircleGeometry(0.09, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a0f0f, roughness: 1 }),
  );
  wound.position.set((Math.random() - 0.5) * 0.2, 0.34, 0.255);
  upper.add(wound);

  const head = new THREE.Group();
  head.position.y = 0.72;
  upper.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), faceMat);
  skull.scale.set(1, 1.08, 1.05);
  skull.castShadow = true;
  head.add(skull);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.09, 0.16), faceMat);
  jaw.position.set(0, -0.14, 0.07);
  jaw.rotation.x = 0.25; // hanging open
  head.add(jaw);
  const hairMat = new THREE.MeshStandardMaterial({ color: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)], roughness: 1 });
  if (Math.random() > 0.25) {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.205, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hair.position.y = 0.03;
    head.add(hair);
  }
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xd8d2b8, emissive: 0x2a2a18, roughness: 0.6 });
  for (const ex of [-0.075, 0.075]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), eyeMat);
    eye.position.set(ex, 0.02, 0.175);
    head.add(eye);
  }

  // --- arms, reaching ---
  const armL = limb(0.72, 0.085, fleshMat);
  const armR = limb(0.72, 0.085, fleshMat);
  armL.position.set(-0.3, 0.58, 0);
  armR.position.set(0.3, 0.58, 0);
  // One in six has lost an arm somewhere.
  const missing = Math.random() < 0.16 ? (Math.random() < 0.5 ? armL : armR) : null;
  for (const arm of [armL, armR]) if (arm !== missing) upper.add(arm);
  if (missing) {
    const stump = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.16, 3, 6), fleshMat);
    stump.position.set(missing === armL ? -0.3 : 0.3, 0.5, 0);
    upper.add(stump);
  }

  const hand = new THREE.Group(); // unused for zombies, keeps the rig uniform
  armR.add(hand);

  group.visible = false;
  return { group, upper, head, armL, armR, legL, legR, flesh: [fleshMat, faceMat], hand };
}

/** The player: same jointed rig, kitted out, with a weapon socket in the hands. */
export function makePlayerRig(): CharacterRig {
  const group = new THREE.Group();
  const gear = new THREE.MeshStandardMaterial({ color: 0x33465c, roughness: 0.6, metalness: 0.2, transparent: true });
  const webbing = new THREE.MeshStandardMaterial({ color: 0x232b33, roughness: 0.85, transparent: true });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc7a488, roughness: 0.7, transparent: true });
  const trousers = new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.9, transparent: true });

  const legL = limb(0.9, 0.13, trousers);
  const legR = limb(0.9, 0.13, trousers);
  legL.position.set(-0.17, 0.95, 0);
  legR.position.set(0.17, 0.95, 0);
  group.add(legL, legR);
  for (const leg of [legL, legR]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.13, 0.32), webbing);
    boot.position.set(0, -0.9, 0.05);
    boot.castShadow = true;
    leg.add(boot);
  }

  const upper = new THREE.Group();
  upper.position.y = 0.95;
  group.add(upper);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.29, 0.5, 5, 12), gear);
  torso.position.y = 0.3;
  torso.castShadow = true;
  upper.add(torso);
  // Plate carrier + pouches, so the silhouette is not a bare capsule.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.44, 0.34), webbing);
  plate.position.y = 0.36;
  plate.castShadow = true;
  upper.add(plate);
  for (const px of [-0.14, 0.14]) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.1), webbing);
    pouch.position.set(px, 0.13, 0.2);
    upper.add(pouch);
  }

  const head = new THREE.Group();
  head.position.y = 0.75;
  upper.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), skinMat);
  skull.castShadow = true;
  head.add(skull);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.245, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), webbing);
  helmet.position.y = 0.02;
  helmet.castShadow = true;
  head.add(helmet);

  const armL = limb(0.74, 0.1, gear);
  const armR = limb(0.74, 0.1, gear);
  armL.position.set(-0.33, 0.6, 0);
  armR.position.set(0.33, 0.6, 0);
  upper.add(armL, armR);

  // Weapon socket. Pinned to the torso rather than the hand: both arms are posed
  // to converge on it, which reads correctly at chase-camera distance and avoids
  // needing any inverse kinematics.
  const hand = new THREE.Group();
  hand.position.set(0.17, 0.44, 0.34);
  upper.add(hand);

  return {
    group,
    upper,
    head,
    armL,
    armR,
    legL,
    legR,
    flesh: [gear, skinMat, webbing, trousers],
    hand,
  };
}

/**
 * A weapon silhouette built from its stats rather than its name: long barrel for
 * long range, a drum for a big magazine, wide muzzle for buckshot. Any weapon
 * added later gets a sensible model for free.
 */
export function makeWeaponMesh(def: WeaponDef): THREE.Group {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.45, metalness: 0.75 });
  const furniture = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.8, metalness: 0.1 });

  const long = def.range > 45;
  const barrelLen = long ? 0.62 : 0.24;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, long ? 0.46 : 0.24), metal);
  receiver.position.z = long ? 0.1 : 0.04;
  g.add(receiver);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(def.pellets > 1 ? 0.035 : 0.022, def.pellets > 1 ? 0.035 : 0.022, barrelLen, 8),
    metal,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = (long ? 0.33 : 0.16) + barrelLen / 2 - 0.1;
  g.add(barrel);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.19, 0.09), furniture);
  grip.position.set(0, -0.14, long ? -0.02 : 0);
  grip.rotation.x = -0.22;
  g.add(grip);

  if (long) {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.3), furniture);
    stock.position.set(0, -0.03, -0.26);
    g.add(stock);
  }
  if (def.magSize > 40) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 12), metal);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(0, -0.13, 0.06);
    g.add(drum);
  } else if (def.magSize > 10) {
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.08), metal);
    mag.position.set(0, -0.15, 0.06);
    mag.rotation.x = 0.12;
    g.add(mag);
  }
  if (def.range > 90) {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 8), metal);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.12, 0.12);
    g.add(scope);
  }

  for (const child of g.children) child.castShadow = true;
  // Muzzle flash, hidden until the shot.
  const flash = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.28, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd489, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  flash.name = "flash";
  flash.rotation.x = Math.PI / 2;
  flash.position.z = (long ? 0.33 : 0.16) + barrelLen - 0.02;
  flash.visible = false;
  g.add(flash);
  return g;
}

/** Blood burst used for hits and kills — recycled, never reallocated. */
export function makeBloodBurst(count: number): THREE.Points {
  const pos = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.13,
    map: dotTexture(),
    color: 0x8e1616,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.visible = false;
  return pts;
}

// ---------- decals: graffiti, stencils, stains ----------

const TAG_FONTS = ['bold 74px "Rajdhani", Impact, sans-serif', 'bold 66px "Rajdhani", Impact, sans-serif'];

/** Spray-paint drips running down from a painted shape. */
function drips(g: CanvasRenderingContext2D, s: number, color: string, count: number): void {
  g.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = Math.random() * s;
    const y = s * (0.35 + Math.random() * 0.3);
    g.fillRect(x, y, 2 + Math.random() * 2, Math.random() * s * 0.3);
  }
}

/** Overspray speckle around a sprayed mark. */
function overspray(g: CanvasRenderingContext2D, s: number, color: string, count: number): void {
  for (let i = 0; i < count; i++) {
    g.globalAlpha = 0.1 + Math.random() * 0.35;
    g.fillStyle = color;
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  g.globalAlpha = 1;
}

/**
 * A transparent decal texture. Everything is drawn with rough edges, drips and
 * overspray — clean vector marks on a filthy concrete wall read as UI, not paint.
 */
function decalTexture(kind: DecalKind, text: string, colorHex: number): THREE.Texture {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const color = "#" + (colorHex & 0xffffff).toString(16).padStart(6, "0");
  g.clearRect(0, 0, S, S);

  switch (kind) {
    case "tag": {
      g.save();
      g.translate(S / 2, S / 2);
      g.rotate((Math.random() - 0.5) * 0.16);
      g.textAlign = "center";
      g.textBaseline = "middle";
      const lines = text.split("\n");
      g.font = TAG_FONTS[lines.length > 1 ? 1 : 0];
      g.lineWidth = 7;
      g.strokeStyle = "rgba(0,0,0,0.45)";
      g.fillStyle = color;
      lines.forEach((line, i) => {
        const y = (i - (lines.length - 1) / 2) * 70;
        g.strokeText(line, 0, y);
        g.fillText(line, 0, y);
      });
      g.restore();
      drips(g, S, color, 16);
      overspray(g, S, color, 220);
      break;
    }
    case "stencil": {
      g.fillStyle = color;
      g.fillRect(14, 92, S - 28, 72);
      g.globalCompositeOperation = "destination-out";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = 'bold 46px "Rajdhani", Impact, sans-serif';
      g.fillText(text, S / 2, 128);
      g.globalCompositeOperation = "source-over";
      // Chew the edges so it looks sprayed through card, not printed.
      g.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 70; i++) g.fillRect(Math.random() * S, 86 + Math.random() * 86, 4 + Math.random() * 8, 3 + Math.random() * 6);
      g.globalCompositeOperation = "source-over";
      overspray(g, S, color, 160);
      break;
    }
    case "arrow": {
      g.strokeStyle = color;
      g.lineWidth = 16;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(36, S / 2);
      g.lineTo(S - 54, S / 2);
      g.moveTo(S - 110, S / 2 - 56);
      g.lineTo(S - 44, S / 2);
      g.lineTo(S - 110, S / 2 + 56);
      g.stroke();
      drips(g, S, color, 10);
      overspray(g, S, color, 150);
      break;
    }
    case "tally": {
      // Days survived, scratched into the concrete five at a time.
      g.strokeStyle = color;
      g.lineWidth = 5;
      g.lineCap = "round";
      const groups = 5;
      for (let gi = 0; gi < groups; gi++) {
        const ox = 26 + (gi % 3) * 78;
        const oy = 60 + Math.floor(gi / 3) * 96;
        for (let i = 0; i < 4; i++) {
          g.beginPath();
          g.moveTo(ox + i * 13 + Math.random() * 3, oy);
          g.lineTo(ox + i * 13 + Math.random() * 5, oy + 62);
          g.stroke();
        }
        g.beginPath();
        g.moveTo(ox - 6, oy + 56);
        g.lineTo(ox + 50, oy + 6);
        g.stroke();
      }
      break;
    }
    case "biohazard": {
      g.strokeStyle = color;
      g.fillStyle = color;
      g.lineWidth = 12;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        const cx = S / 2 + Math.cos(a) * 52;
        const cy = S / 2 + Math.sin(a) * 52;
        g.beginPath();
        g.arc(cx, cy, 42, a - 2.0, a + 2.0);
        g.stroke();
      }
      g.beginPath();
      g.arc(S / 2, S / 2, 24, 0, Math.PI * 2);
      g.fill();
      overspray(g, S, color, 120);
      break;
    }
    case "blood": {
      // Sprayed arterial pattern: one impact, a spatter halo, a few runs.
      const base = "#5e0d0d";
      g.fillStyle = base;
      g.beginPath();
      g.ellipse(S / 2, S / 2, 62, 48, Math.random(), 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 140; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 40 + Math.random() * 100;
        g.globalAlpha = 0.35 + Math.random() * 0.5;
        g.beginPath();
        g.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 1 + Math.random() * 6, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      drips(g, S, base, 12);
      break;
    }
    case "scorch": {
      const grad = g.createRadialGradient(S / 2, S / 2, 6, S / 2, S / 2, S / 2);
      grad.addColorStop(0, "rgba(10,9,8,0.92)");
      grad.addColorStop(0.55, "rgba(24,20,17,0.55)");
      grad.addColorStop(1, "rgba(30,26,22,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
      overspray(g, S, "#0c0a08", 200);
      break;
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * A decal quad. Wall decals stand upright facing `rot`; ground decals (height 0)
 * lie flat. Both are pushed a few centimetres off the surface and rendered with
 * a polygon offset so they never z-fight with the wall behind them.
 */
export function makeDecalMesh(def: DecalDef): THREE.Mesh {
  const size = (def.scale ?? 1) * (def.kind === "blood" || def.kind === "scorch" ? 2.6 : 1.8);
  const tex = decalTexture(def.kind, def.text ?? "", def.color ?? DECAL_COLORS[def.kind]);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    roughness: 0.95,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.renderOrder = 1;
  return mesh;
}

/** Default ink per decal kind — overridable per placement. */
export const DECAL_COLORS: Record<DecalKind, number> = {
  tag: 0xd8452c,
  stencil: 0xe8e2d2,
  arrow: 0xf0c033,
  tally: 0x2a2622,
  biohazard: 0xd8b32a,
  blood: 0x5e0d0d,
  scorch: 0x141210,
};
