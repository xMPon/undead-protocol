# Roadmap sync automation

`docs/ROADMAP_ITEMS.json` is the repository source of truth for Project roadmap
entries **and for the public roadmap page** at
[`/roadmap.html`](../roadmap.html), which imports it at build time. One file,
three renderings: the GitHub issues, the Project board, and the page on the
site.

## How it works

- `.github/workflows/sync-roadmap-project.yml` runs:
  - on changes to `docs/ROADMAP_ITEMS.json` or the sync script,
  - on manual dispatch,
  - and daily on schedule.
- `scripts/sync-roadmap-project.mjs`:
  1. Validates `docs/ROADMAP_ITEMS.json`.
  2. Upserts one GitHub issue per roadmap item (label: `roadmap`).
  3. Adds those issues to the configured GitHub Project (v2).
  4. Updates each project item's **Status** field from the item `status`.
  5. Closes managed roadmap issues that were removed from the source file.

Roadmap issues are tracked with a hidden marker in each issue body:
`<!-- undead-roadmap-id:<id> -->`.

## The item shape

`id`, `title`, `phase`, `status` (`todo` / `in_progress` / `done`) and `details`
are required — `parseRoadmapItems` rejects anything else, and
`tests/roadmap-page.test.ts` runs that validator against the real file.

**`id` is a stable contract.** It is the link between an item and its issue:
rename one and the sync closes the old issue and opens a new one. Append and
re-scope; do not rename.

Any other field is **presentation-only** — the sync reads the five above and
drops the rest. `size` (`S` / `M` / `L`) is used by the roadmap page for rough
effort and never reaches GitHub. `phase` must stay one of the phases the page
has framing for (`Phase 1`–`Phase 5`, `Backlog`), which is enforced by test.

## Required repository configuration

1. Set repository variable `ROADMAP_PROJECT_NUMBER` to the target GitHub Project
   number.
2. (Optional) Set repository variable `ROADMAP_PROJECT_OWNER` if the project is
   under a different owner than the repository owner.
3. If `GITHUB_TOKEN` cannot access your project, create a PAT with project write
   access and store it as `ROADMAP_PROJECT_TOKEN`.

## Updating the roadmap

Edit `docs/ROADMAP_ITEMS.json` and merge to `main`. The workflow will reconcile
the Project roadmap automatically.
