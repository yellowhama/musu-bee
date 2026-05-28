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
  for (const id of ["refresh", "start-runtime", "open-dashboard", "copy-diagnostics"]) {
    $(id).disabled = value;
  }
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

function renderStatus(status) {
  state.status = status;
  const bridgeOk = status.bridge_status === "ok";
  const dashboardOk = status.dashboard_status === "ok";

  $("bridge-status").textContent = bridgeOk ? "Online" : "Offline";
  $("bridge-detail").textContent = status.bridge_detail || "No bridge detail.";
  $("dashboard-status").textContent = dashboardOk ? "Online" : "Offline";
  $("dashboard-detail").textContent = status.dashboard_detail || "No dashboard detail.";
  $("bridge-url").textContent = status.bridge_url || "-";
  $("dashboard-url").textContent = status.dashboard_url || "-";
  $("musu-home").textContent = status.musu_home || "-";

  if (bridgeOk && dashboardOk) {
    setPill("ok", "Ready");
  } else if (bridgeOk || dashboardOk) {
    setPill("warn", "Partial");
  } else {
    setPill("bad", "Offline");
  }
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
  const url = state.status?.dashboard_url || "http://127.0.0.1:3000/app";
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
