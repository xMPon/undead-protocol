# Map Authoring Guide

Every map in Undead Protocol is a single **`MapDef`** object (defined in
[`src/sim/types.ts`](../src/sim/types.ts)) exported from a file in `src/data/`.
[`src/data/map_blacksite.ts`](../src/data/map_blacksite.ts) is the **reference
map** — the fastest way to build a new one is to copy it and change the numbers.

Nothing about a map is hard-coded in the engine: the same simulation and both
renderers read whatever `MapDef` you hand `World`. This doc is the field-by-field
blueprint.

---

## Coordinate system

- The world is a **2D ground plane**: `x` = east, `y` = south (so **+y is
  screen-down** in the top-down view).
- The 3D renderer lifts the plane to `(x, height, y)` — the vertical axis is
  separate and comes from the terrain + jump, never from map `y`.
- Units are metres-ish. The player radius is `0.45`, a zombie `0.5`, a crate
  ~`0.9` wide, a shipping container `3.0 × 1.2`.

---

## `MapDef` at a glance

```ts
export const MYMAP: MapDef = {
  name: "My Map",
  bounds: { minX, minY, maxX, maxY },   // terrain + flow-field extent (add margin!)
  playerSpawn: { x, y },
  startRegions: [0],                     // regions live before any door opens
  playBounds: { minX, minY, maxX, maxY },// the box the PLAYER cannot leave
  walls:    [ /* WallRect[]  — perimeter + interior cover */ ],
  barriers: [ /* BarrierDef[] — where zombies breach in */ ],
  wallBuys: [ /* WallBuyDef[] — buyable guns on the wall */ ],
  doors:    [ /* DoorDef[]   — point-gated region unlocks */ ],
  terrain:  { /* TerrainDef — elevation */ },
  theme:    { /* ThemeDef   — fog / lights / sky / ground */ },
  props:    [ /* PropDef[]  — scenery + cover (+ diegetic lights) */ ],
  lights:   [ /* PointLightDef[] — optional extra coloured accents */ ],
};
```

Then register it: `new World(MYMAP)` (Phase 1 defaults to `BLACKSITE`; a
map-select menu is on the Phase-1 to-do list — until then, swap the default in
`src/sim/World.ts` to test another map).

---

## Fields in detail

### `bounds`
The rectangle the terrain mesh and the pathfinding flow-field cover. **Make it a
few units bigger than the outermost wall on every side** so zombies can spawn
just outside a barrier and still be on the grid. Blacksite walls span
`x[-26.6, 66.6]`; its `bounds` is `x[-30, 71]`.

### `playerSpawn` / `startRegions`
Where the player starts, and which regions are active at round 1 (region `0` =
the spawn area). Keep the spawn point on flat ground, clear of walls, props, and
pits.

### `playBounds`
The interior rectangle the **player** is clamped to each frame. Zombies ignore
it, so they can still pour through the barrier gaps while the player can't walk
out of them. Set it just inside the perimeter walls (Blacksite:
`x[-25.6, 65.6] y[-17.6, 17.6]`).

### `walls` — `WallRect[]`
Axis-aligned solid rectangles (`{minX,minY,maxX,maxY}`). They block movement and
bullets and feed the flow-field. Full height in 3D. Uses:
- **Perimeter** with **gaps** for barriers and doors. Convention: wall thickness
  ~`0.6`; leave gaps ~`3–5` units wide so the flow-field (0.8 u cells, inflated
  ~0.4) keeps a walkable corridor through them.
- **Interior cover** — freestanding "blast walls" (thin long rects) that break
  sightlines. Keep them clear of barrier gaps and don't fully seal a region.

### `barriers` — `BarrierDef[]`
`{ pos, inward, region }`. A breach point on the perimeter: `pos` sits on the
wall line, `inward` is the **unit** vector pointing into the room. Zombies spawn
just outside (`pos - inward`) and path in. Only barriers whose `region` is active
spawn. Give each active region at least one.

### `wallBuys` — `WallBuyDef[]`
`{ pos, weaponId, region }`. A gun on the wall; `weaponId` must exist in
[`data/weapons.ts`](../src/data/weapons.ts). First purchase grants the gun (cost
`wallCost`); repeat purchases refill ammo (cost `ammoCost`). Placed against a
wall, reachable, in an active region.

### `doors` — `DoorDef[]`
`{ id, pos, cost, blocks, opensRegion }`. Interacting (F) near `pos` with enough
points removes the `blocks` rectangle from collision and activates
`opensRegion` (its barriers + wall-buys go live). `blocks` should exactly fill a
gap you left in the shared wall.

### `terrain` — `TerrainDef`
Elevation. **Visual + entity-Y only** — movement stays 2D.
```ts
terrain: {
  baseHeight: 0,
  layers: [ { kind, amplitude, wavelength, seed, angle?, steps? } ],
  flatZones: [ { rect, height, blend? } ],
}
```
- `layers` add procedural relief. `kind`: `"hills" | "drifts"` (smooth noise),
  `"noise"` (fine grain), `"dunes"` (ridged, needs `angle`), `"terraces"`
  (stepped, needs `steps`). `amplitude` = peak height, `wavelength` = feature
  size.
- `flatZones` force a level patch: `rect` at `height`, ramped over `blend` units
  at the edges (`blend: 0` = a hard step/cliff). Use for **pits** (negative
  height — the sunken bay is `-3.0`), **raised docks/platforms** (positive), and
  **level building floors** so structures don't sit on a slope.

### `theme` — `ThemeDef`
```ts
theme: { ground, fog, fogNear, fogFar, sky, hemiSky, hemiGround, dir, dirIntensity }
```
- `ground`: `"concrete" | "snow" | "sand" | "dock" | "quarry" | "grass"` — picks
  the procedural ground/normal texture + 2D hillshade palette.
- `fog*` / `sky`: atmosphere; the 3D view builds a gradient sky dome from `sky`
  and a warm horizon derived from `dir`.
- `hemiSky` / `hemiGround`: ambient sky/bounce colours. `dir` / `dirIntensity`:
  the sun's colour/strength. The sun's **angle is set by the renderer** (high and
  overhead) — you only choose its colour/intensity.

### `props` — `PropDef[]`
`{ kind, pos, rot?, scale?, solid?, color? }`. Scenery and cover. Kinds and
their specs live in [`sim/props.ts`](../src/sim/props.ts); `rot` is yaw in
radians and `scale` multiplies size, footprint, and height.

**Facing convention:** a prop's local **+x points along `rot`** — that is the
car's bonnet, the lamp's arm, the floodlight lens, and the tower's searchlight.
Both views agree, so `rot: 0` always means "aimed east".

**Solidity:** most kinds block movement and bullets and are **jumpable** up to
their height. Kinds marked *decor* are pass-through dressing; `solid: true` /
`solid: false` overrides either default on a single placement.

| kind | footprint | height | notes |
|---|---|---|---|
| `crate` | 0.9² | 0.9 | jump-on; `color` tints wood |
| `barrel` | 0.8² | 0.95 | jump-on; drawn round |
| `sandbag` | 1.1×0.64 | 0.42 | low cover; line them up for emplacements |
| `rock` | 1.1² | 1.2 | |
| `pallet` | 1.2×1.0 | 0.34 | flat stock; scatter near crates/containers |
| `rubble` | 1.8×1.4 | 0.55 | collapsed concrete + rebar; jump-on |
| `concreteBarrier` | 2.0×0.64 | 0.85 | jersey barrier; jump-on; makes checkpoints/chicanes |
| `pipe` | 4.0×1.1 | 1.1 | see-through bore; jump-on; long sight-blocker |
| `dumpster` | 2.0×1.1 | 1.25 | jump-on |
| `container` | 3.0×1.2 | 2.4 | big sight-blocker; `color` tints it; too tall to mount |
| `wreck` | 2.2×1.0 | 1.15 | burnt-out car, **smokes**; jump-on |
| `deadTree` | 0.6² | 4.6 | silhouette; good outside the wire |
| `fence` | 3.2×0.16 | 2.4 | chain-link + barbed wire; **see-through but solid** — leave gaps |
| `generator` | 2.2×1.2 | 1.4 | glowing status LED (no cast light) |
| `tank` | 1.9² | 4.2 | fuel silo with a ladder |
| `tower` | 2.4² | 6.4 | guard tower; **casts a searchlight along `rot`** |
| `antenna` | 0.7² | 9.5 | comms mast; **blinking** red beacon (no cast light) |
| `lamp` | thin | 4.2 | **emits light** (warm; `color` overrides); ~1 in 3 flickers |
| `car` | 2.2×1.0 | 1.3 | **emits a headlight beam** along `rot`; jump-on; `color` = body |
| `floodlight` | 1.0² | 2.5 | **emits a tilted beam** along `rot` |
| `firebarrel` | 0.8² | 0.95 | **emits flickering firelight**; animated flame + smoke |
| `cone` | 0.44² | 0.55 | *decor* — mark ramps, breaches, checkpoints |
| `sign` | 1.2×0.2 | 1.9 | *decor* — hazard board |
| `puddle` | 2.8×2.0 | — | *decor* — wet, near-mirror; put them in pits and low spots |

Emissive kinds cost a real point light in the 3D view, which a forward renderer
pays for on every fragment — **keep a map under roughly 20 of them** (Blacksite
runs ~19). Self-lit detail with no cast light (`generator`, `antenna`) is free,
so prefer it for decoration.

### `lights` — `PointLightDef[]` (optional)
`{ pos, color, intensity, range, height? }`. Prefer **diegetic** light from
`lamp`/`car` props; use this only for extra coloured accents (a glow in a pit,
etc.).

---

## Regions & progression

Region `0` is live at spawn. Each `door` unlocks one further region. A region's
`barriers` and `wallBuys` only activate once its region is live — so gate deeper
areas (and their better guns) behind doors, exactly like Blacksite's vault.

---

## New-map checklist

- [ ] `bounds` extends a few units past every outer wall.
- [ ] `playerSpawn` is on flat ground, not inside a wall/prop/pit.
- [ ] `playBounds` sits just inside the perimeter.
- [ ] Every active region has ≥1 barrier with a correct **unit** `inward`.
- [ ] Barrier/door gaps are wide enough (~3+ u) for zombies to path through.
- [ ] Interior cover doesn't seal a region or block a barrier's path to the player.
- [ ] Every `wallBuy.weaponId` exists in `data/weapons.ts`.
- [ ] Each `door.blocks` exactly fills its wall gap; `opensRegion` is correct.
- [ ] `flatZones` level any building floors; pits/docks read clearly.
- [ ] Props avoid the spawn point and barrier gaps.
- [ ] Solid props leave every interaction point (wall-buys, doors) reachable.
- [ ] Fences and barrier lines leave a walkable gap — they are solid.
- [ ] The map keeps its light-emitting props to roughly 20.

## Verify

```bash
npm test        # sim/terrain/collision tests run in Node
npm run build   # tsc --noEmit + vite build
npm run dev     # play it; press T to check the 2D relief view
```

[`tests/map.test.ts`](../tests/map.test.ts) already runs the data-integrity
checks that a prop pass tends to break — props inside `bounds`, a clear spawn,
unobstructed breach routes, reachable interaction points, decor kept out of
collision, and a real `FlowField` proving every active barrier can still path to
the player before *and* after the doors open. **Add a new map to its `MAPS`
table and it inherits all of them**; extend it only for map-specific progression
rules.
