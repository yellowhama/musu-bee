// MUSU Desktop — fleet cockpit.
// Three states: connecting (no token / device-flow pending), fleet (connected),
// and an always-available diagnostics drawer. The plumbing the old shell put
// front-and-center (bridge/process/runtime) now lives only in that drawer.

const $ = (id) => document.getElementById(id);

const state = {
  busy: false,
  status: null,
};

const LAST_SEEN_ONLINE_MS = 90_000; // a node seen within 90s counts as online
const FLEET_FILTERS = new Set(["all", "online", "targetable", "this-pc", "stale", "offline"]);
const PRIVATE_MESH_PROOF_ORDER =
  "MUSU Private Mesh proof: reply with the executing machine name and current time.";
const CONNECTOR_RISK_RULES = [
  {
    policy: "blocked",
    label: "Blocked",
    terms: ["password", "credential theft", "steal token", "captcha", "bypass", "stealth", "view generator", "brute"],
    reason: "evasion, credential, or artificial-engagement behavior is not a MUSU workflow",
  },
  {
    policy: "blocked-warning",
    label: "Blocked / explicit warning",
    terms: ["lead", "email", "phone", "linkedin", "instagram", "tiktok", "twitter", "telegram", "profile scraper"],
    reason: "personal-data and social-profile scraping carries privacy and platform-risk",
  },
  {
    policy: "warn",
    label: "Needs review",
    terms: ["download", "downloader", "scraper", "scraping", "crawler", "proxy"],
    reason: "scraping or hosted marketplace actors require source, rights, cost, and data-egress review",
  },
  {
    policy: "allow-source",
    label: "Allowed with source proof",
    terms: ["markdown", "documentation", "docs", "rag browser", "website to markdown", "openapi"],
    reason: "content extraction can proceed when source URL and proof are recorded",
  },
];
const GENERATED_MARKETPLACE_CATALOG_RE =
  /(?:github\.com|raw\.githubusercontent\.com)\/cporter202\/(?:api-mega-list|scraping-apis-for-devs)(?:\/|$)/i;
const MARKETPLACE_CATALOG_INDEX_RE =
  /(?:api[-_\s]*mega[-_\s]*list|scraping[-_\s]*apis(?:[-_\s]*for[-_\s]*dev(?:eloper)?s)?|affiliate[-_\s]*api[-_\s]*(?:list|catalog|directory)|apify[-_\s]*(?:actor|actors|store)[-_\s]*(?:list|catalog|directory|collection)|(?:awesome|list|catalog|directory|collection)[-_\s]*(?:apify|scraping[-_\s]*apis|scraper[-_\s]*apis|hosted[-_\s]*actors))/i;

function marketplaceCatalogIndexSignal(value) {
  const raw = String(value || "").trim();
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  return GENERATED_MARKETPLACE_CATALOG_RE.test(raw) || MARKETPLACE_CATALOG_INDEX_RE.test(decoded);
}

const CURATED_CONNECTORS = [
  {
    id: "local-browser",
    name: "Local Browser",
    tier: "T0",
    provider: "local",
    requiresAccount: false,
    dataLeavesDevice: false,
    risk: "low",
    defaultEnabled: true,
    policy: "allow",
    status: "review-ready",
    health: "open local page + screenshot",
    proof: "screenshot, URL, log",
    query: "Local Browser local automation screenshot proof no external egress",
  },
  {
    id: "website-to-markdown",
    name: "Website to Markdown",
    tier: "T0",
    provider: "local",
    requiresAccount: false,
    dataLeavesDevice: true,
    risk: "medium",
    defaultEnabled: false,
    policy: "source URL",
    status: "review-ready",
    health: "fetch URL + status",
    proof: "source URL, markdown hash",
    query: "website to markdown documentation source URL provenance",
  },
  {
    id: "openapi-to-mcp",
    name: "OpenAPI to MCP",
    tier: "T1",
    provider: "user_mcp",
    requiresAccount: false,
    dataLeavesDevice: true,
    risk: "medium",
    defaultEnabled: false,
    policy: "source URL",
    status: "review-ready",
    health: "schema probe",
    proof: "generated tools + probe output",
    query: "OpenAPI to MCP official docs schema generator",
  },
  {
    id: "mcp-validator",
    name: "MCP Validator",
    tier: "T1",
    provider: "user_mcp",
    requiresAccount: false,
    dataLeavesDevice: false,
    risk: "medium",
    defaultEnabled: false,
    policy: "allow",
    status: "review-ready",
    health: "tool schema + timeout test",
    proof: "validation report",
    query: "MCP validator connector quality gate",
  },
  {
    id: "github",
    name: "GitHub",
    tier: "T2",
    provider: "external_api",
    requiresAccount: true,
    dataLeavesDevice: true,
    risk: "high",
    defaultEnabled: false,
    policy: "scoped key",
    status: "credential required",
    health: "authenticated user",
    proof: "scopes + username",
    query: "GitHub official API docs https://docs.github.com https://api.github.com user owned credential scoped token",
  },
  {
    id: "slack",
    name: "Slack",
    tier: "T2",
    provider: "external_api",
    requiresAccount: true,
    dataLeavesDevice: true,
    risk: "high",
    defaultEnabled: false,
    policy: "scoped key",
    status: "credential required",
    health: "auth test + channels",
    proof: "bot scopes + workspace",
    query: "Slack official API scoped bot token user owned credential",
  },
];

function connectorToolContractForUi(connector) {
  const requiresAccount = connector.requiresAccount === true;
  const dataLeavesDevice = connector.dataLeavesDevice === true;
  return {
    schema: "musu.tool_contract.v1",
    provider: connector.provider || "unknown",
    requires_account: requiresAccount,
    data_leaves_device: dataLeavesDevice,
    risk: connector.risk || "unknown",
    default_enabled: connector.defaultEnabled === true,
    run_policy:
      requiresAccount || dataLeavesDevice
        ? "explicit_user_enablement_required"
        : "local_first",
    disclosure:
      requiresAccount || dataLeavesDevice
        ? "External connector: show account, scope, egress, cost, and proof before running."
        : "Local-first connector: run without a third-party account or hidden egress.",
  };
}

function connectorRiskLedgerForUi(connector) {
  const toolContract = connectorToolContractForUi(connector);
  return [
    {
      dimension: "source",
      requirement: "known source/provenance before recommendation",
      status: connector.tier === "T0" ? "local_or_built_in" : "review_required",
    },
    {
      dimension: "license",
      requirement: "license or provider terms must be reviewable",
      status: connector.tier === "T0" ? "local_reviewed" : "provider_terms_required",
    },
    {
      dimension: "secrets",
      requirement: "only scoped user-owned credentials",
      status: toolContract.requires_account ? "scoped_secret_required" : "no_secret_required",
    },
    {
      dimension: "egress",
      requirement: "user-visible data egress boundary",
      status: toolContract.data_leaves_device ? "external_egress_disclosure_required" : "local_only",
    },
    {
      dimension: "proof",
      requirement: "health check proof before first success claim",
      status: "required",
      evidence: connector.health,
    },
  ];
}

function connectorApprovalGateForUi(connector) {
  const toolContract = connectorToolContractForUi(connector);
  return {
    allowed_to_recommend_or_run: false,
    state: "blocked_until_proven",
    required_before_use: [
      ...(toolContract.requires_account ? ["configure scoped user-owned credential"] : []),
      ...(toolContract.data_leaves_device ? ["confirm data egress boundary and provider terms"] : []),
      `pass health check: ${connector.health}`,
      "record proof artifact",
      "preserve deterministic retry payload",
    ],
  };
}
let fleetFilter = "all";
let lastFleetIsEmpty = true;
let lastFleetNodes = []; // last rendered node list (for this-PC IP lookups, etc.)
let lastThisPcPrograms = null; // this PC's ollama/comfyui/adapter snapshot
let lastAutoOpenedApprovalUrl = null; // device-flow approval URL we already opened
let lastPrivateMeshStatus = null;
let lastReleaseProofResult = null;
let lastReleaseProofTarget = null;
let lastPhysicalPeerEvidenceValidation = null;
let lastDerpProbe = null;

async function invoke(command, args = {}) {
  const api = window.__TAURI__?.core;
  if (!api?.invoke) {
    throw new Error("Tauri IPC unavailable. Run inside the MUSU desktop app.");
  }
  return api.invoke(command, args);
}

// Announce a state change to assistive tech via the hidden live regions. Writing
// the same text twice in a row won't re-announce (aria-atomic), so nudge with a
// leading space toggle when the text is unchanged.
function announce(message, assertive) {
  const el = document.getElementById(assertive ? "sr-live-assertive" : "sr-live-polite");
  if (!el || !message) return;
  const text = el.textContent === message ? message + " " : message;
  el.textContent = text;
}

let lastAnnouncedConnState = null;
function setConn(state, label) {
  const el = $("conn");
  el.dataset.state = state;
  $("conn-label").textContent = label;
  // Announce only real transitions, and route connection-lost to assertive.
  if (state !== lastAnnouncedConnState) {
    if (state === "offline" || state === "error") {
      announce("Connection lost", true);
    } else if (state === "online" || state === "connected") {
      announce("Connected");
    }
    lastAnnouncedConnState = state;
  }
}

function isOnline(lastSeen) {
  if (!lastSeen) return false;
  const t = Date.parse(lastSeen);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < LAST_SEEN_ONLINE_MS;
}

function nodeStatusError(node) {
  return String(node?.status_error || "").trim();
}

function nodeIsOnline(node, thisPcBridgeOk) {
  if (node?.is_this_pc) return Boolean(thisPcBridgeOk);
  return !nodeStatusError(node) && isOnline(node?.last_seen);
}

// F-3 HIGH-A: a peer with a direct route down BUT reachable_via="relay" is
// reachable over the relay, NOT offline. The web page (fleet/page.tsx
// nodeState) and CLI (cli_commands.rs) both read the same `reachable_via`
// field; the cockpit must agree or it shows "(probe failed)"/offline where the
// other two surfaces show "relay"/yellow. Keep this a pure read of the field
// the bridge already emits — do NOT conflate with mesh.state (tailscale label).
function nodeReachableViaRelay(node) {
  return String(node?.reachable_via || "") === "relay";
}

// Single source of truth for the 3-state fleet status, used by BOTH the
// order-target <select> and the renderFleet <li> so they cannot drift (the
// exact bug class F-3 HIGH-A). Mirrors fleet/page.tsx nodeState():
//   online  → direct route confirmed (or this PC's bridge up)
//   relay   → direct route down but reachable over the relay
//   offline → neither
// "targetable" = state !== "offline" (a relay peer IS reachable via forward).
function nodeFleetState(node, thisPcBridgeOk) {
  if (nodeIsOnline(node, thisPcBridgeOk)) return "online";
  if (nodeReachableViaRelay(node)) return "relay";
  return "offline";
}

function orderTargetIsAvailable(target) {
  const value = String(target || "");
  if (!value) return true;
  const sel = $("order-target");
  if (!sel) return false;
  return [...sel.options].some((option) => option.value === value && !option.disabled);
}

function orderTargetBoundary(option) {
  if (!option || !option.value) {
    return {
      boundary: "auto",
      text: "Auto-route: MUSU will choose an online target when you send. Retry preserves auto-route instead of re-reading the dropdown.",
      fingerprint: "auto",
    };
  }
  const meshState = option.dataset.meshState || "";
  const tailnetIp = option.dataset.tailnetIp || "";
  const controlServerUrl = option.dataset.controlServerUrl || "";
  const controlServerVerified = option.dataset.controlServerVerified || "";
  const fingerprint = [
    option.value || "",
    option.dataset.thisPc || "",
    meshState,
    tailnetIp,
    controlServerUrl,
    controlServerVerified,
  ].join("|");
  if (option.dataset.thisPc === "true") {
    return {
      boundary: "local",
      text: `Local: this order runs on ${option.value}. No machine-to-machine route or third-party account is required.`,
      fingerprint,
    };
  }
  if (meshState === "private") {
    return {
      boundary: "private",
      text: `Private Mesh: this order targets ${option.value} over MUSU-managed Headscale/private routing. No Tailscale.com signup is required.`,
      fingerprint,
    };
  }
  if (meshState === "external") {
    return {
      boundary: "external",
      text: `External route: ${option.value} is reachable through a non-MUSU or unverified tailnet. Run Private Mesh proof before treating it as release evidence.`,
      fingerprint,
    };
  }
  return {
    boundary: "unverified",
    text: `Unverified route: ${option.value} is online, but MUSU has not verified a Private Mesh route for it. Use verify/proof before release claims.`,
    fingerprint,
  };
}

function orderTargetOptionForValue(target) {
  const value = String(target || "");
  if (!value) return null;
  const sel = $("order-target");
  if (!sel) return null;
  return [...sel.options].find((option) => option.value === value) || null;
}

function orderTargetBoundarySnapshot(target) {
  const value = String(target || "");
  if (!value) return orderTargetBoundary(null);
  const option = orderTargetOptionForValue(value);
  if (option) return orderTargetBoundary(option);
  return {
    boundary: "unverified",
    text: `Unverified route: ${value} is not in the current live fleet target list. Retry keeps this target locked, but verify the machine before treating it as release evidence.`,
    fingerprint: `${value}|missing`,
  };
}

function orderBoundaryLabel(boundary) {
  switch (boundary) {
    case "auto":
      return "auto";
    case "local":
      return "local";
    case "private":
      return "Private Mesh";
    case "external":
      return "external";
    default:
      return "unverified";
  }
}

function applyTaskBoundary(li, orderBoundary) {
  const contract = orderBoundary || orderTargetBoundarySnapshot(li.dataset.orderTarget || "");
  li.dataset.orderBoundary = contract.boundary || "unverified";
  li.dataset.orderBoundaryText = contract.text || "";
  li.dataset.orderBoundaryFingerprint = contract.fingerprint || "";
  const boundary = li.querySelector(".task-boundary");
  if (!boundary) return;
  boundary.textContent = orderBoundaryLabel(li.dataset.orderBoundary);
  boundary.title = li.dataset.orderBoundaryText;
}

function orderBoundaryMismatch(expected, current) {
  if (!expected?.boundary) return false;
  if (expected.boundary !== current?.boundary) return true;
  if (!expected.fingerprint) return false;
  return expected.fingerprint !== (current?.fingerprint || "");
}

function parseOrderBoundaryFingerprint(fingerprint) {
  const parts = String(fingerprint || "").split("|");
  return {
    target: parts[0] || "",
    thisPc: parts[1] || "",
    meshState: parts[2] || "",
    tailnetIp: parts[3] || "",
    controlServerUrl: parts[4] || "",
    controlServerVerified: parts[5] || "",
  };
}

function orderBoundaryFingerprintDiffReason(expected, current) {
  const before = parseOrderBoundaryFingerprint(expected?.fingerprint);
  const after = parseOrderBoundaryFingerprint(current?.fingerprint);
  const changed = [];
  if (before.target !== after.target) changed.push("target changed");
  if (before.thisPc !== after.thisPc) changed.push("local/remote role changed");
  if (before.meshState !== after.meshState) changed.push("mesh state changed");
  if (before.tailnetIp !== after.tailnetIp) changed.push("tailnet IP changed");
  if (before.controlServerUrl !== after.controlServerUrl) changed.push("control server changed");
  if (before.controlServerVerified !== after.controlServerVerified) {
    changed.push("control-server verification changed");
  }
  return changed.length ? changed.join(", ") : "identity fingerprint changed";
}

function retryBoundaryChangedMessage(expected, current) {
  if (expected?.boundary === current?.boundary) {
    const reason = orderBoundaryFingerprintDiffReason(expected, current);
    return `Retry blocked: execution boundary identity changed within ${orderBoundaryLabel(current?.boundary)} (${reason}). Re-select the target or run Private Mesh proof before retrying.`;
  }
  return `Retry blocked: execution boundary changed from ${orderBoundaryLabel(expected.boundary)} to ${orderBoundaryLabel(current?.boundary)}. Re-select the target or run Private Mesh proof before retrying.`;
}

function updateOrderTargetDisclosure() {
  const disclosure = $("order-target-disclosure");
  const sel = $("order-target");
  if (!disclosure || !sel) return;
  const selected = sel.selectedOptions?.[0] || null;
  // Pre-send guard: if an explicit target is selected but offline/not-targetable,
  // don't accept an order we already know will fail — disable Send and surface
  // the reason now, instead of letting it surface later as a failed task card.
  const send = $("order-send");
  if (selected && selected.value && selected.disabled) {
    // The option text already carries the human reason, e.g. "node (offline)".
    const reason = selected.textContent || `${selected.value} is offline`;
    disclosure.dataset.boundary = "unverified";
    disclosure.textContent = `${reason} — pick a reachable machine, or clear the target to auto-route.`;
    if (send) {
      send.disabled = true;
      send.title = `${selected.value} is not reachable`;
    }
    return;
  }
  if (send) {
    send.disabled = false;
    send.removeAttribute("title");
  }
  const contract = orderTargetBoundary(selected);
  disclosure.dataset.boundary = contract.boundary;
  disclosure.textContent = contract.text;
}

function reviewTaskTarget(li) {
  const target = li.dataset.orderTarget || "";
  const sel = $("order-target");
  if (!target || !sel) return;
  let option = [...sel.options].find((o) => o.value === target);
  if (!option) {
    option = document.createElement("option");
    option.value = target;
    option.textContent = `${target} (not currently targetable)`;
    option.disabled = true;
    option.dataset.meshState = li.dataset.orderBoundary || "unverified";
    option.dataset.reviewOnly = "true";
    sel.appendChild(option);
  }
  sel.value = target;
  if (option.disabled || option.dataset.reviewOnly === "true") {
    const disclosure = $("order-target-disclosure");
    if (disclosure) {
      disclosure.dataset.boundary = li.dataset.orderBoundary || "unverified";
      disclosure.textContent = `Review only: ${target} is not currently targetable. ${
        li.dataset.orderBoundaryText || "Re-select an available machine before sending."
      }`;
    }
  } else {
    updateOrderTargetDisclosure();
  }
  $("order-input")?.focus();
}

function relTime(lastSeen) {
  const t = Date.parse(lastSeen);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function isTailnetIpv4(value) {
  const parts = String(value || "").split(".").map((part) => Number(part));
  return parts.length === 4 && parts.every((part) => Number.isInteger(part)) && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

function hostFromUrl(value) {
  try {
    return new URL(String(value || "")).hostname;
  } catch {
    return "";
  }
}

function meshLabelForNode(n) {
  const mode = String(n.mesh_mode || "").toLowerCase();
  const controlUrl = String(n.control_server_url || "").trim();
  const controlVerified = n.control_server_verified === true || n.control_server_verified === "true";
  const tailnetIp = String(n.tailscale_ip || n.tailnet_ip || "").trim();
  const publicHost = hostFromUrl(n.public_url || "");
  const hasTailnetRoute = isTailnetIpv4(tailnetIp) || isTailnetIpv4(publicHost);

  if (mode === "musu_headscale") {
    if (controlUrl && controlVerified) {
      return {
        state: "private",
        label: "Private Mesh",
        title: `MUSU Headscale control plane verified: ${controlUrl}`,
      };
    }
    return {
      state: "mesh-needed",
      label: "Mesh setup needed",
      title: "MUSU Headscale mode is present, but the control server is not verified.",
    };
  }

  if (mode === "external_tailscale_opt_in" || mode === "external_tailnet") {
    return {
      state: "external",
      label: "External Tailnet",
      title: "This route depends on an explicitly chosen external managed tailnet.",
    };
  }

  if (hasTailnetRoute) {
    return {
      state: "mesh-needed",
      label: "Mesh setup needed",
      title: "Tailnet routing exists, but MUSU Private Mesh control-plane evidence is missing.",
    };
  }

  return {
    state: "lan",
    label: "LAN",
    title: "Local LAN route; no tailnet control-plane dependency detected.",
  };
}

function peerVerifyCommandForNode(n, mesh, online) {
  if (!online || n.is_this_pc || mesh?.state !== "private") return "";
  const tailnetIp = String(n.tailscale_ip || n.tailnet_ip || "").trim();
  if (!isTailnetIpv4(tailnetIp)) return "";
  return `musu mesh verify --target-ip ${tailnetIp} --json`;
}

function powershellSingleQuote(value) {
  return `'${String(value || "").replaceAll("'", "''")}'`;
}

function releaseProofTargetForNode(n, mesh, online) {
  if (!online || n.is_this_pc || mesh?.state !== "private") return "";
  const tailnetIp = String(n.tailscale_ip || n.tailnet_ip || "").trim();
  const nodeName = String(n.node_name || "").trim();
  const controlUrl = String(
    n.control_server_url || lastPrivateMeshStatus?.control_server_url || ""
  ).trim();
  if (!nodeName || !isTailnetIpv4(tailnetIp) || !controlUrl) return "";
  return { nodeName, tailnetIp, controlUrl };
}

function releaseProofCommandForTarget(target, evidencePath = validatedPhysicalPeerEvidencePathForTarget(target)) {
  if (!target) return "";
  const physicalEvidence = String(evidencePath || "").trim() || "<copied-target-pc-physical-peer-evidence.json>";
  return [
    "musu mesh release-proof",
    "--target-node",
    powershellSingleQuote(target.nodeName),
    "--target-ip",
    powershellSingleQuote(target.tailnetIp),
    "--expected-control-server-url",
    powershellSingleQuote(target.controlUrl),
    "--physical-peer-evidence",
    powershellSingleQuote(physicalEvidence),
    "--json",
  ].join(" ");
}

function exactReleaseProofCommandForTarget(target) {
  const evidencePath = validatedPhysicalPeerEvidencePathForTarget(target);
  return evidencePath ? releaseProofCommandForTarget(target, evidencePath) : "";
}

function physicalPeerEvidenceCommandForTarget(target) {
  if (!target) return "";
  return "musu mesh physical-peer-evidence --json";
}

function connectorUrlFromCandidate(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol === "http:" || url.protocol === "https:") return url;
  } catch {
    return null;
  }
  return null;
}

function connectorUrlIsPrivateOrLocal(url) {
  const host = String(url?.hostname || "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host === "[::1]" ||
    host.startsWith("[fc") ||
    host.startsWith("[fd") ||
    host.startsWith("[fe80:")
  ) {
    return true;
  }
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

const SENSITIVE_SOURCE_URL_QUERY_KEYS = new Set([
  "access_token",
  "api-key",
  "api_key",
  "apikey",
  "auth",
  "authorization",
  "client_secret",
  "id_token",
  "key",
  "password",
  "private_key",
  "refresh_token",
  "secret",
  "session",
  "session_token",
  "token",
  "x-api-key",
]);

function connectorUrlSecretTerms(url) {
  const terms = [];
  if (url?.username || url?.password) terms.push("url_userinfo");
  for (const key of url?.searchParams?.keys?.() || []) {
    if (SENSITIVE_SOURCE_URL_QUERY_KEYS.has(String(key).toLowerCase())) {
      terms.push(`query:${key}`);
    }
  }
  return terms;
}

function classifyConnectorCandidate(value) {
  const input = String(value || "").trim();
  const haystack = input.toLowerCase();
  if (!haystack) {
    return {
      policy: "idle",
      label: "Connector gate",
      reason: "Paste an API, MCP server, hosted actor, or scraper to review before using it.",
      matched: [],
    };
  }
  if (
    marketplaceCatalogIndexSignal(input) ||
    marketplaceCatalogIndexSignal(haystack)
  ) {
    return {
      policy: "blocked-warning",
      label: "Blocked / explicit warning",
      reason: "generated affiliate/API marketplace indexes are discovery-only; MUSU will not import them or use them as connector proof sources",
      matched: ["marketplace_catalog_index"],
    };
  }
  for (const rule of CONNECTOR_RISK_RULES.filter((item) => item.policy !== "allow-source")) {
    const matched = rule.terms.filter((term) => haystack.includes(term));
    if (matched.length) {
      return { ...rule, matched };
    }
  }
  const candidateUrl = connectorUrlFromCandidate(input);
  const secretTerms = candidateUrl ? connectorUrlSecretTerms(candidateUrl) : [];
  if (secretTerms.length) {
    return {
      policy: "blocked",
      label: "Blocked",
      reason: "source URLs must not contain embedded credentials or token-like query parameters; use MUSU scoped secrets instead",
      matched: secretTerms,
    };
  }
  if (candidateUrl && connectorUrlIsPrivateOrLocal(candidateUrl)) {
    return {
      policy: "blocked",
      label: "Blocked",
      reason: "localhost or private-network URLs cannot be used as server-side connector proof sources; use local browser evidence instead",
      matched: [candidateUrl.hostname],
    };
  }
  if (/apify\.com|fpr=|actor/i.test(input)) {
    return {
      policy: "blocked-warning",
      label: "Blocked / explicit warning",
      reason: "marketplace or affiliate actor links stay discovery-only; MUSU will not fetch them as connector proof sources",
      matched: ["marketplace"],
    };
  }
  for (const rule of CONNECTOR_RISK_RULES.filter((item) => item.policy === "allow-source")) {
    const matched = rule.terms.filter((term) => haystack.includes(term));
    if (matched.length) {
      return { ...rule, matched };
    }
  }
  if (/github\.com|docs\.|developer\.|api\./i.test(input)) {
    return {
      policy: "allow-source",
      label: "Allowed with source proof",
      reason: "reviewable source can proceed after license, secrets, health check, and proof contract are known",
      matched: [],
    };
  }
  return {
    policy: "warn",
    label: "Needs review",
    reason: "unknown external connectors need source, license, secrets, egress, cost, health check, and proof before recommendation",
    matched: [],
  };
}

function reviewConnectorCandidate(value) {
  const card = $("connector-policy");
  const result = $("connector-review-result");
  if (!card || !result) return;
  const assessment = classifyConnectorCandidate(value);
  card.dataset.policy = assessment.policy;
  result.hidden = false;
  const matched = assessment.matched.length ? ` · matched: ${assessment.matched.join(", ")}` : "";
  result.textContent = `${assessment.label}: ${assessment.reason}${matched}`;
}

function renderConnectorRegistry() {
  const list = $("connector-registry");
  if (!list) return;
  list.replaceChildren();
  for (const connector of CURATED_CONNECTORS) {
    const toolContract = connectorToolContractForUi(connector);
    const li = document.createElement("li");
    li.className = "connector-card";
    li.dataset.connector = connector.id;
    li.dataset.connectorProvider = toolContract.provider;
    li.dataset.connectorAccount = toolContract.requires_account ? "required" : "none";
    li.dataset.connectorEgress = toolContract.data_leaves_device ? "external" : "local";
    li.dataset.connectorRisk = toolContract.risk;

    const head = document.createElement("div");
    head.className = "connector-card-head";

    const name = document.createElement("strong");
    name.textContent = connector.name;
    const tier = document.createElement("span");
    tier.textContent = connector.tier;
    head.append(name, tier);

    const meta = document.createElement("p");
    meta.textContent = `${connector.policy} · ${connector.status}`;

    const trust = document.createElement("div");
    trust.className = "connector-card-trust";
    trust.setAttribute("aria-label", `${connector.name} tool contract`);
    const trustRows = [
      `provider: ${toolContract.provider}`,
      toolContract.requires_account ? "account required" : "no account",
      toolContract.data_leaves_device ? "data leaves device" : "local data",
      `risk: ${toolContract.risk}`,
      toolContract.default_enabled ? "default on" : "explicit enable",
    ];
    for (const row of trustRows) {
      const chip = document.createElement("span");
      chip.textContent = row;
      trust.appendChild(chip);
    }

    const disclosure = document.createElement("p");
    disclosure.className = "connector-card-disclosure";
    disclosure.textContent = toolContract.disclosure;

    const proof = document.createElement("p");
    proof.className = "connector-card-proof";
    proof.textContent = `Health: ${connector.health} · Proof: ${connector.proof}`;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Review";
    button.dataset.connectorReview = connector.id;
    button.addEventListener("click", () => {
      const input = $("connector-review-input");
      if (input) input.value = connector.query;
      reviewConnectorCandidate(connector.query);
      input?.focus();
    });

    const copyPlan = document.createElement("button");
    copyPlan.type = "button";
    copyPlan.textContent = "Copy plan";
    copyPlan.dataset.connectorPlan = connector.id;
    copyPlan.addEventListener("click", () => copyConnectorPlan(copyPlan, connector));

    const runProof = document.createElement("button");
    runProof.type = "button";
    runProof.textContent = "Run proof";
    runProof.dataset.connectorProofRun = connector.id;
    runProof.addEventListener("click", () => runConnectorProof(runProof, connector));

    const actions = document.createElement("div");
    actions.className = "connector-card-actions";
    actions.append(button, copyPlan, runProof);

    const proofResult = document.createElement("p");
    proofResult.className = "connector-proof-result";
    proofResult.hidden = true;

    li.append(head, meta, trust, disclosure, proof, actions, proofResult);
    list.appendChild(li);
  }
}

function connectorRequiresSourceUrl(connector) {
  return connector.id === "website-to-markdown" || connector.id === "openapi-to-mcp";
}

function connectorSourceUrlFromInput() {
  const value = String($("connector-review-input")?.value || "").trim();
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    return "";
  }
  return "";
}

function renderConnectorProofResult(card, state, message) {
  if (!card) return;
  card.dataset.connectorProof = state;
  const result = card.querySelector(".connector-proof-result");
  if (!result) return;
  result.hidden = false;
  result.textContent = message;
}

function connectorProofMessage(payload) {
  const readiness = payload?.readiness || "unknown";
  const proof = payload?.proof || {};
  const gate = proof?.approval_gate || payload?.approval_gate || {};
  const gateText =
    typeof gate.allowed_to_recommend_or_run === "boolean"
      ? ` · Approval gate: ${gate.allowed_to_recommend_or_run ? "approved" : gate.state || "held"}`
      : "";
  if (payload?.ok === true) {
    const recordedAt = proof.proof_recorded_at ? ` · ${proof.proof_recorded_at}` : "";
    return `Proof captured: ${proof.result || "success"} · ${readiness}${gateText}${recordedAt}`;
  }
  if (readiness === "credentials_required") {
    const missing = Array.isArray(payload?.missing_secrets) ? payload.missing_secrets.join(", ") : "required secret";
    return `Proof not captured: credentials required (${missing})${gateText}`;
  }
  if (readiness === "source_url_blocked") {
    const sourceGate = proof?.source_gate || {};
    const reason = sourceGate.reason || proof?.error || "source URL blocked before health check";
    const risk = sourceGate.risk_profile ? ` · Risk: ${sourceGate.risk_profile}` : "";
    return `Proof not captured: source blocked before fetch (${reason})${risk}${gateText}`;
  }
  return `Proof not captured: ${payload?.error || proof?.error || readiness}${gateText}`;
}

async function runConnectorProof(btn, connector) {
  const card = btn?.closest(".connector-card");
  const old = btn?.textContent || "Run proof";
  const params = { id: connector.id };

  if (connectorRequiresSourceUrl(connector)) {
    const sourceUrl = connectorSourceUrlFromInput();
    if (!sourceUrl) {
      renderConnectorProofResult(card, "input_required", "Proof not captured: paste an http(s) source URL into the review field first.");
      return;
    }
    reviewConnectorCandidate(sourceUrl);
    params.source_url = sourceUrl;
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Running...";
    }
    renderConnectorProofResult(card, "checking", "Running connector health check...");
    if (!window.fetch) throw new Error("MCP HTTP unavailable");
    const res = await window.fetch("/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `connector-proof-${Date.now()}`,
        method: "musu_run_connector_health_check",
        params,
      }),
    });
    if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);
    const rpc = await res.json();
    if (rpc.error) {
      renderConnectorProofResult(card, "failed", `Proof not captured: ${rpc.error.message || rpc.error.code || "rpc_error"}`);
      return;
    }
    const state = rpc.result?.ok === true ? "proof_captured" : rpc.result?.readiness || "failed";
    renderConnectorProofResult(card, state, connectorProofMessage(rpc.result));
  } catch (err) {
    renderConnectorProofResult(card, "failed", `Proof not captured: ${err?.message || "connector health check failed"}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = old;
    }
  }
}

async function copyConnectorPlan(btn, connector) {
  const toolContract = connectorToolContractForUi(connector);
  const payload = {
    schema: "musu.connector_proof_plan.v1",
    connector_id: connector.id,
    connector_name: connector.name,
    tier: connector.tier,
    tool_contract: toolContract,
    policy: connector.policy,
    status: connector.status,
    health_check: connector.health,
    proof_artifact: connector.proof,
    risk_ledger: connectorRiskLedgerForUi(connector),
    approval_gate: connectorApprovalGateForUi(connector),
    retry_contract: {
      deterministic: true,
      preserve: ["order", "target", "connector_id", "input_payload"],
      forbidden: ["re-read mutable dropdown", "silently switch connector", "silently switch machine"],
    },
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    const old = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = old || "Copy plan"), 1400);
  } catch {
    btn.textContent = "Copy failed";
    setTimeout(() => (btn.textContent = "Copy plan"), 1400);
  }
}

async function runPeerVerify(btn, targetIp) {
  if (!btn || !isTailnetIpv4(targetIp)) return;
  const row = btn.closest(".fleet-row");
  const status = row?.querySelector(".node-proof-status");
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Verifying...";
  if (row) row.dataset.verifyState = "checking";
  if (status) {
    status.hidden = false;
    status.textContent = "checking";
    status.title = "Running peer ping and bridge health verification.";
  }

  try {
    const result = await invoke("private_mesh_verify_target", { targetIp });
    refreshPrivateMeshStatus({ force: true });
    if (row) {
      row.dataset.verifyState = result?.release_grade
        ? "release-grade"
        : result?.ok
          ? "reachable"
          : "failed";
    }
    if (result?.release_grade) {
      btn.textContent = "Release proof";
      btn.title = "Peer ping, bridge health, and callback proof are verified.";
      if (status) {
        status.textContent = "release proof";
        status.title = "Peer ping, bridge health, and callback proof are verified.";
      }
    } else if (result?.ok) {
      btn.textContent = "Reachable";
      const nextStep =
        result?.next_steps?.find(Boolean) ||
        "Peer ping and bridge health passed; callback proof is still required.";
      btn.title = nextStep;
      if (status) {
        status.textContent = "reachable";
        status.title = nextStep;
      }
    } else {
      btn.textContent = "Verify failed";
      btn.title = result?.error || "Private Mesh peer verification failed.";
      if (status) {
        status.textContent = "failed";
        status.title = btn.title;
      }
    }
  } catch (err) {
    if (row) row.dataset.verifyState = "failed";
    btn.textContent = "Verify failed";
    btn.title = String(err);
    if (status) {
      status.hidden = false;
      status.textContent = "failed";
      status.title = String(err);
    }
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = oldText || "Run verify";
    }, 1800);
  }
}

function releaseProofEvidencePath(result) {
  return (
    result?.verification_path ||
    result?.route_evidence_path ||
    result?.evidence_root ||
    ""
  );
}

function releaseProofOpenPath(result) {
  if (
    result?.archive_manifest_path &&
    result?.archive_manifest_sha256_path &&
    result?.archive_artifact_count >= 4 &&
    releaseArchiveVerifierPassed(result)
  ) {
    return result.archive_manifest_path;
  }
  return releaseProofEvidencePath(result);
}

function releaseProofIntegrityLabel(result) {
  if (!result) return "";
  if (result.integrity_verified === true) return "hash verified";
  if (result.integrity_error) return "hash not verified";
  return "";
}

function releaseProofIdentityLabel(result) {
  if (!result) return "";
  if (
    result.release_identity_bound === true &&
    result.route_evidence_integrity_verified === true &&
    result.route_transport_verified === true
  ) {
    return result.physical_peer_verified === true
      ? "identity + physical peer bound"
      : "identity bound · physical peer missing";
  }
  if (result.peer_identity_error || result.route_evidence_integrity_error || result.route_transport_error) {
    return "identity not verified";
  }
  return "";
}

function releaseProofSoftwareTrusted(result) {
  return result?.software_route_trusted === true;
}

function releaseProofTrusted(result) {
  return result?.release_evidence_trusted === true;
}

function releaseProofTrustError(result) {
  if (!result) return "";
  return (
    result.peer_identity_error ||
    result.route_evidence_integrity_error ||
    result.route_transport_error ||
    result.integrity_error ||
    result.physical_peer_error ||
    result.error ||
    ""
  );
}

function releaseArchiveVerifierPassed(result) {
  if (!result) return false;
  return (
    result.archive_verifier_ok === true &&
    result.archive_verifier_schema === "musu.private_mesh_release_proof_archive_verification.v1" &&
    result.archive_verifier_fail_count === 0
  );
}

function releaseArchiveVerifierScope(result) {
  const kind = String(result?.archive_verifier_kind || "").trim();
  if (kind === "native_desktop_internal") return "native structural replay";
  if (kind === "powershell_current_toolchain") return "standalone current-toolchain replay";
  if (kind) return kind;
  return "scope unknown";
}

function releaseDesktopRuntimePackaged(result) {
  return result?.desktop_runtime_packaged === true;
}

function releaseDesktopRuntimeLabel(result) {
  const kind = String(result?.desktop_runtime_kind || "").trim();
  if (kind === "packaged_desktop") return "packaged desktop runtime";
  if (kind === "dev_or_unpackaged_desktop") return "dev/unpackaged desktop runtime";
  if (kind === "external_cli_release_runner") return "external CLI release runner";
  if (kind === "runtime_unknown") return "runtime unknown";
  return kind || "runtime unknown";
}

function releaseReadinessCheckDetail(result, key) {
  if (!result) return "";
  if (key === "native_release_proof_ok") return result.error || result.output || "";
  if (key === "packaged_desktop_runtime") {
    return result.desktop_runtime_exe_path || "Release proof was not generated by a packaged MUSU desktop runtime.";
  }
  if (key === "hash_integrity_verified") {
    return result.route_evidence_integrity_error || result.integrity_error || "";
  }
  if (key === "route_identity_bound") {
    return result.peer_identity_error || result.route_transport_error || result.route_evidence_integrity_error || "";
  }
  if (key === "physical_peer_verified") return result.physical_peer_error || "";
  if (key === "release_evidence_trusted") {
    return result.physical_peer_error || result.bundle_manifest_error || result.error || "";
  }
  if (key === "bundle_manifest_verified") return result.bundle_manifest_error || "";
  if (key === "release_archive_ready") return result.archive_error || "";
  if (key === "archive_verifier_passed") {
    return (
      result.archive_verifier_error ||
      result.archive_error ||
      (result.archive_verifier_fail_count ? `archive verifier failed ${result.archive_verifier_fail_count} checks` : "")
    );
  }
  return "";
}

function releaseReadinessNextAction(result, failedChecks) {
  const target = releaseProofTargetFromResult(result) || lastReleaseProofTarget || {};
  const targetName = result?.target_node || target.nodeName || "<target-node>";
  const targetIp = result?.target_ip || target.tailnetIp || "<target-100.x.y.z>";
  const controlUrl = result?.expected_control_server_url || target.controlUrl || "<headscale-url>";
  const failed = Array.isArray(failedChecks) ? failedChecks : [];
  const physicalCheck = failed.find((check) => check.key === "physical_peer_verified");
  const physicalDetail = [
    physicalCheck?.detail,
    result?.physical_peer_error,
    result?.error,
  ].filter(Boolean).join(" ");
  const physicalEvidenceIsPrimary =
    physicalCheck &&
    (/physical peer evidence is required|target-generated evidence|same host|does not match target/i.test(physicalDetail) ||
      (!physicalPeerEvidencePath() && result?.physical_peer_verified !== true));
  const priorityKeys = [
    ...(physicalEvidenceIsPrimary ? ["physical_peer_verified"] : []),
    "packaged_desktop_runtime",
    "hash_integrity_verified",
    "route_identity_bound",
    ...(!physicalEvidenceIsPrimary ? ["physical_peer_verified"] : []),
    "release_evidence_trusted",
    "bundle_manifest_verified",
    "release_archive_ready",
    "archive_verifier_passed",
    "native_release_proof_ok",
  ];
  const firstByPriority =
    priorityKeys
      .map((key) => failed.find((check) => check.key === key))
      .find(Boolean) || failed[0];
  const blocker = firstByPriority?.label || "Unknown release blocker";
  const base = {
    schema: "musu.private_mesh_release_next_action.v1",
    target_node: targetName,
    target_ip: targetIp,
    expected_control_server_url: controlUrl,
    blocker,
  };

  if (!firstByPriority) {
    return {
      ...base,
      area: "release-notes",
      action_type: "attach_evidence",
      summary: "Attach the verified release archive directory and archive manifest sidecar to the release notes.",
      manual_steps: [
        "Open the verified archive folder from the cockpit.",
        "Attach the archive directory, archive manifest JSON, and matching .sha256 sidecar to the release notes.",
      ],
      command: "",
      evidence_path: result?.archive_dir || result?.archive_manifest_path || releaseProofOpenPath(result) || "",
      verification_command: "",
    };
  }

  if (firstByPriority.key === "physical_peer_verified") {
    return {
      ...base,
      area: "target-physical-evidence",
      action_type: "manual_then_command",
      summary: `Generate target physical evidence on ${targetName}, copy the JSON and .sha256 sidecar back here, then rerun release proof.`,
      manual_steps: [
        `On ${targetName}, run the Evidence cmd from its MUSU cockpit or terminal.`,
        "Copy the generated physical-peer-evidence JSON and matching .sha256 sidecar to the source PC in the same folder.",
        "Paste the copied JSON path into Target PC physical evidence JSON, click Check evidence, then run proof again.",
      ],
      command: "musu mesh physical-peer-evidence --json",
      evidence_path: "<copied-target-pc-physical-peer-evidence.json> plus <same-file>.sha256",
      verification_command: `musu mesh release-proof --target-node '${targetName}' --target-ip '${targetIp}' --expected-control-server-url '${controlUrl}' --physical-peer-evidence '<copied-target-pc-physical-peer-evidence.json>' --json`,
    };
  }

  if (firstByPriority.key === "packaged_desktop_runtime") {
    return {
      ...base,
      area: "packaged-desktop-runtime",
      action_type: "manual_then_command",
      summary: "Run the Private Mesh proof from the packaged desktop app, not a dev/unpackaged runtime.",
      manual_steps: [
        "Install or open the packaged MUSU desktop app on the source PC.",
        "Select the Private Mesh target and run release proof from the packaged cockpit.",
        "Rerun go/no-go after the packaged proof archive is imported.",
      ],
      command: "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\windows\\run-private-mesh-release-proof.ps1 -PhysicalPeerEvidencePath <copied-target-pc-physical-peer-evidence.json>",
      evidence_path: "private-mesh-release-proof.bundle-manifest.json and private-mesh-release-proof.archive.json",
      verification_command: "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\windows\\write-release-go-no-go.ps1 -Json",
    };
  }

  if (firstByPriority.key === "release_archive_ready" || firstByPriority.key === "archive_verifier_passed") {
    return {
      ...base,
      area: "release-archive",
      action_type: "command",
      summary: "Create or verify the release archive from the trusted proof bundle before claiming release-ready evidence.",
      manual_steps: [
        "Open the latest release proof evidence folder.",
        "Archive the proof bundle and verify the archive manifest plus sidecars.",
        "Copy evidence again and confirm release_readiness.ready=true.",
      ],
      command: "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\windows\\archive-private-mesh-release-proof-bundle.ps1 -EvidenceRoot <proof-folder> -Json",
      evidence_path: "private-mesh-release-proof.archive.json, .sha256 sidecar, and archive zip",
      verification_command: "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\windows\\verify-private-mesh-release-proof-archive.ps1 -ArchiveManifest <private-mesh-release-proof.archive.json> -Json",
    };
  }

  return {
    ...base,
    area: firstByPriority.key || "release-proof",
    action_type: "rerun_with_evidence",
    summary: `Resolve ${blocker}, then rerun the strict Private Mesh release proof for ${targetName}.`,
    manual_steps: [
      "Inspect the failing readiness check detail in the cockpit.",
      "Fix the missing or mismatched proof artifact instead of accepting a partial proof.",
      "Rerun release proof and copy evidence only after every readiness check passes.",
    ],
    command: `musu mesh release-proof --target-node '${targetName}' --target-ip '${targetIp}' --expected-control-server-url '${controlUrl}' --physical-peer-evidence '<copied-target-pc-physical-peer-evidence.json>' --json`,
    evidence_path: releaseProofEvidencePath(result) || "<new-private-mesh-release-proof-folder>",
    verification_command: "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\windows\\write-release-go-no-go.ps1 -Json",
  };
}

function releaseEvidenceReadiness(result) {
  const archivePresent = Boolean(
    result?.archive_manifest_path &&
      result?.archive_manifest_sha256_path &&
      result?.archive_artifact_count >= 4
  );
  const checks = [
    {
      key: "native_release_proof_ok",
      label: "Native release proof completed",
      ok: result?.ok === true,
    },
    {
      key: "packaged_desktop_runtime",
      label: `Packaged desktop runtime (${releaseDesktopRuntimeLabel(result)})`,
      ok: releaseDesktopRuntimePackaged(result),
    },
    {
      key: "hash_integrity_verified",
      label: "Evidence hashes verified",
      ok: result?.integrity_verified === true && result?.route_evidence_integrity_verified === true,
    },
    {
      key: "route_identity_bound",
      label: "Route transport and identity bound to selected peer",
      ok: result?.route_transport_verified === true && result?.release_identity_bound === true,
    },
    {
      key: "physical_peer_verified",
      label: "Target physical PC evidence accepted",
      ok: result?.physical_peer_verified === true,
    },
    {
      key: "release_evidence_trusted",
      label: "Final release evidence trusted",
      ok: result?.release_evidence_trusted === true,
    },
    {
      key: "bundle_manifest_verified",
      label: "Bundle manifest verified",
      ok: result?.bundle_manifest_ok === true && result?.bundle_manifest_fail_count === 0,
    },
    {
      key: "release_archive_ready",
      label: "Release evidence archive present",
      ok: archivePresent,
    },
    {
      key: "archive_verifier_passed",
      label: `Archive verifier passed (${releaseArchiveVerifierScope(result)})`,
      ok: archivePresent && releaseArchiveVerifierPassed(result),
    },
  ];
  for (const check of checks) {
    const detail = releaseReadinessCheckDetail(result, check.key);
    if (!check.ok && detail) check.detail = compactDiagnostic(detail);
  }
  const failedChecks = checks.filter((check) => !check.ok);
  const missing = failedChecks.map((check) => check.label);
  const blockingDetails = failedChecks
    .filter((check) => check.detail)
    .map((check) => ({ key: check.key, label: check.label, detail: check.detail }));
  const nextActionDetail = releaseReadinessNextAction(result, failedChecks);
  const passedChecks = checks.length - failedChecks.length;
  const firstBlocker = failedChecks[0]
    ? {
        key: failedChecks[0].key,
        label: failedChecks[0].label,
        detail: failedChecks[0].detail || "",
      }
    : null;
  const ready = missing.length === 0;
  const readinessSummary = {
    schema: "musu.private_mesh_release_readiness_summary.v1",
    ready,
    passed_checks: passedChecks,
    total_checks: checks.length,
    failed_checks: failedChecks.length,
    first_blocker: firstBlocker,
    label: ready
      ? `Release-ready: ${passedChecks}/${checks.length} checks passed`
      : `No-Go: ${passedChecks}/${checks.length} checks passed · First blocker: ${firstBlocker?.label || "unknown"}`,
  };
  return {
    schema: "musu.private_mesh_release_readiness.v1",
    ready,
    checks,
    missing,
    blocking_details: blockingDetails,
    readiness_summary: readinessSummary,
    next_action: missing.length === 0
      ? "Attach the release archive directory and archive manifest sidecar to the release notes."
      : "Run the strict physical release proof flow on two real machines and resolve every failed check.",
    next_action_detail: nextActionDetail,
  };
}

function releaseProofRenderStateForResult(result) {
  if (!hasReleaseProofEvidence(result)) return "idle";
  return releaseEvidenceReadiness(result).ready === true ? "ready" : "error";
}

function hasReleaseProofEvidence(result) {
  return Boolean(
    result &&
      (result.schema ||
        result.ok === true ||
        result.ok === false ||
        releaseProofEvidencePath(result) ||
        result.target_node ||
        result.error)
  );
}

function physicalPeerEvidencePath() {
  return String($("physical-peer-evidence-path")?.value || "").trim();
}

function snapshotReleaseProofTarget(target) {
  if (!target) return null;
  return {
    nodeName: String(target.nodeName || "").trim(),
    tailnetIp: String(target.tailnetIp || "").trim(),
    controlUrl: normalizeControlUrl(target.controlUrl),
  };
}

function rememberPhysicalPeerEvidenceValidation(path, target, validation) {
  lastPhysicalPeerEvidenceValidation = {
    path: String(path || "").trim(),
    target: snapshotReleaseProofTarget(target),
    ok: validation?.ok === true,
    result: validation?.result || null,
    message: validation?.message || "",
  };
}

function clearPhysicalPeerEvidenceValidation() {
  lastPhysicalPeerEvidenceValidation = null;
}

function validatedPhysicalPeerEvidencePathForTarget(target) {
  const path = physicalPeerEvidencePath();
  const validation = lastPhysicalPeerEvidenceValidation;
  if (!path || !validation?.ok || validation.path !== path || !validation.result) return "";
  if (!validation.target || !target) return "";
  if (!physicalEvidenceMatchesTarget(validation.result, target)) return "";
  if (validation.result.physical_host_distinct !== true) return "";
  return path;
}

function physicalPeerEvidenceValidationSnapshotForClipboard(
  target = lastReleaseProofTarget,
  releaseResult = lastReleaseProofResult
) {
  const path = physicalPeerEvidencePath();
  const validation = lastPhysicalPeerEvidenceValidation;
  const exactPath = validatedPhysicalPeerEvidencePathForTarget(target);
  const releaseResultPath = String(releaseResult?.physical_peer_evidence_path || "").trim();
  const releaseResultTarget = releaseProofTargetFromResult(releaseResult);
  const releaseResultMatchesTarget =
    releaseResult?.physical_peer_verified === true &&
    releaseResultPath &&
    target &&
    releaseResultTarget &&
    normalizeNodeName(releaseResultTarget.nodeName) === normalizeNodeName(target.nodeName) &&
    releaseResultTarget.tailnetIp === target.tailnetIp &&
    normalizeControlUrl(releaseResultTarget.controlUrl) === normalizeControlUrl(target.controlUrl);
  if (!exactPath && releaseResultMatchesTarget) {
    return {
      path: path || releaseResultPath,
      target: snapshotReleaseProofTarget(target),
      validated_for_target: true,
      status: "verified_by_release_result",
      message: null,
      validated_path: releaseResultPath,
      result: {
        physical_peer_verified: releaseResult.physical_peer_verified === true,
        physical_peer_evidence_path: releaseResult.physical_peer_evidence_path || null,
        physical_peer_evidence_sha256_path: releaseResult.physical_peer_evidence_sha256_path || null,
        physical_peer_evidence_sha256: releaseResult.physical_peer_evidence_sha256 || null,
        physical_peer_error: releaseResult.physical_peer_error || null,
      },
    };
  }
  return {
    path: path || null,
    target: snapshotReleaseProofTarget(target),
    validated_for_target: Boolean(exactPath),
    status: exactPath
      ? "validated_for_target"
      : path
        ? validation?.ok === false
          ? "validation_failed"
          : "not_validated_for_target"
        : "missing",
    message: validation?.message || null,
    validated_path: exactPath || null,
    result: validation?.result || null,
  };
}

function warnMissingPhysicalPeerEvidence(target) {
  const targetName = target?.nodeName || "target PC";
  if (target) {
    renderReleaseProofEvidence(null, target, "input");
  }
  renderPhysicalPeerEvidenceStatus(
    null,
    `Final release trust needs target-generated evidence. Run Evidence cmd on ${targetName}, copy the JSON and its .sha256 sidecar to this PC, paste the JSON path here, then run proof again.`
  );
}

function physicalEvidencePlatformLabel(result) {
  const os = String(result?.os || "").trim();
  const arch = String(result?.arch || "").trim();
  if (os && arch) return `platform ${os}/${arch}`;
  if (os) return `platform ${os}`;
  if (arch) return `platform ${arch}`;
  return "";
}

function renderPhysicalPeerEvidenceStatus(result, fallbackMessage = "") {
  const status = $("physical-peer-evidence-status");
  if (!status) return;
  status.hidden = false;
  if (!result) {
    status.dataset.state = "error";
    status.textContent = fallbackMessage || "No physical peer evidence found.";
    return;
  }
  status.dataset.state = result.ok ? "ready" : "error";
  if (result.ok) {
    const bits = [
      result.node_name || "target",
      result.tailnet_ip || "",
      result.hostname ? `host ${result.hostname}` : "",
      physicalEvidencePlatformLabel(result),
      result.control_server_url || "",
      result.physical_host_distinct ? "different host" : "",
      result.integrity_verified ? "hash verified" : "",
    ].filter(Boolean);
    status.textContent = `Evidence ready: ${bits.join(" · ")}`;
  } else {
    status.textContent = result.error || fallbackMessage || "Evidence file is not valid.";
  }
}

function physicalEvidenceTargetMismatchMessage(result, target) {
  const fields = physicalEvidenceTargetMismatchFields(result, target);
  const expected = [
    target?.nodeName || "target",
    target?.tailnetIp || "",
    target?.controlUrl || "",
  ].filter(Boolean).join(" · ");
  const actual = [
    result?.node_name || "unknown-node",
    result?.tailnet_ip || "unknown-ip",
    result?.control_server_url || "unknown-control",
  ].join(" · ");
  const fieldText = fields.length ? ` Fields: ${fields.join(", ")}.` : "";
  return `Physical evidence does not match target ${expected}. Got ${actual}.${fieldText}`;
}

function physicalEvidenceHostMismatchMessage(result) {
  const source = result?.source_hostname || "this source PC";
  const target = result?.hostname || "target evidence";
  return `Physical evidence was generated on the same host (${target}) as ${source}. Generate it on a separate target physical PC and copy both the JSON and .sha256 sidecar back here.`;
}

function normalizeNodeName(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeControlUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function physicalEvidenceTargetMismatchFields(result, target) {
  const fields = [];
  if (normalizeNodeName(result?.node_name) !== normalizeNodeName(target?.nodeName)) {
    fields.push("node_name");
  }
  if (String(result?.tailnet_ip || "").trim() !== String(target?.tailnetIp || "").trim()) {
    fields.push("tailnet_ip");
  }
  if (
    normalizeControlUrl(result?.control_server_url) !== normalizeControlUrl(target?.controlUrl)
  ) {
    fields.push("control_server_url");
  }
  return fields;
}

function physicalEvidenceMatchesTarget(result, target) {
  return (
    normalizeNodeName(result?.node_name) === normalizeNodeName(target?.nodeName) &&
    result?.tailnet_ip === target?.tailnetIp &&
    normalizeControlUrl(result?.control_server_url) === normalizeControlUrl(target?.controlUrl)
  );
}

function releaseProofTargetFromResult(result) {
  const nodeName = String(result?.target_node || "").trim();
  const tailnetIp = String(result?.target_ip || "").trim();
  const controlUrl = String(
    result?.expected_control_server_url || result?.control_server_url || ""
  ).trim();
  if (!nodeName || !tailnetIp || !controlUrl) return null;
  return { nodeName, tailnetIp, controlUrl };
}

function validatePhysicalPeerEvidenceResultForTarget(result, target) {
  const path = String(result?.path || physicalPeerEvidencePath()).trim();
  if (!target) {
    renderPhysicalPeerEvidenceStatus(result);
    rememberPhysicalPeerEvidenceValidation(path, null, {
      ok: result?.ok === true,
      result,
    });
    return { ok: result?.ok === true, result };
  }
  if (!result?.ok) {
    const message = result?.error || "Evidence file is not valid.";
    renderPhysicalPeerEvidenceStatus({ ...(result || {}), ok: false, error: message });
    rememberPhysicalPeerEvidenceValidation(path, target, { ok: false, result, message });
    return { ok: false, message };
  }
  if (!physicalEvidenceMatchesTarget(result, target)) {
    const message = physicalEvidenceTargetMismatchMessage(result, target);
    renderPhysicalPeerEvidenceStatus({ ...result, ok: false, error: message });
    rememberPhysicalPeerEvidenceValidation(path, target, { ok: false, result, message });
    return { ok: false, message };
  }
  if (result.physical_host_distinct !== true) {
    const message = physicalEvidenceHostMismatchMessage(result);
    renderPhysicalPeerEvidenceStatus({ ...result, ok: false, error: message });
    rememberPhysicalPeerEvidenceValidation(path, target, { ok: false, result, message });
    return { ok: false, message };
  }
  renderPhysicalPeerEvidenceStatus(result);
  rememberPhysicalPeerEvidenceValidation(path, target, { ok: true, result });
  return { ok: true, result };
}

async function validatePhysicalPeerEvidenceForTarget(path, target) {
  try {
    const result = await invoke("validate_physical_peer_evidence_path", { path });
    return validatePhysicalPeerEvidenceResultForTarget(result, target);
  } catch (err) {
    const message = err?.message || String(err) || "Could not validate physical peer evidence.";
    renderPhysicalPeerEvidenceStatus(null, message);
    rememberPhysicalPeerEvidenceValidation(path, target, { ok: false, message });
    return { ok: false, message };
  }
}

// Run the full release proof from the cockpit (control host) instead of copying
// `musu mesh release-proof ...`. Pulls the peer IP + control URL from the inputs
// and the checked physical-evidence path, and the target node from the order
// target selector, then calls private_mesh_release_proof_target.
async function runReleaseProof() {
  const btn = $("release-proof-run");
  const statusEl = $("release-proof-run-status");
  if (!btn) return;
  const targetIp = String($("release-proof-target-ip")?.value || "").trim();
  const controlUrl = String($("release-proof-control-url")?.value || "").trim();
  const evidencePath = physicalPeerEvidencePath();
  const targetNode = String($("order-target")?.value || "").trim();
  const fail = (msg) => {
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.dataset.state = "error";
      statusEl.textContent = msg;
    }
  };
  if (!targetNode) return fail("Pick the target machine in the order bar first.");
  if (!/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(targetIp))
    return fail("Enter the peer's tailnet IP (100.64.0.0/10).");
  if (!controlUrl) return fail("Enter your control server URL.");
  if (!evidencePath) return fail("Check the target PC's physical evidence file first.");

  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Running…";
  if (statusEl) {
    statusEl.hidden = false;
    statusEl.dataset.state = "running";
    statusEl.textContent = "Running ping → bridge health → delegated task → callback → evidence proof…";
  }
  try {
    const r = await invoke("private_mesh_release_proof_target", {
      targetNode,
      targetIp,
      expectedControlServerUrl: controlUrl,
      physicalPeerEvidencePath: evidencePath,
    });
    if (statusEl) {
      if (r && r.release_grade) {
        statusEl.dataset.state = "ok";
        statusEl.textContent = "Release-grade proof passed: distinct hosts, tailnet ping, bridge health, callback, and physical evidence all verified.";
      } else {
        statusEl.dataset.state = r && r.ok ? "warn" : "error";
        statusEl.textContent = (r && (r.error || (r.next_steps && r.next_steps[0]))) ||
          "Software route verified but not yet release-grade — check the steps above.";
      }
    }
  } catch (err) {
    fail(`Release proof failed: ${String(err)}`);
  } finally {
    btn.disabled = false;
    btn.textContent = old || "Run release proof";
  }
}

async function useLatestPhysicalPeerEvidence(btn) {
  const old = btn?.textContent || "Use latest";
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Loading...";
    }
    const result = await invoke("latest_physical_peer_evidence");
    if (!result?.path) {
      renderPhysicalPeerEvidenceStatus(null, "No target evidence found in MUSU_HOME/private-mesh-physical-peer-evidence.");
      return;
    }
    const input = $("physical-peer-evidence-path");
    if (input) input.value = result.path;
    validatePhysicalPeerEvidenceResultForTarget(result, lastReleaseProofTarget);
  } catch (err) {
    renderPhysicalPeerEvidenceStatus(null, err?.message || "Could not load latest physical peer evidence.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = old;
    }
  }
}

async function checkPhysicalPeerEvidence(btn) {
  const path = physicalPeerEvidencePath();
  if (!path) {
    clearPhysicalPeerEvidenceValidation();
    renderPhysicalPeerEvidenceStatus(null, "Paste a target physical-peer-evidence.json path first. Its .sha256 sidecar must sit next to it.");
    return;
  }
  const old = btn?.textContent || "Check evidence";
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Checking...";
    }
    if (lastReleaseProofTarget) {
      await validatePhysicalPeerEvidenceForTarget(path, lastReleaseProofTarget);
    } else {
      const result = await invoke("validate_physical_peer_evidence_path", { path });
      validatePhysicalPeerEvidenceResultForTarget(result, null);
    }
  } catch (err) {
    renderPhysicalPeerEvidenceStatus(null, err?.message || "Could not validate physical peer evidence.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = old;
    }
  }
}

async function copyReleaseProofCommand(btn, target) {
  if (!btn || !target) return;
  const path = physicalPeerEvidencePath();
  const old = btn.dataset.defaultText || btn.textContent || "Release cmd";
  if (!path) {
    warnMissingPhysicalPeerEvidence(target);
    btn.textContent = "Evidence needed";
    btn.title = "Paste and check target physical evidence before copying an exact release command.";
    setTimeout(() => {
      btn.textContent = old;
      btn.title = target?.nodeName ? `Copy native release proof command for ${target.nodeName}` : "";
    }, 2200);
    return;
  }
  if (!validatedPhysicalPeerEvidencePathForTarget(target)) {
    btn.disabled = true;
    btn.textContent = "Checking...";
    const validation = await validatePhysicalPeerEvidenceForTarget(path, target);
    if (!validation.ok) {
      btn.textContent = "Check failed";
      btn.title = validation.message || "Physical evidence must match this release target before copying an exact release command.";
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = old;
        btn.title = target?.nodeName ? `Copy native release proof command for ${target.nodeName}` : "";
      }, 2200);
      return;
    }
    btn.disabled = false;
    btn.textContent = old;
  }
  const exactCommand = exactReleaseProofCommandForTarget(target);
  if (!exactCommand) {
    warnMissingPhysicalPeerEvidence(target);
    btn.textContent = "Evidence needed";
    setTimeout(() => {
      btn.textContent = old;
      btn.title = target?.nodeName ? `Copy native release proof command for ${target.nodeName}` : "";
    }, 2200);
    return;
  }
  btn.dataset.copyText = exactCommand;
  await copySetupCommand(btn);
}

function compactDiagnostic(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function renderReleaseProofEvidence(result, target, state = "idle") {
  const strip = $("release-evidence-strip");
  if (!strip) return;
  lastReleaseProofTarget = target || releaseProofTargetFromResult(result) || null;
  const title = $("release-evidence-title");
  const detail = $("release-evidence-detail");
  const readinessEl = $("release-evidence-readiness");
  const nextAction = $("release-evidence-next");
  const checksEl = $("release-evidence-checks");
  const path = $("release-evidence-path");
  const copyButtons = document.querySelectorAll("[data-copy-release-evidence]");
  const copyNextButtons = document.querySelectorAll("[data-copy-release-next-action]");
  const openButtons = document.querySelectorAll("[data-open-release-evidence]");
  const targetName = result?.target_node || target?.nodeName || "peer";
  const targetIp = result?.target_ip || target?.tailnetIp || "";
  const evidencePath = releaseProofEvidencePath(result);
  const openPath = releaseProofOpenPath(result);
  const integrity = releaseProofIntegrityLabel(result);
  const identity = releaseProofIdentityLabel(result);
  const ok = result?.ok === true;
  const softwareTrusted = releaseProofSoftwareTrusted(result);
  const trusted = releaseProofTrusted(result);
  const proofQualifiers = [integrity, identity].filter(Boolean).join(" · ");
  const readiness = hasReleaseProofEvidence(result) ? releaseEvidenceReadiness(result) : null;
  const releaseReady = readiness?.ready === true;

  strip.hidden = state === "idle" && !result;
  strip.dataset.state = state;
  if (title) {
    title.textContent =
      state === "running"
        ? "Release proof running"
        : state === "input"
          ? "Target physical evidence required"
        : releaseReady
          ? "Release evidence archived"
        : trusted
          ? "Release archive required"
          : softwareTrusted
            ? "Software route proof trusted"
          : ok
            ? "Release evidence needs review"
          : "Release proof failed";
  }
  if (detail) {
    if (state === "running") {
      detail.textContent = `Generating evidence for ${targetName}${targetIp ? ` (${targetIp})` : ""}.`;
    } else if (state === "input") {
      detail.textContent = `To earn final release trust for ${targetName}${targetIp ? ` · ${targetIp}` : ""}, run Evidence cmd on the target PC, copy the generated JSON to this PC, then paste its path here.`;
    } else if (releaseReady) {
      const archiveLabel = result?.archive_dir
        ? ` · archive verified (${releaseArchiveVerifierScope(result)})`
        : "";
      detail.textContent = `Target ${targetName}${targetIp ? ` · ${targetIp}` : ""} · verifier ok · ${releaseDesktopRuntimeLabel(result)}${proofQualifiers ? ` · ${proofQualifiers}` : ""}${archiveLabel}`;
    } else if (trusted) {
      const missing = readiness?.missing?.length ? ` Missing: ${readiness.missing.join(", ")}.` : "";
      const why = readiness?.blocking_details?.[0]?.detail
        ? ` Why: ${readiness.blocking_details[0].detail}.`
        : "";
      detail.textContent = `Release evidence is trusted, but the release archive is not complete.${missing}${why}`;
    } else if (softwareTrusted) {
      detail.textContent =
        releaseProofTrustError(result) ||
        `Route proof is hash-verified for ${targetName}, but physical peer evidence is still required before final release claims.`;
    } else if (ok) {
      detail.textContent =
        releaseProofTrustError(result) ||
        "Verifier passed, but desktop evidence trust checks did not pass.";
    } else {
      detail.textContent =
        result?.error ||
        result?.integrity_error ||
        "The verifier did not accept this proof.";
    }
  }
  if (nextAction) {
    const action = readiness?.next_action_detail;
    nextAction.hidden = !action;
    if (action) {
      const command = action.command ? ` Command: ${action.command}` : "";
      nextAction.textContent = `Next: ${action.summary}${command}`;
      nextAction.title = action.manual_steps?.length
        ? action.manual_steps.join(" ")
        : action.summary;
    }
  }
  if (readinessEl) {
    const summary = readiness?.readiness_summary;
    readinessEl.hidden = !summary;
    if (summary) {
      readinessEl.textContent = summary.label;
      readinessEl.title = summary.first_blocker?.detail || summary.first_blocker?.label || summary.label;
    }
  }
  if (checksEl) {
    // The per-check list lives in a collapsed <details> drawer; the plain
    // verdict (title/detail/readiness line) is the primary surface.
    const drawer = $("release-evidence-checks-drawer");
    if (drawer) drawer.hidden = !readiness;
    checksEl.innerHTML = "";
    if (readiness) {
      for (const check of readiness.checks) {
        const item = document.createElement("li");
        item.dataset.state = check.ok ? "pass" : "fail";
        item.textContent = `${check.ok ? "OK" : "Needs"} ${check.label}${check.detail ? ` - ${check.detail}` : ""}`;
        if (check.detail) item.title = check.detail;
        checksEl.appendChild(item);
      }
    }
  }
  if (path) {
    path.hidden = !openPath;
    path.textContent = openPath;
    path.title = openPath;
  }
  copyButtons.forEach((btn) => {
    btn.disabled = !result;
    btn.title = result
      ? "Copy the latest release proof result and evidence paths"
      : "Run proof first to generate release evidence.";
  });
  copyNextButtons.forEach((btn) => {
    btn.disabled = !readiness?.next_action_detail;
    btn.title = readiness?.next_action_detail
      ? "Copy only the next release action as structured JSON"
      : "Run proof first to compute the next release action.";
  });
  openButtons.forEach((btn) => {
    btn.disabled = !openPath;
    btn.title = openPath
      ? releaseArchiveVerifierPassed(result)
        ? "Open the verified release archive folder"
        : "Open the folder containing the latest release proof evidence"
      : "Run proof first to save release evidence.";
  });
}

async function runPeerReleaseProof(btn, target) {
  if (!btn || !target?.nodeName || !isTailnetIpv4(target.tailnetIp) || !target.controlUrl) return;
  const row = btn.closest(".fleet-row");
  const status = row?.querySelector(".node-proof-status");
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Proofing...";
  btn.title = `Running release proof for ${target.nodeName}.`;
  if (row) row.dataset.verifyState = "checking";
  if (status) {
    status.hidden = false;
    status.textContent = "proofing";
    status.title = "Running delegated task, callback, route, and evidence verification.";
  }
  const physicalEvidencePath = physicalPeerEvidencePath();
  if (!physicalEvidencePath) {
    warnMissingPhysicalPeerEvidence(target);
    lastReleaseProofResult = {
      ok: false,
      target_node: target.nodeName,
      target_ip: target.tailnetIp,
      expected_control_server_url: target.controlUrl,
      release_evidence_trusted: false,
      software_route_trusted: false,
      physical_peer_verified: false,
      error:
        "Physical peer evidence is required before running final release proof.",
    };
    renderReleaseProofEvidence(lastReleaseProofResult, target, "error");
    if (row) row.dataset.verifyState = "failed";
    btn.textContent = "Evidence required";
    btn.title =
      "Paste target-generated physical-peer-evidence.json with its .sha256 sidecar before running final release proof.";
    if (status) {
      status.hidden = false;
      status.textContent = "evidence required";
      status.title = btn.title;
    }
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = oldText || "Run proof";
      btn.title = target?.nodeName ? `Run native release proof for ${target.nodeName}` : "";
    }, 2400);
    return;
  } else {
    const validation = await validatePhysicalPeerEvidenceForTarget(physicalEvidencePath, target);
    if (!validation.ok) {
      lastReleaseProofResult = {
        ok: false,
        target_node: target.nodeName,
        target_ip: target.tailnetIp,
        expected_control_server_url: target.controlUrl,
        error: validation.message,
      };
      renderReleaseProofEvidence(lastReleaseProofResult, target, "error");
      if (row) row.dataset.verifyState = "failed";
      btn.textContent = "Evidence invalid";
      btn.title = validation.message;
      if (status) {
        status.hidden = false;
        status.textContent = "evidence invalid";
        status.title = validation.message;
      }
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = oldText || "Run proof";
        btn.title = target?.nodeName ? `Run native release proof for ${target.nodeName}` : "";
      }, 2400);
      return;
    }
  }
  renderReleaseProofEvidence(null, target, "running");

  try {
    const result = await invoke("private_mesh_release_proof_target", {
      targetNode: target.nodeName,
      targetIp: target.tailnetIp,
      expectedControlServerUrl: target.controlUrl,
      physicalPeerEvidencePath: physicalEvidencePath,
    });
    lastReleaseProofResult = result || null;
    const trusted = releaseProofTrusted(result);
    const readiness = hasReleaseProofEvidence(result) ? releaseEvidenceReadiness(result) : null;
    const releaseReady = readiness?.ready === true;
    renderReleaseProofEvidence(lastReleaseProofResult, target, releaseReady ? "ready" : "error");
    refreshPrivateMeshStatus({ force: true });
    const evidencePath = releaseProofEvidencePath(result);
    if (releaseReady) {
      if (row) row.dataset.verifyState = "release-grade";
      btn.textContent = "Proof passed";
      btn.title = evidencePath ? `Release proof evidence: ${evidencePath}` : "Release proof passed.";
      if (status) {
        status.textContent = "release proof";
        status.title = btn.title;
      }
    } else if (trusted && readiness?.missing?.some((item) => /archive/i.test(item))) {
      const message = `Release proof is trusted, but archive evidence is incomplete: ${readiness.missing.join(", ")}.`;
      if (row) row.dataset.verifyState = "archive-required";
      btn.textContent = "Archive needed";
      btn.title = message;
      if (status) {
        status.textContent = "archive needed";
        status.title = message;
      }
    } else if (trusted || result?.ok) {
      const readinessMessage = readiness?.missing?.length
        ? `Release proof needs review: ${readiness.missing.join(", ")}.`
        : "";
      const message =
        readinessMessage ||
        releaseProofTrustError(result) ||
        "Verifier passed, but desktop evidence trust checks did not pass.";
      if (row) row.dataset.verifyState = "failed";
      btn.textContent = "Proof review";
      btn.title = message;
      if (status) {
        status.textContent = "needs review";
        status.title = message;
      }
    } else {
      const message = result?.error || result?.output || "Private Mesh release proof failed.";
      if (row) row.dataset.verifyState = "failed";
      btn.textContent = "Proof failed";
      btn.title = message;
      if (status) {
        status.textContent = "failed";
        status.title = message;
      }
    }
  } catch (err) {
    lastReleaseProofResult = {
      ok: false,
      target_node: target.nodeName,
      target_ip: target.tailnetIp,
      expected_control_server_url: target.controlUrl,
      error: String(err),
    };
    renderReleaseProofEvidence(lastReleaseProofResult, target, "error");
    if (row) row.dataset.verifyState = "failed";
    btn.textContent = "Proof failed";
    btn.title = String(err);
    if (status) {
      status.hidden = false;
      status.textContent = "failed";
      status.title = String(err);
    }
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = oldText || "Run proof";
      btn.title = target?.nodeName ? `Run native release proof for ${target.nodeName}` : "";
    }, 2400);
  }
}

async function sendPrivateMeshProofOrder(btn, nodeName) {
  if (!btn || !nodeName) return;
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Sending...";
  try {
    await submitText(PRIVATE_MESH_PROOF_ORDER, nodeName);
    btn.textContent = "Proof sent";
  } catch {
    btn.textContent = "Send failed";
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = oldText || "Proof order";
    }, 1600);
  }
}

function renderPrivateMeshStatus(status) {
  const card = $("mesh-status-card");
  if (status?.derp_probe_ran === true) {
    lastDerpProbe = {
      derp_readiness: status.derp_readiness || "unknown",
      derp_probe_ran: true,
      derp_probe_ok: status.derp_probe_ok === true,
      derp_probe_detail: status.derp_probe_detail || null,
    };
  } else if (
    status?.ok &&
    lastDerpProbe &&
    (status.derp_readiness || "unknown") === lastDerpProbe.derp_readiness
  ) {
    status = { ...status, ...lastDerpProbe };
  }
  lastPrivateMeshStatus = status || null;
  const strip = $("mesh-proof-strip");
  if (!card && !strip) return;
  const title = $("mesh-status-title");
  const detail = $("mesh-status-detail");
  const proof = $("mesh-status-proof");
  const next = $("mesh-status-next");
  const stripTitle = $("mesh-proof-strip-title");
  const stripDetail = $("mesh-proof-strip-detail");
  const stripProof = $("mesh-proof-strip-proof");
  const stripDiagnostic = $("mesh-proof-strip-diagnostic");
  const mode = String(status?.mode || "unknown");
  const releaseGrade = status?.release_grade === true;
  const controlVerified = status?.control_server_verified === true;
  const routeLabel = status?.route_label || "Mesh status unknown";
  const ip = status?.local_tailnet_ip || "";
  const control = status?.control_server_url || "";
  const derpReadiness = String(status?.derp_readiness || "unknown");
  const derpProbeRan = status?.derp_probe_ran === true;
  const derpProbeOk = status?.derp_probe_ok === true;
  const derpProbeDetail = compactDiagnostic(status?.derp_probe_detail || "");
  const targetIp = status?.verified_target_tailnet_ip || "";
  const callbackIp = status?.callback_tailnet_ip || "";
  const targetCallbackMatch = status?.target_callback_match === true;

  let state = "needed";
  const derpLabel =
    derpReadiness === "declared_private"
      ? "DERP private"
      : derpReadiness === "external_dependency"
        ? "DERP external"
        : derpReadiness === "missing"
          ? "DERP missing"
          : "";
  const derpProbeLabel = derpProbeRan
    ? derpProbeOk
      ? "DERP probe ok"
      : "DERP probe failed"
    : "";
  const derpSummary = [derpLabel, derpProbeLabel].filter(Boolean).join(" · ");
  if (!status?.ok) {
    state = "error";
    if (title) title.textContent = "Mesh status unavailable";
    if (detail) detail.textContent = status?.error || "Run diagnostics or `musu mesh doctor --json`.";
  } else if (releaseGrade) {
    state = "ready";
    if (title) title.textContent = "Private connection verified";
    if (detail) detail.textContent = `${routeLabel} · callback verified${ip ? ` · ${ip}` : ""}${derpSummary ? ` · ${derpSummary}` : ""}`;
  } else if (mode === "musu_headscale" && controlVerified) {
    state = "partial";
    if (title) title.textContent = "Private Mesh joined";
    if (detail) detail.textContent = `${control} verified${ip ? ` · ${ip}` : ""}${derpSummary ? ` · ${derpSummary}` : ""}. Route proof still required.`;
  } else if (mode === "external_tailscale_opt_in") {
    state = "warning";
    if (title) title.textContent = "External tailnet detected";
    if (detail) detail.textContent = "This machine is not on MUSU's no-signup Private Mesh path.";
  } else if (meshAutoJoinInFlight) {
    state = "running";
    if (title) title.textContent = "Connecting to your mesh…";
    if (detail) detail.textContent = "Joining the fleet for your account. This is automatic after sign-in.";
  } else {
    // Logged in but not yet on the mesh: with account-auto-join the cockpit
    // reconnects on its own. Frame it as connecting, not a manual setup chore.
    state = "needed";
    if (title) title.textContent = "Connecting to your mesh…";
    if (detail) detail.textContent = "Signing this PC into your private mesh automatically.";
  }

  const step = derpProbeRan && derpProbeDetail
    ? `DERP detail: ${derpProbeDetail}`
    : Array.isArray(status?.next_steps)
      ? status.next_steps.find(Boolean)
      : "";
  const proofParts = [];
  if (targetIp) proofParts.push(`target ${targetIp}`);
  if (callbackIp) proofParts.push(`callback ${callbackIp}`);
  if (targetIp || callbackIp) proofParts.push(targetCallbackMatch ? "bound proof" : "proof not bound");
  if (proof) {
    proof.hidden = proofParts.length === 0;
    proof.textContent = proofParts.join(" · ");
    proof.dataset.bound = targetCallbackMatch ? "true" : "false";
  }
  if (next) {
    next.hidden = !step;
    next.textContent = step || "";
  }
  if (strip) {
    strip.hidden = !status?.ok;
    strip.dataset.state = state;
  }
  if (stripTitle) {
    stripTitle.textContent = releaseGrade ? "Private connection verified" : "Private connection";
  }
  if (stripDetail) {
    stripDetail.textContent = status?.ok
      ? `${routeLabel}${ip ? ` · this PC ${ip}` : ""}${derpSummary ? ` · ${derpSummary}` : ""}`
      : "Waiting for local mesh evidence.";
  }
  if (stripProof) {
    stripProof.hidden = proofParts.length === 0;
    stripProof.textContent = proofParts.join(" · ");
    stripProof.dataset.bound = targetCallbackMatch ? "true" : "false";
  }
  if (stripDiagnostic) {
    stripDiagnostic.hidden = !(derpProbeRan && derpProbeDetail);
    stripDiagnostic.textContent = derpProbeRan && derpProbeDetail ? `DERP detail: ${derpProbeDetail}` : "";
    stripDiagnostic.title = status?.derp_probe_detail || "";
  }
  document.querySelectorAll("[data-mesh-copy-proof]").forEach((btn) => {
    btn.disabled = !status?.ok;
    btn.title = status?.ok
      ? "Copy current MUSU Private Mesh proof JSON"
      : "Mesh proof is not available yet.";
  });
  if (card) card.dataset.state = state;

  // After rendering, if we're signed in but not on the mesh, kick a best-effort
  // auto-join (cooldown-gated). Fire-and-forget: it refreshes status when done.
  if (!meshStatusIsConnected(status)) {
    void maybeAutoJoinAccountMesh(status);
  }
}

async function copyPrivateMeshProof(event) {
  const btn = event?.currentTarget || document.querySelector("[data-mesh-copy-proof]");
  if (!btn || !lastPrivateMeshStatus?.ok) return;
  const oldText = btn.textContent;
  const status = lastPrivateMeshStatus;
  const payload = {
    schema: "musu.private_mesh_desktop_proof_clipboard.v1",
    copied_at: new Date().toISOString(),
    product_name: status.product_name || "MUSU Private Mesh",
    mode: status.mode || "unknown",
    route_label: status.route_label || "",
    control_server_url: status.control_server_url || null,
    control_server_verified: status.control_server_verified === true,
    derp_policy: status.derp_policy || null,
    derp_readiness: status.derp_readiness || "unknown",
    derp_private_declared:
      status.derp_private_declared === true || status.derp_readiness === "declared_private",
    derp_probe_ran: status.derp_probe_ran === true,
    derp_probe_ok: status.derp_probe_ok === true,
    derp_probe_detail: status.derp_probe_detail || null,
    local_tailnet_ip: status.local_tailnet_ip || null,
    verified_target_tailnet_ip: status.verified_target_tailnet_ip || null,
    callback_tailnet_ip: status.callback_tailnet_ip || null,
    target_callback_match: status.target_callback_match === true,
    tailscale_ping_verified: status.tailscale_ping_verified === true,
    bridge_health_verified: status.bridge_health_verified === true,
    callback_verified: status.callback_verified === true,
    release_grade: status.release_grade === true,
    warnings: Array.isArray(status.warnings) ? status.warnings.filter(Boolean) : [],
    next_steps: Array.isArray(status.next_steps) ? status.next_steps.filter(Boolean) : [],
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    btn.textContent = "Copied proof";
  } catch {
    btn.textContent = "Copy failed";
  } finally {
    setTimeout(() => {
      btn.textContent = oldText || "Copy proof";
    }, 1400);
  }
}

async function copyReleaseProofEvidence(event) {
  const btn = event?.currentTarget || document.querySelector("[data-copy-release-evidence]");
  if (!btn || !lastReleaseProofResult) return;
  const oldText = btn.textContent;
  const readiness = releaseEvidenceReadiness(lastReleaseProofResult);
  const payload = {
    schema: "musu.private_mesh_release_evidence_clipboard.v1",
    copied_at: new Date().toISOString(),
    release_target: snapshotReleaseProofTarget(lastReleaseProofTarget),
    physical_peer_evidence_validation: physicalPeerEvidenceValidationSnapshotForClipboard(
      lastReleaseProofTarget,
      lastReleaseProofResult
    ),
    release_readiness: readiness,
    next_action: readiness.next_action_detail,
    result: lastReleaseProofResult,
    evidence_path: releaseProofEvidencePath(lastReleaseProofResult) || null,
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    btn.textContent = "Copied evidence";
  } catch {
    btn.textContent = "Copy failed";
  } finally {
    setTimeout(() => {
      btn.textContent = oldText || "Copy evidence";
    }, 1400);
  }
}

async function copyReleaseNextAction(event) {
  const btn = event?.currentTarget || document.querySelector("[data-copy-release-next-action]");
  if (!btn || !lastReleaseProofResult) return;
  const readiness = releaseEvidenceReadiness(lastReleaseProofResult);
  if (!readiness.next_action_detail) return;
  const oldText = btn.textContent;
  const payload = {
    schema: "musu.private_mesh_release_next_action_clipboard.v1",
    copied_at: new Date().toISOString(),
    release_target: snapshotReleaseProofTarget(lastReleaseProofTarget),
    release_readiness_ready: readiness.ready === true,
    release_readiness_missing: readiness.missing,
    release_readiness_summary: readiness.readiness_summary,
    next_action: readiness.next_action_detail,
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    btn.textContent = "Copied next";
  } catch {
    btn.textContent = "Copy failed";
  } finally {
    setTimeout(() => {
      btn.textContent = oldText || "Copy next";
    }, 1400);
  }
}

async function openReleaseProofEvidence(event) {
  const btn = event?.currentTarget || document.querySelector("[data-open-release-evidence]");
  const evidencePath = releaseProofOpenPath(lastReleaseProofResult);
  if (!btn || !evidencePath) return;
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Opening...";
  try {
    await invoke("open_release_evidence_folder", { path: evidencePath });
    btn.textContent = "Opened";
  } catch (err) {
    btn.textContent = "Open failed";
    btn.title = String(err);
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = oldText || "Open folder";
    }, 1400);
  }
}

async function refreshLatestReleaseEvidence() {
  try {
    const result = await invoke("latest_release_evidence");
    lastReleaseProofResult = hasReleaseProofEvidence(result) ? result : null;
    const currentState = $("release-evidence-strip")?.dataset.state || "idle";
    if (!lastReleaseProofResult && currentState !== "idle") {
      return;
    }
    if (!lastReleaseProofResult && lastReleaseProofTarget) {
      renderReleaseProofEvidence(null, lastReleaseProofTarget, "input");
      return;
    }
    renderReleaseProofEvidence(
      lastReleaseProofResult,
      null,
      releaseProofRenderStateForResult(lastReleaseProofResult)
    );
  } catch {
    // Latest evidence is an enhancement; local mesh status remains the primary
    // proof surface when evidence has not been generated yet.
  }
}

const PRIVATE_MESH_STATUS_REFRESH_MS = 300_000;
let lastPrivateMeshStatusRefreshAt = 0;
let privateMeshStatusRefreshInFlight = null;

// "Account login = automatic mesh join" — cockpit side. Login itself triggers a
// join in the CLI; this is the retry/recovery path. When the machine is logged
// in (account token present) but mesh status says it is not on the MUSU mesh,
// call private_mesh_join_account to (re)connect. Single-flight + cooldown so a
// failed attempt backs off instead of hammering the control plane.
let meshAutoJoinInFlight = null;
let meshAutoJoinLastAttemptAt = 0;
const MESH_AUTO_JOIN_COOLDOWN_MS = 30_000;

function meshStatusIsConnected(status) {
  return (
    status?.ok === true &&
    status.mode === "musu_headscale" &&
    status.control_server_verified === true
  );
}

async function maybeAutoJoinAccountMesh(status, { force = false } = {}) {
  if (meshStatusIsConnected(status)) return;
  // Only auto-join when this machine is actually signed in; otherwise the join
  // would just fail with "Not logged in". cockpit_state.auth_status ===
  // "Connected" is the same signed-in signal the rest of the cockpit uses.
  let signedIn = false;
  try {
    const cockpitState = await invoke("cockpit_state");
    signedIn = (cockpitState?.auth_status || "") === "Connected";
  } catch {
    signedIn = false;
  }
  if (!signedIn) return;

  const now = Date.now();
  if (!force && now - meshAutoJoinLastAttemptAt < MESH_AUTO_JOIN_COOLDOWN_MS) return;
  if (meshAutoJoinInFlight) return meshAutoJoinInFlight;

  meshAutoJoinLastAttemptAt = now;
  meshAutoJoinInFlight = (async () => {
    try {
      await invoke("private_mesh_join_account");
    } catch {
      // Soft-fail: the cooldown gates the next attempt; status refresh below
      // surfaces "connecting…" without throwing into the UI.
    } finally {
      meshAutoJoinInFlight = null;
    }
    // Re-read status so the UI reflects the new connection state promptly.
    return refreshPrivateMeshStatus({ force: true });
  })();
  return meshAutoJoinInFlight;
}

async function refreshPrivateMeshStatus({ force = false } = {}) {
  const now = Date.now();
  if (
    !force &&
    lastPrivateMeshStatus &&
    now - lastPrivateMeshStatusRefreshAt < PRIVATE_MESH_STATUS_REFRESH_MS
  ) {
    return lastPrivateMeshStatus;
  }
  if (privateMeshStatusRefreshInFlight) {
    return privateMeshStatusRefreshInFlight;
  }

  privateMeshStatusRefreshInFlight = (async () => {
    try {
      const status = await invoke("private_mesh_status");
      lastPrivateMeshStatusRefreshAt = Date.now();
      renderPrivateMeshStatus(status);
      return status;
    } catch (err) {
      const status = {
        ok: false,
        error: String(err),
        next_steps: ["Run `musu mesh doctor --json` for details."],
      };
      lastPrivateMeshStatusRefreshAt = Date.now();
      renderPrivateMeshStatus(status);
      return status;
    } finally {
      privateMeshStatusRefreshInFlight = null;
    }
  })();

  return privateMeshStatusRefreshInFlight;
}

// Add PC step 1 as a product action, not a copied command: take the mesh host
// URL and generate the self-hosted Headscale + Caddy + DERP bundle in-app via
// the private_mesh_bootstrap IPC, then show where it landed + what was created.
async function runMeshBootstrap() {
  const btn = $("bootstrap-generate");
  const input = $("bootstrap-server-url");
  const resultEl = $("bootstrap-result");
  const filesEl = $("bootstrap-files");
  if (!btn || !input) return;
  const serverUrl = input.value.trim();
  if (!serverUrl) {
    if (resultEl) {
      resultEl.hidden = false;
      resultEl.dataset.state = "error";
      resultEl.textContent = "Enter your mesh host URL first (e.g. https://mesh.your-domain).";
    }
    input.focus();
    return;
  }
  if (!(serverUrl.startsWith("https://") || serverUrl.startsWith("http://")) || /\s/.test(serverUrl)) {
    if (resultEl) {
      resultEl.hidden = false;
      resultEl.dataset.state = "error";
      resultEl.textContent = "Use a full mesh host URL such as https://mesh.your-domain (http:// is only for local test meshes).";
    }
    input.focus();
    return;
  }
  const oldText = btn.textContent;
  btn.disabled = true;
  input.disabled = true;
  btn.textContent = "Generating…";
  if (resultEl) {
    resultEl.hidden = false;
    resultEl.dataset.state = "running";
    resultEl.textContent = "Writing the self-hosted Headscale + Caddy + DERP bundle…";
  }
  if (filesEl) {
    filesEl.hidden = true;
    filesEl.textContent = "";
  }
  try {
    const r = await invoke("private_mesh_bootstrap", { serverUrl });
    if (r && r.ok) {
      if (resultEl) {
        resultEl.dataset.state = "ok";
        resultEl.textContent = `Bundle ready in ${r.output_dir} (tailnet: ${r.tailnet_name}).`;
      }
      if (filesEl && Array.isArray(r.generated_files) && r.generated_files.length) {
        filesEl.hidden = false;
        filesEl.textContent = "";
        for (const f of r.generated_files) {
          const li = document.createElement("li");
          li.textContent = f;
          filesEl.appendChild(li);
        }
      }
    } else {
      if (resultEl) {
        resultEl.dataset.state = "error";
        resultEl.textContent = (r && r.error) || "Bundle generation failed. See diagnostics.";
      }
    }
  } catch (err) {
    if (resultEl) {
      resultEl.dataset.state = "error";
      resultEl.textContent = `Bundle generation failed: ${String(err)}`;
    }
  } finally {
    btn.disabled = false;
    input.disabled = false;
    btn.textContent = oldText;
  }
}

// Add PC final step on the NEW PC: paste the copied device-add pass file path
// and join the fleet from a button (private_mesh_join) instead of typing
// `musu mesh join`. The join runs tailscale up + control-server health re-check.
async function runMeshJoin() {
  const btn = $("join-run");
  const input = $("join-pass-path");
  const resultEl = $("join-result");
  if (!btn || !input) return;
  const passPath = input.value.trim();
  if (!passPath) {
    if (resultEl) {
      resultEl.hidden = false;
      resultEl.dataset.state = "error";
      resultEl.textContent = "Paste the path to the device-add pass file copied from the control host.";
    }
    input.focus();
    return;
  }
  const oldText = btn.textContent;
  btn.disabled = true;
  input.disabled = true;
  btn.textContent = "Joining…";
  if (resultEl) {
    resultEl.hidden = false;
    resultEl.dataset.state = "running";
    resultEl.textContent = "Joining the mesh (tailscale up + control-server health re-check)…";
  }
  try {
    const r = await invoke("private_mesh_join", { passPath });
    if (resultEl) {
      if (r && r.ok) {
        resultEl.dataset.state = "ok";
        resultEl.textContent = "Joined the MUSU Private Mesh. This PC is now part of the fleet — refresh to see it.";
      } else {
        resultEl.dataset.state = "error";
        resultEl.textContent = (r && r.error) || "Join failed. Check the pass file path and that the control host is online.";
      }
    }
  } catch (err) {
    if (resultEl) {
      resultEl.dataset.state = "error";
      resultEl.textContent = `Join failed: ${String(err)}`;
    }
  } finally {
    btn.disabled = false;
    input.disabled = false;
    btn.textContent = oldText || "Join this PC";
  }
}

// Add PC step 2 as a product action: bring the control plane online (docker
// compose up + Headscale health) from the cockpit instead of a copied docker
// command. Long-running (image pull / boot), so the button reflects progress.
async function runStartControlHost() {
  const btn = $("start-control-host");
  const resultEl = $("start-control-host-result");
  if (!btn) return;
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Starting…";
  if (resultEl) {
    resultEl.hidden = false;
    resultEl.dataset.state = "running";
    resultEl.textContent = "Running docker compose and waiting for Headscale to report healthy…";
  }
  try {
    const r = await invoke("private_mesh_start_control_host");
    if (r && r.ok) {
      if (resultEl) {
        resultEl.dataset.state = "ok";
        resultEl.textContent = "Control host is up and Headscale is healthy. Next: issue a device-add pass below.";
      }
    } else if (resultEl) {
      resultEl.dataset.state = "error";
      resultEl.textContent = (r && r.error) || "Could not start the control host. Is Docker installed and running on this machine?";
    }
  } catch (err) {
    if (resultEl) {
      resultEl.dataset.state = "error";
      resultEl.textContent = `Could not start the control host: ${String(err)}`;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = oldText || "Start control host";
  }
}

async function runDeviceAddPassIssue() {
  const btn = $("device-add-pass-generate");
  const copyBtn = $("device-add-pass-copy");
  const resultEl = $("device-add-pass-result");
  if (!btn) return;
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Issuing...";
  if (copyBtn) {
    copyBtn.hidden = true;
    copyBtn.dataset.copyText = "";
  }
  if (resultEl) {
    resultEl.hidden = false;
    resultEl.dataset.state = "running";
    resultEl.textContent = "Minting a one-use MUSU device-add pass from the running control host...";
  }
  try {
    const r = await invoke("private_mesh_create_join_key");
    if (r && r.ok) {
      const expiry = Number(r.expires_after_seconds || 0);
      if (resultEl) {
        resultEl.dataset.state = "ok";
        resultEl.textContent = `Pass ready: ${r.pass_path} (${r.login_server}, tailnet ${r.tailnet}, expires in ${Math.round(expiry / 60) || 60} min).`;
      }
      if (copyBtn) {
        copyBtn.hidden = false;
        copyBtn.dataset.copyText = r.pass_path || "";
        copyBtn.textContent = "Copy path";
      }
    } else if (resultEl) {
      resultEl.dataset.state = "error";
      resultEl.textContent = (r && r.error) || "Could not issue a device-add pass. Start the control host and run the checks first.";
    }
  } catch (err) {
    if (resultEl) {
      resultEl.dataset.state = "error";
      resultEl.textContent = `Could not issue a device-add pass: ${String(err)}`;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = oldText || "Issue pass";
  }
}

async function runPrivateMeshDoctor() {
  const btn = $("mesh-doctor");
  if (!btn) return;
  const card = $("mesh-status-card");
  const title = $("mesh-status-title");
  const detail = $("mesh-status-detail");
  const proof = $("mesh-status-proof");
  const next = $("mesh-status-next");
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Checking...";
  if (card) card.dataset.state = "checking";
  if (title) title.textContent = "Running local mesh check";
  if (detail) detail.textContent = "Inspecting local mesh config, compatible client, and verification gates.";
  if (proof) {
    proof.hidden = true;
    proof.textContent = "";
  }
  document.querySelectorAll("[data-mesh-copy-proof]").forEach((btn) => {
    btn.disabled = true;
  });
  if (next) {
    next.hidden = true;
    next.textContent = "";
  }

  try {
    renderPrivateMeshStatus(await invoke("private_mesh_doctor"));
  } catch (err) {
    renderPrivateMeshStatus({
      ok: false,
      error: String(err),
      next_steps: ["Run `musu mesh doctor --json` in a terminal if the desktop check keeps failing."],
    });
  } finally {
    btn.disabled = false;
    btn.textContent = oldText || "Run local check";
  }
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
    // Auto-open the approval URL once so the user just clicks "Register this
    // machine" in the browser (the code is already in the URL — no typing). The
    // visible link stays as a fallback if the browser didn't open. Guard against
    // re-opening on every poll tick.
    if (lastAutoOpenedApprovalUrl !== url) {
      lastAutoOpenedApprovalUrl = url;
      try {
        invoke("open_external_url", { url }).catch(() => {});
      } catch {
        /* fallback: the user clicks the visible Approve link */
      }
    }
  } else {
    $("approve-link").hidden = true;
    lastAutoOpenedApprovalUrl = null;
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
    $("connecting-detail").textContent =
      "We opened your browser — click “Sign in” there to finish.";
    if (signinBtn) signinBtn.hidden = flowPending;
  } else {
    setConn("connecting", "Connecting…");
    $("connecting-detail").textContent = "Starting…";
    if (signinBtn) signinBtn.hidden = false;
  }
}

function applyFleetFilter() {
  const rows = [...document.querySelectorAll("#fleet-list .fleet-row")];
  const counts = {
    all: rows.length,
    online: 0,
    relay: 0,
    targetable: 0,
    "this-pc": 0,
    stale: 0,
    offline: 0,
  };
  let visibleCount = 0;

  for (const row of rows) {
    const state = row.dataset.fleetState || "offline";
    counts[state] += 1;
    if (row.dataset.fleetTargetable === "true") counts.targetable += 1;
    if (row.dataset.fleetThisPc === "true") counts["this-pc"] += 1;
    if (row.dataset.fleetStale === "true") counts.stale += 1;
    const visible =
      fleetFilter === "all" ||
      state === fleetFilter ||
      (fleetFilter === "targetable" && row.dataset.fleetTargetable === "true") ||
      (fleetFilter === "this-pc" && row.dataset.fleetThisPc === "true") ||
      (fleetFilter === "stale" && row.dataset.fleetStale === "true");
    row.hidden = !visible;
    if (visible) visibleCount += 1;
  }

  document.querySelectorAll("[data-fleet-filter]").forEach((btn) => {
    const filter = btn.dataset.fleetFilter;
    const selected = filter === fleetFilter;
    btn.setAttribute("aria-pressed", selected ? "true" : "false");
    btn.classList.toggle("active", selected);
  });
  document.querySelectorAll("[data-fleet-count]").forEach((el) => {
    el.textContent = String(counts[el.dataset.fleetCount] ?? 0);
  });

  // #fleet-empty visibility is now owned by updateBodyZone() (called at the end
  // of renderFleet) so it can't fight #task-feed for the body zone.

  const filterEmpty = $("fleet-filter-empty");
  if (filterEmpty) {
    const hideFilterEmpty =
      rows.length === 0 || visibleCount > 0 || (lastFleetIsEmpty && fleetFilter === "all");
    filterEmpty.hidden = hideFilterEmpty;
    filterEmpty.textContent =
      fleetFilter === "all"
        ? "No machines match."
        : fleetFilter === "this-pc"
          ? "This PC is not visible."
          : `No ${fleetFilter} machines match.`;
  }
}

function renderFleet(nodes, thisPcActivity, thisPcBridgeOk) {
  $("connecting").hidden = true;
  $("fleet-section").hidden = false;

  const list = $("fleet-list");
  list.textContent = "";
  let firstReleaseProofTarget = null;

  const others = nodes.filter((n) => !n.is_this_pc);
  // empty = no nodes at all, or only this PC
  const isEmpty = nodes.length === 0 || others.length === 0;
  lastFleetIsEmpty = isEmpty;
  lastFleetNodes = nodes;
  // Onboarding: do NOT auto-open the Add-PC panel on an empty fleet. Adding a PC
  // is infrastructure setup (Headscale) — pushing a first-time user there before
  // they've felt the product (give-a-task → walk-away → get-pinged) is the wrong
  // first step. Keep the panel closed; the empty state now points at the order
  // box, and Add-PC re-surfaces as a contextual nudge AFTER the first task done
  // (see markFirstTaskDoneIfNeeded). The user can still open it manually.
  if (!addPcPanelUserToggled) {
    setAddPcPanelOpen(false);
  }
  // #connector-policy collapse is now owned by updateBodyZone() (called at the
  // end of renderFleet) — unified with fleet-empty/task-feed body arbitration.

  // keep the order target dropdown in sync with the fleet (preserve selection)
  const sel = $("order-target");
  if (sel) {
    const prev = sel.value;
    sel.textContent = "";
    const any = document.createElement("option");
    any.value = "";
    any.textContent = "any machine";
    any.dataset.meshState = "auto";
    sel.appendChild(any);
    for (const n of nodes) {
      const statusError = nodeStatusError(n);
      const fleetState = nodeFleetState(n, thisPcBridgeOk);
      const online = fleetState === "online";
      const relay = fleetState === "relay";
      // A relay peer is reachable via forward — targetable like an online one.
      const targetable = fleetState !== "offline";
      const mesh = meshLabelForNode(n);
      const opt = document.createElement("option");
      opt.value = n.node_name;
      opt.disabled = !targetable;
      opt.dataset.thisPc = n.is_this_pc ? "true" : "false";
      opt.dataset.meshState = mesh.state;
      opt.dataset.meshLabel = mesh.label;
      opt.dataset.tailnetIp = String(n.tailscale_ip || n.tailnet_ip || "").trim();
      opt.dataset.controlServerUrl = String(n.control_server_url || "").trim();
      opt.dataset.controlServerVerified =
        n.control_server_verified === true || n.control_server_verified === "true" ? "true" : "false";
      opt.textContent = n.is_this_pc
        ? `${n.node_name} (this PC${online ? "" : " unavailable"})`
        : relay
          ? `${n.node_name} (relay)`
          : `${n.node_name}${online ? "" : statusError ? ` (${statusError})` : " (offline)"}`;
      sel.appendChild(opt);
    }
    if ([...sel.options].some((o) => o.value === prev && !o.disabled)) {
      sel.value = prev;
    } else {
      sel.value = "";
    }
    updateOrderTargetDisclosure();
  }

  for (const n of nodes) {
    // THIS PC's liveness = the local bridge being up (not an unconditional true —
    // if the bridge is down while the window is open, this PC is NOT online).
    const statusError = nodeStatusError(n);
    const fleetState = nodeFleetState(n, thisPcBridgeOk);
    const online = fleetState === "online";
    const relay = fleetState === "relay";
    // A relay peer is reachable via forward — selectable like an online one.
    const targetable = fleetState !== "offline";
    const seen = relTime(n.last_seen);
    const stale = !online && Boolean(seen);
    const mesh = meshLabelForNode(n);
    const verifyCommand = peerVerifyCommandForNode(n, mesh, online);
    const releaseProofTarget = releaseProofTargetForNode(n, mesh, online);
    if (!firstReleaseProofTarget && releaseProofTarget) {
      firstReleaseProofTarget = releaseProofTarget;
    }
    const releaseProofCommand = exactReleaseProofCommandForTarget(releaseProofTarget);
    const physicalPeerEvidenceCommand = physicalPeerEvidenceCommandForTarget(releaseProofTarget);
    const li = document.createElement("li");
    li.className = `fleet-row ${fleetState}`;
    li.dataset.fleetState = fleetState;
    li.dataset.fleetTargetable = targetable ? "true" : "false";
    li.dataset.fleetThisPc = n.is_this_pc ? "true" : "false";
    li.dataset.fleetStale = stale ? "true" : "false";
    li.dataset.meshState = mesh.state;
    li.dataset.tailnetIp = String(n.tailscale_ip || n.tailnet_ip || "").trim();
    // S-tier (Tailscale machines-list): a fleet row is CLICKABLE — selecting a
    // machine targets it for your next order + focuses the input. "Click a
    // machine, give it work." Keyboard-accessible (Enter/Space).
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-disabled", targetable ? "false" : "true");
    li.setAttribute(
      "aria-label",
      relay
        ? `Send an order to ${n.node_name || "this machine"} (reachable via relay)`
        : online
          ? `Send an order to ${n.node_name || "this machine"}`
          : `${n.node_name || "this machine"} is not targetable: ${statusError || (seen ? `last seen ${seen}` : "offline")}`
    );
    if (relay) {
      li.title = `Reachable via relay${seen ? ` — last seen ${seen}` : ""}`;
    } else if (!online) {
      li.title = statusError || (seen ? `Last seen ${seen}` : "Asleep or off");
    }
    li.dataset.node = n.node_name || "";
    const selectThisMachine = () => {
      if (!targetable) return;
      const sel = $("order-target");
      if (sel && [...sel.options].some((o) => o.value === li.dataset.node && !o.disabled)) {
        sel.value = li.dataset.node;
        updateOrderTargetDisclosure();
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
      if (e.target?.closest?.("button")) return;
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

      // Specialist-program badges (redesign C-plus step 2): what THIS machine is
      // running, so the row reads as "a machine doing something", not just a name.
      // Sourced from this_pc_programs (local /api/setup/status). Local-only —
      // peer machines get this once the cross-machine bridge change lands.
      const prog = lastThisPcPrograms || {};
      const progs = [];
      if (prog.ollama_running) progs.push({ label: "Ollama", on: true });
      if (prog.comfyui_running) progs.push({ label: "ComfyUI", on: true });
      if (prog.default_adapter) progs.push({ label: prog.default_adapter, on: false });
      for (const p of progs) {
        const chip = document.createElement("span");
        chip.className = `node-program${p.on ? " running" : ""}`;
        chip.textContent = p.label;
        li.appendChild(chip);
      }
    }

    // Plain-language status label next to the name (D7 Tailscale-style: a dot is
    // not enough — never rely on color alone, web.dev offline-UX). "Ready" when
    // online and targetable, otherwise the human last-seen / asleep state.
    const statusLabel = document.createElement("span");
    statusLabel.className = `node-status ${online ? "ok" : relay ? "relay" : "off"}`;
    statusLabel.textContent = online
      ? "Ready"
      : relay
        ? "Ready (relay)"
        : statusError
          ? "Needs attention"
          : seen
            ? `Last seen ${seen}`
            : "Asleep or off";
    li.appendChild(statusLabel);

    const meshBadge = document.createElement("span");
    meshBadge.className = `node-network ${mesh.state}`;
    meshBadge.textContent = mesh.label;
    meshBadge.title = mesh.title;
    li.appendChild(meshBadge);

    // Rename (WS-2c): resolve→confirm-by-id. We fetch the authoritative node
    // list, match THIS row by name+IP, and rename by the returned Headscale id —
    // never by the row's possibly-stale name. Ambiguous match → refuse (the
    // server enforces the same, this is a first-line UX guard).
    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "node-rename";
    renameBtn.textContent = "Rename";
    renameBtn.title = `Rename ${n.node_name}`;
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      renameNodeFlow(n);
    });
    li.appendChild(renameBtn);

    // Remove (WS-2c Phase 2) — one-way; never on this PC (use Disconnect for
    // that). The server also refuses self-eviction; this just hides the button.
    if (!n.is_this_pc) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "node-remove";
      removeBtn.textContent = "Remove";
      removeBtn.title = `Remove ${n.node_name} from the fleet`;
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeNodeFlow(n);
      });
      li.appendChild(removeBtn);
    }

    if (verifyCommand) {
      const verifyActions = document.createElement("span");
      verifyActions.className = "node-verify-actions";

      const targetIp = String(n.tailscale_ip || n.tailnet_ip || "").trim();
      const runVerify = document.createElement("button");
      runVerify.type = "button";
      runVerify.className = "node-verify node-verify-run";
      runVerify.textContent = "Run verify";
      runVerify.title = `Run Private Mesh verification for ${n.node_name}`;
      runVerify.addEventListener("click", (e) => {
        e.stopPropagation();
        runPeerVerify(runVerify, targetIp);
      });
      verifyActions.appendChild(runVerify);

      const proofOrder = document.createElement("button");
      proofOrder.type = "button";
      proofOrder.className = "node-verify node-proof-order";
      proofOrder.textContent = "Proof order";
      proofOrder.title = `Send a delegated proof order to ${n.node_name}`;
      proofOrder.addEventListener("click", (e) => {
        e.stopPropagation();
        sendPrivateMeshProofOrder(proofOrder, n.node_name);
      });
      verifyActions.appendChild(proofOrder);

      if (releaseProofTarget) {
        const runReleaseProof = document.createElement("button");
        runReleaseProof.type = "button";
        runReleaseProof.className = "node-verify node-release-run";
        runReleaseProof.textContent = "Run proof";
        runReleaseProof.title = `Run native release proof for ${n.node_name}`;
        runReleaseProof.addEventListener("click", (e) => {
          e.stopPropagation();
          runPeerReleaseProof(runReleaseProof, releaseProofTarget);
        });
        verifyActions.appendChild(runReleaseProof);
      }

      const copyVerify = document.createElement("button");
      copyVerify.type = "button";
      copyVerify.className = "node-verify node-verify-copy";
      copyVerify.textContent = "Copy";
      copyVerify.title = `Copy Private Mesh verification command for ${n.node_name}`;
      copyVerify.dataset.copyText = verifyCommand;
      copyVerify.addEventListener("click", (e) => {
        e.stopPropagation();
        copySetupCommand(copyVerify);
      });
      verifyActions.appendChild(copyVerify);

      if (releaseProofTarget) {
        const copyPhysicalEvidence = document.createElement("button");
        copyPhysicalEvidence.type = "button";
        copyPhysicalEvidence.className = "node-verify node-physical-evidence-copy";
        copyPhysicalEvidence.textContent = "Evidence cmd";
        copyPhysicalEvidence.title =
          `Copy the target-PC physical evidence command to run on ${n.node_name}`;
        copyPhysicalEvidence.dataset.copyText = physicalPeerEvidenceCommand;
        copyPhysicalEvidence.addEventListener("click", (e) => {
          e.stopPropagation();
          copySetupCommand(copyPhysicalEvidence);
        });
        verifyActions.appendChild(copyPhysicalEvidence);

        const copyReleaseProof = document.createElement("button");
        copyReleaseProof.type = "button";
        copyReleaseProof.className = "node-verify node-release-copy";
        copyReleaseProof.textContent = "Release cmd";
        copyReleaseProof.dataset.defaultText = "Release cmd";
        copyReleaseProof.title = releaseProofCommand
          ? `Copy native release proof command for ${n.node_name}`
          : `Paste and check target physical evidence before copying release proof for ${n.node_name}`;
        copyReleaseProof.dataset.copyText = releaseProofCommand;
        copyReleaseProof.addEventListener("click", (e) => {
          e.stopPropagation();
          copyReleaseProofCommand(copyReleaseProof, releaseProofTarget);
        });
        verifyActions.appendChild(copyReleaseProof);
      }

      const verifyStatus = document.createElement("span");
      verifyStatus.className = "node-proof-status";
      verifyStatus.hidden = true;
      verifyActions.appendChild(verifyStatus);

      li.appendChild(verifyActions);
    }

    const meta = document.createElement("span");
    meta.className = "node-meta";
    if (n.is_this_pc) {
      // The one thing only the local app can show: what THIS PC is doing.
      meta.textContent = online ? thisPcActivity || "idle" : "bridge down";
      if (online && (thisPcActivity || "").startsWith("working")) meta.classList.add("working");
    } else {
      meta.textContent = online ? "online" : statusError || (seen ? `seen ${seen}` : "offline");
      if (statusError) meta.title = statusError;
    }
    li.appendChild(meta);

    list.appendChild(li);
  }

  if (!lastReleaseProofResult && firstReleaseProofTarget) {
    renderReleaseProofEvidence(null, firstReleaseProofTarget, "input");
  } else if (!lastReleaseProofResult && !firstReleaseProofTarget) {
    const currentState = $("release-evidence-strip")?.dataset.state || "idle";
    lastReleaseProofTarget = null;
    if (currentState === "idle") {
      renderReleaseProofEvidence(null, null, "idle");
    }
  }

  applyFleetFilter();
  // Single source of truth for the body zone (fleet-empty vs task-feed vs
  // connector-policy). Runs after applyFleetFilter so fleetFilter is current.
  updateBodyZone();
}

// ── diagnostics drawer ─────────────────────────────────
function renderDiagnostics(status) {
  state.status = status;
  const bridgeOk = status.bridge_status === "ok";
  const bridgeStarting = status.bridge_status === "starting";
  $("d-bridge").textContent = bridgeOk
    ? "running"
    : bridgeStarting
      ? "starting"
      : "offline";
  $("d-conn").textContent = status.auth_status || "unknown";
  $("d-runtime").textContent = `${status.runtime_process_count ?? 0} process(es)`;
  const dashboardAvailable = Boolean(status.dashboard_url);
  $("d-dashboard").textContent = dashboardAvailable
    ? "available"
    : status.dashboard_status || "offline";
  const openDashboardBtn = $("open-dashboard");
  if (openDashboardBtn) {
    openDashboardBtn.hidden = !dashboardAvailable;
    openDashboardBtn.disabled = state.busy || !dashboardAvailable;
    openDashboardBtn.title = status.dashboard_detail || "";
  }
  $("package-status").textContent = status.package_status || "unknown";
  $("auth-status").textContent = status.auth_status || "unknown";
  $("runtime-profile-status").textContent = status.runtime_profile_status || "unknown";
  $("process-ownership-status").textContent = status.process_ownership_status || "unknown";
  $("owned-helpers").textContent =
    `${status.owned_node_process_count ?? 0} node / ${status.owned_webview2_process_count ?? 0} WebView2`;

  const canStartRuntime = state.status?.can_start_runtime === true;
  $("start-runtime").disabled = state.busy || !canStartRuntime;

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
  // mirror the same account state into the header account menu + settings modal
  syncAccountAffordances(status);

  renderWarnings(status);
  // #version is set in syncAccountAffordances (called above) from status.version,
  // shared by the cheap cockpit_state poll and this desktop_status path.
  window.__lastStatus = status;
}

function setPill(kind, label) {
  const conn = $("conn");
  if (conn) conn.dataset.reviewState = kind;
  const labelEl = $("conn-label");
  if (labelEl && kind === "warn") labelEl.textContent = label;
}

function renderWarnings(status) {
  const warnings = Array.isArray(status.warnings) ? status.warnings.filter(Boolean) : [];
  const panel = $("warnings-panel");
  const list = $("warning-list");
  const wbox = $("diag-warnings");
  if (warnings.length > 0) {
    panel.hidden = false;
    list.replaceChildren(...warnings.map((warning) => {
      const item = document.createElement("li");
      item.textContent = warning;
      return item;
    }));
    wbox.hidden = false;
    wbox.textContent = warnings.join(" · ");
    setPill("warn", "Review");
  } else {
    panel.hidden = true;
    list.replaceChildren();
    wbox.hidden = true;
  }
}

async function startRuntime(btn) {
  if (state.busy) return;
  state.busy = true;
  const canStartRuntime = state.status?.can_start_runtime === true;
  $("start-runtime").disabled = state.busy || !canStartRuntime;
  if (btn) btn.textContent = "Starting…";
  try {
    await invoke("start_runtime");
    await refresh();
    await loadDiagnostics();
  } catch (err) {
    const wbox = $("diag-warnings");
    wbox.hidden = false;
    wbox.textContent = `Runtime start failed: ${String(err)}`;
  } finally {
    state.busy = false;
    if (btn) btn.textContent = "Start Runtime";
    const canStartRuntimeNow = state.status?.can_start_runtime === true;
    $("start-runtime").disabled = state.busy || !canStartRuntimeNow;
  }
}

async function openDashboard(btn) {
  if (state.busy) return;
  state.busy = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Opening...";
  }
  try {
    const result = await invoke("open_dashboard");
    if (!result?.ok) {
      const wbox = $("diag-warnings");
      if (wbox) {
        wbox.hidden = false;
        wbox.textContent = result?.output || result?.message || "Dashboard is not available.";
      }
    }
  } catch (err) {
    const wbox = $("diag-warnings");
    if (wbox) {
      wbox.hidden = false;
      wbox.textContent = `Dashboard open failed: ${String(err)}`;
    }
  } finally {
    state.busy = false;
    if (btn) {
      btn.textContent = "Open dashboard";
      btn.disabled = !state.status?.dashboard_url;
    }
  }
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

  // Keep the account affordances (settings Sign in/out, account menu) in sync on
  // EVERY poll, driven by cockpit_state's auth_status. Previously these only
  // updated via desktop_status (loadDiagnostics), which isn't called after login
  // — so the Settings "Sign in" stayed visible even though the main screen had
  // flipped to Connected. cockpit_state already carries auth_status, so this is
  // the single source that flips both surfaces together.
  window.__lastStatus = status;
  syncAccountAffordances(status);

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

  // Refresh this-PC's specialist-program snapshot (ollama/comfyui/adapter) before
  // rendering so the this-PC row can badge what it's running. Soft-fail: a miss
  // just leaves the badges off, never blocks the fleet render.
  if (connected) {
    try {
      lastThisPcPrograms = await invoke("this_pc_programs");
    } catch {
      /* leave previous snapshot; badges simply may be stale/absent */
    }
  }

  if (connected) {
    try {
      const nodes = await invoke("list_fleet");
      const list = Array.isArray(nodes) && nodes.length ? nodes : [
        { node_name: "this machine", last_seen: "", public_url: "", is_this_pc: true },
      ];
      renderFleet(list, thisPcActivity, bridgeOk);
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
    // Local Only: cloud-disconnected but the local bridge works. list_fleet now
    // reads the LIVE LOCAL MESH (this bridge's /api/fleet/status — manually-added
    // peers + real health), so the fleet-as-one-device view works WITHOUT cloud
    // login. Fall back to this-PC-only only if even the local read fails.
    try {
      const nodes = await invoke("list_fleet");
      const list = Array.isArray(nodes) && nodes.length ? nodes : [
        { node_name: "this machine", last_seen: "", public_url: "", is_this_pc: true },
      ];
      renderFleet(list, thisPcActivity, bridgeOk);
    } catch {
      renderFleet(
        [{ node_name: "this machine", last_seen: "", public_url: "", is_this_pc: true }],
        thisPcActivity,
        bridgeOk
      );
    }
    setConn("connecting", "Local only");
  }
  refreshPrivateMeshStatus();
}

// ── order submission + observation loop (S-tier task inbox) ────
// An order is a trackable card in an ATTENTION-GROUPED inbox (running → done):
// it surfaces where it needs you. Running cards show a TICKING elapsed clock +
// "esc to stop" (the clock is the liveness proof, not a fake bar). The composer
// NEVER blocks — you queue the next order while one runs. Status reads by SHAPE
// as well as color (the .task-dot CSS), so it's legible at a glance / colorblind.
const TASK_POLL_MS = 2500;
const TASK_FEED_MAX = 8; // most recent N orders kept across both groups
const activePolls = new Map(); // task_id → one-shot timeout handle
const elapsedTimers = new Map(); // task_id → one-shot timeout handle for the ticking clock
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

// Show/hide each group section based on whether it has cards.
function refreshGroupVisibility() {
  const feed = $("task-feed");
  for (const group of ["running", "done"]) {
    const section = feed.querySelector(`[data-group="${group}"]`);
    const has = section.querySelector(".task-group-list").children.length > 0;
    section.hidden = !has;
  }
  updateBodyZone();
}

// Single arbiter of the body zone (redesign WS-1a / Critic HIGH-3). Previously
// three disconnected predicates decided what occupies the middle: fleet-empty
// (lastFleetIsEmpty && filter==all), connector-policy (isEmpty && !firstTaskDone),
// and task-feed (card count) — nothing cross-referenced them, so fleet-empty and
// task-feed could both show or both hide. This unifies them: the activity stream
// owns the body when there are tasks; otherwise the empty-state CTA does. Called
// at the end of both renderFleet and refreshGroupVisibility so there's one truth.
function updateBodyZone() {
  const feed = $("task-feed");
  const hasTasks = feed
    ? [...feed.querySelectorAll(".task-group-list")].some((l) => l.children.length > 0)
    : false;
  if (feed) feed.hidden = !hasTasks;
  const fleetEmpty = $("fleet-empty");
  // empty-state CTA owns the body only when there are no task cards AND the fleet
  // itself is empty on the unfiltered view.
  if (fleetEmpty) {
    fleetEmpty.hidden = hasTasks || !(lastFleetIsEmpty && fleetFilter === "all");
  }
  // connector-policy collapses only on a truly empty body (no tasks, pre-first-task).
  const connectorPolicy = $("connector-policy");
  if (connectorPolicy) {
    connectorPolicy.hidden = !hasTasks && !onboardingFlag("firstTaskDone");
  }
}

function stopTaskTimers(taskId) {
  if (elapsedTimers.has(taskId)) {
    clearTimeout(elapsedTimers.get(taskId));
    elapsedTimers.delete(taskId);
  }
}

function stopTaskPoll(taskId) {
  if (activePolls.has(taskId)) {
    clearTimeout(activePolls.get(taskId));
    activePolls.delete(taskId);
  }
}

function taskEventText(status, body) {
  if (status === "pending") return "queued locally";
  if (status === "running") return "running on target";
  if (status === "done") return body ? "completed with result" : "completed";
  if (status === "failed") return body || "failed";
  if (status === "cancelled") return body || "cancelled";
  if (status === "not_found") return body || "status not found";
  return status || "updated";
}

function appendTaskLog(li, status, body) {
  const log = li.querySelector(".task-log");
  if (!log) return;
  const item = document.createElement("li");
  const time = document.createElement("span");
  time.className = "task-log-time";
  time.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const label = document.createElement("span");
  label.className = "task-log-label";
  label.textContent = taskEventText(status, body);
  item.append(time, label);
  log.appendChild(item);
  while (log.children.length > 8) log.firstElementChild?.remove();
}

function proofValue(proof, key) {
  const value = proof && proof[key];
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function proofGrade(proof) {
  if (!proof) return "";
  if (proof.peer_identity_verified && proof.encryption && proof.encryption !== "none_http_bearer") {
    return "verified transport";
  }
  if (proof.peer_identity_method || proof.peer_public_key) return "advertised identity";
  return "bearer route";
}

function renderProofSummary(li, routeProof) {
  const summary = li.querySelector(".task-proof-summary");
  if (!summary) return;
  if (!routeProof) {
    summary.hidden = true;
    summary.textContent = "";
    return;
  }

  const delivered = Boolean(routeProof.callback_delivered);
  const peer = proofValue(routeProof, delivered ? "callback_node" : "target_node_id") || "peer";
  const routeKind = proofValue(routeProof, "route_kind") || "route";
  const result = proofValue(routeProof, "result") || "unknown";
  const grade = proofGrade(routeProof) || "proof";

  summary.textContent = "";
  const delivery = document.createElement("span");
  delivery.className = `task-proof-delivery ${delivered ? "delivered" : "pending"}`;
  delivery.textContent = delivered ? `returned from ${peer}` : `sent to ${peer}`;
  const transport = document.createElement("span");
  transport.className = "task-proof-transport";
  transport.textContent = `${routeKind} · ${result} · ${grade}`;
  summary.append(delivery, transport);
  summary.hidden = false;
}

function markFleetRowCallbackProof(routeProof, fallbackTarget) {
  if (!routeProof?.callback_delivered) return;
  const peer =
    proofValue(routeProof, "callback_node") ||
    proofValue(routeProof, "target_node_id") ||
    fallbackTarget ||
    "";
  if (!peer) return;
  const rows = document.querySelectorAll(".fleet-row");
  for (const row of rows) {
    if (row.dataset.node !== peer) continue;
    row.dataset.verifyState = "callback-proof";
    const status = row.querySelector(".node-proof-status");
    if (status) {
      status.hidden = false;
      status.textContent = "callback proof";
      status.title = "Delegated task result returned to this cockpit.";
    }
    break;
  }
}

function renderTaskInspector(li, { taskId, status, routeLabel, artifact, routeProof }) {
  const meta = li.querySelector(".task-meta");
  if (!meta) return;
  const boundaryLabel = orderBoundaryLabel(li.dataset.orderBoundary || "unverified");
  const boundaryNote = li.dataset.orderBoundaryText || "";
  const rows = [
    ["Task", taskId],
    ["Route", routeLabel],
    ["Boundary", boundaryLabel],
    ["Status", status],
  ];
  if (boundaryNote) rows.push(["Boundary note", boundaryNote]);
  const elapsed = li.querySelector(".task-elapsed")?.textContent || "";
  if (elapsed) rows.push(["Elapsed", elapsed.replace(" · esc to stop", "")]);
  if (artifact) rows.push(["Artifact", artifact]);
  if (routeProof) {
    rows.push(["Path", proofValue(routeProof, "route_kind") || "unknown"]);
    rows.push(["Peer", proofValue(routeProof, "target_node_id") || "unknown"]);
    rows.push(["Addr", proofValue(routeProof, "candidate_addr") || "unknown"]);
    rows.push(["Result", proofValue(routeProof, "result") || "unknown"]);
    rows.push(["Proof", proofGrade(routeProof) || "unknown"]);
    const recordedAt = proofValue(routeProof, "recorded_at");
    if (recordedAt) rows.push(["Recorded", recordedAt]);
    if (routeProof.callback_delivered) {
      rows.push(["Callback", "delivered"]);
      rows.push(["Remote task", proofValue(routeProof, "callback_remote_task_id") || "unknown"]);
      rows.push(["Callback node", proofValue(routeProof, "callback_node") || "unknown"]);
      rows.push(["Callback at", proofValue(routeProof, "callback_received_at") || "unknown"]);
    }
  }

  meta.textContent = "";
  for (const [key, value] of rows) {
    const k = document.createElement("span");
    k.textContent = key;
    const v = document.createElement("strong");
    v.textContent = value || "unknown";
    meta.append(k, v);
  }
}

// Remove a task card by id (used to swap an optimistic placeholder for the real
// task_id once submit_order returns, avoiding a duplicate row).
function removeTaskCard(taskId) {
  const li = document.querySelector(`#task-feed [data-task="${taskId}"]`);
  if (li) {
    stopTaskTimers?.(taskId);
    li.remove();
    refreshGroupVisibility();
  }
}

function renderTaskCard(taskId, { status, text, target, output, error, artifact, routeProof, orderBoundary, retryDisabled }) {
  const targetGroup = groupFor(status);
  let li = document.querySelector(`#task-feed [data-task="${taskId}"]`);
  if (!li) {
    li = document.createElement("li");
    li.dataset.task = taskId;
    li.innerHTML =
      '<div class="task-head">' +
      '<span class="task-dot" aria-hidden="true"></span>' +
      '<span class="task-text"></span>' +
      '<span class="task-route"></span>' +
      '<span class="task-boundary"></span>' +
      '<span class="task-elapsed"></span>' +
      '<span class="task-status"></span></div>' +
      '<div class="task-proof-summary" hidden></div>' +
      '<div class="task-detail" hidden></div>' +
      '<div class="task-inspector" hidden>' +
      '<div class="task-meta"></div>' +
      '<ol class="task-log" aria-label="Task activity"></ol>' +
      '</div>';
  }
  const previousStatus = li.dataset.taskStatus;
  // Move the card to the right group if its status changed group.
  const list = groupList(targetGroup);
  if (li.parentElement !== list) {
    list.prepend(li);
  }
  li.className = `task-card ${status}`;
  if (text) {
    li.querySelector(".task-text").textContent = text;
    li.dataset.orderText = text; // retained so Retry can resubmit the same order
  }
  if (target !== undefined) {
    li.dataset.orderTarget = target || "";
  }
  if (retryDisabled !== undefined) {
    li.dataset.retryDisabled = retryDisabled ? "true" : "false";
  }
  const route = li.querySelector(".task-route");
  const targetLabel = li.dataset.orderTarget ? `to ${li.dataset.orderTarget}` : "auto-route";
  route.textContent = targetLabel;
  route.title = li.dataset.orderTarget
    ? `This order is locked to ${li.dataset.orderTarget}`
    : "This order lets MUSU choose the machine";
  if (orderBoundary || target !== undefined || !li.dataset.orderBoundary) {
    applyTaskBoundary(li, orderBoundary || orderTargetBoundarySnapshot(li.dataset.orderTarget || ""));
  } else {
    applyTaskBoundary(li, {
      boundary: li.dataset.orderBoundary,
      text: li.dataset.orderBoundaryText,
    });
  }
  li.querySelector(".task-status").textContent = status;
  li.dataset.taskStatus = status;

  // Ticking elapsed clock + "esc to stop" while in flight; freeze on terminal.
  const elapsedEl = li.querySelector(".task-elapsed");
  if (status === "running" || status === "pending") {
    if (!taskStartedAt.has(taskId)) taskStartedAt.set(taskId, Date.now());
    if (!elapsedTimers.has(taskId)) {
      const tick = () => {
        elapsedEl.textContent =
          fmtElapsed(Date.now() - taskStartedAt.get(taskId)) + " · esc to stop";
        elapsedTimers.set(taskId, setTimeout(tick, 1000));
      };
      tick();
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
    li.dataset.resultText = body;
  }
  if (!previousStatus || previousStatus !== status) {
    appendTaskLog(li, status, body);
  }
  renderProofSummary(li, routeProof);
  renderTaskInspector(li, { taskId, status, routeLabel: targetLabel, artifact, routeProof });

  // Failure recovery: a failed/cancelled card is never a dead end. Show the
  // error as the "why" (above) plus a Retry that resubmits the same order, so
  // the user acts from the card instead of retyping. Built once, idempotent.
  const failed = status === "failed" || status === "cancelled";
  const terminal = terminalStatus(status);
  const hasOrder = Boolean(text || li.dataset.orderText);
  let actions = li.querySelector(".task-actions");
  if (hasOrder || (terminal && body)) {
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "task-actions";
      const details = document.createElement("button");
      details.type = "button";
      details.className = "task-details";
      details.textContent = "Details";
      details.dataset.action = "details";
      details.addEventListener("click", () => {
        const inspector = li.querySelector(".task-inspector");
        if (!inspector) return;
        inspector.hidden = !inspector.hidden;
        details.textContent = inspector.hidden ? "Details" : "Hide details";
      });
      actions.appendChild(details);

      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "task-retry";
      retry.textContent = "Retry";
      retry.dataset.action = "retry";
      retry.addEventListener("click", () => {
        const t = li.dataset.orderText;
        const target = li.dataset.orderTarget || "";
        if (t) {
          submitText(t, target, {
            expectedBoundary: {
              boundary: li.dataset.orderBoundary || "",
              text: li.dataset.orderBoundaryText || "",
              fingerprint: li.dataset.orderBoundaryFingerprint || "",
            },
          });
        }
      });
      actions.appendChild(retry);

      const reviewTarget = document.createElement("button");
      reviewTarget.type = "button";
      reviewTarget.className = "task-review-target";
      reviewTarget.textContent = "Review target";
      reviewTarget.dataset.action = "review-target";
      reviewTarget.addEventListener("click", () => reviewTaskTarget(li));
      actions.appendChild(reviewTarget);

      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "task-copy";
      copy.textContent = "Copy result";
      copy.dataset.action = "copy";
      copy.addEventListener("click", async () => {
        const result = li.dataset.resultText;
        if (!result) return;
        try {
          await navigator.clipboard.writeText(result);
          copy.textContent = "Copied";
          setTimeout(() => {
            copy.textContent = "Copy result";
          }, 1200);
        } catch {
          detail.hidden = false;
          detail.focus?.();
        }
      });
      actions.appendChild(copy);
      li.appendChild(actions);
    }
    const retry = actions.querySelector('[data-action="retry"]');
    const reviewTarget = actions.querySelector('[data-action="review-target"]');
    const copy = actions.querySelector('[data-action="copy"]');
    const details = actions.querySelector('[data-action="details"]');
    if (details) details.hidden = false;
    if (retry) retry.hidden = !failed || li.dataset.retryDisabled === "true";
    if (reviewTarget) {
      reviewTarget.hidden = li.dataset.retryDisabled !== "true";
      reviewTarget.disabled = !li.dataset.orderTarget;
    }
    if (copy) copy.hidden = !body;
    actions.hidden = false;
  } else if (actions) {
    actions.hidden = true; // recovered (e.g. re-rendered as running) — hide it
  }

  // Trim oldest across both groups (and stop their polling/timers).
  const all = $("task-feed").querySelectorAll(".task-card");
  if (all.length > TASK_FEED_MAX) {
    // remove from the DONE group first (terminal, least useful to keep)
    const doneCards = groupList("done").querySelectorAll(".task-card");
    let toRemove = all.length - TASK_FEED_MAX;
    for (let i = doneCards.length - 1; i >= 0 && toRemove > 0; i--, toRemove--) {
      const id = doneCards[i].dataset.task;
      if (id) stopTaskPoll(id);
      stopTaskTimers(id);
      doneCards[i].remove();
    }
  }
  refreshGroupVisibility();
}

function pollTask(taskId, text, target, orderBoundary) {
  if (activePolls.has(taskId)) return;
  let stopped = false;
  const tick = async () => {
    let st;
    try {
      st = await invoke("get_order_status", { taskId });
    } catch (err) {
      renderTaskCard(taskId, { status: "failed", text, target, orderBoundary, error: String(err) });
      stopped = true;
      stopTaskPoll(taskId);
      stopTaskTimers(taskId);
      return;
    }
    renderTaskCard(taskId, {
      status: st.status,
      text,
      target,
      output: st.output,
      error: st.error,
      artifact: st.artifact_path,
      routeProof: st.route_proof,
      orderBoundary,
    });
    if (terminalStatus(st.status)) {
      stopped = true;
      stopTaskPoll(taskId);
      if (st.route_proof?.callback_delivered) {
        markFleetRowCallbackProof(st.route_proof, target);
        refreshPrivateMeshStatus({ force: true });
      }
      // OS notification on terminal events (no-op if the plugin command is
      // absent — wrapped in try/catch so a missing command can't break the UI).
      notifyTerminal(text, st, target);
      return;
    }
    if (!stopped) {
      activePolls.set(taskId, setTimeout(tick, TASK_POLL_MS));
    }
  };
  activePolls.set(taskId, setTimeout(tick, 0));
}

// Fire an OS notification when an order finishes — so the user can walk away and
// MUSU taps them. Best-effort: the Tauri command may not exist yet (shell-only
// build), so swallow errors.
// First-task aha (one-time). When the user's FIRST task finishes successfully,
// they've just experienced the whole loop — give-a-task → walk-away → get-pinged.
// Mark it, show a one-line badge above the cockpit, and surface an Add-PC nudge
// (the right moment to scale: they've felt the value). Pure + idempotent so it's
// unit-testable without the async notify path. Returns true the one time it fires.
function markFirstTaskDoneIfNeeded() {
  if (onboardingFlag("firstTaskDone")) return false;
  setOnboardingFlag("firstTaskDone");
  // Chips were a first-run nudge; retire them now.
  updateOrderExamplesVisibility();
  // Re-arbitrate the body zone immediately (firstTaskDone is now set, so
  // connector-policy un-collapses) rather than waiting up to one ~15s poll for
  // the next renderFleet. updateBodyZone is the single owner now.
  updateBodyZone();
  const banner = $("first-task-aha");
  if (banner) {
    banner.hidden = false;
    banner.classList.add("pulse-once");
  }
  announce(
    "First task done. This is the loop — give it work, walk away, get pinged."
  );
  return true;
}

async function notifyTerminal(text, st, target) {
  // Announce to assistive tech alongside the OS notification, so a SR/ambient
  // user learns the order finished without watching the card. done = polite,
  // failed/cancelled = assertive.
  const who = target ? ` on ${target}` : "";
  if (st.status === "done") {
    announce(`Order${who} done`);
    markFirstTaskDoneIfNeeded();
  } else {
    const why = st.error ? `: ${String(st.error).slice(0, 80)}` : "";
    announce(`Order${who} ${st.status}${why}`, true);
  }
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

// Send one order's text to the fleet and track it. Shared by the composer and
// by the Retry affordance on a failed card, so a failure is never a dead end.
async function submitText(text, target, { expectedBoundary } = {}) {
  if (!text) return;
  const orderTarget = target || "";
  const orderBoundary = orderTargetBoundarySnapshot(orderTarget);
  if (orderBoundaryMismatch(expectedBoundary, orderBoundary)) {
    renderTaskCard(`local-${Date.now()}`, {
      status: "failed",
      text,
      target: orderTarget,
      orderBoundary,
      retryDisabled: true,
      error: retryBoundaryChangedMessage(expectedBoundary, orderBoundary),
    });
    return;
  }
  if (!orderTargetIsAvailable(orderTarget)) {
    renderTaskCard(`local-${Date.now()}`, {
      status: "failed",
      text,
      target: orderTarget,
      orderBoundary,
      error: `Target ${orderTarget} is offline or not available. Choose an online machine or use auto-route.`,
    });
    return;
  }
  // Optimistic card: show a "queued" card the instant the user sends, BEFORE the
  // submit_order IPC round-trips. Otherwise a slow adapter / remote target leaves
  // the screen blank right after Send and the user can't tell it worked (the
  // Linear 0ms-feedback bar). Replaced in place by the real task_id on success.
  const optimisticId = `local-${Date.now()}`;
  renderTaskCard(optimisticId, { status: "pending", text, target: orderTarget, orderBoundary });
  announce(`Order sent${orderTarget ? ` to ${orderTarget}` : ""}`);
  try {
    const result = await invoke("submit_order", { text, target: orderTarget });
    if (result.task_id) {
      // Re-key the optimistic card to the real id (renderTaskCard upserts by id,
      // so remove the placeholder first to avoid a duplicate).
      removeTaskCard(optimisticId);
      renderTaskCard(result.task_id, { status: "pending", text, target: orderTarget, orderBoundary });
      pollTask(result.task_id, text, orderTarget, orderBoundary);
    } else {
      removeTaskCard(optimisticId);
      // No task id (e.g. rejected) — surface as a failed card so it's visible.
      renderTaskCard(`local-${Date.now()}`, {
        status: "failed",
        text,
        target: orderTarget,
        orderBoundary,
        error: result.message || "order not queued",
      });
    }
  } catch (err) {
    // Turn the optimistic placeholder into the failed card (don't leave a stray
    // "queued" row alongside a new failed one).
    removeTaskCard(optimisticId);
    renderTaskCard(`local-${Date.now()}`, {
      status: "failed",
      text,
      target: orderTarget,
      orderBoundary,
      error: String(err),
    });
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

  await submitText(text, target);
}

let addPcPanelUserToggled = false;

function setAddPcPanelOpen(open, { focus = false, user = false } = {}) {
  const panel = $("add-pc-panel");
  const toggle = $("add-pc-toggle");
  if (!panel) return;
  if (user) addPcPanelUserToggled = true;
  panel.hidden = !open;
  if (toggle) {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.textContent = open ? "Hide setup" : "Add PC";
    toggle.classList.toggle("active", open);
  }
  if (open && focus) panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openAddPcGuide() {
  fleetFilter = "all";
  applyFleetFilter();
  setAddPcPanelOpen(true, { focus: true, user: true });
}

// ── onboarding state (first-task) ──────────────────────────────────────────
// One-time flags namespaced under musu.onboarding.*. Machine-scoped (per WebView
// profile) for v1 — simple and good enough; a second account on the same machine
// re-seeing the aha is a benign edge. localStorage may throw (private mode /
// cleared WebView); always guard. Falling back to "not done" on read errors is
// safe — at worst the one-time UI shows again, which is harmless.
function onboardingFlag(name) {
  try {
    return window.localStorage.getItem(`musu.onboarding.${name}`) === "1";
  } catch {
    return false;
  }
}
function setOnboardingFlag(name) {
  try {
    window.localStorage.setItem(`musu.onboarding.${name}`, "1");
  } catch {
    /* storage unavailable — non-fatal; the one-time UI may repeat */
  }
}

// Example-command chips are a first-run nudge. Show them only until the user has
// completed their first task, then get out of the way.
function updateOrderExamplesVisibility() {
  const box = $("order-examples");
  if (!box) return;
  box.hidden = onboardingFlag("firstTaskDone");
}

// Bring the order box into view AND focus it. The empty-state lives above the
// order box, so a focus-only CTA would move focus to an element below the fold
// the user never sees (H2). scrollIntoView first, then focus.
function focusOrderInput() {
  const input = $("order-input");
  if (!input) return;
  try {
    input.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch {
    /* jsdom / old engines: scrollIntoView may be unavailable — focus still works */
  }
  input.focus();
}

// ── wiring ─────────────────────────────────────────────
$("order-send").addEventListener("click", submitOrder);
$("order-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitOrder();
});
$("order-target")?.addEventListener("change", updateOrderTargetDisclosure);
$("add-pc-toggle")?.addEventListener("click", () => {
  const panel = $("add-pc-panel");
  setAddPcPanelOpen(panel?.hidden !== false, { focus: true, user: true });
});
$("empty-add-pc")?.addEventListener("click", openAddPcGuide);
// Empty-state primary CTA: the first task is the aha, not Add-PC. Bring the
// order box into view and focus it so the user types their first task.
$("empty-give-task")?.addEventListener("click", focusOrderInput);

// Example-command chips: clicking FILLS the order input (does not send) so the
// user keeps intent, then brings the box into view + focuses. Delegated so all
// chips share one handler. Send is left to the user (Send button / Enter).
$("order-examples")?.addEventListener("click", (e) => {
  const chip = e.target?.closest?.("[data-order-example]");
  if (!chip) return;
  const input = $("order-input");
  if (input) input.value = chip.textContent.trim();
  focusOrderInput();
});
updateOrderExamplesVisibility();

// Contextual Add-PC nudge inside the first-task aha banner — surfaces the
// multi-PC value exactly when the user has felt the single-PC value (M1).
$("aha-add-pc")?.addEventListener("click", openAddPcGuide);
// ── command palette (Ctrl/Cmd+K) — keyboard-first premium speed ────────
// A searchable action list. Frecency-lite: recently-run commands float up.
// Target a machine by name from the keyboard (palette), reusing the fleet-row
// select behavior: set the order target, cue the composer placeholder, focus the
// order input. Returns false if the machine isn't a reachable target.
function targetMachineByName(name) {
  const sel = $("order-target");
  if (!sel) return false;
  const opt = [...sel.options].find((o) => o.value === name && !o.disabled);
  if (!opt) return false;
  sel.value = name;
  updateOrderTargetDisclosure();
  document.querySelectorAll(".fleet-row.selected").forEach((r) => r.classList.remove("selected"));
  const row = document.querySelector(`.fleet-row[data-node="${CSS.escape(name)}"]`);
  if (row) row.classList.add("selected");
  const input = $("order-input");
  input.focus();
  input.placeholder = `What should ${name} do?`;
  return true;
}

// Dynamic palette commands: one "Target <machine>" per online fleet target, so
// the core verb (point at a machine + start an order) is completable from the
// keyboard without touching the mouse — the S-tier palette bar (Linear/Raycast).
function dynamicPaletteCommands() {
  const sel = $("order-target");
  if (!sel) return [];
  return [...sel.options]
    .filter((o) => o.value && !o.disabled)
    .map((o) => ({
      id: `target:${o.value}`,
      label: `Target ${o.value} — start an order`,
      run: () => targetMachineByName(o.value),
    }));
}

const paletteCommands = [
  { id: "focus-order", label: "Focus order input", run: () => $("order-input").focus() },
  { id: "add-pc", label: "Show Add PC guide", run: openAddPcGuide },
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
  const all = [...paletteCommands, ...dynamicPaletteCommands()];
  return all
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
  try { c.run(); } catch { /* command failed, non-fatal */ }
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
    if ($("palette").hidden) {
      openPalette();
    } else {
      closePalette();
    }
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
    // The CLI login flow auto-joins the mesh once approval completes; mirror it
    // on the cockpit side so the mesh card reconnects without a manual step the
    // moment the account token lands (force a status read which triggers
    // maybeAutoJoinAccountMesh).
    void refreshPrivateMeshStatus({ force: true });
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

// ── account menu + settings (Ctrl+,) ───────────────────────────────────────
// The discoverable home for Settings / Help / Sign out — reference apps keep
// these in a fixed-corner account menu, never in a diagnostics drawer. These
// mirror the existing #d-signin/#d-signout actions (same functions) so behavior
// stays identical; they're just placed where users actually look.
const HELP_URL = "https://musu.pro/docs";

function openHelp() {
  try {
    invoke("open_external_url", { url: HELP_URL }).catch(() => {
      try { window.open(HELP_URL, "_blank"); } catch { /* no-op */ }
    });
  } catch {
    try { window.open(HELP_URL, "_blank"); } catch { /* no-op */ }
  }
}

function setAccountMenuOpen(open) {
  const menu = $("account-menu");
  const btn = $("account-btn");
  if (!menu || !btn) return;
  menu.hidden = !open;
  btn.setAttribute("aria-expanded", open ? "true" : "false");
}

function setSettingsOpen(open) {
  const modal = $("settings-modal");
  if (!modal) return;
  modal.hidden = !open;
  if (open) {
    setAccountMenuOpen(false);
    // sync the snapshot into the settings surface
    syncAccountAffordances(window.__lastStatus || {});
    $("set-theme") && ($("set-theme").value = currentTheme());
    queueMicrotask(() => $("settings-close")?.focus());
  }
}

// Theme: dark (default) or system. Stored in localStorage; applied as a
// data-theme attribute. v1 keeps the dark palette and only toggles whether the
// OS "light" preference is honored (system) — the cockpit is dark-first.
function currentTheme() {
  try { return window.localStorage.getItem("musu.theme") || "dark"; } catch { return "dark"; }
}
function applyTheme(theme) {
  try { window.localStorage.setItem("musu.theme", theme); } catch { /* no-op */ }
  document.documentElement.setAttribute("data-theme", theme);
}

// Keep every account/version affordance (header menu + settings modal) in sync
// with one status snapshot, so there's a single source of truth.
function syncAccountAffordances(status) {
  const auth = status?.auth_status || "";
  const signedIn = auth === "Connected";
  const stateText = signedIn
    ? "Signed in"
    : auth === "Local Only"
      ? "Local only (not signed in)"
      : "Not signed in";
  const loginInProgress = !$("connecting")?.hidden;
  for (const id of ["account-menu-state", "set-account-state"]) {
    const el = $(id); if (el) el.textContent = stateText;
  }
  for (const id of ["m-signout", "set-signout"]) {
    const el = $(id); if (el) el.hidden = !signedIn || loginInProgress;
  }
  for (const id of ["m-signin", "set-signin"]) {
    const el = $(id); if (el) el.hidden = signedIn || loginInProgress;
  }
  // Update both version surfaces (header #version + settings #set-version) from
  // whichever status snapshot carries it. Both cockpit_state (cheap 15s poll)
  // and desktop_status (diagnostics drawer) now carry `version`
  // (env!("CARGO_PKG_VERSION")), so the version shows on the normal poll without
  // opening the diagnostics drawer. Guard so a snapshot lacking version never
  // blanks an already-shown value.
  if (status?.version) {
    const label = `MUSU ${status.version}`;
    const v = $("version"); if (v) v.textContent = label;
    const sv = $("set-version"); if (sv) sv.textContent = label;
    // Always-visible header version (no "MUSU" prefix — the brand mark is right
    // there). This is the surface a user sees without opening any drawer/modal.
    const av = $("app-version"); if (av) av.textContent = `v${status.version}`;
  }
}

$("account-btn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  setAccountMenuOpen($("account-menu")?.hidden !== false);
});
// click-away closes the menu
document.addEventListener("click", (e) => {
  const menu = $("account-menu");
  if (menu && !menu.hidden && !e.target?.closest?.(".account-wrap")) setAccountMenuOpen(false);
});
$("m-settings")?.addEventListener("click", () => setSettingsOpen(true));
$("m-help")?.addEventListener("click", () => { setAccountMenuOpen(false); openHelp(); });
$("m-signout")?.addEventListener("click", (e) => { setAccountMenuOpen(false); signOut(e.currentTarget); });
$("m-signin")?.addEventListener("click", (e) => { setAccountMenuOpen(false); startSignIn(e.currentTarget); });

$("settings-close")?.addEventListener("click", () => setSettingsOpen(false));
$("settings-modal")?.addEventListener("click", (e) => {
  if (e.target?.id === "settings-modal") setSettingsOpen(false); // backdrop click
});
$("set-signout")?.addEventListener("click", (e) => signOut(e.currentTarget));
$("set-signin")?.addEventListener("click", (e) => startSignIn(e.currentTarget));
$("set-help")?.addEventListener("click", openHelp);
$("set-check-update")?.addEventListener("click", async () => {
  const el = $("set-update-state");
  const prev = el ? el.textContent : "";
  if (el) el.textContent = "Checking…";
  try {
    await invoke("check_for_updates");
    if (el) el.textContent = "Checking via App Installer…";
    announce("Checking for updates");
  } catch (err) {
    if (el) el.textContent = prev || "Auto-updates on launch";
    const wbox = $("diag-warnings");
    if (wbox) { wbox.hidden = false; wbox.textContent = `Update check: ${String(err)}`; }
  }
});
$("set-theme")?.addEventListener("change", (e) => applyTheme(e.currentTarget.value));

// Disconnect this machine from the mesh — distinct from Sign out (cloud). Runs
// `tailscale down` via private_mesh_leave only when the active tailnet is ours
// (a personal tailnet is preserved server-side). Confirm first; a task running
// here can lose its result callback over the mesh.
async function disconnectMesh(btn) {
  const ok = window.confirm(
    "Disconnect this machine from your private network?\n\n" +
      "• Your other machines won't be able to reach it.\n" +
      "• A task running on this machine may not be able to send its result back.\n" +
      "• This does NOT sign you out — reconnect by logging in or rejoining.\n\n" +
      "A personal (non-MUSU) tailnet is never touched."
  );
  if (!ok) return;
  if (btn) btn.disabled = true;
  try {
    const res = await invoke("private_mesh_leave");
    const wbox = $("diag-warnings");
    if (wbox && res && res.ok === false && res.error) {
      wbox.hidden = false;
      wbox.textContent = `Disconnect: ${String(res.error).slice(0, 200)}`;
    }
    announce("Disconnected this machine from the mesh", true);
  } catch (err) {
    const wbox = $("diag-warnings");
    if (wbox) {
      wbox.hidden = false;
      wbox.textContent = `Disconnect failed: ${String(err)}`;
    }
  } finally {
    if (btn) btn.disabled = false;
    refresh();
    loadDiagnostics();
  }
}
$("set-mesh-disconnect")?.addEventListener("click", (e) => disconnectMesh(e.currentTarget));

// ── complete uninstall (U-B) ────────────────────────────────────────────────
// Fully destructive, one-way removal of THIS machine's MUSU install. Distinct
// from Sign out (cloud only) and Disconnect (mesh only): this deletes local data
// AND detaches this machine from the account AND removes the app. Gated behind a
// checkbox AND a typed phrase; the Rust handler re-validates the phrase server-
// side, so the UI gate is convenience, not the security boundary.
const UNINSTALL_PHRASE = "REMOVE MUSU";

function uninstallReady() {
  const checked = $("uninstall-ack-check")?.checked === true;
  const typed = ($("uninstall-type-input")?.value || "").trim() === UNINSTALL_PHRASE;
  return checked && typed;
}

function syncUninstallButton() {
  const btn = $("uninstall-confirm");
  if (btn) btn.disabled = !uninstallReady();
}

function setUninstallModalOpen(open) {
  const modal = $("uninstall-modal");
  if (!modal) return;
  modal.hidden = !open;
  if (open) {
    setSettingsOpen(false);
    // reset the gate each time it opens — never carry a prior ack/typing.
    const chk = $("uninstall-ack-check");
    if (chk) chk.checked = false;
    const inp = $("uninstall-type-input");
    if (inp) inp.value = "";
    const err = $("uninstall-error");
    if (err) { err.hidden = true; err.textContent = ""; }
    syncUninstallButton();
    inp?.focus();
  }
}

async function confirmUninstall(btn) {
  if (!uninstallReady()) return; // defensive — button should be disabled
  if (btn) btn.disabled = true;
  const err = $("uninstall-error");
  if (err) { err.hidden = true; err.textContent = ""; }
  try {
    announce("Removing MUSU from this machine", true);
    // The handler runs the destructive CLI uninstall, spawns the elevated
    // package-removal helper, and schedules the app to close. We may never get
    // here if the window closes first; that's expected.
    await invoke("complete_uninstall", { confirm: UNINSTALL_PHRASE });
    if (err) {
      err.hidden = false;
      err.textContent = "제거를 진행 중입니다. 이 창은 곧 닫힙니다.";
    }
  } catch (e) {
    if (btn) btn.disabled = false;
    if (err) {
      err.hidden = false;
      err.textContent = `제거 실패: ${String(e).slice(0, 300)}`;
    }
  }
}

$("set-uninstall")?.addEventListener("click", () => setUninstallModalOpen(true));
$("uninstall-cancel")?.addEventListener("click", () => setUninstallModalOpen(false));
$("uninstall-cancel-x")?.addEventListener("click", () => setUninstallModalOpen(false));
$("uninstall-modal")?.addEventListener("click", (e) => {
  if (e.target?.id === "uninstall-modal") setUninstallModalOpen(false); // backdrop
});
$("uninstall-ack-check")?.addEventListener("change", syncUninstallButton);
$("uninstall-type-input")?.addEventListener("input", syncUninstallButton);
$("uninstall-confirm")?.addEventListener("click", (e) => confirmUninstall(e.currentTarget));

// Rename a fleet machine (WS-2c, resolve→confirm-by-id). Fetch the authoritative
// node list, match this row by name AND tailnet IP, rename by the returned
// Headscale id. Refuse if the row matches zero or more than one live node (the
// row's name/IP may be stale; the server enforces the same — this is the UX guard
// against renaming the wrong machine).
// Resolve a fleet ROW (from the bridge dashboard) to the single authoritative
// Headscale node it refers to (resolve→confirm-by-id). Fetches the live node
// list and matches by name AND tailnet IP, refusing on zero/multiple matches so
// rename/remove never act on the wrong (or a stale) machine. Returns the matched
// node, or null after alerting the user. Shared by rename + remove (the matching
// logic was identical in both — one source of truth for "which node is this row").
async function resolveFleetNodeForRow(node, actionVerb) {
  let listRes;
  try {
    listRes = await invoke("mesh_node_list");
  } catch (err) {
    window.alert(`Couldn't load the machine list: ${String(err)}`);
    return null;
  }
  let nodes = [];
  try {
    nodes = JSON.parse(listRes?.output || "{}").nodes || [];
  } catch {
    window.alert("Couldn't read the machine list (unexpected response).");
    return null;
  }
  const rowName = (node.node_name || "").trim();
  const rowIp = String(node.tailscale_ip || node.tailnet_ip || "").trim();
  const matches = nodes.filter((m) => {
    const nameOk = (m.name || "").trim() === rowName;
    const ipOk = rowIp ? (m.ips || []).includes(rowIp) : true;
    return nameOk && ipOk;
  });
  if (matches.length === 0) {
    window.alert(`Couldn't find "${rowName}" in your fleet right now — refresh and try again.`);
    return null;
  }
  if (matches.length > 1) {
    window.alert(`More than one machine matches "${rowName}". ${actionVerb} is blocked to avoid acting on the wrong one.`);
    return null;
  }
  return matches[0];
}

async function renameNodeFlow(node) {
  const target = await resolveFleetNodeForRow(node, "Renaming");
  if (!target) return;
  const newName = window.prompt(`Rename "${target.name}" to:`, target.name);
  if (newName == null) return;
  const trimmed = newName.trim();
  if (!trimmed || trimmed === target.name) return;
  try {
    const res = await invoke("mesh_node_rename", { nodeId: target.id, newName: trimmed });
    if (res && res.ok === false) {
      window.alert(`Rename failed: ${String(res.error || "unknown error").slice(0, 200)}`);
    } else {
      announce(`Renamed ${target.name} to ${trimmed}`);
    }
  } catch (err) {
    window.alert(`Rename failed: ${String(err)}`);
  } finally {
    refresh();
  }
}

// Remove a machine from the fleet (WS-2c Phase 2, one-way). Same resolve→
// confirm-by-id matching as rename, plus a typed confirmation (the user must
// type the machine name) and this-PC's IP passed so the server can refuse
// self-eviction. The destructive guard is server-side; this is UX defense.
async function removeNodeFlow(node) {
  const target = await resolveFleetNodeForRow(node, "Removal");
  if (!target) return;
  const typed = window.prompt(
    `Remove "${target.name}" from your fleet? This is permanent — the machine must rejoin (log in again) to come back.\n\nType the machine name to confirm:`
  );
  if (typed == null) return;
  if (typed.trim() !== target.name) {
    window.alert("Name didn't match — removal cancelled.");
    return;
  }
  // this-PC's own IP — REQUIRED by the server's fail-closed self-eviction guard.
  // If we can't determine it, refuse here rather than send a request the server
  // will (correctly) reject.
  const thisPc = (lastFleetNodes || []).find((m) => m.is_this_pc);
  const callerIp = thisPc ? String(thisPc.tailscale_ip || thisPc.tailnet_ip || "").trim() : "";
  if (!callerIp) {
    window.alert("Can't determine this PC's mesh address right now — try again once the fleet has refreshed.");
    return;
  }
  try {
    const res = await invoke("mesh_node_remove", {
      nodeId: target.id,
      expectedName: target.name,
      callerIp,
    });
    if (res && res.ok === false) {
      window.alert(`Remove failed: ${String(res.error || "unknown error").slice(0, 200)}`);
    } else {
      announce(`Removed ${target.name} from the fleet`, true);
    }
  } catch (err) {
    window.alert(`Remove failed: ${String(err)}`);
  } finally {
    refresh();
  }
}

// Ctrl/Cmd+, opens settings; Esc closes the topmost overlay.
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === ",") {
    e.preventDefault();
    setSettingsOpen($("settings-modal")?.hidden !== false);
  } else if (e.key === "Escape") {
    if (!$("settings-modal")?.hidden) setSettingsOpen(false);
    else if (!$("account-menu")?.hidden) setAccountMenuOpen(false);
  }
});

applyTheme(currentTheme());

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
$("start-runtime").addEventListener("click", (e) => startRuntime(e.currentTarget));
$("open-dashboard").addEventListener("click", (e) => openDashboard(e.currentTarget));
$("d-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(window.__lastStatus || {}, null, 2));
    $("d-copy").textContent = "Copied!";
    setTimeout(() => ($("d-copy").textContent = "Copy diagnostics"), 1500);
  } catch {
    /* ignore */
  }
});

async function copySetupCommand(btn) {
  const text = btn.dataset.copyText || "";
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = old || "Copy"), 1400);
  } catch {
    btn.textContent = "Copy failed";
    setTimeout(() => (btn.textContent = "Copy"), 1400);
  }
}

document.querySelectorAll("[data-copy-text]").forEach((btn) => {
  btn.addEventListener("click", () => copySetupCommand(btn));
});

$("mesh-doctor")?.addEventListener("click", runPrivateMeshDoctor);
$("bootstrap-generate")?.addEventListener("click", runMeshBootstrap);
$("start-control-host")?.addEventListener("click", runStartControlHost);
$("join-run")?.addEventListener("click", runMeshJoin);
$("join-pass-path")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    runMeshJoin();
  }
});
$("device-add-pass-generate")?.addEventListener("click", runDeviceAddPassIssue);
$("bootstrap-server-url")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    runMeshBootstrap();
  }
});
document.querySelectorAll("[data-mesh-copy-proof]").forEach((btn) => {
  btn.addEventListener("click", copyPrivateMeshProof);
});
document.querySelectorAll("[data-copy-release-evidence]").forEach((btn) => {
  btn.addEventListener("click", copyReleaseProofEvidence);
});
document.querySelectorAll("[data-copy-release-next-action]").forEach((btn) => {
  btn.addEventListener("click", copyReleaseNextAction);
});
document.querySelectorAll("[data-open-release-evidence]").forEach((btn) => {
  btn.addEventListener("click", openReleaseProofEvidence);
});
$("physical-peer-evidence-latest")?.addEventListener("click", (event) => {
  useLatestPhysicalPeerEvidence(event.currentTarget);
});
$("physical-peer-evidence-check")?.addEventListener("click", (event) => {
  checkPhysicalPeerEvidence(event.currentTarget);
});
$("release-proof-run")?.addEventListener("click", runReleaseProof);
$("physical-peer-evidence-path")?.addEventListener("input", () => {
  clearPhysicalPeerEvidenceValidation();
});

document.querySelectorAll("[data-fleet-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const next = btn.dataset.fleetFilter;
    if (!FLEET_FILTERS.has(next)) return;
    fleetFilter = next;
    applyFleetFilter();
  });
});

$("connector-review-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  reviewConnectorCandidate($("connector-review-input")?.value || "");
});

renderConnectorRegistry();
refresh();
refreshLatestReleaseEvidence();
// P1: 15s, not 5s. The cheap `cockpit_state` poll keeps connection/activity
// current without hammering the runtime; it is one-shot and rearmed only after
// each refresh finishes, so slow work cannot overlap. Pause entirely when the
// window is hidden — a minimized tray app polling is pure waste.
const TAURI_SHELL_REFRESH_MS = 15000;
let pollTimer = null;
async function runScheduledRefresh() {
  pollTimer = null;
  if (document.hidden) return;
  await refresh();
  scheduleRefresh(TAURI_SHELL_REFRESH_MS);
}
function scheduleRefresh(delayMs = TAURI_SHELL_REFRESH_MS) {
  if (pollTimer || document.hidden) return;
  pollTimer = setTimeout(runScheduledRefresh, delayMs);
}
function clearRefreshTimer() {
  if (!pollTimer) return;
  clearTimeout(pollTimer);
  pollTimer = null;
}
scheduleRefresh(TAURI_SHELL_REFRESH_MS);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearRefreshTimer();
  } else {
    runScheduledRefresh();
  }
});

// ── WS-U: in-app update toast ────────────────────────────────────────────────
// MSIX can't self-replace, so the cockpit probes the hosted .appinstaller and,
// when a newer version is available, surfaces a toast that (1) triggers the OS
// update via the existing `check_for_updates` apply action, then (2) offers a
// restart once the install is in flight. The probe runs once at startup and every
// 6h thereafter (the OS still auto-updates on its own 24h cycle as the backstop),
// wrapped in try/catch so a probe failure never disturbs the cockpit.
const UPDATE_PROBE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
// Session flag: once the user dismisses with "나중에", don't re-show this session.
let updateToastDismissed = false;

// U-3: keep the settings "Updates" line in sync with the probe outcome.
function syncUpdateSettings(probe) {
  const el = $("set-update-state");
  if (!el || !probe) return;
  if (probe.update_available && probe.available) {
    el.textContent = `v${probe.available} 사용 가능`;
  } else if (probe.ok) {
    el.textContent = `최신 버전 (v${probe.current})`;
  }
  // On a graceful failure (ok:false, not dev/off-Windows-specific) leave the
  // existing text untouched rather than blanking a useful value.
}

function showUpdateToast(available) {
  const toast = $("update-toast");
  if (!toast || updateToastDismissed) return;
  const msg = $("update-toast-msg");
  const apply = $("update-toast-apply");
  const restart = $("update-toast-restart");
  // Reset to step 1 (apply) in case a prior cycle left it on step 2.
  if (msg) msg.textContent = `새 버전 v${available} 사용 가능`;
  if (apply) apply.hidden = false;
  if (restart) restart.hidden = true;
  toast.hidden = false;
  toast.classList.add("pulse-once");
  announce(`새 버전 v${available} 사용 가능 — 지금 적용할 수 있습니다.`);
}

function hideUpdateToast() {
  const toast = $("update-toast");
  if (toast) toast.hidden = true;
}

// Apply → fully self-contained, one-click update. check_for_updates spawns a
// detached helper (downloads the .msix, waits for this cockpit to exit, installs
// per-user, relaunches), then exits MUSU. The user does NOTHING else — no App
// Installer window, no manual steps. We deliberately do NOT use the
// ms-appinstaller: protocol (Windows disables it by default → "protocol
// disabled"), nor in-process Add-AppxPackage (0x80073D02, can't replace own
// running files). MUSU will close within ~1s of clicking and reopen at the new
// version a few seconds later.
$("update-toast-apply")?.addEventListener("click", async () => {
  const apply = $("update-toast-apply");
  const restart = $("update-toast-restart");
  const msg = $("update-toast-msg");
  if (apply) apply.disabled = true;
  try {
    const res = await invoke("check_for_updates");
    if (res?.ok) {
      // The detached helper is running and MUSU is about to exit (the Rust side
      // calls app.exit after spawning it). No in-app restart button needed — the
      // helper relaunches us. Show a closing message; the window will vanish.
      if (msg) msg.textContent = "업데이트를 적용하는 중… MUSU가 곧 다시 시작됩니다";
      if (apply) apply.hidden = true;
      if (restart) restart.hidden = true;
      announce("업데이트를 내려받아 적용하는 중입니다. MUSU가 잠시 후 자동으로 다시 시작됩니다.", true);
    }
  } catch (err) {
    if (msg) msg.textContent = `업데이트 적용 실패: ${String(err)}`;
    if (apply) apply.disabled = false;
  }
});

// (No in-app "restart" button: the detached update helper owns the
// close→install→relaunch lifecycle and relaunches MUSU via the shell AUMID.
// restart_app stays registered for tray/settings reuse, but no toast invokes it.)

// "나중에" → dismiss for this session (no re-show).
$("update-toast-later")?.addEventListener("click", () => {
  updateToastDismissed = true;
  hideUpdateToast();
});

// One-shot, self-rearming, cancellable scheduling — mirrors the cockpit's
// scheduleRefresh pattern (NOT setInterval): a slow probe can't overlap, and the
// timer pauses while the window is hidden (a minimized tray app polling is waste).
let updateProbeTimer = null;
async function runUpdateProbe() {
  updateProbeTimer = null;
  if (document.hidden) return;
  try {
    const probe = await invoke("probe_update");
    if (probe) {
      syncUpdateSettings(probe);
      if (probe.update_available && probe.available) {
        showUpdateToast(probe.available);
      }
    }
  } catch {
    // Graceful: a probe failure must never disturb the cockpit. The OS 24h
    // auto-update remains the backstop.
  }
  scheduleUpdateProbe(UPDATE_PROBE_INTERVAL_MS);
}
function scheduleUpdateProbe(delayMs = UPDATE_PROBE_INTERVAL_MS) {
  if (updateProbeTimer || document.hidden) return;
  updateProbeTimer = setTimeout(runUpdateProbe, delayMs);
}
function clearUpdateProbeTimer() {
  if (!updateProbeTimer) return;
  clearTimeout(updateProbeTimer);
  updateProbeTimer = null;
}

runUpdateProbe(); // probe once at startup, then it self-rearms every 6h
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearUpdateProbeTimer();
  else scheduleUpdateProbe(UPDATE_PROBE_INTERVAL_MS);
});
