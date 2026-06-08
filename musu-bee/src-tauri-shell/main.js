const state = {
  status: null,
  busy: false,
};

const $ = (id) => document.getElementById(id);

function log(message, detail) {
  const time = new Date().toLocaleTimeString();
  const text = detail ? `${time}  ${message}\n${detail}` : `${time}  ${message}`;
  $("log").textContent = `${text}\n${$("log").textContent}`.trim();
}

function setBusy(value) {
  state.busy = value;
  syncActionState();
}

function syncActionState() {
  const dashboardAvailable =
    state.status?.dashboard_status === "ok" && Boolean(state.status?.dashboard_url);
  const canStartRuntime = Boolean(state.status?.can_start_runtime);

  $("refresh").disabled = state.busy;
  $("start-runtime").disabled = state.busy || !canStartRuntime;
  $("open-dashboard").disabled = state.busy || !dashboardAvailable;
  $("copy-diagnostics").disabled = state.busy;
}

async function invoke(command, args = {}) {
  const api = window.__TAURI__?.core;
  if (!api?.invoke) {
    throw new Error("Tauri IPC is unavailable. Run this shell inside the MUSU desktop app.");
  }
  return api.invoke(command, args);
}

function setPill(kind, text) {
  const pill = $("overall-pill");
  pill.className = `pill ${kind}`;
  pill.textContent = text;
}

function renderWarnings(warnings) {
  const items = Array.isArray(warnings) ? warnings.filter(Boolean) : [];
  const panel = $("warnings-panel");
  const list = $("warning-list");
  list.textContent = "";
  if (items.length === 0) {
    panel.hidden = true;
    return;
  }

  for (const warning of items) {
    const item = document.createElement("li");
    item.textContent = warning;
    list.appendChild(item);
  }
  panel.hidden = false;
}

function renderStatus(status) {
  state.status = status;
  const bridgeOk = status.bridge_status === "ok";
  const bridgeStarting = status.bridge_status === "starting";
  const dashboardOk = status.dashboard_status === "ok";
  const warnings = Array.isArray(status.warnings) ? status.warnings.filter(Boolean) : [];

  $("bridge-status").textContent = bridgeOk ? "Online" : (bridgeStarting ? "Starting" : "Offline");
  $("bridge-detail").textContent = status.bridge_detail || "No bridge detail.";
  $("dashboard-status").textContent = dashboardOk ? "Online" : "Optional";
  $("dashboard-detail").textContent = status.dashboard_detail || "No dashboard detail.";
  $("package-status").textContent = status.package_status || "Unknown";
  $("package-detail").textContent = status.package_detail || "No package detail.";
  $("auth-status").textContent = status.auth_status || "Unknown";
  $("auth-detail").textContent = status.auth_detail || "No connection detail.";
  $("runtime-profile-status").textContent = status.runtime_profile_status || "Unknown";
  $("runtime-profile-detail").textContent =
    status.runtime_profile_detail || "No runtime profile detail.";
  $("bridge-url").textContent = status.bridge_url || "-";
  $("dashboard-url").textContent = status.dashboard_url || "-";
  $("musu-home").textContent = status.musu_home || "-";
  $("active-loops").textContent =
    Array.isArray(status.active_runtime_loop_candidate_keys) &&
    status.active_runtime_loop_candidate_keys.length > 0
      ? status.active_runtime_loop_candidate_keys.join(", ")
      : "-";
  renderWarnings(warnings);

  if (!bridgeOk && !bridgeStarting) {
    setPill("bad", "Offline");
  } else if (bridgeStarting) {
    setPill("warn", "Starting");
  } else if (warnings.length > 0) {
    setPill("warn", "Review");
  } else if (bridgeOk && dashboardOk) {
    setPill("ok", "Ready");
  } else if (bridgeOk) {
    setPill("ok", "Ready");
  } else {
    setPill("warn", "Review");
  }

  syncActionState();
}

async function refreshStatus() {
  setBusy(true);
  try {
    const status = await invoke("desktop_status");
    renderStatus(status);
    log("Status refreshed.", JSON.stringify(status, null, 2));
  } catch (error) {
    setPill("bad", "Error");
    log("Status refresh failed.", String(error));
  } finally {
    setBusy(false);
  }
}

async function startRuntime() {
  setBusy(true);
  try {
    const result = await invoke("start_runtime");
    log("Runtime start command completed.", result.output || result.message || JSON.stringify(result));
    await refreshStatus();
  } catch (error) {
    log("Runtime start failed.", String(error));
  } finally {
    setBusy(false);
  }
}

async function openDashboard() {
  const url = state.status?.dashboard_url;
  if (!url) {
    log(
      "Debug dashboard is not running.",
      "This is optional. MUSU Desktop runs local work through the bridge; MUSU.PRO sends user input to that local runtime."
    );
    return;
  }

  try {
    const result = await invoke("open_dashboard", { url });
    log("Dashboard open requested.", result.message || url);
  } catch (error) {
    log("Dashboard open failed.", String(error));
  }
}

async function copyDiagnostics() {
  const payload = JSON.stringify(state.status || {}, null, 2);
  try {
    await navigator.clipboard.writeText(payload);
    log("Diagnostics copied.");
  } catch (error) {
    log("Copy failed.", String(error));
  }
}

$("refresh").addEventListener("click", refreshStatus);
$("start-runtime").addEventListener("click", startRuntime);
$("open-dashboard").addEventListener("click", openDashboard);
$("copy-diagnostics").addEventListener("click", copyDiagnostics);
$("clear-log").addEventListener("click", () => {
  $("log").textContent = "";
});

refreshStatus();
