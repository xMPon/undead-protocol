# Map audit — status and outstanding checks

> **The four maps added after Blacksite are not finished.** They are structurally
> sound and pass every automated check, but **no human has looked at any of them
> in 3D, and none has been played.** Treat them as playable drafts, not shipped
> content, until this document says otherwise.

| Map | Structure | Automated checks | Seen in 3D | Played | Balanced |
|---|---|---|---|---|---|
| Blacksite | final | pass | yes | yes | roughly |
| Coldstep | draft | pass | **no** | **no** | **no** |
| Dustline | draft | pass | **no** | **no** | **no** |
| Tidewater | draft | pass | **no** | **no** | **no** |
| Deepcut | draft | pass | **no** | **no** | **no** |

---

## What the automated checks actually prove

`tests/map.test.ts` runs 31 checks against every map in `data/maps.ts`. They
prove the **data is coherent**:

- every prop is inside `bounds`, and none is buried in a wall
- the player spawn is clear, and every wall-buy and door is reachable and inside
  the player cage
- every doorway is continuously caged, so a door you paid for can be walked through
- no barrier breach route is obstructed by a prop
- every region a door unlocks has at least one barrier and one wall-buy
- decals are in bounds, below the wall line, and carry text where the kind needs it
- a real `FlowField` can path from every active barrier to the player, before
  *and* after the doors are opened
- the map loads into the simulation and runs headlessly until a zombie closes on
  the player

That is a high bar for **correctness**. It says nothing at all about whether a
map looks right or plays well.

---

## Outstanding: shared risks across all four

- [ ] **Look at each map in 3D.** Nothing below can be settled without this.
- [ ] **Props on slopes.** A prop is placed at the terrain height of its *centre*,
      so on a gradient a wide prop floats at one corner and sinks at the other.
      The new maps use far steeper terrain than Blacksite — this is the most
      likely visual fault, and the worst offenders will be containers, pipes and
      blockhouses on Deepcut's bowl and Dustline's stepped floors.
- [ ] **Walls on slopes.** Walls are drawn at their centre height and extend 1.2
      below it. A long wall crossing a gradient may show daylight underneath —
      check Deepcut's terraces and the pit rim especially.
- [ ] **Prop interpenetration is only exactly tested for disc pairs.** Two boxes
      are compared by *bounding box*, so a pair of rotated props can clip
      visually and still pass, and a near-miss can fail and be nudged for no
      reason. Every rotated container, pipe, sandbag, jersey barrier and
      blockhouse in the new maps is unverified by eye.
- [ ] **The light pool.** Fourteen point lights are handed to the fixtures
      nearest the player. That was tuned on Blacksite's spacing; maps with very
      different fixture layouts (Tidewater's lamp pairs strung down a pier,
      Dustline's fire-barrel-only lighting) may pop or go dark.
- [ ] **The 2D top-down view** has not been opened on any of the four.
- [ ] **Balance is a guess.** Door costs, wall-buy placement, barrier counts and
      round pacing were scaled from Blacksite by eye and never played.

## Outstanding: per map

### Coldstep — the ring
- [ ] The whiteout (`fogNear 12`, `fogFar 58`, bright fog colour) is untested and
      may either wash the map out completely or make it unplayable.
- [ ] Does the lap actually work? The ring narrows at the two annex corners —
      confirm you can run it continuously without being cornered.
- [ ] Does the sealed hangar read as a building, or as a bare walled box? It has
      no roof and no interior; it may need more dressing against its faces.
- [ ] Four simultaneous barriers may be too much pressure for round 1.

### Dustline — the tight chain
- [ ] `dirIntensity` is 0.35 with fog at 8. This may be **too dark to play**.
- [ ] The rooms are 16×12 and the chase camera pulls in to 1.5 units when
      something is behind you. The camera may spend the whole map jammed in.
- [ ] The 1.2 floor drop at each doorway blends over 0.8 units — check it reads
      as a ramp and not as a step you fall down.
- [ ] Four regions with two barriers each in small rooms may spike difficulty.

### Tidewater — the open pier
- [ ] **Does the water read as water?** It is a flat plane using the `dock`
      ground texture at −3.6. It may simply look like more concrete, in which
      case the map needs a different treatment for it.
- [ ] The deck edge is a hard zero-blend 4.4-unit drop. Confirm it reads as a
      jetty edge and not as an invisible cliff wall.
- [ ] Two wrecks and three rocks are placed deliberately *in the water*. Untested.
- [ ] Firing off the edge, and the camera when backed up to it, are both unknown.

### Deepcut — the hub
- [ ] The bowl blends over 2.0 units, so the pit floor is a shallow curve rather
      than flat. Check props sitting in it.
- [ ] The pit-to-east-gallery step is 6 units over a 2.0 blend. That is the
      steepest ramp in the game and may look like a cliff at the doorway.
- [ ] Sightlines out of the bowl are untested — you may not be able to see the
      barriers you are being flanked from.

---

## Known gaps — things simply not done yet

- No map-specific audio; all five share the same procedural sound set.
- Decal coverage is thinner on the four new maps than on Blacksite.
- Coldstep ships two paid regions where the others have three or four. This was
  deliberate — the ring is the content — but it has not been validated.
- No map has had a balance pass of any kind.

## When a map passes

Move it from **draft** to **final** in the table above, and say so in the
`phase-1-four-more-maps` entry in [`ROADMAP_ITEMS.json`](ROADMAP_ITEMS.json).
Phase 1 is not finished until all five rows read final.
