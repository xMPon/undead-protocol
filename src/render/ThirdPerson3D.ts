// Third-person 3D view. Lifts the 2D ground-plane simulation into world space
// (sim x,y → three x,z; height is the separate y axis), with an over-shoulder
// camera driven by mouselook. Reads World, never writes it.

import * as THREE from "three";
import type { Renderer } from "./Renderer";
import type { World } from "../sim/World";
import type { Input } from "../core/Input";
import type { Intent, ThemeDef } from "../sim/types";
import { emptyIntent } from "../sim/types";
import type { Zombie } from "../sim/Zombie";
import { ZOMBIE_RISE_TIME } from "../sim/Zombie";
import { wallMaterial, makeLabelSprite, buildTerrainMesh, makePropMesh, makeSkyDome } from "./procgen";
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

    // Cover props (lamps and cars also cast light).
    for (const prop of world.def.props ?? []) {
      const scl = prop.scale ?? 1;
      const gy = height(prop.pos.x, prop.pos.y);
      const g = makePropMesh(prop.kind, scl, prop.color);
      g.position.set(prop.pos.x, gy, prop.pos.y);
      g.rotation.y = prop.rot ?? 0;
      this.scene.add(g);

      if (prop.kind === "lamp") {
        const L = new THREE.PointLight(prop.color ?? 0xffe0b0, 16, 30, 2);
        L.position.set(prop.pos.x, gy + 4.0 * scl, prop.pos.y);
        this.scene.add(L);
      } else if (prop.kind === "car") {
        const rot = prop.rot ?? 0;
        const dx = Math.cos(rot);
        const dz = Math.sin(rot);
        for (const s of [-0.35, 0.35]) {
          const hl = new THREE.PointLight(0xfff4e0, 12, 26, 2);
          hl.position.set(prop.pos.x + dx * 1.6 - dz * s, gy + 0.7, prop.pos.y + dz * 1.6 + dx * s);
          this.scene.add(hl);
        }
      }
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

  render(world: World, _dt: number): void {
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
