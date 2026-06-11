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

  // Sign-in button: shown when device-flow is NOT actively pending (failed, or
  // idle with no code) so the user can (re)start sign-in without restarting the
  // app. Hidden while a code is live (the Approve link covers that case).
  const signinBtn = $("signin-btn");
  const flowPending = status === "awaiting-device-approval" && Boolean(code);

  if (status === "device-flow-failed") {
    setConn("offline", "Connection failed");
    $("connecting-detail").textContent = "Sign-in didn't complete. Try again.";
    if (signinBtn) signinBtn.hidden = false;
  } else if (status === "awaiting-device-approval") {
    setConn("connecting", "Connecting…");
    $("connecting-detail").textContent = "Waiting for you to approve at musu.pro…";
    if (signinBtn) signinBtn.hidden = flowPending;
  } else {
    setConn("connecting", "Connecting…");
    $("connecting-detail").textContent = "Starting…";
    if (signinBtn) signinBtn.hidden = false;
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
    // S-tier (Tailscale machines-list): a fleet row is CLICKABLE — selecting a
    // machine targets it for your next order + focuses the input. "Click a
    // machine, give it work." Keyboard-accessible (Enter/Space).
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-label", `Send an order to ${n.node_name || "this machine"}`);
    li.dataset.node = n.node_name || "";
    const selectThisMachine = () => {
      const sel = $("order-target");
      if (sel && [...sel.options].some((o) => o.value === li.dataset.node)) {
        sel.value = li.dataset.node;
      }
      // highlight the chosen row + cue the composer
      list.querySelectorAll(".fleet-row.selected").forEach((r) => r.classList.remove("selected"));
      li.classList.add("selected");
      $("order-input").focus();
      $("order-input").placeholder = n.is_this_pc
        ? "What should this PC do?"
        : `What should ${n.node_name} do?`;
    };
    li.addEventListener("click", selectThisMachine);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectThisMachine();
      }
    });

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

  // Account row + sign in/out buttons. We only have an honest binary signal
  // (token present → "Signed in"); the cloud exposes no /me identity, so we do
  // NOT invent an email/username. "Connected" = cloud login; "Local Only" =
  // bridge token but no cloud account.
  const auth = status.auth_status || "";
  const signedIn = auth === "Connected";
  $("d-account").textContent = signedIn
    ? "Signed in"
    : auth === "Local Only"
      ? "Local only (not signed in)"
      : "Not signed in";
  // Suppress Sign out while the connecting screen is active (a device-flow login
  // may be mid-poll; logging out then would let the in-flight flow re-save the
  // token we just deleted — audit 2026-06-11 MEDIUM logout/login race).
  const loginInProgress = !$("connecting").hidden;
  const out = $("d-signout");
  const inb = $("d-signin");
  if (out) out.hidden = !signedIn || loginInProgress;
  if (inb) inb.hidden = signedIn || loginInProgress;

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

// ── diagnostics drawer load (EXPENSIVE — doctor + process scan) ─────────
// Only run desktop_status when the user actually wants diagnostics: when the
// "Having trouble?" drawer opens, or Refresh is pressed. The 15s poll uses the
// cheap cockpit_state instead (see refresh()).
async function loadDiagnostics() {
  try {
    const status = await invoke("desktop_status");
    renderDiagnostics(status);
  } catch (err) {
    const wbox = $("diag-warnings");
    if (wbox) {
      wbox.hidden = false;
      wbox.textContent = `Diagnostics unavailable: ${String(err)}`;
    }
  }
}

// ── refresh cycle (CHEAP — runs every 15s) ─────────────────────────────
// Uses cockpit_state (bridge /health probe + two token-file reads), NOT
// desktop_status. The expensive doctor/process-scan path is deferred to the
// diagnostics drawer (loadDiagnostics).
async function refresh() {
  let status = null;
  try {
    status = await invoke("cockpit_state");
  } catch (err) {
    setConn("offline", "Error");
    $("connecting").hidden = false;
    $("fleet-section").hidden = true;
    $("connecting-detail").textContent = String(err);
    return;
  }

  // cockpit_state.auth_status: "Connected" (cloud login), "Local Only" (bridge
  // token, no cloud login), "Offline". P1: a "Local Only" machine is still a
  // working machine — show THIS PC instead of trapping the user on the
  // device-flow screen (self-contained-product thesis). Only "Offline" with no
  // bridge means we genuinely can't show a fleet.
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

  // THIS PC's state. NOTE (thermo/critic 2026-06-11): we previously rendered
  // "working · N active" off active_runtime_loop_candidate_count — but that counts
  // ENABLED BACKGROUND SUBSYSTEMS (mDNS, clipboard, cloud_heartbeat=token-present),
  // not running tasks, so every logged-in idle machine read "working · 1". That's
  // a false signal — exactly the kind of on-screen lie this product is trying to
  // avoid. Until the bridge exposes a real running-task count (Phase 2a), show
  // honest "online" and nothing more. Don't paint activity we can't measure.
  const thisPcActivity = "online";

  if (connected) {
    try {
      const nodes = await invoke("list_fleet");
      renderFleet(Array.isArray(nodes) ? nodes : [], thisPcActivity, bridgeOk);
      setConn("connected", "Connected");
    } catch (err) {
      // P3: distinguish fetch failures from an empty fleet. The cockpit still
      // shows THIS PC (cockpit_state already told us the bridge is up) so a
      // cloud hiccup doesn't blank the screen, and the dot reflects the failure.
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

// ── order submission + observation loop (S-tier task inbox) ────
// An order is a trackable card in an ATTENTION-GROUPED inbox (running → done):
// it surfaces where it needs you. Running cards show a TICKING elapsed clock +
// "esc to stop" (the clock is the liveness proof, not a fake bar). The composer
// NEVER blocks — you queue the next order while one runs. Status reads by SHAPE
// as well as color (the .task-dot CSS), so it's legible at a glance / colorblind.
const TASK_POLL_MS = 2500;
const TASK_FEED_MAX = 8; // most recent N orders kept across both groups
const activePolls = new Map(); // task_id → interval handle
const elapsedTimers = new Map(); // task_id → interval handle for the ticking clock
const taskStartedAt = new Map(); // task_id → ms epoch when first seen running

function terminalStatus(s) {
  return s === "done" || s === "failed" || s === "cancelled" || s === "not_found";
}

function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

// Which group a status belongs in. pending+running = "running" (in flight);
// terminal = "done".
function groupFor(status) {
  return terminalStatus(status) ? "done" : "running";
}

function groupList(group) {
  return $("task-feed").querySelector(`[data-group="${group}"] .task-group-list`);
}

// Show/hide each group section based on whether it has cards; reveal the feed.
function refreshGroupVisibility() {
  const feed = $("task-feed");
  let any = false;
  for (const group of ["running", "done"]) {
    const section = feed.querySelector(`[data-group="${group}"]`);
    const has = section.querySelector(".task-group-list").children.length > 0;
    section.hidden = !has;
    any = any || has;
  }
  feed.hidden = !any;
}

function stopTaskTimers(taskId) {
  if (elapsedTimers.has(taskId)) {
    clearInterval(elapsedTimers.get(taskId));
    elapsedTimers.delete(taskId);
  }
}

function renderTaskCard(taskId, { status, text, output, error, artifact }) {
  const targetGroup = groupFor(status);
  let li = document.querySelector(`#task-feed [data-task="${taskId}"]`);
  if (!li) {
    li = document.createElement("li");
    li.dataset.task = taskId;
    li.innerHTML =
      '<div class="task-head">' +
      '<span class="task-dot" aria-hidden="true"></span>' +
      '<span class="task-text"></span>' +
      '<span class="task-elapsed"></span>' +
      '<span class="task-status"></span></div>' +
      '<div class="task-detail" hidden></div>';
  }
  // Move the card to the right group if its status changed group.
  const list = groupList(targetGroup);
  if (li.parentElement !== list) {
    list.prepend(li);
  }
  li.className = `task-card ${status}`;
  if (text) li.querySelector(".task-text").textContent = text;
  li.querySelector(".task-status").textContent = status;

  // Ticking elapsed clock + "esc to stop" while in flight; freeze on terminal.
  const elapsedEl = li.querySelector(".task-elapsed");
  if (status === "running" || status === "pending") {
    if (!taskStartedAt.has(taskId)) taskStartedAt.set(taskId, Date.now());
    if (!elapsedTimers.has(taskId)) {
      const tick = () => {
        elapsedEl.textContent =
          fmtElapsed(Date.now() - taskStartedAt.get(taskId)) + " · esc to stop";
      };
      tick();
      elapsedTimers.set(taskId, setInterval(tick, 1000));
    }
  } else {
    stopTaskTimers(taskId);
    if (taskStartedAt.has(taskId)) {
      elapsedEl.textContent = fmtElapsed(Date.now() - taskStartedAt.get(taskId));
    } else {
      elapsedEl.textContent = "";
    }
  }

  const detail = li.querySelector(".task-detail");
  const body = error ? `error: ${error}` : artifact ? `→ ${artifact}` : output || "";
  if (body) {
    detail.hidden = false;
    detail.textContent = body;
  }

  // Trim oldest across both groups (and stop their polling/timers).
  const all = $("task-feed").querySelectorAll(".task-card");
  if (all.length > TASK_FEED_MAX) {
    // remove from the DONE group first (terminal, least useful to keep)
    const doneCards = groupList("done").querySelectorAll(".task-card");
    let toRemove = all.length - TASK_FEED_MAX;
    for (let i = doneCards.length - 1; i >= 0 && toRemove > 0; i--, toRemove--) {
      const id = doneCards[i].dataset.task;
      if (id && activePolls.has(id)) {
        clearInterval(activePolls.get(id));
        activePolls.delete(id);
      }
      stopTaskTimers(id);
      doneCards[i].remove();
    }
  }
  refreshGroupVisibility();
}

function pollTask(taskId, text) {
  if (activePolls.has(taskId)) return;
  const tick = async () => {
    let st;
    try {
      st = await invoke("get_order_status", { taskId });
    } catch (err) {
      renderTaskCard(taskId, { status: "failed", text, error: String(err) });
      clearInterval(activePolls.get(taskId));
      activePolls.delete(taskId);
      stopTaskTimers(taskId);
      return;
    }
    renderTaskCard(taskId, {
      status: st.status,
      text,
      output: st.output,
      error: st.error,
      artifact: st.artifact_path,
    });
    if (terminalStatus(st.status)) {
      clearInterval(activePolls.get(taskId));
      activePolls.delete(taskId);
      // OS notification on terminal events (no-op if the plugin command is
      // absent — wrapped in try/catch so a missing command can't break the UI).
      notifyTerminal(text, st);
    }
  };
  tick(); // immediate first poll
  activePolls.set(taskId, setInterval(tick, TASK_POLL_MS));
}

// Fire an OS notification when an order finishes — so the user can walk away and
// MUSU taps them. Best-effort: the Tauri command may not exist yet (shell-only
// build), so swallow errors.
async function notifyTerminal(text, st) {
  try {
    await invoke("notify_task_result", {
      title: st.status === "done" ? "Order done" : `Order ${st.status}`,
      body: (text || "") + (st.output ? `\n${st.output.slice(0, 120)}` : ""),
    });
  } catch {
    /* command not available in this build — ignore */
  }
}

// esc cancels the most recent in-flight task (the one you're watching).
async function cancelNewestRunning() {
  const running = groupList("running").querySelector(".task-card");
  if (!running) return;
  const taskId = running.dataset.task;
  try {
    await invoke("cancel_order", { taskId });
  } catch {
    /* cancel command not in this build — ignore */
  }
}

async function submitOrder() {
  const input = $("order-input");
  const text = input.value.trim();
  if (!text) return;
  const target = $("order-target")?.value || "";

  // Non-blocking composer: clear the box immediately and let the user keep
  // typing the next order. Feedback lives in the task card, not a blocking state.
  input.value = "";
  input.focus();

  try {
    const result = await invoke("submit_order", { text, target });
    if (result.task_id) {
      renderTaskCard(result.task_id, { status: "pending", text });
      pollTask(result.task_id, text);
    } else {
      // No task id (e.g. rejected) — surface as a failed card so it's visible.
      renderTaskCard(`local-${Date.now()}`, {
        status: "failed",
        text,
        error: result.message || "order not queued",
      });
    }
  } catch (err) {
    renderTaskCard(`local-${Date.now()}`, {
      status: "failed",
      text,
      error: String(err),
    });
  }
}

// ── wiring ─────────────────────────────────────────────
$("order-send").addEventListener("click", submitOrder);
$("order-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitOrder();
});
// ── command palette (Ctrl/Cmd+K) — keyboard-first premium speed ────────
// A searchable action list. Frecency-lite: recently-run commands float up.
const paletteCommands = [
  { id: "focus-order", label: "Focus order input", run: () => $("order-input").focus() },
  { id: "next-attention", label: "Jump to next task needing attention",
    run: () => {
      const card = $("task-feed").querySelector('[data-group="running"] .task-card');
      if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    } },
  { id: "cancel-newest", label: "Cancel the newest running task", run: cancelNewestRunning },
  { id: "clear-done", label: "Clear finished tasks",
    run: () => {
      const done = $("task-feed").querySelector('[data-group="done"] .task-group-list');
      if (done) done.textContent = "";
      refreshGroupVisibility();
    } },
  { id: "diagnostics", label: "Open diagnostics",
    run: () => { const d = $("diagnostics"); d.open = true; d.scrollIntoView(); } },
  { id: "refresh", label: "Refresh now", run: () => refresh() },
];
const paletteFrecency = new Map(); // id → score

function rankCommands(query) {
  const q = query.trim().toLowerCase();
  return paletteCommands
    .filter((c) => !q || c.label.toLowerCase().includes(q))
    .map((c) => ({ c, score: (paletteFrecency.get(c.id) || 0) - (c.label.toLowerCase().indexOf(q) >= 0 ? 0 : 1) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);
}

let paletteIndex = 0;
function renderPalette(query) {
  const list = $("palette-results");
  const ranked = rankCommands(query);
  paletteIndex = Math.min(paletteIndex, Math.max(0, ranked.length - 1));
  list.innerHTML = "";
  ranked.forEach((c, i) => {
    const li = document.createElement("li");
    li.className = "palette-result" + (i === paletteIndex ? " active" : "");
    li.textContent = c.label;
    li.addEventListener("click", () => runPaletteCommand(c));
    list.appendChild(li);
  });
  list._ranked = ranked;
}

function openPalette() {
  const p = $("palette");
  p.hidden = false;
  paletteIndex = 0;
  $("palette-input").value = "";
  renderPalette("");
  $("palette-input").focus();
}
function closePalette() {
  $("palette").hidden = true;
  $("order-input").focus();
}
function runPaletteCommand(c) {
  paletteFrecency.set(c.id, (paletteFrecency.get(c.id) || 0) + 1);
  closePalette();
  try { c.run(); } catch (e) { /* command failed, non-fatal */ }
}

$("palette-input").addEventListener("input", (e) => {
  paletteIndex = 0;
  renderPalette(e.target.value);
});
$("palette-input").addEventListener("keydown", (e) => {
  const ranked = $("palette-results")._ranked || [];
  if (e.key === "ArrowDown") {
    paletteIndex = Math.min(paletteIndex + 1, ranked.length - 1);
    renderPalette(e.target.value);
    e.preventDefault();
  } else if (e.key === "ArrowUp") {
    paletteIndex = Math.max(paletteIndex - 1, 0);
    renderPalette(e.target.value);
    e.preventDefault();
  } else if (e.key === "Enter") {
    if (ranked[paletteIndex]) runPaletteCommand(ranked[paletteIndex]);
    e.preventDefault();
  } else if (e.key === "Escape") {
    closePalette();
    e.preventDefault();
  }
});
$("palette").addEventListener("click", (e) => {
  if (e.target.id === "palette") closePalette(); // backdrop click
});

// Global keys: Ctrl/Cmd+K opens palette; Esc cancels newest task (when palette closed).
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    $("palette").hidden ? openPalette() : closePalette();
    return;
  }
  if (e.key === "Escape" && $("palette").hidden) cancelNewestRunning();
});
// ── account actions (sign in / sign out) ──────────────────────────────
async function startSignIn(btn) {
  if (btn) btn.disabled = true;
  try {
    await invoke("start_login");
    // The connecting screen will pick up startup-marker.json on the next tick
    // (approval code + browser link). Nudge a refresh so it shows promptly.
    setConn("connecting", "Opening sign-in…");
    refresh();
  } catch (err) {
    setConn("offline", "Sign-in failed");
    $("connecting-detail").textContent = String(err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function signOut(btn) {
  if (btn) btn.disabled = true;
  try {
    await invoke("account_logout");
  } catch (err) {
    const wbox = $("diag-warnings");
    if (wbox) {
      wbox.hidden = false;
      wbox.textContent = `Sign out failed: ${String(err)}`;
    }
  } finally {
    if (btn) btn.disabled = false;
    refresh();
    loadDiagnostics();
  }
}

$("signin-btn").addEventListener("click", (e) => startSignIn(e.currentTarget));
$("d-signin").addEventListener("click", (e) => startSignIn(e.currentTarget));
$("d-signout").addEventListener("click", (e) => signOut(e.currentTarget));

// Diagnostics are lazy: only fetch the expensive desktop_status when the drawer
// is actually opened (and again on each open, to refresh stale numbers).
$("diagnostics").addEventListener("toggle", (e) => {
  if (e.target.open) loadDiagnostics();
});
// Refresh inside the drawer refreshes BOTH the cheap cockpit view and the
// expensive diagnostics (the user explicitly asked for fresh numbers).
$("d-refresh").addEventListener("click", () => {
  refresh();
  loadDiagnostics();
});
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
