import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

// server-only throws under the node test runner; stub it (route-test pattern).
const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

const SECRET_KEYS = ["MUSU_MESH_BEARER_SECRET", "MUSU_P2P_CONTROL_TOKEN"];
function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of SECRET_KEYS) saved[k] = process.env[k];
  for (const k of SECRET_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const k of SECRET_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

async function load() {
  // Fresh import each call so env is read at call time (functions read env live).
  return await import("./meshBearer.ts");
}

test("same owner_key yields the same bearer (account-wide shared secret)", async () => {
  const { deriveMeshBearer } = await load();
  withEnv({ MUSU_MESH_BEARER_SECRET: "s1" }, () => {
    const a = deriveMeshBearer("token-sha256:abc");
    const b = deriveMeshBearer("token-sha256:abc");
    assert.equal(a, b);
    assert.equal(a.length, 64);
    assert.match(a, /^[a-f0-9]{64}$/);
  });
});

test("different owner_key yields a different bearer", async () => {
  const { deriveMeshBearer } = await load();
  withEnv({ MUSU_MESH_BEARER_SECRET: "s1" }, () => {
    assert.notEqual(
      deriveMeshBearer("token-sha256:abc"),
      deriveMeshBearer("token-sha256:xyz"),
    );
  });
});

test("different server secret yields a different bearer", async () => {
  const { deriveMeshBearer } = await load();
  let withS1 = "";
  let withS2 = "";
  withEnv({ MUSU_MESH_BEARER_SECRET: "s1" }, () => {
    withS1 = deriveMeshBearer("token-sha256:abc");
  });
  withEnv({ MUSU_MESH_BEARER_SECRET: "s2" }, () => {
    withS2 = deriveMeshBearer("token-sha256:abc");
  });
  assert.notEqual(withS1, withS2);
});

test("no server secret → empty bearer (fail-closed)", async () => {
  const { deriveMeshBearer, meshBearerConfigured } = await load();
  withEnv({}, () => {
    assert.equal(deriveMeshBearer("token-sha256:abc"), "");
    assert.equal(meshBearerConfigured(), false);
  });
});

test("empty owner_key → empty bearer", async () => {
  const { deriveMeshBearer } = await load();
  withEnv({ MUSU_MESH_BEARER_SECRET: "s1" }, () => {
    assert.equal(deriveMeshBearer(""), "");
  });
});

test("falls back to control token secret when dedicated secret absent", async () => {
  const { deriveMeshBearer, meshBearerConfigured } = await load();
  withEnv({ MUSU_P2P_CONTROL_TOKEN: "ctl" }, () => {
    assert.equal(meshBearerConfigured(), true);
    assert.equal(deriveMeshBearer("token-sha256:abc").length, 64);
  });
});

test("meshBearerEquals is length-safe and rejects empty", async () => {
  const { meshBearerEquals } = await load();
  assert.equal(meshBearerEquals("ab", "ab"), true);
  assert.equal(meshBearerEquals("ab", "abc"), false);
  assert.equal(meshBearerEquals("", ""), false);
});
