// Procedural three.js assets — textures and label sprites drawn to offscreen
// canvases at runtime. Keeps the repo asset-free (mirrors blockcraft's
// procedural atlas / sound philosophy).

import * as THREE from "three";

/** Dark concrete ground with a faint grid, tiled across the floor. */
export function makeGroundTexture(): THREE.Texture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#16181a";
  g.fillRect(0, 0, size, size);
  // speckle
  for (let i = 0; i < 1400; i++) {
    const v = 12 + Math.floor(Math.random() * 22);
    g.fillStyle = `rgb(${v},${v + 2},${v})`;
    g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  // grid
  g.strokeStyle = "rgba(80,120,90,0.10)";
  g.lineWidth = 2;
  g.strokeRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A concrete wall texture. */
export function makeWallTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2a2622";
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 500; i++) {
    const v = 30 + Math.floor(Math.random() * 26);
    g.fillStyle = `rgb(${v},${v - 4},${v - 8})`;
    g.fillRect(Math.random() * size, Math.random() * size, 3, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A floating text label (weapon name + cost) as a camera-facing sprite. */
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
