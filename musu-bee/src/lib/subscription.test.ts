import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getSubscription } from "@/lib/subscription";

function snapshotEnv(keys: string[]) {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of keys) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test("legacy processed event ids (stripe + paddle) are migrated into _processedEventIds", async () => {
  const envSnapshot = snapshotEnv(["KV_REST_API_URL", "KV_REST_API_TOKEN"]);
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;

  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "musu-subscription-state-"));

  try {
    const dataDir = path.join(tempDir, "data");
    fs.mkdirSync(dataDir, { recursive: true });

    fs.writeFileSync(
      path.join(dataDir, "subscription.json"),
      JSON.stringify(
        {
          plan: "pro",
          status: "active",
          provider: "paddle",
          _processedEventIds: ["evt_new_1", "evt_shared"],
          _processedPaddleEventIds: ["evt_pad_1", "evt_shared"],
          _processedStripeEventIds: ["evt_stripe_1"],
        },
        null,
        2
      ),
      "utf-8"
    );

    process.chdir(tempDir);
    const state = await getSubscription();

    assert.deepEqual(state._processedEventIds, [
      "evt_new_1",
      "evt_shared",
      "evt_pad_1",
      "evt_stripe_1",
    ]);
  } finally {
    process.chdir(originalCwd);
    restoreEnv(envSnapshot);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
