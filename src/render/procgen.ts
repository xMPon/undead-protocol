// Procedural three.js assets — albedo + normal-mapped materials, a gradient sky
// dome, and prop meshes, all drawn to offscreen canvases at runtime (no asset
// files). Textures and normal maps are cached module-side and shared across every
// user, so the whole map costs only a handful of GPU textures — the
// performance/beauty balance point: real surface detail without per-object cost.

import * as THREE from "three";
import type { WallRect, GroundKind, PropKind } from "../sim/types";

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

export function buildTerrainMesh(
  bounds: WallRect,
  heightAt: (x: number, y: number) => number,
  ground: GroundKind,
  cell = 1,
): THREE.Mesh {
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
  const rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / cell));
  const [br, bg, bb] = GROUND_BASE[ground];
  const uvScale = 0.14;

  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const wx = bounds.minX + i * cell;
      const wy = bounds.minY + j * cell;
      const h = heightAt(wx, wy);
      positions.push(wx, h, wy);
      uvs.push(wx * uvScale, wy * uvScale);
      const f = Math.max(0.5, Math.min(1.15, 0.78 + h * 0.11));
      colors.push((br / 255) * f, (bg / 255) * f, (bb / 255) * f);
    }
  }
  const indices: number[] = [];
  const stride = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
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

/** A large gradient sky dome (top → warm horizon), unaffected by fog. */
export function makeSkyDome(topHex: number, horizonHex: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(300, 24, 16);
  const top = new THREE.Color(topHex);
  const horizon = new THREE.Color(horizonHex);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 300; // -1..1
    const t = Math.pow(Math.max(0, y), 0.5);
    c.copy(horizon).lerp(top, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  return new THREE.Mesh(geo, mat);
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
      for (const [lx, lz] of [[-1.0, -1.0], [1.0, -1.0], [-1.0, 1.0], [1.0, 1.0]] as const) {
        at(cyl(0.1, 0.13, 4.4, steel, 6), lx, 2.2, lz);
      }
      for (const [bx, bz, ry] of [[0, -1.0, 0], [0, 1.0, 0], [-1.0, 0, Math.PI / 2], [1.0, 0, Math.PI / 2]] as const) {
        for (const tilt of [0.42, -0.42]) {
          const brace = box(2.6, 0.09, 0.09, steel);
          brace.rotation.set(0, ry, tilt);
          at(brace, bx, 2.2, bz);
        }
      }
      at(box(2.6, 0.16, 2.6, metalMaterial(0x3e444a, 0.85)), 0, 4.5, 0);
      const railMat = metalMaterial(0x4a5054, 0.8);
      for (const [rx, rz, w, d] of [[0, -1.25, 2.6, 0.08], [0, 1.25, 2.6, 0.08], [-1.25, 0, 0.08, 2.6], [1.25, 0, 0.08, 2.6]] as const) {
        at(box(w, 0.08, d, railMat), rx, 5.4, rz);
        at(box(w, 0.08, d, railMat), rx, 4.95, rz);
      }
      for (const [px, pz] of [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]] as const) {
        at(cyl(0.05, 0.05, 1.0, railMat, 5), px, 5.1, pz);
      }
      at(box(2.9, 0.14, 2.9, metalMaterial(0x33383d, 0.9)), 0, 6.3, 0);
      const head = box(0.5, 0.3, 0.7, emissive(0xfff0cc, 1.8));
      head.name = "glow";
      head.position.set(1.0 * scale, 6.05 * scale, 0);
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
