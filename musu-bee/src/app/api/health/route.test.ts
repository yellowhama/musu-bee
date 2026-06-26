import assert from "node:assert/strict";
import { test } from "node:test";

import { GET } from "./route";

test("GET /api/health returns public site health without auth", async () => {
  const res = await GET();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");

  const body = (await res.json()) as {
    schema?: unknown;
    ok?: unknown;
    service?: unknown;
    version?: unknown;
  };
  assert.deepEqual(Object.keys(body).sort(), ["ok", "schema", "service", "version"]);
  assert.equal(body.schema, "musu.site_health.v1");
  assert.equal(body.ok, true);
  assert.equal(body.service, "musu.pro");
  assert.equal(typeof body.version, "string");
  assert.match(String(body.version), /^1\.15\.0-rc\.\d+$/);
});
