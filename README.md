# Undead Protocol

A round-based zombie survival shooter for the browser, in the spirit of the
classic wave-survival mode. Hold out across escalating rounds, earn points,
buy weapons off the wall, and push deeper into the map. **Two views, one game:**
play it as a **3D third-person shooter** or flip to a **2D top-down** tactical
view at any moment with a single key.

> TypeScript · Three.js · Vite — a plain game loop, no engine, **zero art or
> audio assets** (everything is generated procedurally at runtime).

---

## Play

```bash
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`), click **Deploy**, and
survive.

> **GitHub Pages:** The repository includes a deployment workflow for
> [`https://xMPon.github.io/undead-protocol/`](https://xMPon.github.io/undead-protocol/).
> Configure the repository's Pages source as **GitHub Actions** if the site has
> not been enabled yet.

### Controls

| Action | Key |
|---|---|
| Move | `W` `A` `S` `D` |
| Aim | Mouse |
| Fire | Left Click |
| Reload | `R` |
| Switch weapon | `1` / `2` |
| Buy weapon / open door | `F` |
| Sprint | `Shift` |
| **Toggle 3D ⇄ 2D view** | `T` |
| Pause | `Esc` |

---

## What's in Phase 1

Phase 1 is **complete**.

- **Main menu** with map select and a choice of starting view (3D or 2D).
- **Five maps**, each with its own ground, weather, elevation and dressing:
  | Map | Setting | Areas |
  |---|---|---|
  | **Blacksite** | research compound at dusk | 4 |
  | **Coldstep** | arctic listening post under the drifts | 2 |
  | **Dustline** | desert fuel depot, an L-shaped compound | 3 |
  | **Tidewater** | container terminal on a dead harbour | 3 |
  | **Deepcut** | open-cast quarry with the pit four units down | 3 |
- **Point-gated rooms** — every map gates its deeper areas behind doors with a
  keypad and a price on the sign, and boarded barriers the zombies breach through.
- **Two renderers over one simulation** — a Three.js third-person view and a
  Canvas 2D top-down view, swappable live with no effect on game state.
- **Shooting** — hitscan guns with spread, per-weapon fire rate, magazines,
  reloads, and reserve ammo. Bullets are stopped by walls.
- **Six weapons** — the starting **M9 Sidearm** plus five wall-buys
  (**PDW-57** SMG, **KR-12** rifle, **Breacher-12** shotgun, **Lancer-7**
  marksman rifle, **Havoc-9** LMG). The carried model is built from the weapon's
  own stats, so it looks like what it is.
- **Zombies** that rise from barriers, flow-field pathfind to you, and swarm —
  jointed bodies with a walk cycle, a grab, a collapse, and per-body variation.
- **Graffiti, stencils and stains** on the walls and floors, walk-in shelters,
  and diegetic lighting: lamps, headlights, floodlights, searchlights and drums.
- **Adjustable controls** — look sensitivity, keyboard turn speed and invert-Y,
  saved between sessions.
- **Round system** with Black-Ops-style health/count scaling and a breather
  between rounds.
- **Points economy** — earn on hits and kills; spend on wall-buys and the door.
- **HUD**, damage feedback, procedural audio, and a local best-round high score.

See [`CLAUDE.md`](CLAUDE.md) for the architecture and [`TODO.md`](TODO.md) for
the categorized remaining roadmap (perks, mystery box, weapon upgrades, dog
rounds, boss rounds, easter eggs, and release work).

Roadmap automation uses [`docs/ROADMAP_ITEMS.json`](docs/ROADMAP_ITEMS.json) as
the source of truth and syncs it to GitHub Project roadmap items via
[`docs/ROADMAP-SYNC.md`](docs/ROADMAP-SYNC.md).

---

## Develop

```bash
npm run dev      # Vite dev server
npm test         # Vitest unit + headless-sim tests
npm run build    # tsc --noEmit + production build
```

The simulation (`src/sim/`) is headless and DOM-free, so the entire game logic
is unit-tested in Node — see `tests/world.test.ts`.

---

## Publishing to GitHub Pages

GitHub Actions deploys the `dist` build whenever `main` changes. The Vite
configuration uses `base: "/undead-protocol/"`, which matches this project's
Pages URL. The first deployment may require enabling **GitHub Actions** under
the repository's Settings → Pages menu.

For the first deployment, open the repository's **Settings → Pages** and set
**Source** to **GitHub Actions**. After that, push to `main` or start the
**Deploy to GitHub Pages** workflow manually from the **Actions** tab.

## License

MIT — see [`LICENSE`](LICENSE).
