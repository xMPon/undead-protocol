// Tiny persistence: the best round reached per map and the handful of control
// settings, in localStorage. Reads are defensive — a wiped or hand-edited value
// must never take the game down.

const LEGACY_KEY = "undead-protocol:best-round"; // pre-per-map single value
const SCORES_KEY = "undead-protocol:best-rounds";
const SETTINGS_KEY = "undead-protocol:settings";

/** Player-tunable controls. Multipliers are relative to the built-in defaults. */
export interface Settings {
  /** Mouse-look multiplier. Low trackpad travel wants this well above 1. */
  lookSensitivity: number;
  /** Keyboard turn-rate multiplier (Q/E and the arrow keys). */
  turnSpeed: number;
  invertY: boolean;
  /** Last map deployed to, so the menu comes back where you left it. */
  mapId: string;
  /** On-screen controls: follow the device, or force them on/off. */
  touchControls: TouchMode;
  /** Master output gain, 0–1. The old hard-coded value was 0.5. */
  masterVolume: number;
  /** Silence everything without losing the volume you had set. */
  muted: boolean;
}

/** `auto` reads the device; the other two are the player overriding it. */
export type TouchMode = "auto" | "on" | "off";

const TOUCH_MODES: TouchMode[] = ["auto", "on", "off"];

export const DEFAULT_SETTINGS: Settings = {
  lookSensitivity: 1,
  turnSpeed: 1,
  invertY: false,
  mapId: "blacksite",
  touchControls: "auto",
  masterVolume: 0.5,
  muted: false,
};

const clampNum = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** Map id → best round reached on it. Absent id means never survived a round. */
export type BestRounds = Record<string, number>;

function readScores(): BestRounds {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: BestRounds = {};
    for (const [id, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) out[id] = Math.floor(v);
    }
    return out;
  } catch {
    return {};
  }
}

function writeScores(scores: BestRounds): void {
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
  } catch {
    // Private-mode or quota failures are not worth interrupting a round for.
  }
}

export const Store = {
  /** Every recorded best, keyed by map id. */
  getBests(): BestRounds {
    return readScores();
  },
  /** Best round on one map, 0 if there is no record for it. */
  getBest(mapId: string): number {
    return readScores()[mapId] ?? 0;
  },
  /** Record `round` on `mapId` if it beats the stored best; returns the best. */
  submit(mapId: string, round: number): number {
    const scores = readScores();
    const best = scores[mapId] ?? 0;
    if (round > best) {
      scores[mapId] = round;
      writeScores(scores);
      return round;
    }
    return best;
  },

  /**
   * Fold the old single-value best into the per-map record. The value has no map
   * attached, so it lands on `mapId` — the map the player last deployed to, which
   * is the only map it could plausibly have come from. Runs once: the legacy key
   * is removed afterwards.
   */
  migrateLegacyBest(mapId: string): void {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (raw === null) return;
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n > 0) Store.submit(mapId, n);
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // Nothing here is worth failing a boot over.
    }
  },

  getSettings(): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        lookSensitivity: clampNum(parsed.lookSensitivity, 0.2, 4, DEFAULT_SETTINGS.lookSensitivity),
        turnSpeed: clampNum(parsed.turnSpeed, 0.2, 4, DEFAULT_SETTINGS.turnSpeed),
        invertY: parsed.invertY === true,
        mapId: typeof parsed.mapId === "string" ? parsed.mapId : DEFAULT_SETTINGS.mapId,
        touchControls: TOUCH_MODES.includes(parsed.touchControls as TouchMode)
          ? (parsed.touchControls as TouchMode)
          : DEFAULT_SETTINGS.touchControls,
        masterVolume: clampNum(parsed.masterVolume, 0, 1, DEFAULT_SETTINGS.masterVolume),
        muted: parsed.muted === true,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },
  saveSettings(s: Settings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      // Private-mode or quota failures are not worth interrupting a round for.
    }
  },
};

/** Live settings, shared by the renderers and the pause menu. */
export const settings: Settings = Store.getSettings();

Store.migrateLegacyBest(settings.mapId);

export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  Store.saveSettings(settings);
}
