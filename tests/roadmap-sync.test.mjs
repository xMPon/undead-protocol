import { describe, it, expect } from "vitest";
import {
  parseRoadmapItems,
  buildIssueBody,
  buildIssueTitle,
  parseRoadmapIdFromBody,
} from "../scripts/sync-roadmap-project.mjs";

describe("roadmap sync helpers", () => {
  it("parses valid roadmap JSON", () => {
    const items = parseRoadmapItems(
      JSON.stringify([
        {
          id: "phase-2-test",
          title: "Example item",
          phase: "Phase 2",
          status: "todo",
          details: "Example details",
        },
      ]),
    );
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("phase-2-test");
  });

  it("rejects duplicate roadmap ids", () => {
    expect(() =>
      parseRoadmapItems(
        JSON.stringify([
          { id: "dup", title: "A", phase: "P", status: "todo", details: "x" },
          { id: "dup", title: "B", phase: "P", status: "todo", details: "y" },
        ]),
      ),
    ).toThrow(/Duplicate roadmap id/);
  });

  it("embeds and re-parses stable roadmap IDs in issue bodies", () => {
    const item = {
      id: "phase-3-item",
      title: "Add power switch",
      phase: "Phase 3",
      status: "in_progress",
      details: "Ship switch-driven progression.",
    };
    expect(buildIssueTitle(item)).toBe("[Roadmap] Add power switch");
    const body = buildIssueBody(item);
    expect(parseRoadmapIdFromBody(body)).toBe(item.id);
  });
});
