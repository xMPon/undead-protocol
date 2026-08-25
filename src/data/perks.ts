// Perk registry — original names, no trademarks. The ids are stable contracts:
// map perk machines reference them, saved games would too, so append rather
// than rename. The *effects* of a perk live in `sim/Perks.ts`; this file is the
// shop-front data (what it costs, what it is called, what colour its machine
// glows) so data/, sim/, and the two renderers can all read one source.

export interface PerkDef {
  id: string;
  name: string;
  /** Two or three characters for the HUD chip. */
  short: string;
  cost: number;
  blurb: string;
  /** Machine livery + HUD chip colour (hex). */
  color: number;
}

export const PERKS: Record<string, PerkDef> = {
  ironhide: {
    id: "ironhide",
    name: "Ironhide",
    short: "IH",
    cost: 2500,
    blurb: "Doubles maximum health.",
    color: 0xc23b3b,
  },
  rapidrounds: {
    id: "rapidrounds",
    name: "Rapid Rounds",
    short: "RR",
    cost: 2000,
    blurb: "Fires around a third faster.",
    color: 0xffb43a,
  },
  fasthands: {
    id: "fasthands",
    name: "Fast Hands",
    short: "FH",
    cost: 3000,
    blurb: "Reloads in half the time.",
    color: 0x4aa3ff,
  },
  secondwind: {
    id: "secondwind",
    name: "Second Wind",
    short: "SW",
    cost: 1500,
    blurb: "Survive one killing blow, then get back up.",
    color: 0x7bd651,
  },
};

/** Every perk id, in the order the HUD lists them. */
export const PERK_ORDER: string[] = ["ironhide", "rapidrounds", "fasthands", "secondwind"];

export function getPerk(id: string): PerkDef {
  const def = PERKS[id];
  if (!def) throw new Error(`unknown perk: ${id}`);
  return def;
}
