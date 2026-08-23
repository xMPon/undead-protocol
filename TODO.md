# Undead Protocol TODO

Remaining work, grouped by area. Items are ordered roughly by dependency and player value.

## Maps and progression

- [ ] Add the four remaining maps planned for the first release phase.
- [ ] Build a map-select menu and pass the selected map into the shared simulation.
- [x] Add more map regions with meaningful unlock routes and wall buys. *(Blacksite: substation + cold store; the other maps still need theirs.)*
- [ ] Add the power switch and connect it to map progression.
- [ ] Add a second fully featured map for the later progression phase.

## Player systems

- [ ] Add perks: Ironhide, Rapid Rounds, Fast Hands, and Second Wind.
- [ ] Add grenades and grenade input, damage, audio, and HUD feedback.
- [ ] Add aim-down-sights behavior and weapon-specific accuracy tuning.
- [ ] Add board-up interactions for breached barriers.
- [ ] Add power-ups: Resupply, Executioner, Purge, Bonus, and Fortify.

## Weapons and enemies

- [ ] Add the Mystery Box (The Cache) with a weighted weapon pool.
- [ ] Add the weapon-upgrade station (The Forge).
- [ ] Add dog/Feral-Hound rounds and their enemy behavior.
- [ ] Add boss rounds with dedicated boss behavior and telegraphs.
- [ ] Add traps and trap purchasing/activation rules.

## Missions and secrets

- [ ] Add mini-quests with clear state, objectives, and rewards.
- [ ] Add a musical easter egg.
- [ ] Add a multi-step main easter egg quest.

## Accessibility and meta

- [ ] Add difficulty settings and gameplay/audio controls.
- [ ] Add local or server-backed leaderboards with validation and privacy considerations.
- [ ] Add a browser support note covering WebGL, pointer lock, and WebAudio.
- [ ] Add screenshots or a short gameplay capture to the README.

## Engineering and release

- [ ] Add map validation tests for bounds, spawn points, regions, barriers, doors, and weapon ids.
- [ ] Add end-to-end smoke coverage for menu, view switching, progression, death, and restart.
- [ ] Add bundle/performance measurements for rendering, pathfinding, and entity counts.
- [ ] Keep co-op as a separate major networking project; it is intentionally outside this backlog.
