import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { before, after, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

type Module = {
  GET: () => Promise<Response>;
  POST: (req: NextRequest) => Promise<Response>;
};
let GET: Module["GET"];
let POST: Module["POST"];

let wikiDbPath: string;

before(async () => {
  // Tasks: in-memory SQLite (tasks.ts has singleton, creates tables itself)
  process.env.MUSU_TASKS_DB = ":memory:";

  // Wiki: temp file (wiki.ts creates a new connection per call, no table init)
  wikiDbPath = join(tmpdir(), `mcp-wiki-test-${Date.now()}.db`);
  const wikiDb = new DatabaseSync(wikiDbPath);
  wikiDb.exec(`
    CREATE TABLE IF NOT EXISTS wiki_pages (
      id TEXT PRIMARY KEY, scope TEXT NOT NULL, title TEXT NOT NULL,
      summary TEXT, key_points TEXT, evidence TEXT, related TEXT,
      open_questions TEXT, source_raw TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS wiki_scope_idx ON wiki_pages(scope);
    CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(id, scope, title, summary, key_points);
  `);
  wikiDb.close();
  process.env.MUSU_WIKI_DB = wikiDbPath;

  process.env.MUSU_PORT_URL = "http://port.test";
  process.env.MUSU_BRIDGE_URL = "http://bridge.test";

  ({ GET, POST } = (await import("./route")) as Module);
});

after(() => {
  try { unlinkSync(wikiDbPath); } catch { /* ignore */ }
});

function withFetchMock(
  mockFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>
) {
  const orig = globalThis.fetch;
  globalThis.fetch = mockFn as typeof fetch;
  return fn().finally(() => { globalThis.fetch = orig; });
}

function rpcReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/mcp", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// ── GET ──────────────────────────────────────────────────────────────────────

test("GET → MCP metadata + tools 배열", async () => {
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json() as { name: string; tools: Array<{ name: string }> };
  assert.equal(body.name, "MUSU MCP Server");
  assert.ok(Array.isArray(body.tools));
  assert.ok(body.tools.length > 0);
  assert.ok(body.tools.some((tool) => tool.name === "musu_get_network_runbook"));
  assert.ok(body.tools.some((tool) => tool.name === "musu_get_connector_policy"));
  assert.ok(body.tools.some((tool) => tool.name === "musu_list_connectors"));
  assert.ok(body.tools.some((tool) => tool.name === "musu_get_connector_proof_plan"));
  assert.ok(body.tools.some((tool) => tool.name === "musu_run_connector_health_check"));
});

// ── JSON-RPC 유효성 ───────────────────────────────────────────────────────────

test("jsonrpc 버전 누락 → -32600", async () => {
  const res = await POST(rpcReq({ id: 1, method: "musu_get_tasks" }));
  assert.equal(res.status, 400);
  const body = await res.json() as { error: { code: number } };
  assert.equal(body.error.code, -32600);
});

test("method 누락 → -32600", async () => {
  const res = await POST(rpcReq({ jsonrpc: "2.0", id: 1 }));
  assert.equal(res.status, 400);
  const body = await res.json() as { error: { code: number } };
  assert.equal(body.error.code, -32600);
});

test("객체 id → -32600 and id:null", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0",
    id: { nested: "not_allowed" },
    method: "musu_get_tasks",
  }));
  assert.equal(res.status, 400);
  const body = await res.json() as { id: unknown; error: { code: number; message: string } };
  assert.equal(body.id, null);
  assert.equal(body.error.code, -32600);
  assert.equal(body.error.message, "Invalid Request");
});

test("비객체 params → -32600", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0",
    id: 2,
    method: "musu_get_tasks",
    params: "scope=global",
  }));
  assert.equal(res.status, 400);
  const body = await res.json() as { id: number; error: { code: number; message: string } };
  assert.equal(body.id, 2);
  assert.equal(body.error.code, -32600);
  assert.equal(body.error.message, "Invalid Request");
});

test("알 수 없는 method → -32601", async () => {
  const res = await POST(rpcReq({ jsonrpc: "2.0", id: 1, method: "no_such_tool" }));
  assert.equal(res.status, 200);
  const body = await res.json() as { error: { code: number } };
  assert.equal(body.error.code, -32601);
});

// ── musu_get_devices ─────────────────────────────────────────────────────────

test("musu_get_devices → devices 배열", async () => {
  await withFetchMock(
    async () =>
      new Response(
        JSON.stringify({ device_id: "dev-1", cpu: 20, gpu: 40, ram: 30, status: "ok" }),
        { status: 200 }
      ),
    async () => {
      const res = await POST(rpcReq({ jsonrpc: "2.0", id: 1, method: "musu_get_devices" }));
      assert.equal(res.status, 200);
      const body = await res.json() as { result: { devices: unknown[] } };
      assert.ok(Array.isArray(body.result.devices));
      assert.equal(body.result.devices.length, 1);
    }
  );
});

test("musu_get_devices (fetch 실패) → error 포함 응답", async () => {
  await withFetchMock(
    async () => { throw new Error("ECONNREFUSED"); },
    async () => {
      const res = await POST(rpcReq({ jsonrpc: "2.0", id: 1, method: "musu_get_devices" }));
      assert.equal(res.status, 200);
      const body = await res.json() as { result: { error: string; devices: unknown[] } };
      assert.equal(body.result.error, "musu_port_unreachable");
      assert.deepEqual(body.result.devices, []);
    }
  );
});

// ── musu_get_tasks ───────────────────────────────────────────────────────────

test("musu_get_tasks → tasks + count", async () => {
  const res = await POST(rpcReq({ jsonrpc: "2.0", id: 2, method: "musu_get_tasks" }));
  assert.equal(res.status, 200);
  const body = await res.json() as { result: { tasks: unknown[]; count: number } };
  assert.ok(Array.isArray(body.result.tasks));
  assert.equal(typeof body.result.count, "number");
});

// ── musu_create_task ─────────────────────────────────────────────────────────

test("musu_create_task title 없음 → error", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0", id: 3, method: "musu_create_task", params: {}
  }));
  assert.equal(res.status, 200);
  const body = await res.json() as { result: { error: string } };
  assert.equal(body.result.error, "title_required");
});

test("musu_create_task 정상 → task", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0", id: 4, method: "musu_create_task",
    params: { title: "MCP 태스크" },
  }));
  assert.equal(res.status, 200);
  const body = await res.json() as { result: { task: { id: string; title: string } } };
  assert.ok(body.result.task.id);
  assert.equal(body.result.task.title, "MCP 태스크");
});

// ── musu_update_task ─────────────────────────────────────────────────────────

test("musu_update_task id_prefix 없음 → error", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0", id: 5, method: "musu_update_task", params: {}
  }));
  const body = await res.json() as { result: { error: string } };
  assert.equal(body.result.error, "id_prefix_required");
});

// ── musu_send_message ────────────────────────────────────────────────────────

test("musu_send_message → musu-bridge 호출", async () => {
  await withFetchMock(
    async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    async () => {
      const res = await POST(rpcReq({
        jsonrpc: "2.0", id: 6, method: "musu_send_message",
        params: { channel: "general", text: "안녕하세요" },
      }));
      const body = await res.json() as { result: { sent: boolean } };
      assert.equal(body.result.sent, true);
    }
  );
});

test("musu_send_message (bridge 실패) → sent:false", async () => {
  await withFetchMock(
    async () => { throw new Error("ECONNREFUSED"); },
    async () => {
      const res = await POST(rpcReq({
        jsonrpc: "2.0", id: 7, method: "musu_send_message",
        params: { channel: "general", text: "test" },
      }));
      const body = await res.json() as { result: { sent: boolean } };
      assert.equal(body.result.sent, false);
    }
  );
});

// ── musu_search_wiki ─────────────────────────────────────────────────────────

test("musu_search_wiki → results 배열", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0", id: 8, method: "musu_search_wiki",
    params: { query: "테스트" },
  }));
  assert.equal(res.status, 200);
  const body = await res.json() as { result: { results: unknown[] } };
  assert.ok(Array.isArray(body.result.results));
});

// ── musu_get_network_runbook ─────────────────────────────────────────────────

test("musu_get_network_runbook → Headscale 기본 네트워크 계약", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0", id: 9, method: "musu_get_network_runbook",
  }));
  assert.equal(res.status, 200);
  const body = await res.json() as {
    result: {
      default_mode: string;
      forbidden_default: string;
      headscale_runbook: string[];
      constraints: string[];
    };
  };
  const runbook = JSON.stringify(body.result);
  assert.equal(body.result.default_mode, "musu_headscale");
  assert.match(body.result.forbidden_default, /Tailscale\.com signup/);
  assert.match(runbook, /musu mesh bootstrap/);
  assert.match(runbook, /docker compose config --quiet/);
  assert.match(runbook, /check-public-endpoint/);
  assert.match(runbook, /https:\/\/<mesh-host>\/health/);
  assert.match(runbook, /musu\.device_add\.v1/);
  assert.match(runbook, /device-add pass/);
  assert.match(runbook, /device-add-passes/);
  assert.match(runbook, /one_time_key=true/);
  assert.match(runbook, /reusable=false/);
  assert.match(runbook, /created_at_utc/);
  assert.match(runbook, /expires_after_seconds=3600/);
  assert.match(runbook, /300 seconds in the future/);
  assert.match(runbook, /clock skew cannot extend the one-hour window/);
  assert.match(runbook, /must not print the raw pass JSON/);
  assert.match(runbook, /raw Headscale preauth-key/);
  assert.match(runbook, /musu mesh join --device-add-pass <musu\.device_add\.v1\.json>/);
  assert.match(runbook, /do not paste the secret-bearing JSON inline into a shell command/);
  assert.match(runbook, /redacted/);
  assert.match(runbook, /\.used-<timestamp>/);
  assert.match(runbook, /musu\.device_add\.consumed\.v1/);
  assert.match(runbook, /deletes the original secret-bearing pass file/);
  assert.match(runbook, /device_add_pass_cleanup_error/);
  assert.doesNotMatch(runbook, /underlying exact `musu mesh join` command/);
  assert.doesNotMatch(runbook, /musu mesh join --login-server .*--authkey/);
  assert.match(runbook, /control_server_verified=true/);
  assert.match(runbook, /--skip-control-health/);
  assert.match(runbook, /run-private-mesh-release-proof/);
  assert.match(runbook, /PhysicalPeerEvidencePath/);
  assert.match(runbook, /physical peer evidence/i);
  assert.match(runbook, /target hostname/i);
  assert.match(runbook, /source_hostname/);
  assert.match(runbook, /target_hostname/);
  assert.match(runbook, /physical_host_distinct=true/);
  assert.match(runbook, /release_evidence_trusted=true/);
  assert.match(runbook, /verify-private-mesh-release-proof-bundle/);
  assert.match(runbook, /private-mesh-release-proof\.bundle-manifest\.json/);
  assert.match(runbook, /musu\.private_mesh_release_proof_bundle\.v1/);
  assert.match(runbook, /fail_count=0/);
  assert.match(runbook, /archive-private-mesh-release-proof-bundle/);
  assert.match(runbook, /private-mesh-release-proof\.archive\.json/);
  assert.match(runbook, /musu\.private_mesh_release_proof_archive\.v1/);
  assert.match(runbook, /archive_zip_path/);
  assert.match(runbook, /bundle_manifest_ok=true/);
  assert.match(runbook, /bundle_manifest_fail_count=0/);
  assert.match(runbook, /verify-private-mesh-route-proof-evidence/);
  assert.match(runbook, /no Tailscale\.com account/i);
  assert.match(runbook, /BSD-3-Clause/);
});

test("musu_get_connector_policy → local-first curated connector contract", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0", id: 10, method: "musu_get_connector_policy",
  }));
  assert.equal(res.status, 200);
  const body = await res.json() as {
    result: {
      default_posture: string;
      direct_catalog_import: string;
      marketplace_catalogs: string;
      required_connector_contract: string[];
      blocked_by_default: string[];
      safe_near_term_connectors: string[];
      curated_registry: Array<{
        id: string;
        proof_required: boolean;
        tool_contract: {
          schema: string;
          provider: string;
          requires_account: boolean;
          data_leaves_device: boolean;
          run_policy: string;
        };
      }>;
      candidate_assessment: null;
    };
  };
  const policy = JSON.stringify(body.result);
  assert.equal(body.result.default_posture, "local_first_curated_connectors_only");
  assert.equal(body.result.direct_catalog_import, "forbidden");
  assert.equal(body.result.marketplace_catalogs, "discovery_only");
  assert.match(policy, /deterministic retry payload/);
  assert.match(policy, /data egress/);
  assert.match(policy, /captcha\/bypass\/stealth\/evasion/);
  assert.match(policy, /OpenAPI-to-MCP/);
  assert.ok(body.result.curated_registry.some((connector) => connector.id === "openapi-to-mcp"));
  assert.ok(body.result.curated_registry.every((connector) => connector.proof_required === true));
  assert.ok(body.result.curated_registry.every((connector) => connector.tool_contract.schema === "musu.tool_contract.v1"));
  assert.ok(body.result.curated_registry.some((connector) => connector.tool_contract.run_policy === "local_first"));
  assert.ok(body.result.curated_registry.some((connector) => connector.tool_contract.run_policy === "explicit_user_enablement_required"));
  assert.equal(body.result.candidate_assessment, null);
});

test("musu_list_connectors → curated registry with trust, egress, health, and proof", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0",
    id: 12,
    method: "musu_list_connectors",
    params: { category: "work-apps" },
  }));
  assert.equal(res.status, 200);
  const body = await res.json() as {
    result: {
      schema: string;
      posture: string;
      count: number;
      connectors: Array<{
        id: string;
        trust_tier: number;
        required_secrets: string[];
        data_egress: string[];
        health_check: string;
        proof_required: boolean;
        tool_contract: {
          schema: string;
          provider: string;
          requires_account: boolean;
          data_leaves_device: boolean;
          default_enabled: boolean;
          run_policy: string;
        };
      }>;
    };
  };
  assert.equal(body.result.schema, "musu.connector_registry.v1");
  assert.equal(body.result.posture, "curated_not_marketplace");
  assert.ok(body.result.count >= 3);
  assert.ok(body.result.connectors.every((connector) => connector.trust_tier === 2));
  assert.ok(body.result.connectors.some((connector) => connector.id === "github"));
  assert.ok(body.result.connectors.some((connector) => connector.required_secrets.length > 0));
  assert.ok(body.result.connectors.every((connector) => connector.health_check));
  assert.ok(body.result.connectors.every((connector) => connector.proof_required === true));
  const github = body.result.connectors.find((connector) => connector.id === "github");
  assert.equal(github?.tool_contract.schema, "musu.tool_contract.v1");
  assert.equal(github?.tool_contract.provider, "external_api");
  assert.equal(github?.tool_contract.requires_account, true);
  assert.equal(github?.tool_contract.data_leaves_device, true);
  assert.equal(github?.tool_contract.run_policy, "explicit_user_enablement_required");
});

test("musu_get_connector_proof_plan → readiness, missing secrets, retry and revoke contract", async () => {
  const oldGithubToken = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  try {
    const res = await POST(rpcReq({
      jsonrpc: "2.0",
      id: 13,
      method: "musu_get_connector_proof_plan",
      params: { id: "github" },
    }));
    assert.equal(res.status, 200);
    const body = await res.json() as {
      result: {
        schema: string;
        ok: boolean;
        readiness: string;
        missing_secrets: string[];
        tool_contract: {
          schema: string;
          provider: string;
          requires_account: boolean;
          data_leaves_device: boolean;
          run_policy: string;
          disclosure: string;
        };
        risk_ledger: Array<{ dimension: string; status: string }>;
        approval_gate: {
          allowed_to_recommend_or_run: boolean;
          state: string;
          required_before_use: string[];
        };
        install_plan: string[];
        proof_artifact: { must_not_claim_success_until: string };
        retry_contract: { deterministic: boolean; preserve: string[]; forbidden: string[] };
        revoke_plan: string[];
      };
    };
    assert.equal(body.result.schema, "musu.connector_proof_plan.v1");
    assert.equal(body.result.ok, true);
    assert.equal(body.result.readiness, "credentials_required");
    assert.deepEqual(body.result.missing_secrets, ["GITHUB_TOKEN"]);
    assert.equal(body.result.tool_contract.schema, "musu.tool_contract.v1");
    assert.equal(body.result.tool_contract.provider, "external_api");
    assert.equal(body.result.tool_contract.requires_account, true);
    assert.equal(body.result.tool_contract.data_leaves_device, true);
    assert.equal(body.result.tool_contract.run_policy, "explicit_user_enablement_required");
    assert.match(body.result.tool_contract.disclosure, /account, scope, data egress, cost, and proof/);
    assert.ok(body.result.risk_ledger.some((item) => item.dimension === "license"));
    assert.ok(body.result.risk_ledger.some((item) => item.dimension === "egress"));
    assert.equal(body.result.approval_gate.allowed_to_recommend_or_run, false);
    assert.equal(body.result.approval_gate.state, "blocked_until_proven");
    assert.ok(body.result.approval_gate.required_before_use.includes("configure scoped secret GITHUB_TOKEN"));
    assert.match(JSON.stringify(body.result.install_plan), /Run health check: get_authenticated_user/);
    assert.equal(
      body.result.proof_artifact.must_not_claim_success_until,
      "health_check_passed_and_proof_artifact_captured"
    );
    assert.equal(body.result.retry_contract.deterministic, true);
    assert.ok(body.result.retry_contract.preserve.includes("connector_id"));
    assert.ok(body.result.retry_contract.forbidden.includes("silently switch machine"));
    assert.match(JSON.stringify(body.result.revoke_plan), /Revoke token/);
  } finally {
    if (oldGithubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = oldGithubToken;
    }
  }
});

test("musu_run_connector_health_check captures URL proof artifact", async () => {
  await withFetchMock(
    async () =>
      new Response("# Hello MUSU docs", {
        status: 200,
        headers: { "content-type": "text/markdown" },
      }),
    async () => {
      const res = await POST(rpcReq({
        jsonrpc: "2.0",
        id: 14,
        method: "musu_run_connector_health_check",
        params: { id: "website-to-markdown", source_url: "https://docs.example.test/page" },
      }));
      assert.equal(res.status, 200);
      const body = await res.json() as {
        result: {
          schema: string;
          ok: boolean;
          readiness: string;
          proof: {
            schema: string;
            connector_id: string;
            result: string;
            source_url: string;
            status: number;
            content_type: string;
            body_sample_sha256: string;
            risk_ledger: Array<{ dimension: string; status: string }>;
            approval_gate: {
              allowed_to_recommend_or_run: boolean;
              state: string;
            };
          };
        };
      };
      assert.equal(body.result.schema, "musu.connector_health_check.v1");
      assert.equal(body.result.ok, true);
      assert.equal(body.result.readiness, "proof_captured");
      assert.equal(body.result.proof.schema, "musu.connector_proof.v1");
      assert.equal(body.result.proof.connector_id, "website-to-markdown");
      assert.equal(body.result.proof.result, "success");
      assert.equal(body.result.proof.source_url, "https://docs.example.test/page");
      assert.equal(body.result.proof.status, 200);
      assert.equal(body.result.proof.content_type, "text/markdown");
      assert.match(body.result.proof.body_sample_sha256, /^[a-f0-9]{64}$/);
      assert.ok(body.result.proof.risk_ledger.some((item) => item.dimension === "source"));
      assert.equal(body.result.proof.approval_gate.allowed_to_recommend_or_run, true);
      assert.equal(body.result.proof.approval_gate.state, "approved");
    }
  );
});

test("musu_run_connector_health_check rejects binary source content before approval", async () => {
  await withFetchMock(
    async () =>
      new Response(new Uint8Array([0, 1, 2, 3]), {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    async () => {
      const res = await POST(rpcReq({
        jsonrpc: "2.0",
        id: 140,
        method: "musu_run_connector_health_check",
        params: { id: "website-to-markdown", source_url: "https://docs.example.test/file.bin" },
      }));
      assert.equal(res.status, 200);
      const body = await res.json() as {
        result: {
          ok: boolean;
          readiness: string;
          proof: {
            result: string;
            source_url: string;
            status: number;
            content_type: string;
            error: string;
            body_sample_sha256?: string;
            approval_gate: {
              allowed_to_recommend_or_run: boolean;
              state: string;
            };
          };
        };
      };
      assert.equal(body.result.ok, false);
      assert.equal(body.result.readiness, "health_check_failed");
      assert.equal(body.result.proof.result, "failed");
      assert.equal(body.result.proof.source_url, "https://docs.example.test/file.bin");
      assert.equal(body.result.proof.status, 200);
      assert.equal(body.result.proof.content_type, "application/octet-stream");
      assert.equal(body.result.proof.error, "unsupported_source_content_type");
      assert.equal(body.result.proof.body_sample_sha256, undefined);
      assert.equal(body.result.proof.approval_gate.allowed_to_recommend_or_run, false);
      assert.equal(body.result.proof.approval_gate.state, "blocked_until_proven");
    }
  );
});

test("musu_run_connector_health_check blocks marketplace actor URLs before fetch", async () => {
  await withFetchMock(
    async () => {
      throw new Error("fetch must not run for marketplace actor URLs");
    },
    async () => {
      const res = await POST(rpcReq({
        jsonrpc: "2.0",
        id: 141,
        method: "musu_run_connector_health_check",
        params: {
          id: "website-to-markdown",
          source_url: "https://apify.com/example/linkedin-lead-scraper?fpr=p2hrc6",
        },
      }));
      assert.equal(res.status, 200);
      const body = await res.json() as {
        result: {
          ok: boolean;
          readiness: string;
          proof: {
            result: string;
            error: string;
            source_gate: {
              policy: string;
              risk_profile: string;
            };
            approval_gate: {
              allowed_to_recommend_or_run: boolean;
              state: string;
            };
          };
        };
      };
      assert.equal(body.result.ok, false);
      assert.equal(body.result.readiness, "source_url_blocked");
      assert.equal(body.result.proof.result, "not_run");
      assert.equal(body.result.proof.source_gate.policy, "blocked_or_explicit_warning");
      assert.equal(body.result.proof.source_gate.risk_profile, "personal_data_scraping");
      assert.equal(body.result.proof.approval_gate.allowed_to_recommend_or_run, false);
      assert.equal(body.result.proof.approval_gate.state, "blocked_until_proven");
    }
  );
});

test("musu_run_connector_health_check blocks marketplace actor URLs even with safe keywords", async () => {
  await withFetchMock(
    async () => {
      throw new Error("fetch must not run for marketplace actor URLs with safe keywords");
    },
    async () => {
      const res = await POST(rpcReq({
        jsonrpc: "2.0",
        id: 145,
        method: "musu_run_connector_health_check",
        params: {
          id: "website-to-markdown",
          source_url: "https://apify.com/example/website-to-markdown?fpr=p2hrc6",
        },
      }));
      assert.equal(res.status, 200);
      const body = await res.json() as {
        result: {
          ok: boolean;
          readiness: string;
          proof: {
            result: string;
            source_gate: {
              policy: string;
              risk_profile: string;
              matched_terms: string[];
            };
            approval_gate: {
              allowed_to_recommend_or_run: boolean;
            };
          };
        };
      };
      assert.equal(body.result.ok, false);
      assert.equal(body.result.readiness, "source_url_blocked");
      assert.equal(body.result.proof.result, "not_run");
      assert.equal(body.result.proof.source_gate.policy, "blocked_or_explicit_warning");
      assert.equal(body.result.proof.source_gate.risk_profile, "marketplace_or_hosted_actor");
      assert.deepEqual(body.result.proof.source_gate.matched_terms, ["marketplace"]);
      assert.equal(body.result.proof.approval_gate.allowed_to_recommend_or_run, false);
    }
  );
});

test("musu_run_connector_health_check blocks generated marketplace catalog indexes before fetch", async () => {
  await withFetchMock(
    async () => {
      throw new Error("fetch must not run for generated marketplace catalog indexes");
    },
    async () => {
      const res = await POST(rpcReq({
        jsonrpc: "2.0",
        id: 146,
        method: "musu_run_connector_health_check",
        params: {
          id: "website-to-markdown",
          source_url: "https://github.com/cporter202/scraping-apis-for-devs",
        },
      }));
      assert.equal(res.status, 200);
      const body = await res.json() as {
        result: {
          ok: boolean;
          readiness: string;
          proof: {
            result: string;
            source_gate: {
              policy: string;
              risk_profile: string;
              matched_terms: string[];
            };
            approval_gate: {
              allowed_to_recommend_or_run: boolean;
            };
          };
        };
      };
      assert.equal(body.result.ok, false);
      assert.equal(body.result.readiness, "source_url_blocked");
      assert.equal(body.result.proof.result, "not_run");
      assert.equal(body.result.proof.source_gate.policy, "blocked_or_explicit_warning");
      assert.equal(body.result.proof.source_gate.risk_profile, "marketplace_catalog_index");
      assert.deepEqual(body.result.proof.source_gate.matched_terms, ["marketplace_catalog_index"]);
      assert.equal(body.result.proof.approval_gate.allowed_to_recommend_or_run, false);
    }
  );
});

test("musu_run_connector_health_check blocks generic marketplace catalog indexes before fetch", async () => {
  await withFetchMock(
    async () => {
      throw new Error("fetch must not run for generic marketplace catalog indexes");
    },
    async () => {
      const res = await POST(rpcReq({
        jsonrpc: "2.0",
        id: 148,
        method: "musu_run_connector_health_check",
        params: {
          id: "website-to-markdown",
          source_url: "https://github.com/example/awesome-scraping-apis",
        },
      }));
      assert.equal(res.status, 200);
      const body = await res.json() as {
        result: {
          ok: boolean;
          readiness: string;
          proof: {
            result: string;
            source_gate: {
              policy: string;
              risk_profile: string;
              matched_terms: string[];
            };
            approval_gate: {
              allowed_to_recommend_or_run: boolean;
            };
          };
        };
      };
      assert.equal(body.result.ok, false);
      assert.equal(body.result.readiness, "source_url_blocked");
      assert.equal(body.result.proof.result, "not_run");
      assert.equal(body.result.proof.source_gate.policy, "blocked_or_explicit_warning");
      assert.equal(body.result.proof.source_gate.risk_profile, "marketplace_catalog_index");
      assert.deepEqual(body.result.proof.source_gate.matched_terms, ["marketplace_catalog_index"]);
      assert.equal(body.result.proof.approval_gate.allowed_to_recommend_or_run, false);
    }
  );
});

test("musu_run_connector_health_check blocks raw generated catalog READMEs before fetch", async () => {
  await withFetchMock(
    async () => {
      throw new Error("fetch must not run for raw generated marketplace catalog READMEs");
    },
    async () => {
      const res = await POST(rpcReq({
        jsonrpc: "2.0",
        id: 147,
        method: "musu_run_connector_health_check",
        params: {
          id: "website-to-markdown",
          source_url:
            "https://raw.githubusercontent.com/cporter202/scraping-apis-for-devs/main/README.md",
        },
      }));
      assert.equal(res.status, 200);
      const body = await res.json() as {
        result: {
          ok: boolean;
          readiness: string;
          proof: {
            result: string;
            source_gate: {
              policy: string;
              risk_profile: string;
              matched_terms: string[];
            };
            approval_gate: {
              allowed_to_recommend_or_run: boolean;
            };
          };
        };
      };
      assert.equal(body.result.ok, false);
      assert.equal(body.result.readiness, "source_url_blocked");
      assert.equal(body.result.proof.result, "not_run");
      assert.equal(body.result.proof.source_gate.policy, "blocked_or_explicit_warning");
      assert.equal(body.result.proof.source_gate.risk_profile, "marketplace_catalog_index");
      assert.deepEqual(body.result.proof.source_gate.matched_terms, ["marketplace_catalog_index"]);
      assert.equal(body.result.proof.approval_gate.allowed_to_recommend_or_run, false);
    }
  );
});

test("musu_run_connector_health_check blocks private network URLs before fetch", async () => {
  await withFetchMock(
    async () => {
      throw new Error("fetch must not run for private network URLs");
    },
    async () => {
      const res = await POST(rpcReq({
        jsonrpc: "2.0",
        id: 142,
        method: "musu_run_connector_health_check",
        params: {
          id: "website-to-markdown",
          source_url: "http://127.0.0.1:8070/private",
        },
      }));
      assert.equal(res.status, 200);
      const body = await res.json() as {
        result: {
          ok: boolean;
          readiness: string;
          proof: {
            result: string;
            error: string;
            source_gate: {
              policy: string;
              risk_profile: string;
              matched_terms: string[];
            };
            approval_gate: {
              allowed_to_recommend_or_run: boolean;
            };
          };
        };
      };
      assert.equal(body.result.ok, false);
      assert.equal(body.result.readiness, "source_url_blocked");
      assert.equal(body.result.proof.result, "not_run");
      assert.equal(body.result.proof.error, "source_url_private_network_blocked");
      assert.equal(body.result.proof.source_gate.policy, "blocked");
      assert.equal(body.result.proof.source_gate.risk_profile, "server_side_request_forgery");
      assert.deepEqual(body.result.proof.source_gate.matched_terms, ["127.0.0.1"]);
      assert.equal(body.result.proof.approval_gate.allowed_to_recommend_or_run, false);
    }
  );
});

test("musu_run_connector_health_check blocks source URLs with embedded secrets before fetch", async () => {
  await withFetchMock(
    async () => {
      throw new Error("fetch must not run for source URLs with embedded secrets");
    },
    async () => {
      const res = await POST(rpcReq({
        jsonrpc: "2.0",
        id: 144,
        method: "musu_run_connector_health_check",
        params: {
          id: "website-to-markdown",
          source_url:
            "https://user:pass@docs.example.test/page?api_key=sk_live_123&x-api-key=sk_live_456&refresh_token=rt_789&topic=ok",
        },
      }));
      assert.equal(res.status, 200);
      const body = await res.json() as {
        result: {
          ok: boolean;
          readiness: string;
          proof: {
            result: string;
            source_url: string;
            error: string;
            source_gate: {
              policy: string;
              risk_profile: string;
              matched_terms: string[];
              source_url_redacted: string;
            };
            approval_gate: {
              allowed_to_recommend_or_run: boolean;
            };
          };
        };
      };
      assert.equal(body.result.ok, false);
      assert.equal(body.result.readiness, "source_url_blocked");
      assert.equal(body.result.proof.result, "not_run");
      assert.equal(body.result.proof.error, "source_url_embedded_secret_blocked");
      assert.equal(body.result.proof.source_gate.policy, "blocked");
      assert.equal(body.result.proof.source_gate.risk_profile, "secret_leakage");
      assert.deepEqual(body.result.proof.source_gate.matched_terms, [
        "url_userinfo",
        "query:api_key",
        "query:x-api-key",
        "query:refresh_token",
      ]);
      assert.equal(
        body.result.proof.source_url,
        "https://docs.example.test/page?api_key=%3Credacted%3E&x-api-key=%3Credacted%3E&refresh_token=%3Credacted%3E&topic=ok"
      );
      assert.equal(body.result.proof.source_url, body.result.proof.source_gate.source_url_redacted);
      assert.doesNotMatch(JSON.stringify(body.result.proof), /sk_live_123|sk_live_456|rt_789|user:pass/);
      assert.equal(body.result.proof.approval_gate.allowed_to_recommend_or_run, false);
    }
  );
});

test("musu_run_connector_health_check does not overblock public hostnames with private-like prefixes", async () => {
  let fetched = false;
  await withFetchMock(
    async () => {
      fetched = true;
      return new Response("public docs", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    },
    async () => {
      const res = await POST(rpcReq({
        jsonrpc: "2.0",
        id: 143,
        method: "musu_run_connector_health_check",
        params: {
          id: "website-to-markdown",
          source_url: "https://fca.example/docs",
        },
      }));
      assert.equal(res.status, 200);
      const body = await res.json() as {
        result: {
          ok: boolean;
          readiness: string;
          proof: {
            result: string;
            source_url: string;
          };
        };
      };
      assert.equal(fetched, true);
      assert.equal(body.result.ok, true);
      assert.equal(body.result.readiness, "proof_captured");
      assert.equal(body.result.proof.result, "success");
      assert.equal(body.result.proof.source_url, "https://fca.example/docs");
    }
  );
});

test("musu_run_connector_health_check validates OpenAPI source before proof", async () => {
  let fetchCount = 0;
  await withFetchMock(
    async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({ openapi: "3.1.0", paths: { "/health": { get: {} } } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    async () => {
      const res = await POST(rpcReq({
        jsonrpc: "2.0",
        id: 15,
        method: "musu_run_connector_health_check",
        params: { id: "openapi-to-mcp", source_url: "https://api.example.test/openapi.json" },
      }));
      assert.equal(res.status, 200);
      const body = await res.json() as {
        result: {
          ok: boolean;
          readiness: string;
          proof: {
            connector_id: string;
            openapi_detected: string;
            openapi_schema_valid: boolean;
            result: string;
            body_sample_sha256: string;
          };
        };
      };
      const expectedBody = JSON.stringify({ openapi: "3.1.0", paths: { "/health": { get: {} } } });
      assert.equal(body.result.ok, true);
      assert.equal(body.result.readiness, "proof_captured");
      assert.equal(fetchCount, 1);
      assert.equal(body.result.proof.connector_id, "openapi-to-mcp");
      assert.equal(body.result.proof.openapi_detected, "openapi:3.1.0");
      assert.equal(body.result.proof.openapi_schema_valid, true);
      assert.equal(body.result.proof.result, "success");
      assert.equal(
        body.result.proof.body_sample_sha256,
        createHash("sha256").update(expectedBody).digest("hex")
      );
    }
  );
});

test("musu_run_connector_health_check does not approve invalid OpenAPI proof after HTTP success", async () => {
  await withFetchMock(
    async () =>
      new Response(JSON.stringify({ message: "not an openapi schema" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    async () => {
      const res = await POST(rpcReq({
        jsonrpc: "2.0",
        id: 151,
        method: "musu_run_connector_health_check",
        params: { id: "openapi-to-mcp", source_url: "https://api.example.test/not-openapi.json" },
      }));
      assert.equal(res.status, 200);
      const body = await res.json() as {
        result: {
          ok: boolean;
          readiness: string;
          proof: {
            result: string;
            openapi_detected: string;
            openapi_schema_valid: boolean;
            approval_gate: {
              allowed_to_recommend_or_run: boolean;
              state: string;
            };
          };
        };
      };
      assert.equal(body.result.ok, false);
      assert.equal(body.result.readiness, "health_check_failed");
      assert.equal(body.result.proof.result, "failed");
      assert.equal(body.result.proof.openapi_detected, "json");
      assert.equal(body.result.proof.openapi_schema_valid, false);
      assert.equal(body.result.proof.approval_gate.allowed_to_recommend_or_run, false);
      assert.equal(body.result.proof.approval_gate.state, "blocked_until_proven");
    }
  );
});

test("musu_run_connector_health_check rejects binary OpenAPI source before proof sampling", async () => {
  await withFetchMock(
    async () =>
      new Response(new Uint8Array([0, 1, 2, 3]), {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    async () => {
      const res = await POST(rpcReq({
        jsonrpc: "2.0",
        id: 152,
        method: "musu_run_connector_health_check",
        params: { id: "openapi-to-mcp", source_url: "https://api.example.test/openapi.bin" },
      }));
      assert.equal(res.status, 200);
      const body = await res.json() as {
        result: {
          ok: boolean;
          readiness: string;
          proof: {
            result: string;
            content_type: string;
            error: string;
            body_sample_sha256?: string;
            openapi_schema_valid?: boolean;
            approval_gate: {
              allowed_to_recommend_or_run: boolean;
              state: string;
            };
          };
        };
      };
      assert.equal(body.result.ok, false);
      assert.equal(body.result.readiness, "health_check_failed");
      assert.equal(body.result.proof.result, "failed");
      assert.equal(body.result.proof.content_type, "application/octet-stream");
      assert.equal(body.result.proof.error, "unsupported_source_content_type");
      assert.equal(body.result.proof.body_sample_sha256, undefined);
      assert.equal(body.result.proof.openapi_schema_valid, undefined);
      assert.equal(body.result.proof.approval_gate.allowed_to_recommend_or_run, false);
      assert.equal(body.result.proof.approval_gate.state, "blocked_until_proven");
    }
  );
});

test("musu_run_connector_health_check validates MUSU MCP tool schema", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0",
    id: 16,
    method: "musu_run_connector_health_check",
    params: { id: "mcp-validator" },
  }));
  assert.equal(res.status, 200);
  const body = await res.json() as {
    result: {
      ok: boolean;
      readiness: string;
      proof: {
        connector_id: string;
        validated_server: string;
        tool_count: number;
        failures: string[];
        tool_names_sha256: string;
      };
    };
  };
  assert.equal(body.result.ok, true);
  assert.equal(body.result.readiness, "proof_captured");
  assert.equal(body.result.proof.connector_id, "mcp-validator");
  assert.equal(body.result.proof.validated_server, "musu_mcp_self");
  assert.ok(body.result.proof.tool_count >= 10);
  assert.deepEqual(body.result.proof.failures, []);
  assert.match(body.result.proof.tool_names_sha256, /^[a-f0-9]{64}$/);
});

test("musu_run_connector_health_check fails closed when connector secret is missing", async () => {
  const oldGithubToken = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  try {
    const res = await POST(rpcReq({
      jsonrpc: "2.0",
      id: 17,
      method: "musu_run_connector_health_check",
      params: { id: "github" },
    }));
    assert.equal(res.status, 200);
    const body = await res.json() as {
      result: {
        ok: boolean;
        readiness: string;
        missing_secrets: string[];
        proof: {
          connector_id: string;
          result: string;
          error: string;
          approval_gate: { allowed_to_recommend_or_run: boolean };
        };
      };
    };
    assert.equal(body.result.ok, false);
    assert.equal(body.result.readiness, "credentials_required");
    assert.deepEqual(body.result.missing_secrets, ["GITHUB_TOKEN"]);
    assert.equal(body.result.proof.connector_id, "github");
    assert.equal(body.result.proof.result, "not_run");
    assert.equal(body.result.proof.error, "missing_required_secrets");
    assert.equal(body.result.proof.approval_gate.allowed_to_recommend_or_run, false);
  } finally {
    if (oldGithubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = oldGithubToken;
    }
  }
});

test("musu_run_connector_health_check records provider fetch failures as failed proof", async () => {
  const oldGithubToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "ghp_test_token";
  try {
    await withFetchMock(
      async () => {
        throw new Error("network down");
      },
      async () => {
        const res = await POST(rpcReq({
          jsonrpc: "2.0",
          id: 18,
          method: "musu_run_connector_health_check",
          params: { id: "github" },
        }));
        assert.equal(res.status, 200);
        const body = await res.json() as {
          result: {
            ok: boolean;
            readiness: string;
            proof: {
              connector_id: string;
              result: string;
              endpoint: string;
              error: string;
              secret_names_checked: string[];
              approval_gate: {
                allowed_to_recommend_or_run: boolean;
                state: string;
              };
            };
          };
        };
        assert.equal(body.result.ok, false);
        assert.equal(body.result.readiness, "health_check_failed");
        assert.equal(body.result.proof.connector_id, "github");
        assert.equal(body.result.proof.result, "failed");
        assert.equal(body.result.proof.endpoint, "https://api.github.com/user");
        assert.match(body.result.proof.error, /network down/);
        assert.deepEqual(body.result.proof.secret_names_checked, ["GITHUB_TOKEN"]);
        assert.equal(body.result.proof.approval_gate.allowed_to_recommend_or_run, false);
        assert.equal(body.result.proof.approval_gate.state, "blocked_until_proven");
        assert.doesNotMatch(JSON.stringify(body.result.proof), /ghp_test_token/);
      }
    );
  } finally {
    if (oldGithubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = oldGithubToken;
    }
  }
});

test("musu_get_connector_policy classifies scraping marketplaces as unsafe by default", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0",
    id: 11,
    method: "musu_get_connector_policy",
    params: {
      name: "LinkedIn Email Lead Scraper",
      description: "Extract phone numbers, emails, and profiles through proxy scraping.",
      source_url: "https://apify.com/example/linkedin-lead-scraper?fpr=p2hrc6",
    },
  }));
  assert.equal(res.status, 200);
  const body = await res.json() as {
    result: {
      candidate_assessment: {
        policy: string;
        risk_profile: string;
        matched_terms: string[];
        reason: string;
      };
    };
  };
  assert.equal(body.result.candidate_assessment.policy, "blocked_or_explicit_warning");
  assert.equal(body.result.candidate_assessment.risk_profile, "personal_data_scraping");
  assert.ok(body.result.candidate_assessment.matched_terms.includes("lead"));
  assert.match(body.result.candidate_assessment.reason, /privacy/);
});

test("musu_get_connector_policy does not let safe keywords override marketplace URLs", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0",
    id: 111,
    method: "musu_get_connector_policy",
    params: {
      name: "Website to Markdown",
      description: "Convert documentation to markdown",
      source_url: "https://apify.com/example/website-to-markdown?fpr=p2hrc6",
    },
  }));
  assert.equal(res.status, 200);
  const body = await res.json() as {
    result: {
      candidate_assessment: {
        policy: string;
        risk_profile: string;
        matched_terms: string[];
        reason: string;
      };
    };
  };
  assert.equal(body.result.candidate_assessment.policy, "blocked_or_explicit_warning");
  assert.equal(body.result.candidate_assessment.risk_profile, "marketplace_or_hosted_actor");
  assert.deepEqual(body.result.candidate_assessment.matched_terms, ["marketplace"]);
  assert.match(body.result.candidate_assessment.reason, /discovery-only/);
});

test("musu_get_connector_policy classifies generated Apify catalog repos as discovery-only", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0",
    id: 112,
    method: "musu_get_connector_policy",
    params: {
      name: "Scraping APIs for Developers",
      description: "Automatically generated from the Apify Store API with affiliate links.",
      source_url: "https://github.com/cporter202/scraping-apis-for-devs",
    },
  }));
  assert.equal(res.status, 200);
  const body = await res.json() as {
    result: {
      candidate_assessment: {
        policy: string;
        risk_profile: string;
        matched_terms: string[];
        reason: string;
      };
    };
  };
  assert.equal(body.result.candidate_assessment.policy, "blocked_or_explicit_warning");
  assert.equal(body.result.candidate_assessment.risk_profile, "marketplace_catalog_index");
  assert.deepEqual(body.result.candidate_assessment.matched_terms, ["marketplace_catalog_index"]);
  assert.match(body.result.candidate_assessment.reason, /discovery-only/);
});

test("musu_get_connector_policy classifies raw generated Apify catalog READMEs as discovery-only", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0",
    id: 113,
    method: "musu_get_connector_policy",
    params: {
      name: "Raw scraping API catalog README",
      description: "Raw generated README from a marketplace catalog.",
      source_url:
        "https://raw.githubusercontent.com/cporter202/scraping-apis-for-devs/main/README.md",
    },
  }));
  assert.equal(res.status, 200);
  const body = await res.json() as {
    result: {
      candidate_assessment: {
        policy: string;
        risk_profile: string;
        matched_terms: string[];
        reason: string;
      };
    };
  };
  assert.equal(body.result.candidate_assessment.policy, "blocked_or_explicit_warning");
  assert.equal(body.result.candidate_assessment.risk_profile, "marketplace_catalog_index");
  assert.deepEqual(body.result.candidate_assessment.matched_terms, ["marketplace_catalog_index"]);
  assert.match(body.result.candidate_assessment.reason, /discovery-only/);
});

test("MUSU system prompt defaults LLM operators to MUSU mesh wrappers", () => {
  const prompt = readFileSync("src/prompts/musu-system-prompt-v1.md", "utf8");
  assert.match(prompt, /Never tell the user that Tailscale\.com signup is required/);
  assert.match(prompt, /musu mesh bootstrap/);
  assert.match(prompt, /musu\.device_add\.v1/);
  assert.match(prompt, /copy that pass file to the target PC/);
  assert.match(prompt, /Delete stale pass copies after use/);
  assert.match(prompt, /musu mesh join --device-add-pass <musu\.device_add\.v1\.json>/);
  assert.match(prompt, /Do not paste the secret-bearing JSON inline into a shell command/);
  assert.match(prompt, /do not make the user reason about raw Headscale preauth keys/);
  assert.match(prompt, /musu mesh status --json/);
  assert.match(prompt, /musu mesh verify --target-ip <target-tailnet-ip>/);
  assert.match(prompt, /musu mesh physical-peer-evidence --json/);
  assert.match(prompt, /copy both the generated JSON and its `\.sha256` sidecar/);
  assert.match(prompt, /target hostname/);
  assert.match(prompt, /source_hostname/);
  assert.match(prompt, /target_hostname/);
  assert.match(prompt, /physical_host_distinct=true/);
  assert.match(prompt, /musu mesh release-proof/);
  assert.match(prompt, /--physical-peer-evidence <copied-target-pc-physical-peer-evidence\.json>/);
  assert.match(prompt, /PhysicalPeerEvidencePath/);
  assert.match(prompt, /verify-private-mesh-release-proof-bundle/);
  assert.match(prompt, /private-mesh-release-proof\.bundle-manifest\.json/);
  assert.match(prompt, /musu\.private_mesh_release_proof_bundle\.v1/);
  assert.match(prompt, /fail_count=0/);
  assert.match(prompt, /archive-private-mesh-release-proof-bundle/);
  assert.match(prompt, /private-mesh-release-proof\.archive\.json/);
  assert.match(prompt, /musu\.private_mesh_release_proof_archive\.v1/);
  assert.match(prompt, /archive_zip_path/);
  assert.match(prompt, /bundle_manifest_ok=true/);
  assert.match(prompt, /bundle_manifest_fail_count=0/);
  assert.match(prompt, /release_evidence_trusted=true/);
  assert.doesNotMatch(prompt, /join each machine with `tailscale login --login-server/);
  assert.doesNotMatch(prompt, /run `tailscale login --login-server/);
});

test("Private Mesh docs keep device-add pass as the default enrollment path", () => {
  const networkContract = readFileSync(
    "../docs/TAILSCALE_HEADSCALE_NETWORK_CONTRACT_2026_06_13.md",
    "utf8"
  );
  const deepResearch = readFileSync(
    "../docs/MUSU_PRIVATE_MESH_DEEP_RESEARCH_AND_REDESIGN_2026_06_13.md",
    "utf8"
  );

  assert.match(networkContract, /musu mesh join --device-add-pass <musu\.device_add\.v1\.json>/);
  assert.match(networkContract, /Raw `tailscale login\/up --login-server` is also forbidden as the normal MUSU/);
  assert.match(networkContract, /advanced\/manual fallback/);
  assert.doesNotMatch(
    networkContract,
    /Join each MUSU machine with `tailscale login --login-server=<headscale-url>`/
  );
  assert.doesNotMatch(
    networkContract,
    /to use Headscale via\s+`tailscale login --login-server=<headscale-url>`/
  );

  assert.match(deepResearch, /Default enrollment is `musu mesh join --device-add-pass/);
  assert.match(deepResearch, /Raw `join --login-server\/--authkey` is advanced\/manual fallback only/);
  assert.match(deepResearch, /default user\/LLM instruction/);
  assert.match(deepResearch, /The pass owns the login server\/authkey tuple/);
  assert.doesNotMatch(deepResearch, /MUSU's default join flow must keep using `--login-server`/);
  assert.doesNotMatch(deepResearch, /Add `musu mesh join --login-server <url> --authkey <key>`\./);
});

test("MUSU system prompt requires connector policy before external APIs", () => {
  const prompt = readFileSync("src/prompts/musu-system-prompt-v1.md", "utf8");
  assert.match(prompt, /musu_list_connectors/);
  assert.match(prompt, /musu_get_connector_policy/);
  assert.match(prompt, /musu_get_connector_proof_plan/);
  assert.match(prompt, /musu\.tool_contract\.v1/);
  assert.match(prompt, /provider/);
  assert.match(prompt, /requires_account/);
  assert.match(prompt, /data_leaves_device/);
  assert.match(prompt, /run_policy=local_first/);
  assert.match(prompt, /run_policy=explicit_user_enablement_required/);
  assert.match(prompt, /account\/scope\/data-egress\/cost boundary/);
  assert.match(prompt, /Do not recommend random API marketplaces/);
  assert.match(prompt, /scraping, lead generation, downloader, proxy, bypass, CAPTCHA, stealth/);
  assert.match(prompt, /same order, target, connector, and input payload/);
});
