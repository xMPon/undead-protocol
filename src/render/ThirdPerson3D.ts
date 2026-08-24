// Third-person 3D view. Lifts the 2D ground-plane simulation into world space
// (sim x,y → three x,z; height is the separate y axis), with an over-shoulder
// camera driven by mouselook. Reads World, never writes it.

import * as THREE from "three";
import type { Renderer } from "./Renderer";
import type { World } from "../sim/World";
import type { Input } from "../core/Input";
import type { Intent, ThemeDef, PropDef, MapDef } from "../sim/types";
import { emptyIntent } from "../sim/types";
import type { Zombie } from "../sim/Zombie";
import { ZOMBIE_RISE_TIME } from "../sim/Zombie";
import {
  wallMaterial,
  makeLabelSprite,
  buildTerrainMesh,
  makePropMesh,
  makeSkyDome,
  makeLightCone,
  makeDustField,
  makeStarField,
  makeSmokePlume,
  makeDoorMesh,
  makeDecalMesh,
  makeZombieRig,
  makePlayerRig,
  makeWeaponMesh,
  makeBloodBurst,
} from "./procgen";
import type { CharacterRig } from "./procgen";
import { getWeapon } from "../data/weapons";
import { settings } from "../persist/Store";
import { rayVsRect } from "../sim/collision";

const WALL_H = 2.6;
const LOOK_SENS = 0.0022;
/** Radians per second for keyboard turning (Q/E, arrows) at turnSpeed 1. */
const TURN_RATE = 2.4;
/** How far behind the player the camera sits when nothing is in the way. */
const CAM_DIST = 6.2;
/** Never let the camera get closer than this, even in a corner. */
const CAM_MIN = 1.5;
/** Clearance kept between the camera and whatever it backed off. */
const CAM_PAD = 0.45;
/** Rest height of each rig's hips, so the walk bob has something to bob around. */
const ZOMBIE_HIP_Y = 0.9;
const PLAYER_HIP_Y = 0.95;
/** Seconds a blood burst lives. */
const BURST_LIFE = 0.75;
/** Real point lights kept alive at once; the rest of the map's fixtures glow only. */
const LIGHT_POOL = 14;

const DEFAULT_THEME: ThemeDef = {
  ground: "concrete",
  fog: 0x0a0d0b,
  fogNear: 14,
  fogFar: 46,
  sky: 0x0a0d0b,
  hemiSky: 0x9fb7a6,
  hemiGround: 0x14100c,
  dir: 0xffe6b0,
  dirIntensity: 0.5,
};

/** three rotation.y that faces ground-plane heading `a` (points +z at a=PI/2). */
function faceY(a: number): number {
  return Math.atan2(Math.cos(a), Math.sin(a));
}

/**
 * A pooled zombie body plus the state needed to animate it. The gait phase is
 * advanced by distance travelled rather than by time, so feet do not slide, and
 * it is clamped per frame because a pool slot can change owner when the horde is
 * culled — a reused slot should pick up the walk, not snap through it.
 */
interface ZombieSlot {
  rig: CharacterRig;
  phase: number;
  prevX: number;
  prevZ: number;
  /** Last frame's hit flash, so a rise can trigger a blood burst. */
  prevFlash: number;
}

/** A short-lived spray of blood, recycled from a small pool. */
interface Burst {
  pts: THREE.Points;
  vel: Float32Array;
  life: number;
}

/**
 * One light-emitting fixture. Emitters are data, not lights: the glow meshes,
 * haze cones and flames animate for every one of them, but only the nearest
 * `LIGHT_POOL` get an actual THREE.PointLight each frame. That keeps the light
 * count — and so the fragment cost and the shader permutation — constant no
 * matter how many rooms a map opens up.
 */
interface Emitter {
  pos: THREE.Vector3;
  color: number;
  /** Intensity at full brightness, before flicker. */
  base: number;
  range: number;
  mode: "steady" | "flicker" | "fire";
  phase: number;
  glow: THREE.MeshStandardMaterial | null;
  glowBase: number;
  cone: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null;
  coneBase: number;
  flame: THREE.Object3D | null;
  /** This frame's modulated intensity. */
  live: number;
}

/** A rising particle column, animated in place with no allocation. */
interface PlumeFx {
  pts: THREE.Points;
  speed: number;
  height: number;
  radius: number;
}

/** Pseudo-noise in [0,1] — three offset sines, cheap and non-repeating enough. */
function flickerNoise(t: number, phase: number): number {
  const a = Math.sin(t * 11.3 + phase);
  const b = Math.sin(t * 23.7 + phase * 2.1);
  const c = Math.sin(t * 4.1 + phase * 0.7);
  return (a * 0.5 + b * 0.3 + c * 0.2) * 0.5 + 0.5;
}

export class ThirdPerson3D implements Renderer {
  readonly name = "3d" as const;
  private canvas!: HTMLCanvasElement;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);

  private playerRig!: CharacterRig;
  private player!: THREE.Group;
  private weaponMesh: THREE.Group | null = null;
  private weaponId = "";
  private muzzleFlash: THREE.Mesh | null = null;
  private recoil = 0;
  private walkPhase = 0;
  private prevPlayerX = 0;
  private prevPlayerZ = 0;
  private bursts: Burst[] = [];
  private burstNext = 0;
  private muzzleLight!: THREE.PointLight;
  private tracers!: THREE.LineSegments;
  private tracerPos = new Float32Array(64 * 2 * 3);
  private doorMeshes = new Map<string, THREE.Object3D>();
  /** Everything belonging to the loaded map, so switching maps is one teardown. */
  private mapRoot = new THREE.Group();
  private builtFor: MapDef | null = null;
  private actorsBuilt = false;
  private zombiePool: ZombieSlot[] = [];
  private hemi!: THREE.HemisphereLight;
  private dirLight!: THREE.DirectionalLight;

  private yaw = 0;
  private pitch = 0.12;
  /** Player body materials, faded out when the camera is forced in close. */
  private playerMats: THREE.MeshStandardMaterial[] = [];
  private camDist = CAM_DIST;

  private time = 0;
  private emitters: Emitter[] = [];
  private lightPool: THREE.PointLight[] = [];
  private emitterRank: number[] = [];
  private emitterDist = new Float64Array(0);
  private readonly byDist = (a: number, b: number): number => this.emitterDist[a] - this.emitterDist[b];
  private beacons: THREE.MeshStandardMaterial[] = [];
  private plumes: PlumeFx[] = [];
  private dust: THREE.Points | null = null;
  private stars: THREE.Points | null = null;

  mount(container: HTMLElement): void {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "view-3d";
    container.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(0x0a0d0b);
    this.scene.fog = new THREE.Fog(0x0a0d0b, 14, 46);

    this.hemi = new THREE.HemisphereLight(0x9fb7a6, 0x14100c, 0.75);
    this.scene.add(this.hemi);
    this.dirLight = new THREE.DirectionalLight(0xffe6b0, 0.5);
    this.dirLight.position.set(8, 18, 6);
    this.scene.add(this.dirLight);
    const fillDir = new THREE.DirectionalLight(0x4466aa, 0.25);
    fillDir.position.set(-10, 8, -8);
    this.scene.add(fillDir);

    this.muzzleLight = new THREE.PointLight(0xffd070, 0, 10, 2);
    this.scene.add(this.muzzleLight);

    // Allocated once and never added to or removed from, so three compiles the
    // lighting shader a single time and reassigning slots costs nothing.
    for (let i = 0; i < LIGHT_POOL; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 20, 2);
      this.lightPool.push(light);
      this.scene.add(light);
    }

    const tgeo = new THREE.BufferGeometry();
    tgeo.setAttribute("position", new THREE.BufferAttribute(this.tracerPos, 3));
    this.tracers = new THREE.LineSegments(tgeo, new THREE.LineBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.85 }));
    this.tracers.frustumCulled = false;
    this.scene.add(this.tracers);
    this.scene.add(this.mapRoot);
  }

  /** Free every GPU resource the previous map owned. */
  private teardownMap(): void {
    this.mapRoot.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Sprite) {
        o.geometry?.dispose();
        const mat = o.material as THREE.Material | THREE.Material[];
        // Textures are cached module-side and shared between maps, so materials
        // are disposed but their maps deliberately are not.
        for (const m of Array.isArray(mat) ? mat : [mat]) m?.dispose();
      }
    });
    this.mapRoot.clear();
    this.emitters = [];
    this.plumes = [];
    this.beacons = [];
    this.doorMeshes.clear();
    for (const light of this.lightPool) light.intensity = 0;
  }

  /** One-off actors that outlive any single map: the player rig and blood pool. */
  private ensureActors(): void {
    if (this.actorsBuilt) return;
    this.actorsBuilt = true;

    this.playerRig = makePlayerRig();
    this.player = this.playerRig.group;
    this.playerMats.push(...this.playerRig.flesh);
    this.scene.add(this.player);

    for (let i = 0; i < 6; i++) {
      const pts = makeBloodBurst(14);
      this.scene.add(pts);
      this.bursts.push({ pts, vel: new Float32Array(14 * 3), life: 0 });
    }

    // Airborne dust — a fixed cloud the camera drags around with it, so a few
    // hundred motes cover a map of any size.
    this.dust = makeDustField(320, 64, 9);
    this.scene.add(this.dust);
    this.stars = makeStarField(360, 280);
    this.scene.add(this.stars);
  }

  private buildFromWorld(world: World): void {
    this.ensureActors();
    if (this.builtFor === world.def) return;
    if (this.builtFor) this.teardownMap();
    this.builtFor = world.def;
    const b = world.def.bounds;
    const th = world.def.theme ?? DEFAULT_THEME;
    const height = (x: number, y: number): number => world.terrain.heightAt(x, y);

    // Theme: sky, fog, lights.
    this.scene.background = new THREE.Color(th.sky);
    this.scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
    this.hemi.color.setHex(th.hemiSky);
    this.hemi.groundColor.setHex(th.hemiGround);
    this.dirLight.color.setHex(th.dir);
    this.dirLight.intensity = th.dirIntensity;

    // Gradient dusk sky dome (warm horizon derived from the sun colour).
    const horizon = new THREE.Color(th.dir).lerp(new THREE.Color(th.sky), 0.45).getHex();
    this.mapRoot.add(makeSkyDome(th.sky, horizon));

    // Sun casts shadows sized to the map bounds.
    const mcx = (b.minX + b.maxX) / 2;
    const mcz = (b.minY + b.maxY) / 2;
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY);
    // High overhead sun (slight tilt) so shadows drop straight down, not sideways.
    this.dirLight.position.set(mcx + span * 0.18, span * 1.35, mcz - span * 0.12);
    this.dirLight.target.position.set(mcx, 0, mcz);
    this.scene.add(this.dirLight.target);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(2048, 2048);
    const sc = this.dirLight.shadow.camera;
    const half = span * 0.62;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 1;
    sc.far = span * 2.6;
    sc.updateProjectionMatrix();
    this.dirLight.shadow.bias = -0.0004;
    this.dirLight.shadow.normalBias = 0.03;

    // Ground: displaced terrain mesh.
    this.mapRoot.add(buildTerrainMesh(b, height, th.ground, 1));

    // Walls: rooted below the floor so they never float on uneven ground.
    const wallMat = wallMaterial();
    const WALL_BOX = WALL_H + 1.2;
    for (const w of world.def.walls) {
      const width = w.maxX - w.minX;
      const depth = w.maxY - w.minY;
      const cx = (w.minX + w.maxX) / 2;
      const cz = (w.minY + w.maxY) / 2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, WALL_BOX, depth), wallMat);
      mesh.position.set(cx, height(cx, cz) + WALL_H / 2 - 0.6, cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.mapRoot.add(mesh);
    }

    // Doors get their own mesh each, so any one of them can open independently.
    for (const door of world.def.doors) {
      const dw = door.blocks.maxX - door.blocks.minX;
      const dd = door.blocks.maxY - door.blocks.minY;
      const dcx = (door.blocks.minX + door.blocks.maxX) / 2;
      const dcz = (door.blocks.minY + door.blocks.maxY) / 2;
      // The door spans the wide axis of the gap it fills; the thin one is depth.
      const acrossX = dw >= dd;
      const mesh = makeDoorMesh(acrossX ? dw : dd, WALL_H, (acrossX ? dd : dw) * 0.8, door.name ?? "Door", door.cost);
      if (!acrossX) mesh.rotation.y = Math.PI / 2;
      mesh.position.set(dcx, height(dcx, dcz) + WALL_H / 2 - 0.35, dcz);
      this.mapRoot.add(mesh);
      this.doorMeshes.set(door.id, mesh);
    }

    // Graffiti, stencils and stains. Flat on the floor when height is 0.
    for (const d of world.def.decals ?? []) {
      const mesh = makeDecalMesh(d);
      const h = d.height ?? 1.5;
      const gy = height(d.pos.x, d.pos.y);
      if (h <= 0.001) {
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = d.rot ?? 0;
        mesh.position.set(d.pos.x, gy + 0.03, d.pos.y);
      } else {
        // `rot` is a heading on the sim plane; three turns the other way about Y.
        mesh.rotation.y = -(d.rot ?? 0) + Math.PI / 2;
        mesh.position.set(d.pos.x, gy + h, d.pos.y);
      }
      this.mapRoot.add(mesh);
    }

    // Wall-buy markers.
    for (const wb of world.def.wallBuys) {
      const def = getWeapon(wb.weaponId);
      const gy = height(wb.pos.x, wb.pos.y);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.5, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x2b3a2b, emissive: 0x1b3a12, emissiveIntensity: 0.6 }),
      );
      box.position.set(wb.pos.x, gy + 1.1, wb.pos.y);
      box.castShadow = true;
      this.mapRoot.add(box);
      const label = makeLabelSprite(def.name, `$${def.wallCost || def.ammoCost}`);
      label.position.set(wb.pos.x, gy + 2.1, wb.pos.y);
      this.mapRoot.add(label);
    }

    // Cover props, plus the diegetic light rig: every emissive kind gets a real
    // light, a haze cone, and (for fires) flame + smoke the render loop drives.
    for (const prop of world.def.props ?? []) {
      const scl = prop.scale ?? 1;
      const gy = height(prop.pos.x, prop.pos.y);
      const rot = prop.rot ?? 0;
      const g = makePropMesh(prop.kind, scl, prop.color);
      g.position.set(prop.pos.x, gy, prop.pos.y);
      // Props are authored with local +x pointing along `rot` on the sim plane;
      // three rotates the opposite way about Y, so negate to keep the 3D and 2D
      // views showing the same thing (and headlights on the front of the car).
      g.rotation.y = -rot;
      this.mapRoot.add(g);
      this.addPropFx(prop, g, gy, scl, rot);
    }

    // Coloured atmosphere lights (plus a visible glowing source).
    for (const L of world.def.lights ?? []) {
      const y = height(L.pos.x, L.pos.y) + (L.height ?? 3);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: L.color }));
      bulb.position.set(L.pos.x, y, L.pos.y);
      this.mapRoot.add(bulb);
      this.addEmitter({ x: L.pos.x, y, z: L.pos.y }, L.color, L.intensity, L.range, "steady");
    }

    // Emitter bookkeeping used by the per-frame nearest-N light assignment.
    this.emitterDist = new Float64Array(this.emitters.length);
    this.emitterRank = this.emitters.map((_, i) => i);

  }

  /** Orient a light cone so its narrow end sits at the source and it points `dir`. */
  private placeBeam(mesh: THREE.Mesh, ox: number, oy: number, oz: number, dir: THREE.Vector3, length: number): void {
    dir.normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    mesh.position.set(ox + dir.x * (length / 2), oy + dir.y * (length / 2), oz + dir.z * (length / 2));
  }

  /** Register a fixture. Its cone/glow/flame animate always; its point light is
   *  handed out per frame by `assignLights` only if it is among the nearest. */
  private addEmitter(
    pos: { x: number; y: number; z: number },
    color: number,
    intensity: number,
    range: number,
    mode: Emitter["mode"] = "steady",
    parts: {
      glow?: THREE.Object3D | null;
      cone?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null;
      flame?: THREE.Object3D | null;
    } = {},
  ): void {
    const { glow = null, cone = null, flame = null } = parts;
    if (cone) this.mapRoot.add(cone);
    const glowMat =
      glow instanceof THREE.Mesh && glow.material instanceof THREE.MeshStandardMaterial ? glow.material : null;
    this.emitters.push({
      pos: new THREE.Vector3(pos.x, pos.y, pos.z),
      color,
      base: intensity,
      range,
      mode,
      phase: Math.random() * Math.PI * 2,
      glow: glowMat,
      glowBase: glowMat?.emissiveIntensity ?? 1,
      cone,
      coneBase: cone?.material.opacity ?? 0,
      flame,
      live: intensity,
    });
  }

  private addPlume(x: number, y: number, z: number, count: number, radius: number, plumeHeight: number, speed: number, color: number): void {
    const pts = makeSmokePlume(count, radius, plumeHeight, color);
    pts.position.set(x, y, z);
    this.mapRoot.add(pts);
    this.plumes.push({ pts, speed, height: plumeHeight, radius });
  }

  /** Lights, beams, flames and smoke for one placed prop. */
  private addPropFx(prop: PropDef, g: THREE.Group, gy: number, scl: number, rot: number): void {
    const fx = Math.cos(rot);
    const fz = Math.sin(rot);
    const glow = g.getObjectByName("glow") ?? null;

    switch (prop.kind) {
      case "lamp": {
        const tint = prop.color ?? 0xffe0b0;
        const hx = prop.pos.x + fx * 0.62 * scl;
        const hz = prop.pos.y + fz * 0.62 * scl;
        const hy = gy + 3.88 * scl;
        const cone = makeLightCone(0.45 * scl, 3.4 * scl, hy - gy, tint, 0.07);
        cone.position.set(hx, gy + (hy - gy) / 2, hz);
        // Roughly a third of them sit on a failing ballast.
        const mode = Math.random() < 0.3 ? "flicker" : "steady";
        this.addEmitter({ x: hx, y: hy, z: hz }, tint, 16, 30, mode, { glow, cone });
        break;
      }
      case "car": {
        // One emitter for the pair — the two glowing lenses sell the rest.
        const beam = makeLightCone(2.4 * scl, 0.4 * scl, 10, 0xfff4e0, 0.045);
        this.placeBeam(beam, prop.pos.x + fx * 1.2, gy + 0.55, prop.pos.y + fz * 1.2, new THREE.Vector3(fx, -0.05, fz), 10);
        this.addEmitter({ x: prop.pos.x + fx * 1.6, y: gy + 0.7, z: prop.pos.y + fz * 1.6 }, 0xfff4e0, 14, 26, "steady", { cone: beam });
        break;
      }
      case "floodlight": {
        const tint = prop.color ?? 0xfff0cc;
        const hx = prop.pos.x + fx * 0.24 * scl;
        const hz = prop.pos.y + fz * 0.24 * scl;
        const hy = gy + 2.28 * scl;
        const beam = makeLightCone(4.0 * scl, 0.45 * scl, 14, tint, 0.05);
        this.placeBeam(beam, hx, hy, hz, new THREE.Vector3(fx, -0.32, fz), 14);
        this.addEmitter({ x: hx, y: hy, z: hz }, tint, 22, 34, "steady", { glow, cone: beam });
        break;
      }
      case "tower": {
        const hx = prop.pos.x + fx * 1.0 * scl;
        const hz = prop.pos.y + fz * 1.0 * scl;
        const hy = gy + 6.05 * scl;
        const beam = makeLightCone(6.0 * scl, 0.5 * scl, 20, 0xfff0cc, 0.045);
        this.placeBeam(beam, hx, hy, hz, new THREE.Vector3(fx, -0.42, fz), 20);
        this.addEmitter({ x: hx, y: hy, z: hz }, 0xfff0cc, 26, 44, "steady", { glow, cone: beam });
        break;
      }
      case "blockhouse": {
        // A warm bulb just inside the doorway, so the shelter reads as somewhere
        // you can actually go rather than a solid block.
        const glowPos = { x: prop.pos.x + fx * 1.3 * scl, y: gy + 2.7 * scl, z: prop.pos.y + fz * 1.3 * scl };
        this.addEmitter(glowPos, 0xffd9a0, 12, 14, "flicker", { glow });
        break;
      }
      case "firebarrel": {
        const flame = g.getObjectByName("flame") ?? null;
        this.addEmitter({ x: prop.pos.x, y: gy + 1.3 * scl, z: prop.pos.y }, 0xff8a20, 11, 16, "fire", { flame });
        this.addPlume(prop.pos.x, gy + 1.7 * scl, prop.pos.y, 26, 0.3, 5.5, 1.1, 0x3a352f);
        break;
      }
      case "wreck": {
        this.addPlume(prop.pos.x - fx * 0.1, gy + 1.0 * scl, prop.pos.y - fz * 0.1, 22, 0.35, 6.5, 0.7, 0x24221f);
        break;
      }
      case "antenna": {
        const beacon = g.getObjectByName("beacon");
        if (beacon instanceof THREE.Mesh && beacon.material instanceof THREE.MeshStandardMaterial) {
          this.beacons.push(beacon.material);
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * Hand the point-light pool to the fixtures nearest the player. Emitters past
   * their own falloff leave their slot dark, so a swap is invisible: whatever
   * drops out was already contributing nothing at that distance.
   */
  private assignLights(px: number, py: number, pz: number): void {
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      const dx = e.pos.x - px;
      const dy = e.pos.y - py;
      const dz = e.pos.z - pz;
      this.emitterDist[i] = dx * dx + dy * dy + dz * dz;
    }
    this.emitterRank.sort(this.byDist); // near-sorted every frame, so this is cheap

    for (let slot = 0; slot < this.lightPool.length; slot++) {
      const light = this.lightPool[slot];
      const idx = this.emitterRank[slot];
      if (idx === undefined) {
        light.intensity = 0;
        continue;
      }
      const e = this.emitters[idx];
      if (this.emitterDist[idx] > e.range * e.range) {
        light.intensity = 0;
        continue;
      }
      light.position.copy(e.pos);
      light.color.setHex(e.color);
      light.distance = e.range;
      light.intensity = e.live;
    }
  }

  /**
   * How far the camera can sit behind the player before something solid gets in
   * the way. Casts the sim's own obstacle rects on the ground plane and keeps
   * only those tall enough to actually occlude — a crate at knee height should
   * not yank the camera in.
   */
  private clearCameraDist(world: World, px: number, pz: number, dx: number, dz: number): number {
    let best = CAM_DIST;
    const eye = world.player.footY + 1.6;
    for (const o of world.obstacles) {
      if (o.top < eye) continue; // low enough for the camera to look over
      // Posts, masts and trees are too thin to hide anything; pulling in for them
      // would make the camera twitch every time one swept past behind the player.
      if (o.rect.maxX - o.rect.minX < 0.7 && o.rect.maxY - o.rect.minY < 0.7) continue;
      const t = rayVsRect(px, pz, dx, dz, o.rect);
      if (t === null || t >= best) continue;
      best = t;
    }
    return Math.max(CAM_MIN, best - CAM_PAD);
  }

  private makeZombie(): ZombieSlot {
    const rig = makeZombieRig();
    this.scene.add(rig.group);
    return { rig, phase: Math.random() * Math.PI * 2, prevX: 0, prevZ: 0, prevFlash: 0 };
  }

  /** Throw a short spray of blood from a point, recycling the oldest burst. */
  private spatter(x: number, y: number, z: number, force: number): void {
    const burst = this.bursts[this.burstNext];
    this.burstNext = (this.burstNext + 1) % this.bursts.length;
    const arr = burst.pts.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = arr[i + 1] = arr[i + 2] = 0;
      const a = Math.random() * Math.PI * 2;
      const up = 0.6 + Math.random() * 2.2;
      const out = (0.7 + Math.random() * 1.8) * force;
      burst.vel[i] = Math.cos(a) * out;
      burst.vel[i + 1] = up;
      burst.vel[i + 2] = Math.sin(a) * out;
    }
    burst.pts.geometry.attributes.position.needsUpdate = true;
    burst.pts.position.set(x, y, z);
    burst.pts.visible = true;
    burst.life = BURST_LIFE;
  }

  private updateBursts(dt: number): void {
    for (const burst of this.bursts) {
      if (burst.life <= 0) continue;
      burst.life -= dt;
      if (burst.life <= 0) {
        burst.pts.visible = false;
        continue;
      }
      const arr = burst.pts.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        burst.vel[i + 1] -= 11 * dt;
        arr[i] += burst.vel[i] * dt;
        arr[i + 1] += burst.vel[i + 1] * dt;
        arr[i + 2] += burst.vel[i + 2] * dt;
      }
      burst.pts.geometry.attributes.position.needsUpdate = true;
      (burst.pts.material as THREE.PointsMaterial).opacity = Math.min(1, burst.life / (BURST_LIFE * 0.6));
    }
  }

  /**
   * Pose one zombie. A shambler is mostly a walk cycle plus a lurch: legs
   * counter-swinging, the torso rolling with them, arms out and drifting, and
   * the head lolling a beat behind. Attacking swaps the arms to a fast grab.
   */
  private syncZombie(slot: ZombieSlot, z: Zombie, groundY: number, t: number): void {
    const { rig } = slot;
    rig.group.visible = true;

    let yOff = 0;
    if (z.state === "rising") yOff = -(z.riseTimer / ZOMBIE_RISE_TIME) * 1.7;
    rig.group.position.set(z.pos.x, groundY + yOff, z.pos.y);
    rig.group.rotation.y = faceY(z.facing);

    // Gait phase from ground covered, clamped so a recycled slot cannot jump.
    const moved = Math.hypot(z.pos.x - slot.prevX, z.pos.y - slot.prevZ);
    slot.prevX = z.pos.x;
    slot.prevZ = z.pos.y;
    slot.phase += Math.min(moved, 0.35) * 3.4;
    const swing = Math.sin(slot.phase);
    const roll = Math.sin(slot.phase * 0.5);

    if (z.isDead) {
      // Collapse: fold forward and let the limbs go slack.
      const k = Math.min(1, z.deadTimer * 2.2);
      rig.group.rotation.x = -k * (Math.PI / 2);
      rig.group.position.y = groundY + yOff - k * 0.3;
      const slack = 1 - k;
      rig.legL.rotation.x = swing * 0.3 * slack;
      rig.legR.rotation.x = -swing * 0.3 * slack;
      rig.armL.rotation.set(-0.4 * slack, 0, 0.3 * slack);
      rig.armR.rotation.set(-0.4 * slack, 0, -0.3 * slack);
      rig.upper.rotation.set(0.2, 0, 0);
      return;
    }

    rig.group.rotation.x = 0;
    rig.legL.rotation.x = swing * 0.55;
    rig.legR.rotation.x = -swing * 0.55;
    rig.upper.position.y = ZOMBIE_HIP_Y + Math.abs(swing) * 0.045;
    rig.upper.rotation.set(0.18, 0, roll * 0.1);
    rig.head.rotation.set(-0.16, roll * 0.18, roll * 0.14);

    if (z.state === "attacking") {
      // Grabbing: both arms up and clawing, quicker than the walk.
      const claw = Math.sin(t * 13 + slot.phase) * 0.45;
      rig.armL.rotation.set(-2.0 + claw, 0, 0.35);
      rig.armR.rotation.set(-2.0 - claw, 0, -0.35);
    } else {
      rig.armL.rotation.set(-1.28 - swing * 0.2, 0, 0.22 + roll * 0.06);
      rig.armR.rotation.set(-1.28 + swing * 0.2, 0, -0.22 + roll * 0.06);
    }

    // Hit flash, and a spray of blood on the frame the flash rises.
    const flash = z.hitFlash;
    if (flash > slot.prevFlash + 0.2) {
      this.spatter(z.pos.x, groundY + 1.25, z.pos.y, 1);
    }
    slot.prevFlash = flash;
    const e = new THREE.Color(flash, flash * 0.15, flash * 0.15);
    for (const m of rig.flesh) m.emissive = e;
  }

  /** Pose the player: walk cycle, weapon carry, and recoil. */
  private syncPlayer(world: World, dt: number, t: number): void {
    const rig = this.playerRig;
    const p = world.player;

    // Swap the weapon model when the carried gun changes.
    const def = p.def();
    if (def.id !== this.weaponId) {
      this.weaponId = def.id;
      if (this.weaponMesh) rig.hand.remove(this.weaponMesh);
      this.weaponMesh = makeWeaponMesh(def);
      this.weaponMesh.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
          o.material.transparent = true;
          if (!this.playerMats.includes(o.material)) this.playerMats.push(o.material);
        }
      });
      this.muzzleFlash = (this.weaponMesh.getObjectByName("flash") as THREE.Mesh) ?? null;
      rig.hand.add(this.weaponMesh);
    }

    const moved = Math.hypot(p.pos.x - this.prevPlayerX, p.pos.y - this.prevPlayerZ);
    this.prevPlayerX = p.pos.x;
    this.prevPlayerZ = p.pos.y;
    this.walkPhase += Math.min(moved, 0.4) * 3.0;
    const swing = Math.sin(this.walkPhase);
    const moving = moved > 0.004;
    const stride = moving ? 0.5 : 0;

    rig.legL.rotation.x = swing * stride;
    rig.legR.rotation.x = -swing * stride;
    rig.upper.position.y = PLAYER_HIP_Y + Math.abs(swing) * 0.03 * (moving ? 1 : 0);
    // Idle breathing keeps a standing player from looking like a statue.
    const breathe = Math.sin(t * 1.6) * 0.012;

    // Recoil decays fast; it kicks the torso back and shoves the weapon into the
    // shoulder, which is what actually sells a shot at this camera distance.
    this.recoil = Math.max(0, this.recoil - dt * 7);
    if (world.muzzle > 0) this.recoil = Math.min(1, this.recoil + 0.55);

    rig.upper.rotation.set(-0.06 - this.recoil * 0.12 + breathe, 0, 0);
    rig.armL.rotation.set(-1.36 + this.recoil * 0.16, 0, 0.42);
    rig.armR.rotation.set(-1.22 + this.recoil * 0.22, 0, -0.3);
    rig.head.rotation.set(-this.recoil * 0.1, 0, 0);
    rig.hand.position.set(0.17, 0.44, 0.34 - this.recoil * 0.09);

    if (this.muzzleFlash) {
      this.muzzleFlash.visible = world.muzzle > 0;
      if (this.muzzleFlash.visible) {
        const flare = 0.7 + Math.random() * 0.6;
        this.muzzleFlash.scale.set(flare, 0.8 + Math.random() * 0.5, flare);
        this.muzzleFlash.rotation.z = Math.random() * Math.PI;
      }
    }
  }

  /** Advance every animated atmosphere element. Allocation-free. */
  private updateFx(dt: number): void {
    const t = this.time;

    for (const e of this.emitters) {
      let k = 1;
      if (e.mode === "flicker") {
        // Mostly-on with occasional dips, rather than a strobe.
        const n = flickerNoise(t, e.phase);
        k = n > 0.35 ? 1 : 0.35 + n;
      } else if (e.mode === "fire") {
        const n = flickerNoise(t, e.phase);
        k = 0.72 + n * 0.55;
        if (e.flame) {
          e.flame.scale.set(0.86 + n * 0.28, 0.75 + n * 0.5, 0.86 + n * 0.28);
          e.flame.rotation.y = t * 1.7 + e.phase;
        }
      } else {
        continue; // steady fixtures never need re-modulating
      }
      e.live = e.base * k;
      if (e.cone) e.cone.material.opacity = e.coneBase * Math.min(1, k);
      if (e.glow) e.glow.emissiveIntensity = e.glowBase * k;
    }

    for (const beacon of this.beacons) {
      // Aircraft-warning blink: ~1.4 s period, short bright pulse.
      const pulse = Math.max(0, Math.sin(t * 4.5));
      beacon.emissiveIntensity = 0.25 + pulse * pulse * 3.0;
    }

    for (const plume of this.plumes) {
      const attr = plume.pts.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] += plume.speed * dt;
        arr[i] += Math.sin(t * 0.8 + i) * 0.006;
        arr[i + 2] += Math.cos(t * 0.6 + i) * 0.006;
        if (arr[i + 1] > plume.height) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * plume.radius;
          arr[i] = Math.cos(a) * r;
          arr[i + 1] = 0;
          arr[i + 2] = Math.sin(a) * r;
        }
      }
      attr.needsUpdate = true;
    }

    if (this.dust) {
      // Slow lateral drift; the cloud itself is re-centred on the camera, and
      // wrapping in the box keeps density even without respawning particles.
      const attr = this.dust.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const half = 32;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] += (0.35 + Math.sin(t * 0.4 + i) * 0.2) * dt;
        arr[i + 1] += Math.sin(t * 0.9 + i * 0.3) * 0.05 * dt;
        if (arr[i] > half) arr[i] -= half * 2;
      }
      attr.needsUpdate = true;
      this.dust.position.set(this.camera.position.x, 0, this.camera.position.z);
    }
    if (this.stars) this.stars.position.copy(this.camera.position);
  }

  render(world: World, dt: number): void {
    this.time += dt;
    this.buildFromWorld(world);
    for (const [id, mesh] of this.doorMeshes) mesh.visible = !world.map.openedDoors.has(id);
    // Pulse the keypad LED on every still-locked door so they read as live.
    for (const mesh of this.doorMeshes.values()) {
      if (!mesh.visible) continue;
      const led = mesh.getObjectByName("led");
      if (led instanceof THREE.Mesh && led.material instanceof THREE.MeshStandardMaterial) {
        led.material.emissiveIntensity = 1.2 + Math.abs(Math.sin(this.time * 2.6)) * 2.2;
      }
    }

    const p = world.player;
    const groundP = world.terrain.heightAt(p.pos.x, p.pos.y);
    this.player.position.set(p.pos.x, p.footY, p.pos.y);
    this.player.rotation.y = faceY(p.aim);
    this.syncPlayer(world, dt, this.time);

    // Zombies (pooled)
    const zs = world.zombies;
    for (let i = 0; i < zs.length; i++) {
      if (!this.zombiePool[i]) this.zombiePool[i] = this.makeZombie();
      this.syncZombie(this.zombiePool[i], zs[i], zs[i].footY, this.time);
    }
    for (let i = zs.length; i < this.zombiePool.length; i++) this.zombiePool[i].rig.group.visible = false;
    this.updateBursts(dt);

    // Muzzle flash
    this.muzzleLight.intensity = world.muzzle > 0 ? 6 : 0;
    const fx = Math.cos(p.aim);
    const fz = Math.sin(p.aim);
    this.muzzleLight.position.set(p.pos.x + fx * 0.9, p.footY + 1.2, p.pos.y + fz * 0.9);

    // Tracers
    const maxT = Math.min(world.tracers.length, 64);
    for (let i = 0; i < maxT; i++) {
      const tr = world.tracers[i];
      const o = i * 6;
      this.tracerPos[o] = tr.from.x;
      this.tracerPos[o + 1] = world.terrain.heightAt(tr.from.x, tr.from.y) + 1.25;
      this.tracerPos[o + 2] = tr.from.y;
      this.tracerPos[o + 3] = tr.to.x;
      this.tracerPos[o + 4] = world.terrain.heightAt(tr.to.x, tr.to.y) + 1.25;
      this.tracerPos[o + 5] = tr.to.y;
    }
    this.tracers.geometry.setDrawRange(0, maxT * 2);
    this.tracers.geometry.attributes.position.needsUpdate = true;

    // Chase camera centred directly behind the player so the crosshair aligns
    // with the bullet path (firing goes along `aim` from the player position —
    // any lateral camera offset would make centred targets shoot off to the side).
    // It pulls in when something solid is behind the player, so backing into a
    // wall no longer puts the geometry between the camera and the character.
    const want = this.clearCameraDist(world, p.pos.x, p.pos.y, -fx, -fz);
    // Ease outward, snap inward: popping out into a wall looks far worse than a
    // quick recovery once the player steps clear of it.
    this.camDist = want < this.camDist ? want : Math.min(want, this.camDist + dt * 9);
    const camX = p.pos.x - fx * this.camDist;
    const camZ = p.pos.y - fz * this.camDist;
    const camY = groundP + (0.9 + (this.camDist / CAM_DIST) * 2.4) + this.pitch * 3.5;
    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(p.pos.x + fx * 4, groundP + 1.4 - this.pitch * 3, p.pos.y + fz * 4);

    // Dissolve the player once the camera is close enough to be inside them. The
    // materials are created transparent and only their opacity moves — toggling
    // `transparent` per frame would recompile the shader every time.
    const fade = Math.max(0, Math.min(1, (this.camDist - CAM_MIN) / 1.8));
    for (const m of this.playerMats) m.opacity = fade;
    this.player.visible = fade > 0.02;

    this.updateFx(dt);
    // Light the player's surroundings, not the camera's — the camera trails them.
    this.assignLights(p.pos.x, p.footY + 1.2, p.pos.y);
    this.renderer.render(this.scene, this.camera);
  }

  buildIntent(_world: World, input: Input, dt: number): Intent {
    // Mouse look, scaled by the player's sensitivity setting.
    const sens = LOOK_SENS * settings.lookSensitivity;
    const invert = settings.invertY ? -1 : 1;
    this.yaw += input.mouseDX * sens;
    this.pitch = Math.max(-0.5, Math.min(0.8, this.pitch + input.mouseDY * sens * invert));

    // Keyboard turning. Essential on a trackpad, where there is not enough travel
    // to spin round, and it leaves the mouse free to keep firing.
    const turn = TURN_RATE * settings.turnSpeed * dt;
    if (input.isDown("KeyQ") || input.isDown("ArrowLeft")) this.yaw -= turn;
    if (input.isDown("KeyE") || input.isDown("ArrowRight")) this.yaw += turn;
    if (input.isDown("ArrowUp")) this.pitch = Math.max(-0.5, this.pitch - turn * 0.5 * invert);
    if (input.isDown("ArrowDown")) this.pitch = Math.min(0.8, this.pitch + turn * 0.5 * invert);

    const fx = Math.cos(this.yaw);
    const fy = Math.sin(this.yaw);
    const rx = -Math.sin(this.yaw);
    const ry = Math.cos(this.yaw);
    const intent = emptyIntent();
    let mx = 0;
    let my = 0;
    if (input.isDown("KeyW")) { mx += fx; my += fy; }
    if (input.isDown("KeyS")) { mx -= fx; my -= fy; }
    if (input.isDown("KeyD")) { mx += rx; my += ry; }
    if (input.isDown("KeyA")) { mx -= rx; my -= ry; }
    intent.move = { x: mx, y: my };
    intent.aim = this.yaw;
    intent.firing = input.left;
    intent.reload = input.isDown("KeyR");
    intent.interact = input.isDown("KeyF");
    intent.sprint = input.isDown("ShiftLeft") || input.isDown("ShiftRight");
    intent.jump = input.isDown("Space");
    if (input.wasPressed("Digit1")) intent.switchTo = 0;
    else if (input.wasPressed("Digit2")) intent.switchTo = 1;
    return intent;
  }

  onActivate(input: Input): void {
    input.requestLock();
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  show(): void {
    this.canvas.classList.remove("hidden");
  }
  hide(): void {
    this.canvas.classList.add("hidden");
  }
  dispose(): void {
    this.renderer.dispose();
  }
}
