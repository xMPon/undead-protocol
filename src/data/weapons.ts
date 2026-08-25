// Weapon registry. Original designations (no trademarked names). Tuned so the
// starting sidearm is viable early but wall-buys clearly outclass it by design,
// and the two `boxOnly` guns clearly outclass the walls — those are the reason
// to keep feeding The Cache instead of banking points.

import type { WeaponDef } from "../sim/types";

export const WEAPONS: Record<string, WeaponDef> = {
  m9: {
    id: "m9",
    name: "M9 Sidearm",
    damage: 40,
    rpm: 360,
    magSize: 12,
    reserveMax: 96,
    reloadTime: 1.3,
    pellets: 1,
    spread: 0.012,
    auto: false,
    range: 60,
    wallCost: 0,
    ammoCost: 100,
  },
  pdw: {
    id: "pdw",
    name: "PDW-57",
    damage: 55,
    rpm: 850,
    magSize: 30,
    reserveMax: 270,
    reloadTime: 1.8,
    pellets: 1,
    spread: 0.03,
    auto: true,
    range: 55,
    wallCost: 1000,
    ammoCost: 500,
  },
  kr12: {
    id: "kr12",
    name: "KR-12",
    damage: 130,
    rpm: 600,
    magSize: 30,
    reserveMax: 300,
    reloadTime: 2.2,
    pellets: 1,
    spread: 0.02,
    auto: true,
    range: 80,
    wallCost: 1200,
    ammoCost: 600,
  },
  lancer: {
    id: "lancer",
    name: "Lancer-7",
    damage: 340,
    rpm: 150,
    magSize: 10,
    reserveMax: 90,
    reloadTime: 2.6,
    pellets: 1,
    spread: 0.005,
    auto: false,
    range: 120,
    wallCost: 1750,
    ammoCost: 850,
  },
  havoc: {
    id: "havoc",
    name: "Havoc-9",
    damage: 105,
    rpm: 780,
    magSize: 75,
    reserveMax: 450,
    reloadTime: 4.4,
    pellets: 1,
    spread: 0.05,
    auto: true,
    range: 70,
    wallCost: 2000,
    ammoCost: 1000,
  },
  // --- The Cache only. Never put these on a wall-buy: `boxOnly` is what makes
  //     rolling the box worth 950 points a go, and tests enforce it. ---
  arclight: {
    id: "arclight",
    name: "Arclight VX",
    damage: 1400,
    rpm: 90,
    magSize: 6,
    reserveMax: 30,
    reloadTime: 3.4,
    pellets: 1,
    spread: 0.004,
    auto: false,
    range: 110,
    wallCost: 0,
    ammoCost: 4500,
    boxOnly: true,
  },
  hailstorm: {
    id: "hailstorm",
    name: "Hailstorm",
    damage: 78,
    rpm: 260,
    magSize: 20,
    reserveMax: 160,
    reloadTime: 3.0,
    pellets: 6,
    spread: 0.11,
    auto: true,
    range: 30,
    wallCost: 0,
    ammoCost: 3000,
    boxOnly: true,
  },
  breacher: {
    id: "breacher",
    name: "Breacher-12",
    damage: 90,
    rpm: 75,
    magSize: 6,
    reserveMax: 42,
    reloadTime: 3.2,
    pellets: 8,
    spread: 0.14,
    auto: false,
    range: 26,
    wallCost: 1500,
    ammoCost: 750,
  },
};

/**
 * What The Cache can roll. Everything but the starting sidearm — landing on the
 * M9 you already own would be a punishment, not a draw — including the two
 * box-only guns.
 */
export const CACHE_POOL: string[] = ["pdw", "kr12", "breacher", "lancer", "havoc", "arclight", "hailstorm"];

export function getWeapon(id: string): WeaponDef {
  const def = WEAPONS[id];
  if (!def) throw new Error(`unknown weapon: ${id}`);
  return def;
}
