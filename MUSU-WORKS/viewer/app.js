const dataFiles = [
  { key: "company", path: "../mock/company_alpha.json" },
  { key: "org", path: "../mock/org_chart_alpha.json" },
  { key: "projects", path: "../mock/projects_alpha.json" },
  { key: "approvals", path: "../mock/approvals_alpha.json" },
  { key: "mcp", path: "../mock/mcp_surface_examples.json" },
  { key: "runtime", path: "../mock/runtime_contract_alpha.json" }
];

const fmt = new Intl.NumberFormat("en-US");

init().catch((error) => {
  document.getElementById("company-name").textContent = "Viewer failed to load";
  document.getElementById("company-mission").textContent = String(error);
});

async function init() {
  const entries = await Promise.all(
    dataFiles.map(async (file) => [file.key, await loadJson(file.path)])
  );
  const data = Object.fromEntries(entries);

  renderSources();
  renderOverview(data.company, data.projects.projects, data.approvals.approvals, data.runtime);
  renderSummary(data.company, data.org.nodes, data.approvals.approvals, data.projects.projects, data.runtime);
  renderOrg(data.org.nodes);
  renderRuntime(data.runtime);
  renderBlockers(data.runtime.blockers || []);
  renderGovernanceReviews(data.runtime.governance_reviews || { approvals: [], escalations: [], morning_reviews: [], board_decisions: [] });
  renderQueueItems(data.runtime.queue_items || []);
  renderApprovals(data.approvals.approvals);
  renderProjects(data.projects.projects);
  renderContractNotes(data.mcp);
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

function renderSources() {
  const list = document.getElementById("data-sources");
  dataFiles.forEach((file) => {
    const item = document.createElement("li");
    item.textContent = file.path.replace("../", "");
    list.appendChild(item);
  });
}

function renderOverview(company, projects, approvals, runtime) {
  document.getElementById("company-name").textContent = company.name;
  document.getElementById("company-mission").textContent = company.mission;
  const blockedLanes = runtime.lane_states.filter((lane) => lane.status === "blocked").length;
  const openBlockers = (runtime.blockers || []).length;

  const stats = [
    ["Active Agents", fmt.format(company.active_agent_count)],
    ["Active Projects", fmt.format(company.active_project_count)],
    ["Approval Backlog", fmt.format(company.approval_backlog_count)],
    ["Blocked Lanes", fmt.format(blockedLanes)],
    ["Open Blockers", fmt.format(openBlockers)]
  ];

  const grid = document.getElementById("hero-stats");
  stats.forEach(([label, value]) => grid.appendChild(makeStatCard(label, value)));
}

function renderSummary(company, orgNodes, approvals, projects, runtime) {
  const activeAgents = orgNodes.filter((node) => node.status === "active").length;
  const idleAgents = orgNodes.filter((node) => node.status === "idle").length;
  const riskyProjects = projects.filter((project) => project.risk_level !== "low").length;
  const waitingApprovalLanes = runtime.lane_states.filter((lane) => lane.status === "waiting_for_approval").length;
  const queueDepth = (runtime.queue_items || []).length;

  const cards = [
    {
      label: "Org Health",
      value: `${activeAgents}/${orgNodes.length}`,
      detail: `${idleAgents} idle agents`
    },
    {
      label: "Approvals",
      value: approvals.filter((item) => item.status === "pending").length,
      detail: "Company-level pending decisions"
    },
    {
      label: "Projects",
      value: projects.length,
      detail: `${riskyProjects} medium or higher risk`
    },
    {
      label: "Runtime",
      value: runtime.lane_states.length,
      detail: `${waitingApprovalLanes} lanes waiting for approval`
    },
    {
      label: "Queue Depth",
      value: queueDepth,
      detail: "Tasks pending execution"
    }
  ];

  const grid = document.getElementById("summary-grid");
  cards.forEach((card) => {
    const node = document.createElement("article");
    node.className = "card";
    node.innerHTML = `
      <p class="card-label">${card.label}</p>
      <p class="card-value">${card.value}</p>
      <p class="muted">${card.detail}</p>
    `;
    grid.appendChild(node);
  });
}

function renderOrg(nodes) {
  const rootMap = new Map();
  nodes.forEach((node) => {
    const key = node.reports_to || "root";
    if (!rootMap.has(key)) {
      rootMap.set(key, []);
    }
    rootMap.get(key).push(node);
  });

  const host = document.getElementById("org-groups");
  const roots = rootMap.get("root") || [];

  roots.forEach((leader) => {
    const children = nodes.filter((node) => node.reports_to === leader.agent_id);
    const card = document.createElement("article");
    card.className = "org-card";
    card.innerHTML = `
      <header>
        <div>
          <p class="eyebrow">${leader.role_type}</p>
          <h4>${leader.display_name}</h4>
        </div>
        <span class="chip">${leader.status}</span>
      </header>
      <p class="muted">${children.length} direct reports</p>
      <ul class="list">
        ${children
          .map(
            (child) =>
              `<li><strong>${child.display_name}</strong> · ${child.role_type} · ${child.status}</li>`
          )
          .join("")}
      </ul>
    `;
    host.appendChild(card);
  });
}

function renderApprovals(approvals) {
  const host = document.getElementById("approval-list");
  approvals.forEach((approval) => {
    const card = document.createElement("article");
    card.className = "approval-card";
    card.innerHTML = `
      <header>
        <div>
          <p class="eyebrow">${approval.approval_kind}</p>
          <h4>${approval.id}</h4>
        </div>
        <span class="chip warn">${approval.status}</span>
      </header>
      <p>${approval.summary}</p>
      <div class="approval-meta">
        <span class="chip">requester ${approval.requested_by_agent_id}</span>
        <span class="chip">${approval.project_id || "company-wide"}</span>
      </div>
    `;
    host.appendChild(card);
  });
}

function renderRuntime(runtime) {
  const host = document.getElementById("runtime-list");
  runtime.lane_states.forEach((lane) => {
    const card = document.createElement("article");
    card.className = "project-card";
    const safetyProfile = runtime.safety_profile_by_lane[lane.lane_key];
    const lastResult = lane.last_result_status
      ? `<span class="chip ${lane.last_result_status === "blocked" ? "warn" : ""}">last ${lane.last_result_status}</span>`
      : "";
    const lastReason = lane.last_result_reason
      ? `<p class="muted">${lane.last_result_reason}</p>`
      : "";
    const updatedAt = lane.updated_at
      ? `<span class="chip">updated ${lane.updated_at.slice(0, 16).replace("T", " ")}</span>`
      : "";
    card.innerHTML = `
      <header>
        <div>
          <p class="eyebrow">${lane.lane_key}</p>
          <h4>${lane.owner}</h4>
        </div>
        <span class="chip ${lane.status === "blocked" ? "warn" : ""}">${lane.status}</span>
      </header>
      <p class="muted">${lane.workspace}</p>
      ${lastReason}
      <div class="project-meta">
        <span class="chip">safety ${safetyProfile}</span>
        <span class="chip">handoffs ${lane.pending_handoffs}</span>
        ${lastResult}
        ${updatedAt}
      </div>
    `;
    host.appendChild(card);
  });
}

function renderBlockers(blockers) {
  const runtimePanel = document.getElementById("runtime");
  const section = document.createElement("div");
  section.className = "subsection";
  section.innerHTML = `<h4 class="subsection-title">Open Blockers (${blockers.length})</h4>`;
  const list = document.createElement("div");
  list.className = "project-list";
  if (blockers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No open blockers.";
    list.appendChild(empty);
  } else {
    blockers.forEach((blocker) => {
      const card = document.createElement("article");
      card.className = "project-card";
      const escalated = blocker.escalated_to
        ? `<span class="chip warn">escalated to ${blocker.escalated_to}</span>`
        : `<span class="chip">not escalated</span>`;
      card.innerHTML = `
        <header>
          <div>
            <p class="eyebrow">${blocker.lane_key}</p>
            <h4>${blocker.task_id}</h4>
          </div>
          <span class="chip warn">blocked</span>
        </header>
        <p class="muted">${blocker.blocked_reason}</p>
        <div class="project-meta">
          <span class="chip">needs ${blocker.needs_role}</span>
          <span class="chip">opened ${blocker.opened_at.slice(0, 16).replace("T", " ")}</span>
          ${escalated}
        </div>
      `;
      list.appendChild(card);
    });
  }
  section.appendChild(list);
  runtimePanel.appendChild(section);
}

function renderGovernanceReviews(reviews) {
  const runtimePanel = document.getElementById("runtime");
  const section = document.createElement("div");
  section.className = "subsection";
  const pendingApprovals = (reviews.approvals || []).filter((a) => a.status === "pending").length;
  const morningReview = (reviews.morning_reviews || [])[0];
  section.innerHTML = `<h4 class="subsection-title">Governance Reviews</h4>`;

  const list = document.createElement("div");
  list.className = "project-list";

  // Approval requests
  (reviews.approvals || []).forEach((approval) => {
    const card = document.createElement("article");
    card.className = "project-card";
    card.innerHTML = `
      <header>
        <div>
          <p class="eyebrow">approval request · ${approval.lane}</p>
          <h4>${approval.task_id}</h4>
        </div>
        <span class="chip ${approval.status === "pending" ? "warn" : ""}">${approval.status}</span>
      </header>
      <div class="project-meta">
        <span class="chip">action ${approval.action}</span>
        <span class="chip">requestor ${approval.requestor}</span>
      </div>
    `;
    list.appendChild(card);
  });

  // Latest morning review
  if (morningReview) {
    const card = document.createElement("article");
    card.className = "project-card";
    card.innerHTML = `
      <header>
        <div>
          <p class="eyebrow">morning review</p>
          <h4>${morningReview.date}</h4>
        </div>
        <span class="chip">review</span>
      </header>
      <div class="project-meta">
        <span class="chip">completed ${morningReview.completed_tasks} tasks</span>
        <span class="chip ${morningReview.open_blockers > 0 ? "warn" : ""}">${morningReview.open_blockers} blockers</span>
        <span class="chip">${morningReview.pending_approvals} pending approvals</span>
      </div>
    `;
    list.appendChild(card);
  }

  if ((reviews.approvals || []).length === 0 && !morningReview) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No governance review records.";
    list.appendChild(empty);
  }

  section.appendChild(list);
  runtimePanel.appendChild(section);
}

function renderQueueItems(items) {
  const runtimePanel = document.getElementById("runtime");
  const section = document.createElement("div");
  section.className = "subsection";
  section.innerHTML = `<h4 class="subsection-title">Queue Items (${items.length})</h4>`;
  const list = document.createElement("div");
  list.className = "project-list";
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Queue is empty.";
    list.appendChild(empty);
  } else {
    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "project-card";
      card.innerHTML = `
        <header>
          <div>
            <p class="eyebrow">${item.queue} · ${item.owner}</p>
            <h4>${item.title}</h4>
          </div>
          <span class="chip ${item.priority === "high" ? "warn" : ""}">${item.priority}</span>
        </header>
        <p class="muted">${item.body}</p>
        <div class="project-meta">
          <span class="chip">task ${item.task_id}</span>
          <span class="chip">retry budget ${item.retry_budget}</span>
          <span class="chip">from ${item.source}</span>
        </div>
      `;
      list.appendChild(card);
    });
  }
  section.appendChild(list);
  runtimePanel.appendChild(section);
}

function renderProjects(projects) {
  const host = document.getElementById("project-list");
  projects.forEach((project) => {
    const card = document.createElement("article");
    card.className = "project-card";
    card.innerHTML = `
      <header>
        <div>
          <p class="eyebrow">${project.status}</p>
          <h4>${project.name}</h4>
        </div>
        <span class="chip ${project.risk_level === "low" ? "" : "warn"}">${project.risk_level}</span>
      </header>
      <p class="muted">${project.workspace_root}</p>
      <div class="project-meta">
        <span class="chip">${project.attached_agent_count} attached agents</span>
        <span class="chip">${project.current_pipeline_stage}</span>
      </div>
    `;
    host.appendChild(card);
  });
}

function renderContractNotes(mcp) {
  const notes = [
    {
      title: "Company Overview Surface",
      body: "Overview payload stays summary-first. Detailed company data lives behind dedicated read surfaces.",
      meta: Object.keys(mcp.musu_company_get_overview).join(", ")
    },
    {
      title: "Project Overview Surface",
      body: "Project payload is execution-focused: pipeline, attached agents, blockers, outputs.",
      meta: Object.keys(mcp.musu_project_get_overview).join(", ")
    },
    {
      title: "Schema Alignment",
      body: "Viewer assumes company owns agents and approvals; project owns workspace root and pipeline state.",
      meta: "company -> project -> attachment"
    },
    {
      title: "Next Backport",
      body: "Read-only company plane is the next likely original-app cut before action surfaces.",
      meta: "overview + approvals + org chart"
    }
  ];

  const host = document.getElementById("contract-notes");
  notes.forEach((note) => {
    const card = document.createElement("article");
    card.className = "note-card";
    card.innerHTML = `
      <h4>${note.title}</h4>
      <p class="muted">${note.body}</p>
      <p class="chip">${note.meta}</p>
    `;
    host.appendChild(card);
  });
}

function makeStatCard(label, value) {
  const card = document.createElement("article");
  card.className = "card";
  card.innerHTML = `
    <p class="card-label">${label}</p>
    <p class="card-value">${value}</p>
  `;
  return card;
}
