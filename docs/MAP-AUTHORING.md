# Map Authoring Guide

Every map in Undead Protocol is a single **`MapDef`** object (defined in
[`src/sim/types.ts`](../src/sim/types.ts)) exported from a file in `src/data/`.
[`src/data/map_blacksite.ts`](../src/data/map_blacksite.ts) is the **reference
map** — the fastest way to build a new one is to copy it and change the numbers.

> **Status:** Blacksite is finished. Coldstep, Dustline, Tidewater and Deepcut
> are **drafts awaiting audit** — correct data, but unseen and unplayed. Read
> [`MAP-AUDIT.md`](MAP-AUDIT.md) before treating any of them as a reference, and
> add your own map to its table when you build one.

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
  id: "my-map",                          // stable: the menu and settings store it
  name: "My Map",
  blurb: "One line for the map-select card.",
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

Then add it to `MAPS` in [`src/data/maps.ts`](../src/data/maps.ts). That single
line puts it in the map-select menu **and** enrols it in every data-integrity
check in `tests/map.test.ts`, including a headless play test that proves the
horde can reach the player from its barriers. Nothing else needs to know it
exists.

`id` is a stable contract — the menu and saved settings store it, so append,
never rename. `blurb` is the one line shown on the menu card.

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

### `playBounds` - `WallRect[]`
The rectangles the **player** is clamped to each frame - the cage that stops them
strolling out through a barrier gap. Zombies ignore it entirely, so they still
pour through those gaps while the player cannot follow.

The player may stand anywhere in the **union**, so a compound with wings lists
one rect per wing, each sitting just inside that perimeter wall.
**Connected rects must overlap across their shared doorway by more than the
player diameter (0.9).** Each rect is inset by the player radius before the
clamp, so two rects that merely touch leave a band neither of them accepts - and
the player cannot walk through that door at all, no matter what they paid for it.
The southern wings of Blacksite reach 1.4 units back into the yards for this
reason. Outside every zone the player is pulled to the nearest point of the
nearest rect.

Put each rect on the **inner wall faces** (Blacksite's yards are exactly
`x[-26, 66] y[-18, 18]`), not inset from them: the walls already stop the player,
so an inset just adds an invisible kerb along every wall in the map. The cage
only needs to bite at the barrier gaps.

Do not just take the bounding box of the whole map: the only job of the cage is
to cover the floor the player is allowed on and *nothing else*.

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
`{ id, pos, name?, cost, blocks, opensRegion }`. Interacting (F) near `pos` with
enough points removes the `blocks` rectangle from collision and activates
`opensRegion` (its barriers + wall-buys go live). `blocks` should exactly fill a
gap you left in the wall, and `pos` should sit on it - put `pos` at the centre of
the gap. `name` is what the HUD prompt calls it ("Open Cold Store"); it falls
back to "Open Door".

Doors are independent, so a map can branch: the vault and substation of Blacksite
both open off the spawn yard, while the cold store is only reachable through the
vault - which makes it the deepest room in both distance and points.

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

**Shape:** a prop collides as what you can see it to be. Rotated props are
oriented boxes, not bounding boxes; kinds marked *round* in `PROP_SPECS` collide
as discs; and a kind with `parts` collides as those pieces, which is why you can
walk between the legs of a `tower`. All of it comes out of `propColliders`, so
adding a kind means describing its shape there once rather than in each consumer.

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
| `blockhouse` | 4.0×3.6 | 3.0 | **walk-in shelter**: four walls, a 2.2-wide doorway on its `rot` face, lit inside |
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

Place emissive kinds freely: the 3D view keeps a **fixed pool of 14 point
lights** and hands them each frame to the fixtures nearest the player, so the
light count of a map never changes what the GPU pays. Glow, haze cone and flame
animate on every fixture regardless - only the cast light is pooled. Self-lit
detail with no cast light at all (`generator` LED, `antenna` beacon) is cheaper
still.

### `decals` — `DecalDef[]` (optional)
`{ kind, pos, rot?, height?, scale?, text?, color? }`. Graffiti, stencils, tally
marks, biohazard symbols, blood and scorch marks. No collider, no simulation
involvement — but they are what makes a compound feel like somewhere people were,
so put them where the story happened rather than spreading them evenly.

- `kind`: `"tag"` (dripping spray paint, uses `text`, `\n` splits two lines),
  `"stencil"` (sprayed-through block lettering, uses `text`), `"arrow"`,
  `"tally"` (days scratched off), `"biohazard"`, `"blood"`, `"scorch"`.
- `rot` is the direction the decal **faces** — point it away from the wall and
  into the room, the same convention props use. A wall at `y = -18` with the room
  to its south faces `+y`, so `rot: 1.5708`.
- `height` is the centre above the ground; **`0` lays it flat on the floor**,
  which is what blood and scorch marks want. Keep wall decals at or below `2.0`
  so they do not ride over the top of a 2.6-unit wall.
- Sit wall decals ~0.15 in front of the wall face (`y: -17.85` for that wall) so
  they are not inside it.

Only floor decals appear in the 2D view, faintly — wall graffiti has no meaning
in a top-down tactical read.

### `lights` — `PointLightDef[]` (optional)
`{ pos, color, intensity, range, height? }`. Prefer **diegetic** light from
`lamp`/`car` props; use this only for extra coloured accents (a glow in a pit,
etc.).

---

## Make it a different shape, not a different colour

The quickest way to build a map that feels like one you already have is to lay
out rectangular yards in a row, put a door in the middle of each shared wall and
change the ground kind. Resist it. Decide what the **layout** does to the fight
first, then let the theme follow:

| Shape | The fight it makes |
|---|---|
| Branching yards (*Blacksite*) | routes and choices; you can be flanked through a door |
| A **ring** round a solid mass (*Coldstep*) | a lap you can kite forever; keep it bare or it stops being one |
| A **tight chain** of small rooms (*Dustline*) | no kiting, barriers within a few strides, close-range weapons |
| An **open plate** with no perimeter (*Tidewater*) | the edge is the boundary; barriers on every side at once |
| A **hub with spokes** (*Deepcut*) | no "deeper" - only directions, and a back you have turned |

Vary the same things the shape does: prop **density** (the ring of Coldstep is
nearly empty, Dustline is wall-to-wall), **fog distance** (8 to 95 across the
roster), `dirIntensity` (0.35 in a dark bunker, 1.9 in a quarry at golden hour),
and how many barriers a region has and how close they are.

**Give every map its own terrain system too** - that is half of what makes a
place somewhere. Across the roster: settled hills, wind drifts, floors stepping
down at each doorway, a water plane with hard-edged decking, and stepped benches
around a bowl. See the table in the README.

## Regions & progression

Region `0` is live at spawn. Each `door` unlocks one further region. The
`barriers` and `wallBuys` of a region only activate once that region is live - so
gate deeper areas, and their better guns, behind doors.

> **The gating rule.** A region you unlock with a door must take its zombies
> from barriers that open to the **outside of the compound**. A barrier gap
> facing a region the player can already reach is simply a hole they can walk
> through, and the door becomes decorative - the cage is a union of rectangles
> and cannot fence off an interior room. If a room is surrounded by ground the
> player already owns it cannot be a paid region: make it a solid mass (as the
> hangar of Coldstep is) and hang the paid rooms off the perimeter instead.

Give every region you unlock **at least one barrier and one wall-buy**: a region
with no barrier is a safe room the horde cannot reach, and one with no wall-buy
gives the player no reason to spend the points. Blacksite runs four regions:

| region | room | door | cost | guns |
|---|---|---|---|---|
| 0 | spawn yard | - | - | PDW-57 |
| 1 | vault yard | `vault-door`, off spawn | 750 | KR-12, Breacher-12 |
| 2 | substation | `substation-door`, off spawn | 1000 | Lancer-7 |
| 3 | cold store | `coldstore-door`, off the vault | 1250 | Havoc-9 |

The other four maps gate differently on purpose: Coldstep hangs two annexes off
the perimeter, Dustline chains four rooms so each door is the only way on,
Tidewater gates the shore end and the sea end of one pier, and Deepcut puts
three doors on one room so nothing is ever simply "next".

Adding a wing is five edits: carve a door gap in the wall you are hanging it off,
add the perimeter walls of the wing (with gaps for its barriers), add the
`DoorDef`, add its `barriers`/`wallBuys`/`props`, and **add its rect to
`playBounds`**. The last one is the easy one to forget - and the map tests catch
it.

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
- [ ] Every wing has its own `playBounds` rect, on the inner wall faces, overlapping its neighbour by >0.9 at the doorway.
- [ ] Every region a door unlocks has at least one barrier and one wall-buy.
- [ ] No solid prop is buried in a wall.
- [ ] Walk-in props (`blockhouse`) sit on a `flatZone` so no daylight shows under a wall.
- [ ] Wall decals face into the room, sit ~0.15 off the wall, and stay under 2.0 high.

## Verify

```bash
npm test        # sim/terrain/collision tests run in Node
npm run build   # tsc --noEmit + vite build
npm run dev     # play it; press T to check the 2D relief view
```

These checks are necessary and nowhere near sufficient: they verify the data, not
the map. Budget for a play session per map on top, and record what you find in
[`MAP-AUDIT.md`](MAP-AUDIT.md).

[`tests/map.test.ts`](../tests/map.test.ts) already runs the data-integrity
checks that a prop pass tends to break — props inside `bounds`, a clear spawn,
unobstructed breach routes, reachable interaction points, decor kept out of
collision, and a real `FlowField` proving every active barrier can still path to
the player before *and* after the doors open. **Add a new map to its `MAPS`
table and it inherits all of them**; extend it only for map-specific progression
rules.
