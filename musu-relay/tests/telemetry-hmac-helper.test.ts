/**
 * V23.3 A3.helper (wiki/379 §2 A3.helper + Critic C3 resolution):
 * unit tests for the client-side `signAndPost` helper in
 * `src/gateway/telemetry-hmac.ts`. Per Critic C3, this test file imports
 * the helper directly so `tsc --noEmit` stays clean at the A3.helper-only
 * commit (before A3.swap rewires the call sites at client.ts + main.ts).
 *
 * NOTE: distinct from `telemetry-hmac.test.ts` which covers the
 * SERVER-side `requireInstallHmac` middleware (V23.2 B1). This file
 * covers the CLIENT-side helper.
 *
 * Behavior coverage:
 *   1. Signature header format matches V23.2 B1 wire contract
 *      (`t=<sec>,v1=<hex>`); HMAC input is exactly `${t}.${rawBody}`
 *   2. Body-identity: fetch body bytes === the signed rawBody bytes
 *   3. fetch error path returns { error } without throwing (best-effort)
 *   4. tSeconds parameter pins the timestamp (for deterministic tests);
 *      omitting defaults to Math.floor(Date.now() / 1000)
 */

import { createHmac } from "crypto";
import { signAndPost } from "../src/gateway/telemetry-hmac";

describe("V23.3 A3.helper — signAndPost", () => {
  const accountKey = "a".repeat(64); // 32 bytes hex
  const userId = "u-test";
  const url = "https://signaling.musu.pro/v1/telemetry/install";
  const record = { musu_install_id: "i1", elapsed_ms: 1234, step_failed: null };
  const rawBody = JSON.stringify(record);

  test("signature header format: t=<sec>,v1=<hex>", async () => {
    const captured: { headers?: Record<string, string>; body?: string } = {};
    const fakeFetch = jest.fn(
      async (_url: string, init: RequestInit) => {
        captured.headers = init.headers as Record<string, string>;
        captured.body = init.body as string;
        return { status: 202 } as Response;
      },
    );

    const result = await signAndPost({
      url,
      rawBody,
      accountKey,
      userId,
      fetchImpl: fakeFetch as unknown as typeof fetch,
      tSeconds: 1700000000,
    });

    expect(result.status).toBe(202);
    expect(captured.headers).toBeDefined();
    expect(captured.headers!["content-type"]).toBe("application/json");
    expect(captured.headers!["x-musu-user-id"]).toBe(userId);

    const sig = captured.headers!["x-musu-telemetry-signature"];
    expect(sig).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    const [tPart, v1Part] = sig.split(",");
    expect(tPart).toBe("t=1700000000");

    const expectedV1 = createHmac("sha256", accountKey)
      .update(`1700000000.${rawBody}`)
      .digest("hex");
    expect(v1Part).toBe(`v1=${expectedV1}`);
  });

  test("body-identity: fetch body bytes === signed rawBody bytes", async () => {
    const captured: { body?: string } = {};
    const fakeFetch = jest.fn(
      async (_url: string, init: RequestInit) => {
        captured.body = init.body as string;
        return { status: 202 } as Response;
      },
    );

    await signAndPost({
      url,
      rawBody,
      accountKey,
      userId,
      fetchImpl: fakeFetch as unknown as typeof fetch,
      tSeconds: 42,
    });

    expect(captured.body).toBe(rawBody);
  });

  test("fetch error returns { error } without throwing", async () => {
    const fakeFetch = jest.fn(async () => {
      throw new Error("network down");
    });
    const logged: string[] = [];

    const result = await signAndPost({
      url,
      rawBody,
      accountKey,
      userId,
      fetchImpl: fakeFetch as unknown as typeof fetch,
      log: (l) => logged.push(l),
    });

    expect(result.status).toBeUndefined();
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toBe("network down");
    expect(logged.length).toBe(1);
    expect(logged[0]).toContain("network down");
  });

  test("tSeconds defaults to Math.floor(Date.now()/1000) when omitted", async () => {
    const beforeSec = Math.floor(Date.now() / 1000);
    const captured: { headers?: Record<string, string> } = {};
    const fakeFetch = jest.fn(
      async (_url: string, init: RequestInit) => {
        captured.headers = init.headers as Record<string, string>;
        return { status: 202 } as Response;
      },
    );

    await signAndPost({
      url,
      rawBody,
      accountKey,
      userId,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    const afterSec = Math.floor(Date.now() / 1000);
    const sig = captured.headers!["x-musu-telemetry-signature"];
    const tValue = parseInt(sig.match(/t=(\d+)/)![1], 10);
    expect(tValue).toBeGreaterThanOrEqual(beforeSec);
    expect(tValue).toBeLessThanOrEqual(afterSec);
  });
});
