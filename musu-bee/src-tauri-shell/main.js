// MUSU Desktop — fleet cockpit.
// Three states: connecting (no token / device-flow pending), fleet (connected),
// and an always-available diagnostics drawer. The plumbing the old shell put
// front-and-center (bridge/process/runtime) now lives only in that drawer.

const $ = (id) => document.getElementById(id);

const LAST_SEEN_ONLINE_MS = 90_000; // a node seen within 90s counts as online

async function invoke(command, args = {}) {
  const api = window.__TAURI__?.core;
  if (!api?.invoke) {
    throw new Error("Tauri IPC unavailable. Run inside the MUSU desktop app.");
  }
  return api.invoke(command, args);
}

function setConn(state, label) {
  const el = $("conn");
  el.dataset.state = state;
  $("conn-label").textContent = label;
}

function isOnline(lastSeen) {
  if (!lastSeen) return false;
  const t = Date.parse(lastSeen);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < LAST_SEEN_ONLINE_MS;
}

function relTime(lastSeen) {
  const t = Date.parse(lastSeen);
  if (Number.isNaN(t)) return "unknown";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── screen switching ───────────────────────────────────
function showConnecting(marker) {
  $("connecting").hidden = false;
  $("fleet-section").hidden = true;

  // startup-marker.json fields (musu-startup.rs StartupMarker): the lifecycle
  // phase is `stage`; the device-flow pair is device_user_code / device_approval_url.
  const status = marker?.stage;
  const code = marker?.device_user_code;
  const url = marker?.device_approval_url;

  if (code) {
    $("connecting-code").hidden = false;
    $("code-value").textContent = code;
  } else {
    $("connecting-code").hidden = true;
  }
  if (url) {
    const link = $("approve-link");
    link.href = url;
    link.hidden = false;
  } else {
    $("approve-link").hidden = true;
  }

  if (status === "device-flow-failed") {
    setConn("offline", "Connection failed");
    $("connecting-detail").textContent =
      "Sign-in didn't complete. Reopen MUSU to try again.";
  } else if (status === "awaiting-device-approval") {
    setConn("connecting", "Connecting…");
    $("connecting-detail").textContent = "Waiting for you to approve at musu.pro…";
  } else {
    setConn("connecting", "Connecting…");
    $("connecting-detail").textContent = "Starting…";
  }
}

function renderFleet(nodes) {
  $("connecting").hidden = true;
  $("fleet-section").hidden = false;
  setConn("connected", "Connected");

  const list = $("fleet-list");
  list.textContent = "";

  const others = nodes.filter((n) => !n.is_this_pc);
  // empty = no nodes at all, or only this PC
  $("fleet-empty").hidden = !(nodes.length === 0 || others.length === 0);

  for (const n of nodes) {
    const online = n.is_this_pc || isOnline(n.last_seen);
    const li = document.createElement("li");
    li.className = `fleet-row ${online ? "online" : "offline"}`;

    const dot = document.createElement("span");
    dot.className = "node-dot";
    li.appendChild(dot);

    const name = document.createElement("span");
    name.className = "node-name";
    name.textContent = n.node_name || "(unnamed)";
    li.appendChild(name);

    if (n.is_this_pc) {
      const badge = document.createElement("span");
      badge.className = "this-pc-badge";
      badge.textContent = "this PC";
      li.appendChild(badge);
    }

    const meta = document.createElement("span");
    meta.className = "node-meta";
    meta.textContent = n.is_this_pc ? "online" : online ? "online" : `seen ${relTime(n.last_seen)}`;
    li.appendChild(meta);

    list.appendChild(li);
  }
}

// ── diagnostics drawer ─────────────────────────────────
function renderDiagnostics(status) {
  const bridgeOk = status.bridge_status === "ok";
  const bridgeStarting = status.bridge_status === "starting";
  $("d-bridge").textContent = bridgeOk
    ? "running"
    : bridgeStarting
      ? "starting"
      : "offline";
  $("d-conn").textContent = status.auth_status || "unknown";
  $("d-runtime").textContent = `${status.runtime_process_count ?? 0} process(es)`;

  const warnings = Array.isArray(status.warnings) ? status.warnings.filter(Boolean) : [];
  const wbox = $("diag-warnings");
  if (warnings.length) {
    wbox.hidden = false;
    wbox.textContent = warnings.join(" · ");
  } else {
    wbox.hidden = true;
  }
  $("version").textContent = status.version ? `MUSU ${status.version}` : "";
  window.__lastStatus = status;
}

// ── refresh cycle ──────────────────────────────────────
async function refresh() {
  let status = null;
  try {
    status = await invoke("desktop_status");
    renderDiagnostics(status);
  } catch (err) {
    setConn("offline", "Error");
    $("connecting").hidden = false;
    $("fleet-section").hidden = true;
    $("connecting-detail").textContent = String(err);
    return;
  }

  // Logged in? desktop_status.auth_status is "Connected" (cloud login present),
  // "Local Only" (bridge token but no cloud login), "Offline", or "Unknown".
  // Only "Connected" means we can list the fleet; everything else → connecting.
  const loggedIn = (status.auth_status || "") === "Connected";

  if (!loggedIn) {
    let marker = null;
    try {
      marker = await invoke("read_startup_marker");
    } catch {
      marker = null;
    }
    showConnecting(marker || {});
    return;
  }

  try {
    const nodes = await invoke("list_fleet");
    renderFleet(Array.isArray(nodes) ? nodes : []);
  } catch (err) {
    // Connected but fleet fetch failed — show fleet section empty + keep dot green.
    renderFleet([]);
    const wbox = $("diag-warnings");
    wbox.hidden = false;
    wbox.textContent = `Couldn't load fleet: ${err}`;
  }
}

// ── wiring ─────────────────────────────────────────────
$("d-refresh").addEventListener("click", refresh);
$("d-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(window.__lastStatus || {}, null, 2));
    $("d-copy").textContent = "Copied!";
    setTimeout(() => ($("d-copy").textContent = "Copy diagnostics"), 1500);
  } catch {
    /* ignore */
  }
});

refresh();
setInterval(refresh, 5000); // light poll; fleet + connection state stay current
