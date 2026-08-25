// The public roadmap page. It imports `docs/ROADMAP_ITEMS.json` — the same file
// the GitHub Project sync reads — so the page, the issues and the board can
// never disagree: there is one source and three renderings of it.
//
// Plain DOM, no framework, matching the rest of the UI. Fields the sync ignores
// (`size`) are presentation-only and documented as such in docs/ROADMAP-SYNC.md.

import "./roadmap.css";
import ITEMS from "../../docs/ROADMAP_ITEMS.json";

type Status = "todo" | "in_progress" | "done";

interface RoadmapItem {
  id: string;
  title: string;
  phase: string;
  status: Status;
  details: string;
  /** Rough effort, for the page only. */
  size?: "S" | "M" | "L";
}

const REPO = "https://github.com/xMPon/undead-protocol";

const STATUS_LABEL: Record<Status, string> = {
  done: "Shipped",
  in_progress: "In progress",
  todo: "Planned",
};

/** Phases in the order they should read, with the one-line framing for each. */
const PHASE_BLURB: Record<string, string> = {
  "Phase 1": "The base game: one simulation, two renderers, five maps.",
  "Phase 2": "Perks, The Cache, grenades, sights, and barriers worth rebuilding.",
  "Phase 3": "Power, upgrades, and enemies that are not all the same shambler.",
  "Phase 4": "Encounters: bosses, traps, and objectives inside a run.",
  "Phase 5": "Endgame and meta — secrets, difficulty, and scores worth comparing.",
  Backlog: "Platform, polish and hygiene. Not gated behind a phase; picked up when it earns its place.",
};

const items = ITEMS as RoadmapItem[];

const phaseOrder = (phase: string): number => {
  const m = /^Phase (\d+)$/.exec(phase);
  return m ? Number(m[1]) : 99; // Backlog and anything unnumbered sorts last
};

const escape = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function statusCount(list: RoadmapItem[], status: Status): number {
  return list.filter((i) => i.status === status).length;
}

function renderItem(item: RoadmapItem): string {
  const size = item.size ? `<span class="size" title="rough effort">${item.size}</span>` : "";
  return `
    <article class="item ${item.status}" id="${escape(item.id)}">
      <header>
        <h3>${escape(item.title)}</h3>
        <div class="badges">
          ${size}
          <span class="status">${STATUS_LABEL[item.status]}</span>
        </div>
      </header>
      <p>${escape(item.details)}</p>
    </article>`;
}

function renderPhase(phase: string, list: RoadmapItem[]): string {
  const done = statusCount(list, "done");
  const pct = Math.round((done / list.length) * 100);
  return `
    <section class="phase">
      <div class="phase-head">
        <h2>${escape(phase)}</h2>
        <div class="phase-meta">
          <span>${done} of ${list.length} shipped</span>
          <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
        </div>
      </div>
      <p class="phase-blurb">${escape(PHASE_BLURB[phase] ?? "")}</p>
      <div class="items">${list.map(renderItem).join("")}</div>
    </section>`;
}

function render(): string {
  const phases = [...new Set(items.map((i) => i.phase))].sort((a, b) => phaseOrder(a) - phaseOrder(b));
  const done = statusCount(items, "done");
  const active = statusCount(items, "in_progress");

  return `
    <header class="top">
      <div class="crumb"><a href="./">&larr; Play the game</a></div>
      <h1>UNDEAD <span class="accent">PROTOCOL</span></h1>
      <p class="tagline">Roadmap</p>
      <p class="lede">
        Everything below is generated from
        <a href="${REPO}/blob/main/docs/ROADMAP_ITEMS.json"><code>docs/ROADMAP_ITEMS.json</code></a>,
        the same file that syncs the project board and opens one issue per item — so this page cannot
        drift from the repository.
      </p>
      <div class="totals">
        <div><b>${done}</b><span>shipped</span></div>
        <div><b>${active}</b><span>in progress</span></div>
        <div><b>${items.length - done - active}</b><span>planned</span></div>
      </div>
    </header>
    <main>${phases.map((p) => renderPhase(p, items.filter((i) => i.phase === p))).join("")}</main>
    <footer>
      <a href="./">Play</a> ·
      <a href="${REPO}">Source</a> ·
      <a href="${REPO}/issues?q=is%3Aissue+label%3Aroadmap">Roadmap issues</a> ·
      MIT
    </footer>`;
}

document.getElementById("roadmap")!.innerHTML = render();
