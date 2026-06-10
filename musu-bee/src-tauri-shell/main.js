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

function renderFleet(nodes, thisPcActivity, thisPcBridgeOk) {
  $("connecting").hidden = true;
  $("fleet-section").hidden = false;

  const list = $("fleet-list");
  list.textContent = "";

  const others = nodes.filter((n) => !n.is_this_pc);
  // empty = no nodes at all, or only this PC
  const isEmpty = nodes.length === 0 || others.length === 0;
  $("fleet-empty").hidden = !isEmpty;

  // keep the order target dropdown in sync with the fleet (preserve selection)
  const sel = $("order-target");
  if (sel) {
    const prev = sel.value;
    sel.textContent = "";
    const any = document.createElement("option");
    any.value = "";
    any.textContent = "any machine";
    sel.appendChild(any);
    for (const n of nodes) {
      const opt = document.createElement("option");
      opt.value = n.node_name;
      opt.textContent = n.is_this_pc ? `${n.node_name} (this PC)` : n.node_name;
      sel.appendChild(opt);
    }
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }

  for (const n of nodes) {
    // THIS PC's liveness = the local bridge being up (not an unconditional true —
    // if the bridge is down while the window is open, this PC is NOT online).
    const online = n.is_this_pc ? Boolean(thisPcBridgeOk) : isOnline(n.last_seen);
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
    if (n.is_this_pc) {
      // The one thing only the local app can show: what THIS PC is doing.
      meta.textContent = online ? thisPcActivity || "idle" : "bridge down";
      if (online && (thisPcActivity || "").startsWith("working")) meta.classList.add("working");
    } else {
      meta.textContent = online ? "online" : `seen ${relTime(n.last_seen)}`;
    }
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

  // desktop_status.auth_status: "Connected" (cloud login), "Local Only" (bridge
  // token, no cloud login), "Offline", "Unknown". P1: a "Local Only" machine is
  // still a working machine — show THIS PC instead of trapping the user on the
  // device-flow screen (self-contained-product thesis). Only "Offline"/"Unknown"
  // with no bridge means we genuinely can't show a fleet.
  const auth = status.auth_status || "";
  const connected = auth === "Connected";
  const localOnly = auth === "Local Only";
  const bridgeOk = status.bridge_status === "ok";

  if (!connected && !localOnly && !bridgeOk) {
    // Not connected and no local bridge → show the connecting / device-flow screen.
    let marker = null;
    try {
      marker = await invoke("read_startup_marker");
    } catch {
      marker = null;
    }
    showConnecting(marker || {});
    return;
  }

  // P1: derive "what THIS PC is doing" from desktop_status — the one signal only
  // a local app has. active_runtime_loop_candidate_count > 0 == working.
  const active = status.active_runtime_loop_candidate_count ?? 0;
  const thisPcActivity = active > 0 ? `working · ${active} active` : "idle";

  if (connected) {
    try {
      const nodes = await invoke("list_fleet");
      renderFleet(Array.isArray(nodes) ? nodes : [], thisPcActivity, bridgeOk);
      setConn("connected", "Connected");
    } catch (err) {
      // P3: distinguish fetch failures from an empty fleet. The cockpit still
      // shows THIS PC (from desktop_status) so a cloud hiccup doesn't blank the
      // screen, and the connection dot reflects the real failure.
      const msg = String(err);
      renderFleet(
        [{ node_name: "this machine", last_seen: "", public_url: "", is_this_pc: true }],
        thisPcActivity,
        bridgeOk
      );
      if (msg.includes("token_expired")) {
        setConn("connecting", "Sign in again");
      } else {
        setConn("connecting", "musu.pro unreachable");
      }
      const wbox = $("diag-warnings");
      wbox.hidden = false;
      wbox.textContent =
        msg.includes("token_expired")
          ? "Your sign-in expired — reopen MUSU to reconnect."
          : `Couldn't reach musu.pro to list your fleet (${msg}). Showing this machine only.`;
    }
  } else {
    // Local Only: cloud-disconnected but the local bridge works. Show just THIS
    // PC (no cloud fleet list available) and a calmer "local" connection state.
    renderFleet(
      [{ node_name: "this machine", last_seen: "", public_url: "", is_this_pc: true }],
      thisPcActivity,
      bridgeOk
    );
    setConn("connecting", "Local only");
  }
}

// ── order submission (P0 input path → submit_order) ────
async function submitOrder() {
  const input = $("order-input");
  const sendBtn = $("order-send");
  const statusEl = $("order-status");
  const text = input.value.trim();
  if (!text) return;

  const target = $("order-target")?.value || "";
  input.disabled = true;
  sendBtn.disabled = true;
  statusEl.hidden = false;
  statusEl.className = "order-status pending";
  statusEl.textContent = "Sending…";

  try {
    const result = await invoke("submit_order", { text, target });
    statusEl.className = "order-status ok";
    statusEl.textContent = result.message || "Order sent.";
    input.value = "";
  } catch (err) {
    statusEl.className = "order-status bad";
    statusEl.textContent = String(err);
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    setTimeout(() => {
      statusEl.hidden = true;
    }, 4000);
  }
}

// ── wiring ─────────────────────────────────────────────
$("order-send").addEventListener("click", submitOrder);
$("order-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitOrder();
});
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
// P1: 15s, not 5s. `desktop_status` shells out to `musu doctor` + enumerates the
// whole process table each tick; 5s meant doing that 12×/min forever on an idle
// tray app. 15s keeps connection/activity current at 1/3 the process churn; the
// Refresh button covers on-demand freshness. Pause entirely when the window is
// hidden — a minimized tray app polling is pure waste.
let pollTimer = setInterval(refresh, 15000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearInterval(pollTimer);
    pollTimer = null;
  } else if (!pollTimer) {
    refresh();
    pollTimer = setInterval(refresh, 15000);
  }
});
