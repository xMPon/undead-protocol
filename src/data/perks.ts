// Perk registry — original names, Phase 2 feature. Defined here so the economy,
// HUD, and map can reference stable ids now; the effects are wired up later.

export interface PerkDef {
  id: string;
  name: string;
  cost: number;
  blurb: string;
}

export const PERKS: Record<string, PerkDef> = {
  ironhide: { id: "ironhide", name: "Ironhide", cost: 2500, blurb: "Doubles maximum health." },
  rapidrounds: { id: "rapidrounds", name: "Rapid Rounds", cost: 2000, blurb: "Increases rate of fire." },
  fasthands: { id: "fasthands", name: "Fast Hands", cost: 3000, blurb: "Reloads far faster." },
  secondwind: { id: "secondwind", name: "Second Wind", cost: 1500, blurb: "Revive faster; self-revive when solo." },
};
