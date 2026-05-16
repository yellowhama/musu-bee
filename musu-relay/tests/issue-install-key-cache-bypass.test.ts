/**
 * Cache-poisoning regression test for /v1/telemetry/issue_install_key
 * (V23.2 B1 dual-audit Auditor A finding M1).
 *
 * Threat model:
 *   The validationCache in src/signaling/server.ts is keyed on the token
 *   alone (V23.2 audit HIGH #3 fix). On a v21-era musu.pro upstream the
 *   /validate response carries no user_id field and validateToken falls
 *   back to the HELLO-supplied claimedUserId as the canonical id
 *   (server.ts:140-151). That fallback makes the cache poisonable: an
 *   attacker who holds ANY valid tunnel_token T can open a WS, send
 *   HELLO {token: T, user_id: VICTIM_ID}, and the cache will store
 *   {token: T, canonicalUserId: VICTIM_ID, valid: true} for CACHE_TTL_MS.
 *
 *   If the /issue_install_key adapter then trusts that cache entry, the
 *   attacker can POST tunnel_token=T to /issue_install_key, the cache HIT
 *   returns userId=VICTIM_ID, and the route INSERTs an HMAC account_key
 *   keyed on VICTIM_ID. The victim's legitimate gateway later bootstraps,
 *   hits 409 in account_keys, and signaling is unusable for the victim
 *   until manual ops intervention.
 *
 * Closure:
 *   server.ts's /v1/telemetry router adapter must call validateToken with
 *   forceRefresh=true so the bootstrap path bypasses the validationCache
 *   and always asks the upstream fresh. On a v21-era /validate the fresh
 *   response has no user_id → adapter normalizes to null → route returns
 *   503 (Design A: refuse to issue against the v21 fallback). On a
 *   B2-deployed upstream the fresh response carries the canonical user_id
 *   and issuance proceeds normally for the real owner of the token.
 *
 * Load-bearing assertion:
 *   This test pre-poisons _validationCache with a valid+VICTIM_ID entry,
 *   then issues the POST. If the adapter forgets forceRefresh=true the
 *   route would 200 with an account_key keyed on VICTIM_ID. The test
 *   asserts 503 — so removing forceRefresh breaks this test, which is
 *   exactly the load-bearing signal Auditor A asked for.
 */

process.env.MUSU_TELEMETRY_DB = ":memory:";
delete process.env.MUSU_TELEMETRY_SHARED_SECRET;

import supertest from "supertest";
import {
  app,
  validateToken,
  _resetAuthState,
  _validationCache,
} from "../src/signaling/server";
import { _resetDb, _closeDb, _getDbForTests } from "../src/signaling/telemetry";

const ATTACKER_TOKEN = "attacker-token-abc";
const VICTIM_ID = "usr_victim_777";

let originalFetch: typeof fetch;

beforeAll(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  originalFetch = global.fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  _closeDb();
});

beforeEach(() => {
  _resetAuthState();
  _resetDb();
});

describe("Auditor A M1 — /issue_install_key bypasses HELLO-poisoned cache", () => {
  it("rejects bootstrap when validationCache was poisoned by HELLO fallback", async () => {
    // 1. Simulate the (PRE-B2) v21-era HELLO path having already cached a
    //    poisoned entry: attacker connected via WS with HELLO {token,
    //    user_id: VICTIM_ID} while upstream /validate returned 200 with
    //    no user_id body. server.ts:140-151 (PRE-B2) fell back to the
    //    HELLO-supplied claim and cached canonicalUserId=VICTIM_ID
    //    against the attacker's token. The fallback was removed in B2-bee
    //    (wiki/365); this test continues to exercise the route-level
    //    Design A enforcement independent of the fallback's existence,
    //    by pre-seeding the cache directly to simulate the poisoned
    //    state any other code path could in principle write.
    _validationCache.set(ATTACKER_TOKEN, {
      valid: true,
      canonicalUserId: VICTIM_ID,
      timestamp: Date.now(),
    });

    // 2. Stub the upstream to return 200 OK but no user_id field in the
    //    body. Pre-B2 this was v21-era musu.pro /validate behavior; post-B2
    //    (wiki/365) the adapter normalizes any missing/empty user_id to
    //    null and the route returns 503 (correct).
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    // 3. Attacker POSTs to /issue_install_key with their valid token.
    //    If the adapter trusted the cache, this would 200 with an
    //    account_key squatted on VICTIM_ID.
    const res = await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({ tunnel_token: ATTACKER_TOKEN, musu_install_id: "atk-1" });

    // 4. Adapter must have called validateToken with forceRefresh=true,
    //    bypassing the poisoned cache. Fresh upstream returned no user_id
    //    → adapter normalized to null → route returned 503 (Design A).
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/canonical user_id not available/);

    // 5. Load-bearing assertion: the fresh upstream call must have happened.
    //    If forceRefresh=false (the bug), fetch would NOT be invoked because
    //    the cache entry was fresh enough to satisfy the call. So a fetch
    //    call count of >=1 proves the cache was bypassed.
    expect(fetchSpy).toHaveBeenCalled();

    // 6. Defense-in-depth: no telemetry_account_keys row exists for
    //    VICTIM_ID. The squat attack is fully closed at the route level.
    const row = _getDbForTests()
      .prepare(
        "SELECT user_id FROM telemetry_account_keys WHERE user_id = ?",
      )
      .get(VICTIM_ID);
    expect(row).toBeUndefined();
  });

  it("happy path is unaffected: a B2-deployed upstream still issues a key on fresh canonical id", async () => {
    // Sanity check: the forceRefresh adapter must NOT break the normal
    // B2-era happy path. With a fresh upstream returning a real canonical
    // user_id, issuance proceeds.
    const REAL_OWNER = "usr_real_owner_abc";
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user_id: REAL_OWNER }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const res = await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({ tunnel_token: "legit-token", musu_install_id: "good-1" });

    expect(res.status).toBe(200);
    expect(res.body.user_id).toBe(REAL_OWNER);
    expect(res.body.account_key).toMatch(/^[0-9a-f]{64}$/);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("validateToken cache fast-path still works for non-bootstrap callers (HELLO path is unaffected)", async () => {
    // Sanity check: the forceRefresh hack lives ONLY in the /v1/telemetry
    // adapter. The default validateToken(token, claimedId) call (used by
    // the WS HELLO handler) still uses the cache. This test confirms we
    // didn't accidentally globally disable the cache.
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user_id: "canonical-id" }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    // First call: cache miss → fetch.
    const a = await validateToken("hello-path-token", "claimed");
    expect(a.valid).toBe(true);

    // Second call without forceRefresh: cache hit → no fetch.
    const b = await validateToken("hello-path-token", "claimed");
    expect(b.valid).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
