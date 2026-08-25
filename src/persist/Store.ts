// Tiny persistence: the best round reached and the handful of control settings,
// in localStorage. Reads are defensive — a wiped or hand-edited value must never
// take the game down.

const KEY = "undead-protocol:best-round";
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
};

const clampNum = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

export const Store = {
  getBest(): number {
    const raw = localStorage.getItem(KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  },
  /** Record `round` if it beats the stored best; returns the current best. */
  submit(round: number): number {
    const best = Store.getBest();
    if (round > best) {
      localStorage.setItem(KEY, String(round));
      return round;
    }
    return best;
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

export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  Store.saveSettings(settings);
}
