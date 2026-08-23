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

// ---------- props ----------

/** A cover prop whose origin sits on the ground. All meshes cast/receive shadow. */
export function makePropMesh(kind: PropKind, scale = 1, color?: number): THREE.Group {
  const group = new THREE.Group();
  const add = (m: THREE.Mesh): THREE.Mesh => {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  switch (kind) {
    case "lamp": {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09 * scale, 0.13 * scale, 4.0 * scale, 8),
        metalMaterial(0x2a2e33, 0.6),
      );
      pole.position.y = 2.0 * scale;
      add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7 * scale, 0.12 * scale, 0.12 * scale), metalMaterial(0x2a2e33, 0.6));
      arm.position.set(0.3 * scale, 3.95 * scale, 0);
      add(arm);
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.5 * scale, 0.22 * scale, 0.4 * scale),
        new THREE.MeshStandardMaterial({ color: color ?? 0xffe0b0, emissive: color ?? 0xffe0b0, emissiveIntensity: 1.6 }),
      );
      head.position.set(0.62 * scale, 3.88 * scale, 0);
      group.add(head);
      return group;
    }
    case "car": {
      const body = metalMaterial(color ?? 0x8a2a2a, 0.35);
      const lower = new THREE.Mesh(new THREE.BoxGeometry(2.3 * scale, 0.55 * scale, 1.05 * scale), body);
      lower.position.y = 0.5 * scale;
      add(lower);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2 * scale, 0.5 * scale, 0.95 * scale), body);
      cabin.position.set(-0.15 * scale, 0.98 * scale, 0);
      add(cabin);
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.15, metalness: 0.4 });
      const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.06 * scale, 0.42 * scale, 0.85 * scale), glassMat);
      windshield.position.set(0.46 * scale, 0.98 * scale, 0);
      add(windshield);
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.9 });
      for (const wx of [-0.8, 0.8]) {
        for (const wz of [-0.52, 0.52]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * scale, 0.32 * scale, 0.2 * scale, 12), wheelMat);
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(wx * scale, 0.32 * scale, wz * scale);
          add(wheel);
        }
      }
      const glow = new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xfff4e0, emissiveIntensity: 1.8 });
      for (const sz of [-0.34, 0.34]) {
        const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scale, 0.12 * scale, 0.08 * scale, 12), glow);
        hl.rotation.z = Math.PI / 2;
        hl.position.set(1.17 * scale, 0.5 * scale, sz * scale);
        group.add(hl);
      }
      return group;
    }
    case "barrel": {
      const b = add(new THREE.Mesh(new THREE.CylinderGeometry(0.35 * scale, 0.35 * scale, 0.95 * scale, 16), metalMaterial(color ?? 0x6e7a52, 0.5)));
      b.position.y = 0.475 * scale;
      for (const ry of [0.28, 0.67]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.36 * scale, 0.03 * scale, 6, 16), metalMaterial(0x30302c, 0.7));
        band.rotation.x = Math.PI / 2;
        band.position.y = ry * scale;
        add(band);
      }
      return group;
    }
    case "rock": {
      const r = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 * scale, 0), new THREE.MeshStandardMaterial({ color: color ?? 0x565550, roughness: 1, flatShading: true })));
      r.position.y = 0.4 * scale;
      return group;
    }
    case "sandbag": {
      const s = add(new THREE.Mesh(new THREE.BoxGeometry(1.0 * scale, 0.42 * scale, 0.6 * scale), new THREE.MeshStandardMaterial({ color: color ?? 0x8a7a4a, roughness: 0.98 })));
      s.position.y = 0.21 * scale;
      return group;
    }
    case "container": {
      const m = add(new THREE.Mesh(new THREE.BoxGeometry(3.0 * scale, 2.4 * scale, 1.2 * scale), containerMaterial(color)));
      m.position.y = 1.2 * scale;
      return group;
    }
    default: {
      const m = add(new THREE.Mesh(new THREE.BoxGeometry(0.9 * scale, 0.9 * scale, 0.9 * scale), crateMaterial(color)));
      m.position.y = 0.45 * scale;
      return group;
    }
  }
}
