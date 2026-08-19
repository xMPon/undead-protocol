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

- **Main menu** with a choice of starting view (3D or 2D).
- **One map — "Blacksite":** a spawn room and a vault room split by a 750-point
  door, with boarded windows the zombies breach through.
- **Two renderers over one simulation** — a Three.js third-person view and a
  Canvas 2D top-down view, swappable live with no effect on game state.
- **Shooting** — hitscan guns with spread, per-weapon fire rate, magazines,
  reloads, and reserve ammo. Bullets are stopped by walls.
- **Four weapons** — the starting **M9 Sidearm** plus three wall-buys
  (**PDW-57** SMG, **KR-12** rifle, **Breacher-12** shotgun).
- **Zombies** that rise from barriers, flow-field pathfind to you, and swarm.
- **Round system** with Black-Ops-style health/count scaling and a breather
  between rounds.
- **Points economy** — earn on hits and kills; spend on wall-buys and the door.
- **HUD**, damage feedback, procedural audio, and a local best-round high score.

See [`CLAUDE.md`](CLAUDE.md) for the architecture and the full phase roadmap
(perks, mystery box, weapon upgrades, dog rounds, boss rounds, easter eggs).

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

## Publishing to GitHub

This repo is initialized locally. To open-source it:

```bash
gh repo create undead-protocol --public --source=. --remote=origin --push
```

(or create an empty repo on GitHub and `git remote add origin … && git push -u
origin main`). `vite.config.ts` already sets `base: "/undead-protocol/"` for
GitHub Pages.

## License

MIT — see [`LICENSE`](LICENSE).
