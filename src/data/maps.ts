// The playable map roster. Order here is the order of the map-select menu, so
// keep it roughly easiest-first. Ids are stable contracts — the menu and saved
// settings reference them — so append, never rename.

import type { MapDef } from "../sim/types";
import { BLACKSITE } from "./map_blacksite";
import { COLDSTEP } from "./map_coldstep";
import { DUSTLINE } from "./map_dustline";
import { TIDEWATER } from "./map_tidewater";
import { DEEPCUT } from "./map_deepcut";

export const MAPS: MapDef[] = [BLACKSITE, COLDSTEP, DUSTLINE, TIDEWATER, DEEPCUT];

export const DEFAULT_MAP: MapDef = BLACKSITE;

/** Look up a map by id, falling back to the default rather than throwing —
 *  a stale id in localStorage should not stop the game from starting. */
export function getMap(id: string): MapDef {
  return MAPS.find((m) => m.id === id) ?? DEFAULT_MAP;
}
