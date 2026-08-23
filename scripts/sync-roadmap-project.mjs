import { readFile } from "node:fs/promises";
import process from "node:process";

const ROADMAP_ID_MARKER = "undead-roadmap-id";
const STATUS_MAP = {
  todo: ["todo", "to do", "backlog", "planned"],
  in_progress: ["in progress", "in-progress", "doing"],
  done: ["done", "complete", "completed"],
};

export function parseRoadmapItems(text) {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error("Roadmap source must be a JSON array.");
  const ids = new Set();
  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Item ${index} must be an object.`);
    const { id, title, phase, status, details } = item;
    if (typeof id !== "string" || !id.trim()) throw new Error(`Item ${index} is missing a string id.`);
    if (ids.has(id)) throw new Error(`Duplicate roadmap id: ${id}`);
    ids.add(id);
    if (typeof title !== "string" || !title.trim()) throw new Error(`Item ${id} is missing a title.`);
    if (typeof phase !== "string" || !phase.trim()) throw new Error(`Item ${id} is missing a phase.`);
    if (!Object.hasOwn(STATUS_MAP, status)) throw new Error(`Item ${id} has unsupported status: ${status}`);
    if (typeof details !== "string" || !details.trim()) throw new Error(`Item ${id} is missing details.`);
    return { id, title, phase, status, details };
  });
}

export function buildIssueTitle(item) {
  return `[Roadmap] ${item.title}`;
}

export function buildIssueBody(item) {
  return `<!-- ${ROADMAP_ID_MARKER}:${item.id} -->
## Roadmap item

- **Phase:** ${item.phase}
- **Status:** ${item.status}
- **Source:** \`docs/ROADMAP_ITEMS.json\`

${item.details}
`;
}

export function parseRoadmapIdFromBody(body = "") {
  const match = body.match(new RegExp(`<!--\\s*${ROADMAP_ID_MARKER}:([a-zA-Z0-9._-]+)\\s*-->`));
  return match?.[1] ?? null;
}

function findStatusOptionId(statusField, statusKey) {
  const desired = STATUS_MAP[statusKey];
  if (!desired) return null;
  const option = statusField.options.find((opt) => desired.includes(opt.name.trim().toLowerCase()));
  return option?.id ?? null;
}

async function githubRequest(path, token, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub REST ${options.method ?? "GET"} ${path} failed (${response.status}): ${text}`);
  }

  return response.status === 204 ? null : response.json();
}

async function githubGraphql(token, query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const result = await response.json();
  if (!response.ok || result.errors?.length) {
    throw new Error(`GitHub GraphQL request failed: ${JSON.stringify(result.errors ?? result)}`);
  }
  return result.data;
}

async function ensureLabel(owner, repo, token, labelName) {
  try {
    await githubRequest(`/repos/${owner}/${repo}/labels/${encodeURIComponent(labelName)}`, token);
  } catch (error) {
    const message = String(error);
    if (!message.includes("(404)")) throw error;
    await githubRequest(`/repos/${owner}/${repo}/labels`, token, {
      method: "POST",
      body: {
        name: labelName,
        color: "5319e7",
        description: "Repository roadmap item managed by automation",
      },
    });
  }
}

async function getProjectData(projectOwner, projectNumber, token) {
  const query = `
    query ProjectData($owner: String!, $number: Int!) {
      user(login: $owner) {
        projectV2(number: $number) {
          id
          fields(first: 50) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options { id name }
              }
            }
          }
          items(first: 200) {
            nodes {
              id
              content {
                ... on Issue { id number }
              }
            }
          }
        }
      }
      organization(login: $owner) {
        projectV2(number: $number) {
          id
          fields(first: 50) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options { id name }
              }
            }
          }
          items(first: 200) {
            nodes {
              id
              content {
                ... on Issue { id number }
              }
            }
          }
        }
      }
    }
  `;

  const data = await githubGraphql(token, query, { owner: projectOwner, number: projectNumber });
  return data.user?.projectV2 ?? data.organization?.projectV2 ?? null;
}

async function addIssueToProject(projectId, issueNodeId, token) {
  const mutation = `
    mutation AddIssueToProject($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }
  `;
  const data = await githubGraphql(token, mutation, { projectId, contentId: issueNodeId });
  return data.addProjectV2ItemById.item.id;
}

async function setProjectStatus(projectId, itemId, statusFieldId, optionId, token) {
  const mutation = `
    mutation SetProjectStatus($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: { singleSelectOptionId: $optionId }
      }) {
        projectV2Item { id }
      }
    }
  `;
  await githubGraphql(token, mutation, { projectId, itemId, fieldId: statusFieldId, optionId });
}

async function syncRoadmap() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const sourcePath = process.env.ROADMAP_SOURCE_FILE ?? "docs/ROADMAP_ITEMS.json";
  const label = process.env.ROADMAP_LABEL ?? "roadmap";
  const projectOwner = process.env.ROADMAP_PROJECT_OWNER;
  const projectNumber = Number(process.env.ROADMAP_PROJECT_NUMBER);

  if (!token) throw new Error("GITHUB_TOKEN is required.");
  if (!repository?.includes("/")) throw new Error("GITHUB_REPOSITORY must be owner/repo.");
  if (!projectOwner) throw new Error("ROADMAP_PROJECT_OWNER is required.");
  if (!Number.isInteger(projectNumber) || projectNumber <= 0) {
    throw new Error("ROADMAP_PROJECT_NUMBER must be a positive integer.");
  }

  const [owner, repo] = repository.split("/");
  const roadmapText = await readFile(sourcePath, "utf8");
  const items = parseRoadmapItems(roadmapText);
  const idsInSource = new Set(items.map((item) => item.id));

  await ensureLabel(owner, repo, token, label);

  const existingIssues = await githubRequest(
    `/repos/${owner}/${repo}/issues?state=all&labels=${encodeURIComponent(label)}&per_page=100`,
    token,
  );
  const managedById = new Map();
  for (const issue of existingIssues) {
    if (issue.pull_request) continue;
    const id = parseRoadmapIdFromBody(issue.body ?? "");
    if (id) managedById.set(id, issue);
  }

  const syncedIssues = [];

  for (const item of items) {
    const desiredTitle = buildIssueTitle(item);
    const desiredBody = buildIssueBody(item);
    const desiredState = item.status === "done" ? "closed" : "open";
    const current = managedById.get(item.id);

    if (!current) {
      const created = await githubRequest(`/repos/${owner}/${repo}/issues`, token, {
        method: "POST",
        body: { title: desiredTitle, body: desiredBody, labels: [label] },
      });
      let issue = created;
      if (desiredState === "closed") {
        issue = await githubRequest(`/repos/${owner}/${repo}/issues/${created.number}`, token, {
          method: "PATCH",
          body: { state: "closed" },
        });
      }
      syncedIssues.push(issue);
      continue;
    }

    const patch = {};
    if (current.title !== desiredTitle) patch.title = desiredTitle;
    if ((current.body ?? "") !== desiredBody) patch.body = desiredBody;
    if (current.state !== desiredState) patch.state = desiredState;

    const issue = Object.keys(patch).length
      ? await githubRequest(`/repos/${owner}/${repo}/issues/${current.number}`, token, {
          method: "PATCH",
          body: patch,
        })
      : current;

    syncedIssues.push(issue);
  }

  for (const [id, issue] of managedById.entries()) {
    if (idsInSource.has(id) || issue.state === "closed") continue;
    await githubRequest(`/repos/${owner}/${repo}/issues/${issue.number}`, token, {
      method: "PATCH",
      body: { state: "closed" },
    });
  }

  const project = await getProjectData(projectOwner, projectNumber, token);
  if (!project) throw new Error(`Project ${projectOwner}#${projectNumber} was not found.`);

  const statusField = project.fields.nodes.find(
    (field) => field.name?.trim().toLowerCase() === "status" && Array.isArray(field.options),
  );
  const itemByIssueId = new Map(
    project.items.nodes
      .filter((node) => node.content?.id)
      .map((node) => [node.content.id, node.id]),
  );

  for (const issue of syncedIssues) {
    let projectItemId = itemByIssueId.get(issue.node_id);
    if (!projectItemId) {
      projectItemId = await addIssueToProject(project.id, issue.node_id, token);
      itemByIssueId.set(issue.node_id, projectItemId);
    }
    if (!statusField) continue;

    const itemId = parseRoadmapIdFromBody(issue.body ?? "");
    const sourceItem = itemId ? items.find((entry) => entry.id === itemId) : null;
    if (!sourceItem) continue;

    const optionId = findStatusOptionId(statusField, sourceItem.status);
    if (!optionId) continue;
    await setProjectStatus(project.id, projectItemId, statusField.id, optionId, token);
  }

  console.log(`Synced ${syncedIssues.length} roadmap items to ${owner}/${repo} and project ${projectOwner}#${projectNumber}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncRoadmap().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
