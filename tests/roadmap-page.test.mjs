// The roadmap page is generated from the same JSON that opens the GitHub issues,
// so the thing worth testing is that the data stays valid and that every item in
// it actually reaches the page — a phase the page does not know about, or an
// item silently dropped, would show up as a public page that quietly lies.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { parseRoadmapItems } from "../scripts/sync-roadmap-project.mjs";

const raw = readFileSync("docs/ROADMAP_ITEMS.json", "utf8");
const items = JSON.parse(raw);

describe("roadmap source", () => {
  it("satisfies the contract the GitHub sync enforces", () => {
    // Parsing is the sync's own validator: ids unique, statuses known, nothing blank.
    expect(parseRoadmapItems(raw)).toHaveLength(items.length);
  });

  it("carries a size on every item for the public page", () => {
    for (const item of items) {
      expect.soft(["S", "M", "L"], `${item.id} has size ${item.size}`).toContain(item.size);
    }
  });

  it("uses stable kebab-case ids", () => {
    // Ids are the link between an item and its issue: renaming one closes the
    // old issue and opens a new one, so they are a contract, not a label.
    for (const item of items) {
      expect.soft(item.id, `${item.id} is not kebab-case`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("keeps every phase one the page has framing for", () => {
    const known = new Set(["Phase 1", "Phase 2", "Phase 3", "Phase 4", "Phase 5", "Backlog"]);
    for (const item of items) {
      expect.soft(known.has(item.phase), `${item.id} is in unknown phase "${item.phase}"`).toBe(true);
    }
  });
});

describe("roadmap page", () => {
  let html = "";

  beforeAll(async () => {
    // The page writes straight into the document on import, so a one-element
    // stub is enough to capture what it would have rendered.
    let captured = "";
    globalThis.document = {
      getElementById: () => ({
        set innerHTML(value) {
          captured = value;
        },
      }),
    };
    await import("../src/roadmap/main");
    html = captured;
  });

  it("renders every roadmap item", () => {
    expect(html.length).toBeGreaterThan(1000);
    for (const item of items) {
      expect.soft(html, `${item.id} is missing from the page`).toContain(item.title);
      expect.soft(html).toContain(`id="${item.id}"`);
    }
  });

  it("groups by phase with the phases in order", () => {
    const order = ["Phase 1", "Phase 2", "Phase 3", "Phase 4", "Phase 5", "Backlog"];
    const positions = order.map((p) => html.indexOf(`<h2>${p}</h2>`));
    for (const pos of positions) expect(pos).toBeGreaterThan(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("shows a status on each item and links back to the game", () => {
    const shipped = items.filter((i) => i.status === "done").length;
    expect((html.match(/class="status"/g) ?? []).length).toBe(items.length);
    expect((html.match(/class="item done"/g) ?? []).length).toBe(shipped);
    expect(html).toContain('href="./"');
  });
});
