import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import {
  checkMeshJoinRateLimit,
  resetMeshJoinRateLimitForTests,
} from "./meshJoinRateLimit";

const ACCT = "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9";

beforeEach(() => {
  resetMeshJoinRateLimitForTests();
  delete process.env.MUSU_MESH_JOIN_RATE_LIMIT_PER_MINUTE;
});

test("allows up to the limit, then 429s within the window", () => {
  process.env.MUSU_MESH_JOIN_RATE_LIMIT_PER_MINUTE = "3";
  const t0 = 1_000_000;
  assert.equal(checkMeshJoinRateLimit(ACCT, t0).limited, false);
  assert.equal(checkMeshJoinRateLimit(ACCT, t0 + 1).limited, false);
  assert.equal(checkMeshJoinRateLimit(ACCT, t0 + 2).limited, false);
  const fourth = checkMeshJoinRateLimit(ACCT, t0 + 3);
  assert.equal(fourth.limited, true);
  if (fourth.limited) assert.ok(fourth.retryAfterSeconds >= 1);
});

test("window resets after 60s", () => {
  process.env.MUSU_MESH_JOIN_RATE_LIMIT_PER_MINUTE = "1";
  const t0 = 2_000_000;
  assert.equal(checkMeshJoinRateLimit(ACCT, t0).limited, false);
  assert.equal(checkMeshJoinRateLimit(ACCT, t0 + 500).limited, true);
  // After the window elapses, the count resets.
  assert.equal(checkMeshJoinRateLimit(ACCT, t0 + 60_000).limited, false);
});

test("limits are per-account, not global", () => {
  process.env.MUSU_MESH_JOIN_RATE_LIMIT_PER_MINUTE = "1";
  const t0 = 3_000_000;
  assert.equal(checkMeshJoinRateLimit("acct-A", t0).limited, false);
  assert.equal(checkMeshJoinRateLimit("acct-A", t0 + 1).limited, true);
  // A different account is unaffected by acct-A hitting its cap.
  assert.equal(checkMeshJoinRateLimit("acct-B", t0 + 2).limited, false);
});

test("default limit applies when env unset", () => {
  // Default is 10/min; the 11th in-window attempt is limited.
  const t0 = 4_000_000;
  for (let i = 0; i < 10; i++) {
    assert.equal(checkMeshJoinRateLimit(ACCT, t0 + i).limited, false);
  }
  assert.equal(checkMeshJoinRateLimit(ACCT, t0 + 10).limited, true);
});
