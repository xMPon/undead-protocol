# Undead Protocol — Developer Guide

Round-based zombie survival shooter for the browser. TypeScript + Three.js +
Vite. Plain TS game loop — no React, no game engine. **3D third-person with a
2D top-down toggle**, built on one shared simulation with two renderers.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server at `http://localhost:5173` |
| `npm test` | vitest unit + headless-sim tests (`tests/`) |
| `npm run build` | typecheck (`tsc --noEmit`) + production build |

## The one big idea

**One simulation, two renderers.** The game is simulated on the 2D ground plane
`(x, y)`; player and zombies are circles with a facing angle, the map is
rectangles. `src/sim/` is **headless, DOM-free, and deterministic-friendly** —
it never imports three.js or touches the DOM, so the whole game logic is
unit-testable in Node. Two renderers read that world and draw it — a Three.js
third-person view (`x,y → x,z`, height is the separate `y`) and a Canvas 2D
top-down view. Input is abstracted to a view-independent `Intent`; the sim only
ever reads `Intent`, never the raw keyboard/mouse. Toggling the view (`T`)
changes nothing about game state.

## Architecture (`src/`)

| Module | Responsibility |
|---|---|
| `core/math.ts` | `Vec2` + pure vector/angle helpers (the shared ground-plane math) |
| `core/rng.ts` | mulberry32 PRNG + integer hash (blockcraft pattern) |
| `core/Loop.ts` | RAF loop with clamped dt |
| `core/Input.ts` | keyboard state, one-frame edges, mouse pos/delta, pointer lock |
| `core/Sound.ts` | procedural WebAudio SFX (guns, groans, hits, round sting) — no files |
| `sim/types.ts` | `Intent`, weapon/map/terrain/theme/prop/light data shapes, `Obstacle`, `Tracer` |
| `sim/World.ts` | **the integrator** — owns all state incl. terrain, obstacles, jump physics; `update(dt, intent)` |
| `sim/Player.ts` | transform, `footY`/jump, survival (health/i-frames/regen), points, carried weapons |
| `sim/Zombie.ts` | undead entity data + `footY`/jump + stuck-timer; damage/death; steering runs in World |
| `sim/Terrain.ts` | procedural heightfield `heightAt(x,y)` (pure); elevation is visual + entity-Y only |
| `sim/props.ts` | `PROP_SPECS` — footprint/height/colour/`emits`/`decor`/`round`/`parts` per prop kind + `isSolidProp` and `propColliders` (the one source of a prop's solids, for collision *and* the flow field) |
| `sim/Round.ts` | round state machine + `zombieHealth`/`zombieCount` scaling (pure) |
| `sim/Spawner.ts` | spawn-cadence gate + interval (pure) |
| `sim/Weapons.ts` | fire/reload/ammo mechanics on a `WeaponInstance` (pure) |
| `sim/Economy.ts` | points award/spend rules (pure) |
| `sim/Map.ts` | runtime map: door/region state + current collision walls (incl. solid props) |
| `sim/collision.ts` | circle vs rect/**oriented box**/disc + **height-aware obstacle** resolution, `supportHeight`, ray casts, `clampToZones` player cage (pure) |
| `sim/pathing.ts` | BFS flow-field toward the player; zombies sample its gradient |
| `render/Renderer.ts` | the interface both views implement (`render`/`buildIntent`/…) |
| `render/ThirdPerson3D.ts` | Three.js view: displaced terrain, sun **shadows** + ACES tone mapping, entity jump lift, the diegetic light rig (a fixed 14-light pool handed to the nearest fixtures + haze cones + flicker) and atmosphere (fire, smoke, dust, stars) |
| `render/TopDown2D.ts` | Canvas 2D top-down: terrain hillshade, prop footprints (dressing drawn faint), light glows, jump shadows |
| `render/ViewManager.ts` | holds both renderers, keeps one visible, toggles them |
| `render/procgen.ts` | procedural PBR-ish materials (albedo + **normal maps**), terrain mesh, sky dome, prop meshes — no asset files |
| `data/weapons.ts` | `WEAPONS` registry (original, non-trademarked designations) |
| `data/map_blacksite.ts` | the reference map "Blacksite" — walls, barriers, buys, door, terrain, theme, props, lights, `playBounds` |
| `data/perks.ts` | perk registry — **reserved for Phase 2**, not wired yet |
| `ui/Hud.ts` | round/points/health/ammo/prompt/banner + damage vignette (DOM) |
| `ui/Menu.ts` | main menu (`Menu`) + pause overlay (`PauseMenu`) |
| `ui/GameOver.ts` | death screen: round reached, best, restart/menu |
| `persist/Store.ts` | localStorage best-round high score + persisted control `settings` (look sensitivity, turn speed, invert Y) |
| `main.ts` | bootstrap + menu→playing→paused/over state machine; `window.__up` |

## Conventions

- **`sim/` stays DOM-free and three-free.** No `document`, no `THREE`, no
  `window`. That's what lets `tests/world.test.ts` drive the entire game in Node.
- **The sim reads `Intent`, never `Input`.** View-specific mapping (camera-yaw
  aim in 3D, cursor aim in 2D) lives in each renderer's `buildIntent`.
- **Roadmap every change.** Before introducing a feature, fixing a bug,
  addressing technical debt, or making a meaningful maintenance change, link the
  work to an existing roadmap issue or create a new categorised roadmap entry.
  Start the linked issue before implementation and keep its status and details
  aligned with the code change. Update `docs/ROADMAP_ITEMS.json` when the change
  affects the planned roadmap so the GitHub Project sync remains accurate.
- **No asset files.** Textures, sprites, and all SFX are generated at runtime
  (mirrors blockcraft's procedural atlas/sound philosophy).
- **Names are original.** No trademarked perk/gun/map names — safe to
  open-source. Perk ids in `data/perks.ts` are stable contracts for Phase 2.
- **Weapon ids are stable contracts** (map wall-buys reference them) — append,
  don't rename.
- **Verification handle:** `main.ts` exposes
  `window.__up = { world, vm, input, hud, sound, loop, start, getState }`. When
  the tab is backgrounded the RAF loop throttles, so verify the sim headlessly:
  loop `world.update(dt, intent)` and read `world.zombies`, `world.player`,
  `world.rounds`, `world.kills` directly.
- **A prop's solids come from `propColliders`.** Collision obstacles and
  flow-field walls are both built from it, so what blocks the player, what blocks
  a zombie, and what you can see can never drift apart. Never re-derive a
  footprint by hand — an inflated bounding box is what an "invisible wall" is.
- **Elevation is cosmetic to gameplay.** `Terrain.heightAt` and jump `footY`
  drive where things are *drawn* and height-aware obstacle mounting, but
  movement/collision resolve in 2D — so the sim stays deterministic and testable.

## Authoring maps

Every map is a single `MapDef` (`src/sim/types.ts`) exported from a file in
`src/data/`. **`data/map_blacksite.ts` is the reference/blueprint** — copy its
shape. The full field-by-field guide, coordinate conventions, prop/terrain/theme
/light options, region+door progression, and a new-map checklist live in
[`docs/MAP-AUTHORING.md`](docs/MAP-AUTHORING.md). To add a prop kind: extend
`PropKind` (`types.ts`), `PROP_SPECS` (`sim/props.ts`), `makePropMesh`
(`render/procgen.ts`), and the 2D draw (`render/TopDown2D.ts`) — plus
`addPropFx` (`render/ThirdPerson3D.ts`) if it emits light or animates. Props
face **local +x along `rot`** in both views; keep new meshes to that convention.

## Roadmap

- **Phase 1 — DONE (this repo):** main menu; map "Blacksite"; dual 3D/2D
  renderers; movement + hitscan shooting + reload; 4 weapons (M9 + PDW-57 /
  KR-12 / Breacher-12 wall-buys); flow-field zombie AI; round system with
  health/count scaling + intermissions; points economy (hits/kills, wall-buys,
  door); HUD + game over + local high score; procedural audio.
  **Polish landed since:** procedural heightfield terrain + per-map theming;
  jumping (player + zombies, onto objects) with height-aware collision; a bigger,
  colourful, prop-rich Blacksite (containers/crates/barrels/sandbags/lamps/cars,
  blast-wall cover, sunken bay + raised docks); diegetic lighting (overhead sun +
  lamp posts + car headlights); real-time shadows + ACES tone mapping + normal-
  mapped materials + gradient sky; `playBounds` player cage; fixed 3D aim.
  **Environment-detail pass:** 16 more prop kinds (chain-link fence, jersey
  barriers, pipes, pallets, dumpsters, tanks, generators, a guard tower, a comms
  mast, floodlights, fire barrels, wrecks, rubble, dead trees, cones, signs,
  puddles), pass-through `decor` props, fake-volumetric light shafts, lamp
  flicker, animated fire + smoke + dust + stars, and `tests/map.test.ts` map
  integrity checks.
  **Four-region Blacksite:** the substation (1000, off spawn) and the cold store
  (1250, behind the vault), each with barriers, terrain, dressing and a wall-buy
  (Lancer-7 and Havoc-9); `playBounds` is a union of per-wing rects so a compound
  no longer has to be one box; doors are named in the prompt and get a mesh each.
  **Controls and collision pass:** rotated props collide as oriented boxes and
  round ones as discs (no more bounding-box snags), multi-part props like the
  guard tower collide as their legs so you can walk under them, the chase camera
  pulls in and fades the player when something solid is behind them, and
  keyboard turning (Q/E, arrows) plus a persisted sensitivity/turn-speed setting
  in the pause menu make the game playable on a trackpad.
  **Remaining:** the four other maps + a map-select menu.
- **Phase 2:** perks (Ironhide / Rapid Rounds / Fast Hands / Second Wind), the
  Mystery Box ("The Cache"), grenades, ADS, more map regions, board-up barriers.
- **Phase 3:** weapon-upgrade station ("The Forge"), dog/Feral-Hound rounds,
  power-ups (Resupply / Executioner / Purge / Bonus / Fortify), power switch,
  second map.
- **Phase 4:** boss rounds, traps, mini-quests.
- **Phase 5:** easter eggs (musical + multi-step main quest), difficulty/
  settings, leaderboards.

Not planned: co-op (networking is a separate major effort).
