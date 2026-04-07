const dataFiles = [
  { key: "company", path: "../MUSU-WORKS/mock/company_alpha.json" },
  { key: "org", path: "../MUSU-WORKS/mock/org_chart_alpha.json" },
  { key: "roles", path: "../MUSU-WORKS/mock/role_templates_alpha.json" },
  { key: "projects", path: "../MUSU-WORKS/mock/projects_alpha.json" },
  { key: "attachments", path: "../MUSU-WORKS/mock/agent_attachments_alpha.json" },
  { key: "approvals", path: "../MUSU-WORKS/mock/approvals_alpha.json" },
  { key: "mcp", path: "../MUSU-WORKS/mock/mcp_surface_examples.json" }
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
  renderOverview(data.company, data.approvals.approvals);
  renderSummary(data.company, data.org.nodes, data.approvals.approvals, data.projects.projects);
  renderOrg(data.org.nodes);
  renderRoles(data.roles.role_templates);
  renderApprovals(data.approvals.approvals);
  renderProjects(data.projects.projects, data.attachments.projects);
  renderContractNotes(data.mcp);
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
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

function renderOverview(company, approvals) {
  document.getElementById("company-name").textContent = company.name;
  document.getElementById("company-mission").textContent = company.mission;
  const stats = [
    ["Active Agents", fmt.format(company.active_agent_count)],
    ["Active Projects", fmt.format(company.active_project_count)],
    ["Role Templates", fmt.format(company.role_template_count || 0)],
    ["Live Sessions", fmt.format(company.active_session_count || 0)],
    ["Approval Backlog", fmt.format(company.approval_backlog_count)],
    ["Pending Approvals", fmt.format(approvals.filter((item) => item.status === "pending").length)]
  ];
  const grid = document.getElementById("hero-stats");
  stats.forEach(([label, value]) => grid.appendChild(makeStatCard(label, value)));
}

function renderSummary(company, orgNodes, approvals, projects) {
  const activeAgents = orgNodes.filter((node) => node.status === "active").length;
  const idleAgents = orgNodes.filter((node) => node.status === "idle").length;
  const riskyProjects = projects.filter((project) => project.risk_level !== "low").length;
  const cards = [
    { label: "Org Health", value: `${activeAgents}/${orgNodes.length}`, detail: `${idleAgents} idle agents` },
    { label: "Approvals", value: approvals.filter((item) => item.status === "pending").length, detail: "Company-level pending decisions" },
    { label: "Projects", value: projects.length, detail: `${riskyProjects} medium or higher risk` },
    { label: "Runtime", value: company.active_session_count || 0, detail: company.runtime_topology || "sessioned execution" }
  ];
  const grid = document.getElementById("summary-grid");
  cards.forEach((card) => {
    const node = document.createElement("article");
    node.className = "card";
    node.innerHTML = `<p class="card-label">${card.label}</p><p class="card-value">${card.value}</p><p class="muted">${card.detail}</p>`;
    grid.appendChild(node);
  });
}

function renderRoles(roles) {
  const host = document.getElementById("role-list");
  roles.forEach((role) => {
    const card = document.createElement("article");
    card.className = "role-card";
    card.innerHTML = `
      <p class="eyebrow">${role.role_id}</p>
      <h4>${role.display_name}</h4>
      <p class="muted">${role.mission}</p>
      <div class="project-meta">
        <span class="chip">${role.default_policy_profile}</span>
        <span class="chip">${role.default_approval_scope}</span>
        <span class="chip">${role.allowed_project_modes.join(", ")}</span>
      </div>
    `;
    host.appendChild(card);
  });
}

function renderOrg(nodes) {
  const host = document.getElementById("org-groups");
  const roots = nodes.filter((node) => !node.reports_to);
  roots.forEach((leader) => {
    const children = nodes.filter((node) => node.reports_to === leader.agent_id);
    const card = document.createElement("article");
    card.className = "org-card";
    card.innerHTML = `
      <header>
        <div><p class="eyebrow">${leader.role_type}</p><h4>${leader.display_name}</h4></div>
        <span class="chip">${leader.status}</span>
      </header>
      <p class="muted">${children.length} direct reports</p>
      <ul class="list">
        ${children.map((child) => `<li><strong>${child.display_name}</strong> · ${child.role_type} · ${child.status}</li>`).join("")}
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
        <div><p class="eyebrow">${approval.approval_kind}</p><h4>${approval.id}</h4></div>
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

function renderProjects(projects, attachmentProjects) {
  const host = document.getElementById("project-list");
  projects.forEach((project) => {
    const runtime = attachmentProjects.find((item) => item.project_id === project.id) || { attachments: [], sessions: [] };
    const card = document.createElement("article");
    card.className = "project-card";
    card.innerHTML = `
      <header>
        <div><p class="eyebrow">${project.status}</p><h4>${project.name}</h4></div>
        <span class="chip ${project.risk_level === "low" ? "" : "warn"}">${project.risk_level}</span>
      </header>
      <p class="muted">${project.workspace_root}</p>
      <div class="project-meta">
        <span class="chip">${project.attached_agent_count} attached agents</span>
        <span class="chip">${project.active_session_count || runtime.sessions.length} live sessions</span>
        <span class="chip">${project.current_pipeline_stage}</span>
        <span class="chip">${(project.channels || []).join(", ")}</span>
      </div>
      <p class="muted">${project.runtime_profile || ""}</p>
      <ul class="list">
        ${runtime.sessions
          .map((session) => `<li><strong>${session.mode}</strong> · ${session.channel} · ${session.runtime_state}</li>`)
          .join("")}
      </ul>
    `;
    host.appendChild(card);
  });
}

function renderContractNotes(mcp) {
  const notes = [
    { title: "Company Overview Surface", body: "Overview payload stays summary-first. Detailed company data lives behind dedicated read surfaces.", meta: Object.keys(mcp.musu_company_get_overview).join(", ") },
    { title: "Project Overview Surface", body: "Project payload is execution-focused: pipeline, attached agents, blockers, outputs.", meta: Object.keys(mcp.musu_project_get_overview).join(", ") },
    { title: "Role Template Surface", body: "Company owns stable role templates; sessions switch mode without changing identity.", meta: Object.keys(mcp.musu_company_list_role_templates).join(", ") },
    { title: "Session Runtime Surface", body: "Project execution is modeled as attachments plus live sessions across cli, mcp, and dashboard channels.", meta: Object.keys(mcp.musu_project_list_agent_sessions).join(", ") },
    { title: "Schema Alignment", body: "Viewer assumes company owns agents and approvals; project owns workspace root, attachments, and runtime sessions.", meta: "company -> project -> attachment -> session" },
    { title: "Runtime Isolation", body: "OpenClaw provides session continuity; NanoClaw provides small-runtime isolation and queue partitioning.", meta: "session + isolation + queue" }
  ];
  const host = document.getElementById("contract-notes");
  notes.forEach((note) => {
    const card = document.createElement("article");
    card.className = "note-card";
    card.innerHTML = `<h4>${note.title}</h4><p class="muted">${note.body}</p><p class="chip">${note.meta}</p>`;
    host.appendChild(card);
  });
}

function makeStatCard(label, value) {
  const card = document.createElement("article");
  card.className = "card";
  card.innerHTML = `<p class="card-label">${label}</p><p class="card-value">${value}</p>`;
  return card;
}
