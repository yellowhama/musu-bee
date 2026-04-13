import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

type Module = { GET: () => Promise<Response> };
let GET: Module["GET"];

const DATA_DIR = path.join(process.cwd(), "data");
const SUB_FILE = path.join(DATA_DIR, "subscription.json");

function req() {
  return new NextRequest("http://localhost/api/subscription");
}

before(async () => {
  // Ensure no KV so file fallback is used
  delete process.env.KV_REST_API_URL;
  ({ GET } = (await import("./route")) as Module);
});

after(() => {
  // Clean up any test subscription file
  try { fs.unlinkSync(SUB_FILE); } catch { /* ok */ }
});

test("GET /api/subscription — no subscription file → plan: free", async () => {
  // Remove file to ensure DEFAULT_STATE
  try { fs.unlinkSync(SUB_FILE); } catch { /* ok */ }

  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json() as { plan: string; deviceLimit: number };
  assert.equal(body.plan, "free");
  assert.ok(typeof body.deviceLimit === "number", "deviceLimit should be a number");
});

test("GET /api/subscription — subscription file present → returns saved plan", async () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    SUB_FILE,
    JSON.stringify({
      plan: "pro",
      customerId: "cus_test123",
      subscriptionId: "sub_test123",
      provider: "paddle",
      status: "active",
      currentPeriodEnd: "2026-12-31T00:00:00.000Z",
      _processedEventIds: [],
    }),
    "utf-8"
  );

  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json() as { plan: string; deviceLimit: number; customerId: string };
  assert.equal(body.plan, "pro");
  assert.equal(body.customerId, "cus_test123");
  assert.ok(typeof body.deviceLimit === "number", "deviceLimit should be a number");
  // _processedEventIds must not leak into public response
  assert.ok(!("_processedEventIds" in body), "_processedEventIds should be stripped");
});
