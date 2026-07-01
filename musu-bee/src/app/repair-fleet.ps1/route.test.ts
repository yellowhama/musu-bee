import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "./route";

const originalFetch = globalThis.fetch;

function repairScript({
  schema = true,
  expectedNodeName = true,
}: {
  schema?: boolean;
  expectedNodeName?: boolean;
} = {}) {
  return `
param(
${expectedNodeName ? "    [string]$ExpectedNodeName," : ""}
    [switch]$Json
)
$schema = "${schema ? "musu.fleet_node_public_url_repair.v1" : "wrong.schema"}"
Write-Output $schema
`;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("/repair-fleet.ps1 proxies canonical fleet repair script", async () => {
  globalThis.fetch = (async () => new Response(repairScript(), { status: 200 })) as typeof fetch;

  const res = await GET();
  const body = await res.text();

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.match(body, /musu\.fleet_node_public_url_repair\.v1/);
  assert.match(body, /ExpectedNodeName/);
});

test("/repair-fleet.ps1 fails closed when upstream is missing", async () => {
  globalThis.fetch = (async () => new Response("not found", { status: 404 })) as typeof fetch;

  const res = await GET();
  const body = await res.text();

  assert.equal(res.status, 502);
  assert.match(body, /temporarily unavailable/);
});

test("/repair-fleet.ps1 fails closed when script schema drifts", async () => {
  globalThis.fetch = (async () =>
    new Response(repairScript({ schema: false }), { status: 200 })) as typeof fetch;

  const res = await GET();
  const body = await res.text();

  assert.equal(res.status, 409);
  assert.match(body, /expected evidence schema/);
});

test("/repair-fleet.ps1 fails closed when node-name guard is missing", async () => {
  globalThis.fetch = (async () =>
    new Response(repairScript({ expectedNodeName: false }), { status: 200 })) as typeof fetch;

  const res = await GET();
  const body = await res.text();

  assert.equal(res.status, 409);
  assert.match(body, /expected node-name guard/);
});

