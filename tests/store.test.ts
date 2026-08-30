// @vitest-environment happy-dom
// Store owns two things a player would be upset to lose: their per-map records
// and their settings. Both read from localStorage, so both are tested against a
// real one rather than a stub.

import { describe, it, expect, beforeEach, vi } from "vitest";

const LEGACY_KEY = "undead-protocol:best-round";
const SETTINGS_KEY = "undead-protocol:settings";

/** Re-import Store with the current localStorage, since it migrates on load. */
async function freshStore() {
  vi.resetModules();
  return await import("../src/persist/Store");
}

beforeEach(() => {
  localStorage.clear();
});

describe("per-map high scores", () => {
  it("keeps a separate record per map", async () => {
    const { Store } = await freshStore();
    Store.submit("blacksite", 14);
    Store.submit("dustline", 7);
    expect(Store.getBest("blacksite")).toBe(14);
    expect(Store.getBest("dustline")).toBe(7);
    expect(Store.getBest("coldstep")).toBe(0);
  });

  it("only records an improvement", async () => {
    const { Store } = await freshStore();
    Store.submit("blacksite", 12);
    expect(Store.submit("blacksite", 5)).toBe(12);
    expect(Store.getBest("blacksite")).toBe(12);
  });

  it("survives a hand-edited blob", async () => {
    localStorage.setItem("undead-protocol:best-rounds", "{not json");
    const { Store } = await freshStore();
    expect(Store.getBests()).toEqual({});
  });
});

describe("legacy best migration", () => {
  it("folds the old single value onto the last-played map", async () => {
    localStorage.setItem(LEGACY_KEY, "18");
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mapId: "tidewater" }));
    const { Store } = await freshStore();
    expect(Store.getBest("tidewater")).toBe(18);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("never lowers a record that already exists", async () => {
    localStorage.setItem(LEGACY_KEY, "3");
    localStorage.setItem("undead-protocol:best-rounds", JSON.stringify({ blacksite: 20 }));
    const { Store } = await freshStore();
    expect(Store.getBest("blacksite")).toBe(20);
  });
});

describe("audio settings", () => {
  it("defaults to half volume, unmuted", async () => {
    const { settings } = await freshStore();
    expect(settings.masterVolume).toBe(0.5);
    expect(settings.muted).toBe(false);
  });

  it("clamps a volume outside 0-1 and rejects a non-boolean mute", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ masterVolume: 9, muted: "yes" }));
    const { settings } = await freshStore();
    expect(settings.masterVolume).toBe(1);
    expect(settings.muted).toBe(false);
  });

  it("round-trips through updateSettings", async () => {
    const { settings, updateSettings, Store } = await freshStore();
    updateSettings({ masterVolume: 0.2, muted: true });
    expect(settings.masterVolume).toBe(0.2);
    expect(Store.getSettings().muted).toBe(true);
  });
});
