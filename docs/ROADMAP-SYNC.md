# Roadmap sync automation

`docs/ROADMAP_ITEMS.json` is the repository source of truth for Project roadmap
entries.

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
