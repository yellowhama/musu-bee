import { createHash } from "node:crypto";
import { TOOLS } from "../tools";

type ConnectorPolicyParams = {
  name?: unknown;
  description?: unknown;
  source_url?: unknown;
};

type ConnectorListParams = {
  category?: unknown;
  trust_tier?: unknown;
  risk_profile?: unknown;
};

type ConnectorProofPlanParams = {
  id?: unknown;
};

type ConnectorHealthCheckParams = {
  id?: unknown;
  source_url?: unknown;
};

const CURATED_CONNECTORS = [
  {
    id: "local-browser",
    name: "Local Browser",
    category: "local-automation",
    trust_tier: 0,
    default_policy: "allow",
    risk_profile: "local_operator",
    install_mode: "built_in_or_local_sidecar",
    required_secrets: [],
    data_egress: [],
    health_check: "open_local_page_and_capture_screenshot",
    proof_required: true,
    status: "review_ready",
  },
  {
    id: "website-to-markdown",
    name: "Website to Markdown",
    category: "research",
    trust_tier: 0,
    default_policy: "allow_with_source_url",
    risk_profile: "content_extraction",
    install_mode: "local_builtin",
    required_secrets: [],
    data_egress: ["user_supplied_url"],
    health_check: "fetch_source_url_and_record_status",
    proof_required: true,
    status: "review_ready",
  },
  {
    id: "openapi-to-mcp",
    name: "OpenAPI to MCP",
    category: "developer-tools",
    trust_tier: 1,
    default_policy: "allow_with_source_url",
    risk_profile: "api_generation",
    install_mode: "local_generator",
    required_secrets: [],
    data_egress: ["openapi_spec_url_if_remote"],
    health_check: "generate_connector_and_run_schema_probe",
    proof_required: true,
    status: "review_ready",
  },
  {
    id: "mcp-validator",
    name: "MCP Validator",
    category: "developer-tools",
    trust_tier: 1,
    default_policy: "allow",
    risk_profile: "connector_quality_gate",
    install_mode: "local_test_runner",
    required_secrets: [],
    data_egress: [],
    health_check: "list_tools_and_validate_schema_timeouts_errors",
    proof_required: true,
    status: "review_ready",
  },
  {
    id: "github",
    name: "GitHub",
    category: "work-apps",
    trust_tier: 2,
    default_policy: "allow_with_user_owned_credential",
    risk_profile: "source_control",
    install_mode: "scoped_token_or_oauth",
    required_secrets: ["GITHUB_TOKEN"],
    data_egress: ["github.com"],
    health_check: "get_authenticated_user",
    proof_required: true,
    status: "credential_required",
  },
  {
    id: "slack",
    name: "Slack",
    category: "work-apps",
    trust_tier: 2,
    default_policy: "allow_with_user_owned_credential",
    risk_profile: "workspace_messages",
    install_mode: "scoped_bot_token_or_oauth",
    required_secrets: ["SLACK_BOT_TOKEN"],
    data_egress: ["slack.com"],
    health_check: "auth_test_and_list_allowed_channels",
    proof_required: true,
    status: "credential_required",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "work-apps",
    trust_tier: 2,
    default_policy: "allow_with_user_owned_credential",
    risk_profile: "calendar_events",
    install_mode: "oauth",
    required_secrets: ["GOOGLE_OAUTH_TOKEN"],
    data_egress: ["googleapis.com"],
    health_check: "list_calendars_readonly",
    proof_required: true,
    status: "credential_required",
  },
  {
    id: "notion",
    name: "Notion",
    category: "work-apps",
    trust_tier: 2,
    default_policy: "allow_with_user_owned_credential",
    risk_profile: "workspace_docs",
    install_mode: "integration_token",
    required_secrets: ["NOTION_TOKEN"],
    data_egress: ["api.notion.com"],
    health_check: "search_accessible_pages",
    proof_required: true,
    status: "credential_required",
  },
] as const;

const TRUST_TIERS = [
  {
    tier: 0,
    label: "local_builtin",
    behavior: "Enabled by default only when audited, local-first, and proof-producing.",
    examples: ["MUSU fleet", "local files", "local terminal", "local browser", "private mesh"],
  },
  {
    tier: 1,
    label: "official_or_open_source",
    behavior: "Curated install only after license, source, health check, and rollback are known.",
    examples: ["official SDK", "permissively licensed MCP server", "OpenAPI spec from vendor docs"],
  },
  {
    tier: 2,
    label: "user_authorized_cloud",
    behavior: "Optional connector with explicit OAuth/API key scopes, revocation path, and data egress display.",
    examples: ["GitHub", "Slack", "Google Calendar", "Gmail", "Notion", "Jira", "Linear"],
  },
  {
    tier: 3,
    label: "marketplace_or_hosted_actor",
    behavior: "Discovery only by default; require sandboxing, cost/ToS/privacy warning, and user confirmation.",
    examples: ["Apify actors", "hosted scraping APIs", "affiliate API directories"],
  },
] as const;

const RISK_RULES = [
  {
    policy: "blocked",
    riskProfile: "credential_or_evasion_abuse",
    terms: ["password", "credential theft", "steal token", "captcha", "bypass", "stealth", "view generator", "brute"],
    reason: "Credential, evasion, artificial engagement, or bypass behavior is not a first-class MUSU workflow.",
  },
  {
    policy: "blocked_or_explicit_warning",
    riskProfile: "personal_data_scraping",
    terms: ["lead", "email", "phone", "linkedin", "instagram", "tiktok", "twitter", "telegram", "profile scraper"],
    reason: "Personal-data or social-profile scraping has high privacy and platform ToS risk.",
  },
  {
    policy: "warn",
    riskProfile: "media_or_marketplace_scraping",
    terms: ["download", "downloader", "scraper", "scraping", "crawler", "proxy"],
    reason: "Scraping/downloading/marketplace actors need explicit source, rights, cost, and data-egress review.",
  },
  {
    policy: "allow_with_source_url",
    riskProfile: "content_extraction",
    terms: ["markdown", "documentation", "docs", "rag browser", "website to markdown", "openapi"],
    reason: "Content extraction can be safe when source URL, provenance, and output proof are recorded.",
  },
] as const;

const GENERATED_MARKETPLACE_CATALOG_RE =
  /(?:github\.com|raw\.githubusercontent\.com)\/cporter202\/(?:api-mega-list|scraping-apis-for-devs)(?:\/|$)/i;

const MARKETPLACE_CATALOG_INDEX_RE =
  /(?:api[-_\s]*mega[-_\s]*list|scraping[-_\s]*apis(?:[-_\s]*for[-_\s]*dev(?:eloper)?s)?|affiliate[-_\s]*api[-_\s]*(?:list|catalog|directory)|apify[-_\s]*(?:actor|actors|store)[-_\s]*(?:list|catalog|directory|collection)|(?:awesome|list|catalog|directory|collection)[-_\s]*(?:apify|scraping[-_\s]*apis|scraper[-_\s]*apis|hosted[-_\s]*actors))/i;

function marketplaceCatalogIndexSignal(value: string) {
  const raw = value.trim();
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  return GENERATED_MARKETPLACE_CATALOG_RE.test(raw) || MARKETPLACE_CATALOG_INDEX_RE.test(decoded);
}

function textParam(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function safeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Resolve a hostname and return the first resolved address that is
 * private/loopback/link-local/metadata, or null if all are public. This closes
 * the SSRF gap where a public hostname (or a DNS-rebinding record) resolves to
 * an internal IP that the string-based hostname gate cannot see. Returns null
 * (allow) if the host is already a literal IP the gate handled, or if resolution
 * fails (the subsequent fetch will then fail on its own).
 */
/** Is a bare (unbracketed) resolved IP private/loopback/link-local/ULA/metadata?
 *  dns.lookup returns IPv6 WITHOUT brackets, and IPv4-mapped IPv6 as ::ffff:a.b.c.d,
 *  neither of which isPrivateOrLocalHostname (bracket-based) catches — so check
 *  the bare form here. */
function resolvedAddressIsPrivate(address: string): boolean {
  const addr = address.toLowerCase();
  // IPv4-mapped IPv6 (::ffff:127.0.0.1) → test the embedded IPv4.
  const mapped = addr.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) {
    return isPrivateOrLocalHostname(mapped[1]);
  }
  if (addr.includes(":")) {
    // Bare IPv6: loopback, ULA (fc00::/7 → fc/fd), link-local fe80::/10
    // (first hextet 0xfe80–0xfebf → prefixes fe8/fe9/fea/feb; fe80: alone would
    // miss fe81–fe8f).
    return (
      addr === "::1" ||
      addr.startsWith("fc") ||
      addr.startsWith("fd") ||
      addr.startsWith("fe8") ||
      addr.startsWith("fe9") ||
      addr.startsWith("fea") ||
      addr.startsWith("feb")
    );
  }
  // IPv4 literal → reuse the existing dotted-quad classifier.
  return isPrivateOrLocalHostname(addr);
}

async function resolvedHostIsPrivate(hostname: string): Promise<string | null> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  // Literal IPs were already handled by isPrivateOrLocalHostname in the gate.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare) || bare.includes(":")) {
    return null;
  }
  try {
    const dns = await import("node:dns/promises");
    // Bound the lookup so a hostile/slow resolver cannot stall the health check
    // before the already-bounded fetch (matches the catch → null behavior).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const lookup = dns.lookup(bare, { all: true });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("dns_timeout")), 3000);
    });
    let records: Array<{ address: string }>;
    try {
      records = (await Promise.race([lookup, timeout])) as Array<{ address: string }>;
    } finally {
      if (timer) clearTimeout(timer);
    }
    for (const { address } of records) {
      if (resolvedAddressIsPrivate(address)) {
        return address;
      }
    }
    return null;
  } catch {
    // Resolution failed/timed out → let fetch surface the error; do not hard-block.
    return null;
  }
}

function isPrivateOrLocalHostname(hostname: string) {
  const host = hostname.toLowerCase();
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

function sourceUrlSecretTerms(url: URL) {
  const terms: string[] = [];
  if (url.username || url.password) terms.push("url_userinfo");
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_SOURCE_URL_QUERY_KEYS.has(key.toLowerCase())) {
      terms.push(`query:${key}`);
    }
  }
  return terms;
}

function redactSourceUrl(url: URL) {
  const redacted = new URL(url.toString());
  redacted.username = "";
  redacted.password = "";
  for (const key of [...redacted.searchParams.keys()]) {
    if (SENSITIVE_SOURCE_URL_QUERY_KEYS.has(key.toLowerCase())) {
      redacted.searchParams.set(key, "<redacted>");
    }
  }
  return redacted.toString();
}

function isTextualSourceContentType(contentType: string) {
  const value = contentType.toLowerCase().split(";")[0]?.trim() || "";
  return (
    value.startsWith("text/") ||
    value === "application/json" ||
    value === "application/ld+json" ||
    value === "application/xml" ||
    value === "application/xhtml+xml" ||
    value === "application/rss+xml" ||
    value === "application/atom+xml" ||
    value === "application/javascript" ||
    value === "application/x-javascript" ||
    value === "application/yaml" ||
    value === "application/x-yaml"
  );
}

function connectorSourceUrlGate(
  connector: NonNullable<ReturnType<typeof connectorById>>,
  url: URL,
) {
  const secretTerms = sourceUrlSecretTerms(url);
  if (secretTerms.length) {
    return {
      ok: false,
      reason: "source_url_embedded_secret_blocked",
      policy: "blocked",
      risk_profile: "secret_leakage",
      matched_terms: secretTerms,
      source_url_redacted: redactSourceUrl(url),
    };
  }

  if (isPrivateOrLocalHostname(url.hostname)) {
    return {
      ok: false,
      reason: "source_url_private_network_blocked",
      policy: "blocked",
      risk_profile: "server_side_request_forgery",
      matched_terms: [url.hostname],
    };
  }

  const assessment = classifyConnector({
    name: connector.name,
    description: connector.risk_profile,
    source_url: url.toString(),
  });
  const blocked =
    assessment.policy === "blocked" ||
    assessment.policy === "blocked_or_explicit_warning" ||
    assessment.risk_profile === "marketplace_or_hosted_actor";
  return {
    ...assessment,
    ok: !blocked,
    reason: blocked ? assessment.reason : "source_url_allowed_for_health_check",
  };
}

function connectorById(id: string) {
  return CURATED_CONNECTORS.find((connector) => connector.id === id);
}

function connectorForResponse(connector: NonNullable<ReturnType<typeof connectorById>>) {
  return {
    ...connector,
    tool_contract: connectorToolContract(connector),
  };
}

function secretPresence(requiredSecrets: readonly string[]) {
  return requiredSecrets.map((secret) => ({
    name: secret,
    present: Boolean(process.env[secret]),
  }));
}

function connectorToolContract(connector: NonNullable<ReturnType<typeof connectorById>>) {
  const provider =
    connector.trust_tier >= 2
      ? "external_api"
      : connector.install_mode.includes("local") || connector.install_mode.includes("built_in")
        ? "local"
        : "user_mcp";
  const requiresAccount = connector.required_secrets.length > 0;
  const dataLeavesDevice = connector.data_egress.length > 0;
  return {
    schema: "musu.tool_contract.v1",
    provider,
    requires_account: requiresAccount,
    data_leaves_device: dataLeavesDevice,
    data_egress: connector.data_egress,
    risk: connector.risk_profile,
    default_enabled: connector.trust_tier === 0 && !requiresAccount && !dataLeavesDevice,
    run_policy:
      requiresAccount || dataLeavesDevice
        ? "explicit_user_enablement_required"
        : "local_first",
    disclosure:
      requiresAccount || dataLeavesDevice
        ? "Show account, scope, data egress, cost, and proof before running."
        : "Local-first tool: no third-party account or hidden egress.",
  };
}

function connectorRiskLedger(connector: NonNullable<ReturnType<typeof connectorById>>) {
  const toolContract = connectorToolContract(connector);
  return [
    {
      dimension: "source",
      requirement: "known source/provenance before recommendation",
      status: connector.install_mode.includes("local") || connector.install_mode.includes("built_in")
        ? "local_or_built_in"
        : "review_required",
      evidence: connector.install_mode,
    },
    {
      dimension: "license",
      requirement: "license or provider terms must be reviewable before install/use",
      status: connector.trust_tier <= 1 ? "review_required" : "provider_terms_required",
      evidence: connector.trust_tier <= 1 ? "curated source must retain license proof" : "provider account terms apply",
    },
    {
      dimension: "secrets",
      requirement: "only scoped user-owned credentials; no shared marketplace keys",
      status: toolContract.requires_account ? "scoped_secret_required" : "no_secret_required",
      evidence: connector.required_secrets,
    },
    {
      dimension: "egress",
      requirement: "all data leaving the device is disclosed before use",
      status: toolContract.data_leaves_device ? "egress_declared" : "local_only",
      evidence: connector.data_egress,
    },
    {
      dimension: "cost",
      requirement: "paid or metered third-party usage cannot be hidden",
      status: connector.trust_tier >= 2 ? "provider_cost_review_required" : "no_hosted_actor_cost",
      evidence: connector.trust_tier >= 2 ? "user-owned provider account" : "local/curated connector lane",
    },
    {
      dimension: "proof",
      requirement: "health check proof must exist before first success claim",
      status: connector.proof_required ? "required" : "not_required",
      evidence: connector.health_check,
    },
  ];
}

function connectorApprovalGate(
  connector: NonNullable<ReturnType<typeof connectorById>>,
  result: "success" | "failed" | "not_run" = "not_run",
) {
  const toolContract = connectorToolContract(connector);
  const secrets = secretPresence(connector.required_secrets);
  const missingSecrets = secrets.filter((secret) => !secret.present).map((secret) => secret.name);
  const healthCheckPassed = result === "success";
  const allowed = healthCheckPassed && missingSecrets.length === 0;
  return {
    allowed_to_recommend_or_run: allowed,
    state: allowed ? "approved" : healthCheckPassed ? "held_for_review" : "blocked_until_proven",
    required_before_use: [
      ...missingSecrets.map((secret) => `configure scoped secret ${secret}`),
      ...(toolContract.data_leaves_device ? ["confirm data egress boundary and provider terms"] : []),
      ...(healthCheckPassed ? [] : [`pass health check ${connector.health_check}`]),
      "preserve deterministic retry payload",
      "record proof artifact with source, egress, secrets, and result",
    ],
  };
}

function buildConnectorProofPlan(id: string) {
  const connector = connectorById(id);
  if (!connector) {
    return {
      schema: "musu.connector_proof_plan.v1",
      ok: false,
      error: "unknown_connector",
      id,
      available_connectors: CURATED_CONNECTORS.map((item) => item.id),
    };
  }

  const secrets = secretPresence(connector.required_secrets);
  const missingSecrets = secrets.filter((secret) => !secret.present).map((secret) => secret.name);
  const readiness = missingSecrets.length ? "credentials_required" : "ready_for_health_check";

  return {
    schema: "musu.connector_proof_plan.v1",
    ok: true,
    connector,
    tool_contract: connectorToolContract(connector),
    risk_ledger: connectorRiskLedger(connector),
    approval_gate: connectorApprovalGate(connector),
    readiness,
    missing_secrets: missingSecrets,
    secret_checks: secrets,
    install_plan: [
      `Confirm source/provenance for ${connector.name}.`,
      `Review default policy: ${connector.default_policy}.`,
      connector.required_secrets.length
        ? `Configure scoped user-owned secrets: ${connector.required_secrets.join(", ")}.`
        : "No secret required before local health check.",
      `Run health check: ${connector.health_check}.`,
      "Capture proof artifact before first user-facing success claim.",
    ],
    proof_artifact: {
      schema: "musu.connector_proof.v1",
      required_fields: [
        "connector_id",
        "connector_name",
        "health_check",
        "data_egress",
        "required_secrets_present",
        "proof_recorded_at",
        "result",
      ],
      must_not_claim_success_until: "health_check_passed_and_proof_artifact_captured",
    },
    retry_contract: {
      deterministic: true,
      preserve: ["order", "target", "connector_id", "input_payload"],
      forbidden: ["re-read mutable dropdown", "silently switch connector", "silently switch machine"],
    },
    revoke_plan: connector.required_secrets.length
      ? [
          "Remove stored token from MUSU secret storage.",
          "Revoke token/OAuth grant at the provider.",
          "Run health check again and verify it fails closed.",
        ]
      : ["Disable connector entry and remove local proof cache if present."],
  };
}

function connectorProofArtifact(
  connector: NonNullable<ReturnType<typeof connectorById>>,
  result: "success" | "failed" | "not_run",
  fields: Record<string, unknown> = {},
) {
  const secrets = secretPresence(connector.required_secrets);
  return {
    schema: "musu.connector_proof.v1",
    connector_id: connector.id,
    connector_name: connector.name,
    tool_contract: connectorToolContract(connector),
    health_check: connector.health_check,
    data_egress: connector.data_egress,
    risk_ledger: connectorRiskLedger(connector),
    approval_gate: connectorApprovalGate(connector, result),
    required_secrets_present: secrets.every((secret) => secret.present),
    proof_recorded_at: nowIso(),
    result,
    ...fields,
  };
}

async function runUrlFetchHealthCheck(
  connector: NonNullable<ReturnType<typeof connectorById>>,
  sourceUrl: string,
) {
  const url = safeHttpUrl(sourceUrl);
  if (!url) {
    return {
      ok: false,
      readiness: "source_url_required",
      proof: connectorProofArtifact(connector, "not_run", {
        error: "source_url_must_be_http_or_https",
      }),
    };
  }

  const sourceGate = connectorSourceUrlGate(connector, url);
  if (!sourceGate.ok) {
    return {
      ok: false,
      readiness: "source_url_blocked",
      proof: connectorProofArtifact(connector, "not_run", {
        source_url: sourceGate.source_url_redacted || url.toString(),
        error: sourceGate.reason,
        source_gate: sourceGate,
      }),
    };
  }

  // The string-based gate above cannot catch a public hostname that RESOLVES to
  // a private/metadata IP. Resolve and block if ANY resolved address is
  // private/loopback/link-local/ULA (IPv4 + IPv6 + IPv4-mapped). Residual: this
  // is the gate's own lookup; fetch() resolves independently, so a true DNS-
  // rebinding attacker (public on this lookup, private on fetch's) is NOT
  // blocked — accepted for the connector health-check use case (low likelihood,
  // owner-triggered, read-only). Full defeat needs IP-pinning the fetch.
  const resolvedBlock = await resolvedHostIsPrivate(url.hostname);
  if (resolvedBlock) {
    return {
      ok: false,
      readiness: "source_url_blocked",
      proof: connectorProofArtifact(connector, "not_run", {
        source_url: url.toString(),
        error: "source_url_resolves_to_private_network_blocked",
        source_gate: {
          ok: false,
          reason: "source_url_resolves_to_private_network_blocked",
          policy: "blocked",
          risk_profile: "server_side_request_forgery",
          matched_terms: [resolvedBlock],
        },
      }),
    };
  }

  try {
    const res = await fetch(url, {
      headers: { Accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.1" },
      signal: AbortSignal.timeout(5000),
    });
    const contentType = res.headers.get("content-type") || "";
    if (res.ok && !isTextualSourceContentType(contentType)) {
      return {
        ok: false,
        readiness: "health_check_failed",
        proof: connectorProofArtifact(connector, "failed", {
          source_url: url.toString(),
          status: res.status,
          content_type: contentType,
          error: "unsupported_source_content_type",
        }),
      };
    }
    const text = await res.text();
    const sample = text.slice(0, 65536);
    const proof = connectorProofArtifact(connector, res.ok ? "success" : "failed", {
      source_url: url.toString(),
      status: res.status,
      content_type: contentType,
      body_sample_bytes: sample.length,
      body_sample_sha256: sha256(sample),
    });
    return {
      ok: res.ok,
      readiness: res.ok ? "proof_captured" : "health_check_failed",
      proof,
    };
  } catch (err) {
    return {
      ok: false,
      readiness: "health_check_failed",
      proof: connectorProofArtifact(connector, "failed", {
        source_url: url.toString(),
        error: String(err),
      }),
    };
  }
}

async function runOpenApiHealthCheck(
  connector: NonNullable<ReturnType<typeof connectorById>>,
  sourceUrl: string,
) {
  const url = safeHttpUrl(sourceUrl);
  if (!url) {
    return {
      ok: false,
      readiness: "source_url_required",
      proof: connectorProofArtifact(connector, "not_run", {
        error: "source_url_must_be_http_or_https",
      }),
    };
  }

  const sourceGate = connectorSourceUrlGate(connector, url);
  if (!sourceGate.ok) {
    return {
      ok: false,
      readiness: "source_url_blocked",
      proof: connectorProofArtifact(connector, "not_run", {
        source_url: sourceGate.source_url_redacted || url.toString(),
        error: sourceGate.reason,
        source_gate: sourceGate,
      }),
    };
  }

  const resolvedBlock = await resolvedHostIsPrivate(url.hostname);
  if (resolvedBlock) {
    return {
      ok: false,
      readiness: "source_url_blocked",
      proof: connectorProofArtifact(connector, "not_run", {
        source_url: url.toString(),
        error: "source_url_resolves_to_private_network_blocked",
        source_gate: {
          ok: false,
          reason: "source_url_resolves_to_private_network_blocked",
          policy: "blocked",
          risk_profile: "server_side_request_forgery",
          matched_terms: [resolvedBlock],
        },
      }),
    };
  }

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json,text/yaml,text/plain;q=0.9,*/*;q=0.1" },
      signal: AbortSignal.timeout(5000),
    });
    const contentType = res.headers.get("content-type") || "";
    if (res.ok && !isTextualSourceContentType(contentType)) {
      return {
        ok: false,
        readiness: "health_check_failed",
        proof: connectorProofArtifact(connector, "failed", {
          source_url: url.toString(),
          status: res.status,
          content_type: contentType,
          error: "unsupported_source_content_type",
        }),
      };
    }
    const text = await res.text();
    const sample = text.slice(0, 65536);
    let valid = false;
    let detected = "unknown";
    if (res.ok) {
      try {
        const json = JSON.parse(text) as { openapi?: unknown; swagger?: unknown; paths?: unknown };
        valid =
          (typeof json.openapi === "string" || typeof json.swagger === "string") &&
          typeof json.paths === "object";
        detected =
          typeof json.openapi === "string"
            ? `openapi:${json.openapi}`
            : typeof json.swagger === "string"
              ? `swagger:${json.swagger}`
              : "json";
      } catch {
        valid = /(^|\n)\s*openapi\s*:/i.test(text) && /(^|\n)\s*paths\s*:/i.test(text);
        detected = valid ? "yaml_openapi" : "text";
      }
    }
    const finalResult = res.ok && valid ? "success" : "failed";
    return {
      ok: finalResult === "success",
      readiness: finalResult === "success" ? "proof_captured" : "health_check_failed",
      proof: connectorProofArtifact(connector, finalResult, {
        source_url: url.toString(),
        status: res.status,
        content_type: contentType,
        body_sample_bytes: sample.length,
        body_sample_sha256: sha256(sample),
        openapi_detected: detected,
        openapi_schema_valid: valid,
      }),
    };
  } catch (err) {
    return {
      ok: false,
      readiness: "health_check_failed",
      proof: connectorProofArtifact(connector, "failed", {
        source_url: url.toString(),
        error: String(err),
      }),
    };
  }
}

function runMcpValidatorHealthCheck(connector: NonNullable<ReturnType<typeof connectorById>>) {
  const names = new Set<string>();
  const failures: string[] = [];
  for (const tool of TOOLS) {
    if (!tool.name) failures.push("tool_name_missing");
    if (names.has(tool.name)) failures.push(`duplicate_tool:${tool.name}`);
    names.add(tool.name);
    if (!tool.description) failures.push(`description_missing:${tool.name}`);
    if (!tool.inputSchema || typeof tool.inputSchema !== "object") {
      failures.push(`input_schema_missing:${tool.name}`);
    }
  }
  const ok = failures.length === 0;
  return {
    ok,
    readiness: ok ? "proof_captured" : "health_check_failed",
    proof: connectorProofArtifact(connector, ok ? "success" : "failed", {
      validated_server: "musu_mcp_self",
      tool_count: TOOLS.length,
      failures,
      tool_names_sha256: sha256(TOOLS.map((tool) => tool.name).sort().join("\n")),
    }),
  };
}

async function runCredentialConnectorHealthCheck(
  connector: NonNullable<ReturnType<typeof connectorById>>,
) {
  const secretChecks = secretPresence(connector.required_secrets);
  const missingSecrets = secretChecks.filter((secret) => !secret.present).map((secret) => secret.name);
  if (missingSecrets.length) {
    return {
      ok: false,
      readiness: "credentials_required",
      missing_secrets: missingSecrets,
      proof: connectorProofArtifact(connector, "not_run", {
        error: "missing_required_secrets",
      }),
    };
  }

  if (connector.id === "github") {
    const endpoint = "https://api.github.com/user";
    try {
      const res = await fetch(endpoint, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(5000),
      });
      return {
        ok: res.ok,
        readiness: res.ok ? "proof_captured" : "health_check_failed",
        proof: connectorProofArtifact(connector, res.ok ? "success" : "failed", {
          status: res.status,
          endpoint,
          secret_names_checked: connector.required_secrets,
        }),
      };
    } catch (err) {
      return {
        ok: false,
        readiness: "health_check_failed",
        proof: connectorProofArtifact(connector, "failed", {
          endpoint,
          error: String(err),
          secret_names_checked: connector.required_secrets,
        }),
      };
    }
  }

  return {
    ok: false,
    readiness: "manual_health_check_required",
    proof: connectorProofArtifact(connector, "not_run", {
      error: "health_check_runner_not_implemented",
    }),
  };
}

function classifyConnector(params: ConnectorPolicyParams) {
  const name = textParam(params.name);
  const description = textParam(params.description);
  const sourceUrl = textParam(params.source_url);
  const haystack = `${name} ${description} ${sourceUrl}`.toLowerCase();
  const matched: Array<{ term: string; policy: string; riskProfile: string }> = [];

  if (
    marketplaceCatalogIndexSignal(sourceUrl) ||
    marketplaceCatalogIndexSignal(haystack)
  ) {
    return {
      policy: "blocked_or_explicit_warning",
      risk_profile: "marketplace_catalog_index",
      reason: "Generated affiliate/API marketplace indexes are discovery-only; MUSU must not import them or use them as connector proof sources.",
      matched_terms: ["marketplace_catalog_index"],
    };
  }

  for (const rule of RISK_RULES.filter((item) => item.policy !== "allow_with_source_url")) {
    for (const term of rule.terms) {
      if (haystack.includes(term)) {
        matched.push({ term, policy: rule.policy, riskProfile: rule.riskProfile });
      }
    }
    if (matched.some((m) => m.policy === rule.policy && m.riskProfile === rule.riskProfile)) {
      return {
        policy: rule.policy,
        risk_profile: rule.riskProfile,
        reason: rule.reason,
        matched_terms: matched.map((m) => m.term),
      };
    }
  }

  if (/apify\.com|fpr=|actor/i.test(sourceUrl)) {
    return {
      policy: "blocked_or_explicit_warning",
      risk_profile: "marketplace_or_hosted_actor",
      reason: "Marketplace or affiliate actor links stay discovery-only; MUSU will not fetch them as connector proof sources.",
      matched_terms: ["marketplace"],
    };
  }

  for (const rule of RISK_RULES.filter((item) => item.policy === "allow_with_source_url")) {
    for (const term of rule.terms) {
      if (haystack.includes(term)) {
        matched.push({ term, policy: rule.policy, riskProfile: rule.riskProfile });
      }
    }
    if (matched.some((m) => m.policy === rule.policy && m.riskProfile === rule.riskProfile)) {
      return {
        policy: rule.policy,
        risk_profile: rule.riskProfile,
        reason: rule.reason,
        matched_terms: matched.map((m) => m.term),
      };
    }
  }

  if (/github\.com|docs\.|developer\.|api\./i.test(sourceUrl)) {
    return {
      policy: "allow_with_user_owned_credential",
      risk_profile: "official_or_reviewable_source",
      reason: "Reviewable source or official docs can proceed only after license/source, required secrets, health check, and proof contract are known.",
      matched_terms: [],
    };
  }

  return {
    policy: "warn",
    risk_profile: "unknown_external_connector",
    reason: "Unknown external connectors must not be recommended until source, license, secrets, egress, cost, and health check are known.",
    matched_terms: [],
  };
}

export function handleGetConnectorProofPlan(params: ConnectorProofPlanParams = {}) {
  const id = textParam(params.id);
  if (!id) {
    return {
      schema: "musu.connector_proof_plan.v1",
      ok: false,
      error: "id_required",
      available_connectors: CURATED_CONNECTORS.map((connector) => connector.id),
    };
  }
  return buildConnectorProofPlan(id);
}

export async function handleRunConnectorHealthCheck(params: ConnectorHealthCheckParams = {}) {
  const id = textParam(params.id);
  if (!id) {
    return {
      schema: "musu.connector_health_check.v1",
      ok: false,
      error: "id_required",
      available_connectors: CURATED_CONNECTORS.map((connector) => connector.id),
    };
  }
  const connector = connectorById(id);
  if (!connector) {
    return {
      schema: "musu.connector_health_check.v1",
      ok: false,
      error: "unknown_connector",
      id,
      available_connectors: CURATED_CONNECTORS.map((item) => item.id),
    };
  }

  const sourceUrl = textParam(params.source_url);
  let result:
    | Awaited<ReturnType<typeof runUrlFetchHealthCheck>>
    | Awaited<ReturnType<typeof runOpenApiHealthCheck>>
    | ReturnType<typeof runMcpValidatorHealthCheck>
    | Awaited<ReturnType<typeof runCredentialConnectorHealthCheck>>;
  if (connector.id === "website-to-markdown") {
    result = await runUrlFetchHealthCheck(connector, sourceUrl);
  } else if (connector.id === "openapi-to-mcp") {
    result = await runOpenApiHealthCheck(connector, sourceUrl);
  } else if (connector.id === "mcp-validator") {
    result = runMcpValidatorHealthCheck(connector);
  } else if (connector.required_secrets.length) {
    result = await runCredentialConnectorHealthCheck(connector);
  } else {
    result = {
      ok: false,
      readiness: "manual_health_check_required",
      proof: connectorProofArtifact(connector, "not_run", {
        error: "health_check_runner_not_implemented",
      }),
    };
  }

  return {
    schema: "musu.connector_health_check.v1",
    connector_id: connector.id,
    ...result,
  };
}

export function handleListConnectors(params: ConnectorListParams = {}) {
  const category = textParam(params.category);
  const riskProfile = textParam(params.risk_profile);
  const trustTier =
    typeof params.trust_tier === "number" && Number.isInteger(params.trust_tier)
      ? params.trust_tier
      : null;
  const connectors = CURATED_CONNECTORS.filter((connector) => {
    if (category && connector.category !== category) return false;
    if (riskProfile && connector.risk_profile !== riskProfile) return false;
    if (trustTier !== null && connector.trust_tier !== trustTier) return false;
    return true;
  });

  return {
    schema: "musu.connector_registry.v1",
    posture: "curated_not_marketplace",
    connectors: connectors.map(connectorForResponse),
    count: connectors.length,
    required_next_step:
      "Before install/use, run the connector health check and capture a proof artifact.",
  };
}

export function handleGetConnectorPolicy(params: ConnectorPolicyParams = {}) {
  const hasCandidate = Boolean(
    textParam(params.name) || textParam(params.description) || textParam(params.source_url)
  );

  return {
    schema: "musu.connector_policy.v1",
    default_posture: "local_first_curated_connectors_only",
    direct_catalog_import: "forbidden",
    marketplace_catalogs: "discovery_only",
    trust_tiers: TRUST_TIERS,
    required_connector_contract: [
      "known source and license/provenance",
      "explicit required secrets and revocation path",
      "explicit data egress and cost model",
      "health check before first use",
      "proof artifact after first successful use",
      "deterministic retry payload: same order, target, connector, and input",
      "failure must surface actual cause without silent fallback",
    ],
    blocked_by_default: [
      "credential theft or password extraction",
      "captcha/bypass/stealth/evasion automation",
      "view generation or artificial engagement",
      "unauthorized mass personal-data scraping",
      "phone/email/lead/social-profile scraping without explicit lawful basis",
      "media downloading where rights are unclear",
    ],
    safe_near_term_connectors: [
      "local browser automation with screenshots and logs",
      "website-to-markdown with source URL provenance",
      "document/PDF-to-markdown extraction",
      "official docs/search through user-owned keys or official APIs",
      "OpenAPI-to-MCP generator with proof call",
      "MCP validator/stress tester",
      "GitHub/Slack/Google/Notion/Jira/Linear through scoped user credentials",
    ],
    curated_registry: CURATED_CONNECTORS.map(connectorForResponse),
    candidate_assessment: hasCandidate ? classifyConnector(params) : null,
  };
}
