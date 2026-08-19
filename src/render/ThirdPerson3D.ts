// Third-person 3D view. Lifts the 2D ground-plane simulation into world space
// (sim x,y → three x,z; height is the separate y axis), with an over-shoulder
// camera driven by mouselook. Reads World, never writes it.

import * as THREE from "three";
import type { Renderer } from "./Renderer";
import type { World } from "../sim/World";
import type { Input } from "../core/Input";
import type { Intent } from "../sim/types";
import { emptyIntent } from "../sim/types";
import type { Zombie } from "../sim/Zombie";
import { ZOMBIE_RISE_TIME } from "../sim/Zombie";
import { makeGroundTexture, makeWallTexture, makeLabelSprite } from "./procgen";
import { getWeapon } from "../data/weapons";

const WALL_H = 2.6;
const LOOK_SENS = 0.0022;

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

  private yaw = 0;
  private pitch = 0.12;

  mount(container: HTMLElement): void {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "view-3d";
    container.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    this.scene.background = new THREE.Color(0x0a0d0b);
    this.scene.fog = new THREE.Fog(0x0a0d0b, 14, 46);

    const hemi = new THREE.HemisphereLight(0x9fb7a6, 0x14100c, 0.7);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffe6b0, 0.5);
    dir.position.set(8, 18, 6);
    this.scene.add(dir);
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

    // Ground
    const groundMat = new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((b.minX + b.maxX) / 2, 0, (b.minY + b.maxY) / 2);
    this.scene.add(ground);

    // Walls
    const wallMat = new THREE.MeshStandardMaterial({ map: makeWallTexture(), roughness: 0.9 });
    for (const w of world.def.walls) {
      const width = w.maxX - w.minX;
      const depth = w.maxY - w.minY;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, WALL_H, depth), wallMat);
      mesh.position.set((w.minX + w.maxX) / 2, WALL_H / 2, (w.minY + w.maxY) / 2);
      this.scene.add(mesh);
    }

    // Door (its own mesh so we can hide it when opened)
    const door = world.def.doors[0];
    if (door) {
      const dw = door.blocks.maxX - door.blocks.minX;
      const dd = door.blocks.maxY - door.blocks.minY;
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x7a3b1a, roughness: 0.7, emissive: 0x2a1305 });
      this.doorMesh = new THREE.Mesh(new THREE.BoxGeometry(dw, WALL_H, dd), doorMat);
      this.doorMesh.position.set((door.blocks.minX + door.blocks.maxX) / 2, WALL_H / 2, (door.blocks.minY + door.blocks.maxY) / 2);
      this.scene.add(this.doorMesh);
    }

    // Wall-buy markers
    for (const wb of world.def.wallBuys) {
      const def = getWeapon(wb.weaponId);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.5, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x2b3a2b, emissive: 0x1b3a12, emissiveIntensity: 0.6 }),
      );
      box.position.set(wb.pos.x, 1.1, wb.pos.y);
      this.scene.add(box);
      const label = makeLabelSprite(def.name, `$${def.wallCost || def.ammoCost}`);
      label.position.set(wb.pos.x, 2.1, wb.pos.y);
      this.scene.add(label);
    }

    // Player: torso + gun
    this.player = new THREE.Group();
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 0.9, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x39506b, roughness: 0.6 }),
    );
    torso.position.y = 1.0;
    this.player.add(torso);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xcaa98a }),
    );
    head.position.y = 1.7;
    this.player.add(head);
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.16, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x111111 }),
    );
    gun.position.set(0.25, 1.2, 0.5);
    this.player.add(gun);
    this.scene.add(this.player);
  }

  private makeZombie(): ZombieMesh {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 1.15, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x4b6a3a, roughness: 0.8 }),
    ) as ZombieMesh["body"];
    body.position.y = 0.95;
    group.add(body);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.42, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x6b7f52, roughness: 0.8 }),
    ) as ZombieMesh["head"];
    head.position.y = 1.75;
    group.add(head);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x415c33 });
    for (const sx of [-0.42, 0.42]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.7), armMat);
      arm.position.set(sx, 1.15, 0.35);
      group.add(arm);
    }
    group.visible = false;
    this.scene.add(group);
    return { group, body, head };
  }

  private syncZombie(zm: ZombieMesh, z: Zombie): void {
    zm.group.visible = true;
    let yOff = 0;
    if (z.state === "rising") yOff = -(z.riseTimer / ZOMBIE_RISE_TIME) * 1.7;
    zm.group.position.set(z.pos.x, yOff, z.pos.y);
    zm.group.rotation.y = faceY(z.facing);

    if (z.isDead) {
      const t = Math.min(1, z.deadTimer * 2.2);
      zm.group.rotation.x = -t * (Math.PI / 2);
      zm.group.position.y = yOff - t * 0.3;
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
    this.player.position.set(p.pos.x, 0, p.pos.y);
    this.player.rotation.y = faceY(p.aim);

    // Zombies (pooled)
    const zs = world.zombies;
    for (let i = 0; i < zs.length; i++) {
      if (!this.zombiePool[i]) this.zombiePool[i] = this.makeZombie();
      this.syncZombie(this.zombiePool[i], zs[i]);
    }
    for (let i = zs.length; i < this.zombiePool.length; i++) this.zombiePool[i].group.visible = false;

    // Muzzle flash
    this.muzzleLight.intensity = world.muzzle > 0 ? 6 : 0;
    const fx = Math.cos(p.aim);
    const fz = Math.sin(p.aim);
    this.muzzleLight.position.set(p.pos.x + fx * 0.9, 1.2, p.pos.y + fz * 0.9);

    // Tracers
    const maxT = Math.min(world.tracers.length, 64);
    for (let i = 0; i < maxT; i++) {
      const tr = world.tracers[i];
      const o = i * 6;
      this.tracerPos[o] = tr.from.x;
      this.tracerPos[o + 1] = 1.25;
      this.tracerPos[o + 2] = tr.from.y;
      this.tracerPos[o + 3] = tr.to.x;
      this.tracerPos[o + 4] = 1.25;
      this.tracerPos[o + 5] = tr.to.y;
    }
    this.tracers.geometry.setDrawRange(0, maxT * 2);
    this.tracers.geometry.attributes.position.needsUpdate = true;

    // Over-shoulder camera
    const camDist = 6.2;
    const rightX = -Math.sin(this.yaw);
    const rightZ = Math.cos(this.yaw);
    const camX = p.pos.x - fx * camDist + rightX * 1.0;
    const camZ = p.pos.y - fz * camDist + rightZ * 1.0;
    const camY = 3.3 + this.pitch * 3.5;
    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(p.pos.x + fx * 3 + rightX, 1.4 - this.pitch * 3, p.pos.y + fz * 3 + rightZ);

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
