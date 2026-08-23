// Third-person 3D view. Lifts the 2D ground-plane simulation into world space
// (sim x,y → three x,z; height is the separate y axis), with an over-shoulder
// camera driven by mouselook. Reads World, never writes it.

import * as THREE from "three";
import type { Renderer } from "./Renderer";
import type { World } from "../sim/World";
import type { Input } from "../core/Input";
import type { Intent, ThemeDef, PropDef } from "../sim/types";
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
} from "./procgen";
import { getWeapon } from "../data/weapons";

const WALL_H = 2.6;
const LOOK_SENS = 0.0022;

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

interface ZombieMesh {
  group: THREE.Group;
  body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  head: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
}

/** A lamp/floodlight the renderer can dim — a third of them flicker on a bad ballast. */
interface LampFx {
  light: THREE.PointLight;
  glow: THREE.MeshStandardMaterial | null;
  cone: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  base: number;
  coneBase: number;
  phase: number;
  flickers: boolean;
}

/** A live fire: light + flame cones, both driven off the same noise. */
interface FireFx {
  light: THREE.PointLight;
  flame: THREE.Object3D;
  base: number;
  phase: number;
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

  private player!: THREE.Group;
  private muzzleLight!: THREE.PointLight;
  private tracers!: THREE.LineSegments;
  private tracerPos = new Float32Array(64 * 2 * 3);
  private doorMesh: THREE.Mesh | null = null;
  private zombiePool: ZombieMesh[] = [];
  private hemi!: THREE.HemisphereLight;
  private dirLight!: THREE.DirectionalLight;

  private yaw = 0;
  private pitch = 0.12;

  private time = 0;
  private lamps: LampFx[] = [];
  private fires: FireFx[] = [];
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

    const tgeo = new THREE.BufferGeometry();
    tgeo.setAttribute("position", new THREE.BufferAttribute(this.tracerPos, 3));
    this.tracers = new THREE.LineSegments(tgeo, new THREE.LineBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.85 }));
    this.tracers.frustumCulled = false;
    this.scene.add(this.tracers);
  }

  private builtStatics = false;
  private buildFromWorld(world: World): void {
    if (this.builtStatics) return;
    this.builtStatics = true;
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
    this.scene.add(makeSkyDome(th.sky, horizon));
    this.stars = makeStarField(360, 280);
    this.scene.add(this.stars);

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
    this.scene.add(buildTerrainMesh(b, height, th.ground, 1));

    // Airborne dust — a fixed cloud the camera drags around with it, so a few
    // hundred motes cover a map of any size.
    this.dust = makeDustField(320, 64, 9);
    this.scene.add(this.dust);

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
      this.scene.add(mesh);
    }

    // Door (its own mesh so we can hide it when opened).
    const door = world.def.doors[0];
    if (door) {
      const dw = door.blocks.maxX - door.blocks.minX;
      const dd = door.blocks.maxY - door.blocks.minY;
      const dcx = (door.blocks.minX + door.blocks.maxX) / 2;
      const dcz = (door.blocks.minY + door.blocks.maxY) / 2;
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x7a3b1a, roughness: 0.7, emissive: 0x2a1305 });
      this.doorMesh = new THREE.Mesh(new THREE.BoxGeometry(dw, WALL_BOX, dd), doorMat);
      this.doorMesh.position.set(dcx, height(dcx, dcz) + WALL_H / 2 - 0.6, dcz);
      this.doorMesh.castShadow = true;
      this.doorMesh.receiveShadow = true;
      this.scene.add(this.doorMesh);
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
      this.scene.add(box);
      const label = makeLabelSprite(def.name, `$${def.wallCost || def.ammoCost}`);
      label.position.set(wb.pos.x, gy + 2.1, wb.pos.y);
      this.scene.add(label);
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
      this.scene.add(g);
      this.addPropFx(prop, g, gy, scl, rot);
    }

    // Coloured atmosphere lights (plus a visible glowing source).
    for (const L of world.def.lights ?? []) {
      const light = new THREE.PointLight(L.color, L.intensity, L.range, 2);
      light.position.set(L.pos.x, height(L.pos.x, L.pos.y) + (L.height ?? 3), L.pos.y);
      this.scene.add(light);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 8, 8),
        new THREE.MeshBasicMaterial({ color: L.color }),
      );
      bulb.position.copy(light.position);
      this.scene.add(bulb);
    }

    // Player: torso + head + gun.
    this.player = new THREE.Group();
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 0.9, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x33465c, roughness: 0.55, metalness: 0.25 }),
    );
    torso.position.y = 1.0;
    torso.castShadow = true;
    this.player.add(torso);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xc7a488, roughness: 0.7 }),
    );
    head.position.y = 1.7;
    head.castShadow = true;
    this.player.add(head);
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.16, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.4, metalness: 0.7 }),
    );
    gun.position.set(0.25, 1.2, 0.5);
    gun.castShadow = true;
    this.player.add(gun);
    this.scene.add(this.player);
  }

  /** Orient a light cone so its narrow end sits at the source and it points `dir`. */
  private placeBeam(mesh: THREE.Mesh, ox: number, oy: number, oz: number, dir: THREE.Vector3, length: number): void {
    dir.normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    mesh.position.set(ox + dir.x * (length / 2), oy + dir.y * (length / 2), oz + dir.z * (length / 2));
  }

  private addLamp(
    light: THREE.PointLight,
    cone: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>,
    glow: THREE.Object3D | null,
    flickers: boolean,
  ): void {
    this.scene.add(light);
    this.scene.add(cone);
    const mat = glow instanceof THREE.Mesh && glow.material instanceof THREE.MeshStandardMaterial ? glow.material : null;
    this.lamps.push({
      light,
      cone,
      glow: mat,
      base: light.intensity,
      coneBase: cone.material.opacity,
      phase: Math.random() * Math.PI * 2,
      flickers,
    });
  }

  private addPlume(x: number, y: number, z: number, count: number, radius: number, plumeHeight: number, speed: number, color: number): void {
    const pts = makeSmokePlume(count, radius, plumeHeight, color);
    pts.position.set(x, y, z);
    this.scene.add(pts);
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
        const light = new THREE.PointLight(tint, 16, 30, 2);
        light.position.set(hx, hy, hz);
        const cone = makeLightCone(0.45 * scl, 3.4 * scl, hy - gy, tint, 0.07);
        cone.position.set(hx, gy + (hy - gy) / 2, hz);
        this.addLamp(light, cone, glow, Math.random() < 0.3);
        break;
      }
      case "car": {
        // One light for the pair — the two glowing lenses sell the rest, and a
        // forward-rendered scene pays for every extra light on every fragment.
        const light = new THREE.PointLight(0xfff4e0, 14, 26, 2);
        light.position.set(prop.pos.x + fx * 1.6, gy + 0.7, prop.pos.y + fz * 1.6);
        this.scene.add(light);
        const beam = makeLightCone(2.4 * scl, 0.4 * scl, 10, 0xfff4e0, 0.045);
        this.placeBeam(beam, prop.pos.x + fx * 1.2, gy + 0.55, prop.pos.y + fz * 1.2, new THREE.Vector3(fx, -0.05, fz), 10);
        this.scene.add(beam);
        break;
      }
      case "floodlight": {
        const tint = prop.color ?? 0xfff0cc;
        const hx = prop.pos.x + fx * 0.24 * scl;
        const hz = prop.pos.y + fz * 0.24 * scl;
        const hy = gy + 2.28 * scl;
        const light = new THREE.PointLight(tint, 22, 34, 2);
        light.position.set(hx, hy, hz);
        const beam = makeLightCone(4.0 * scl, 0.45 * scl, 14, tint, 0.05);
        this.placeBeam(beam, hx, hy, hz, new THREE.Vector3(fx, -0.32, fz), 14);
        this.addLamp(light, beam, glow, false);
        break;
      }
      case "tower": {
        const hx = prop.pos.x + fx * 1.0 * scl;
        const hz = prop.pos.y + fz * 1.0 * scl;
        const hy = gy + 6.05 * scl;
        const light = new THREE.PointLight(0xfff0cc, 26, 44, 2);
        light.position.set(hx, hy, hz);
        const beam = makeLightCone(6.0 * scl, 0.5 * scl, 20, 0xfff0cc, 0.045);
        this.placeBeam(beam, hx, hy, hz, new THREE.Vector3(fx, -0.42, fz), 20);
        this.addLamp(light, beam, glow, false);
        break;
      }
      case "firebarrel": {
        const light = new THREE.PointLight(0xff8a20, 11, 16, 2);
        light.position.set(prop.pos.x, gy + 1.3 * scl, prop.pos.y);
        this.scene.add(light);
        const flame = g.getObjectByName("flame");
        if (flame) this.fires.push({ light, flame, base: 11, phase: Math.random() * Math.PI * 2 });
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

  private makeZombie(): ZombieMesh {
    const group = new THREE.Group();
    // Slight per-zombie colour variation so a horde doesn't look cloned.
    const hue = 0.26 + (Math.random() - 0.5) * 0.06;
    const skin = new THREE.Color().setHSL(hue, 0.33, 0.26 + Math.random() * 0.05);
    const skinDark = skin.clone().multiplyScalar(0.8);

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 0.7, 4, 10),
      new THREE.MeshStandardMaterial({ color: skin, roughness: 0.92 }),
    ) as ZombieMesh["body"];
    body.position.y = 0.95;
    body.rotation.x = 0.18; // hunched
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 12, 10),
      new THREE.MeshStandardMaterial({ color: skin.clone().lerp(new THREE.Color(0xc7b48a), 0.35), roughness: 0.85 }),
    ) as ZombieMesh["head"];
    head.position.set(0, 1.62, 0.12);
    head.castShadow = true;
    group.add(head);

    const armMat = new THREE.MeshStandardMaterial({ color: skinDark, roughness: 0.92 });
    for (const sx of [-0.34, 0.34]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.55, 4, 8), armMat);
      arm.position.set(sx, 1.15, 0.4);
      arm.rotation.x = 1.4; // reaching forward
      arm.castShadow = true;
      group.add(arm);
    }
    group.visible = false;
    this.scene.add(group);
    return { group, body, head };
  }

  private syncZombie(zm: ZombieMesh, z: Zombie, groundY: number): void {
    zm.group.visible = true;
    let yOff = 0;
    if (z.state === "rising") yOff = -(z.riseTimer / ZOMBIE_RISE_TIME) * 1.7;
    zm.group.position.set(z.pos.x, groundY + yOff, z.pos.y);
    zm.group.rotation.y = faceY(z.facing);

    if (z.isDead) {
      const t = Math.min(1, z.deadTimer * 2.2);
      zm.group.rotation.x = -t * (Math.PI / 2);
      zm.group.position.y = groundY + yOff - t * 0.3;
    } else {
      zm.group.rotation.x = 0;
    }
    const flash = z.hitFlash;
    const e = new THREE.Color(flash, flash * 0.15, flash * 0.15);
    zm.body.material.emissive = e;
    zm.head.material.emissive = e;
  }

  /** Advance every animated atmosphere element. Allocation-free. */
  private updateFx(dt: number): void {
    const t = this.time;

    for (const lamp of this.lamps) {
      if (!lamp.flickers) continue;
      // Mostly-on with occasional dips, rather than a strobe.
      const n = flickerNoise(t, lamp.phase);
      const k = n > 0.35 ? 1 : 0.35 + n;
      lamp.light.intensity = lamp.base * k;
      lamp.cone.material.opacity = lamp.coneBase * k;
      if (lamp.glow) lamp.glow.emissiveIntensity = 1.6 * k;
    }

    for (const fire of this.fires) {
      const n = flickerNoise(t, fire.phase);
      fire.light.intensity = fire.base * (0.72 + n * 0.55);
      fire.flame.scale.set(0.86 + n * 0.28, 0.75 + n * 0.5, 0.86 + n * 0.28);
      fire.flame.rotation.y = t * 1.7 + fire.phase;
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
    if (this.doorMesh) this.doorMesh.visible = !world.map.openedDoors.has("vault-door");

    const p = world.player;
    const groundP = world.terrain.heightAt(p.pos.x, p.pos.y);
    this.player.position.set(p.pos.x, p.footY, p.pos.y);
    this.player.rotation.y = faceY(p.aim);

    // Zombies (pooled)
    const zs = world.zombies;
    for (let i = 0; i < zs.length; i++) {
      if (!this.zombiePool[i]) this.zombiePool[i] = this.makeZombie();
      this.syncZombie(this.zombiePool[i], zs[i], zs[i].footY);
    }
    for (let i = zs.length; i < this.zombiePool.length; i++) this.zombiePool[i].group.visible = false;

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
    const camDist = 6.2;
    const camX = p.pos.x - fx * camDist;
    const camZ = p.pos.y - fz * camDist;
    const camY = groundP + 3.3 + this.pitch * 3.5;
    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(p.pos.x + fx * 4, groundP + 1.4 - this.pitch * 3, p.pos.y + fz * 4);

    this.updateFx(dt);
    this.renderer.render(this.scene, this.camera);
  }

  buildIntent(_world: World, input: Input): Intent {
    this.yaw += input.mouseDX * LOOK_SENS;
    this.pitch = Math.max(-0.5, Math.min(0.8, this.pitch + input.mouseDY * LOOK_SENS));

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
