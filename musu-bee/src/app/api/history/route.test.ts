import assert from "node:assert/strict";
import { test } from "node:test";

import { buildBridgeHeaders } from "@/lib/bridgeHeaders";

test("buildBridgeHeaders includes content type without token", () => {
  const headers = buildBridgeHeaders("");
  assert.deepEqual(headers, { "Content-Type": "application/json" });
});

test("buildBridgeHeaders attaches bearer token when provided", () => {
  const headers = buildBridgeHeaders("bridge-secret-token");
  assert.deepEqual(headers, {
    "Content-Type": "application/json",
    Authorization: "Bearer bridge-secret-token",
  });
});
