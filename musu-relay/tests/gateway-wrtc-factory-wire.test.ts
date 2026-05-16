/**
 * V23.3 A2 (wiki/379 §2 A2): T1.9 wrtc factory wiring at main.ts:211-218.
 *
 * Asserts that `makeWrtcFactory()` — the offerer-side factory — can be
 * constructed and produces a working SimplePeerConnection when invoked the
 * way `main.ts` now invokes it. Replaces the previous throw-stub
 * `throw new Error("TODO T1.9 wrtc factory wiring")`.
 *
 * Skips automatically if the `@roamhq/wrtc` native binding isn't loadable
 * (same pattern as wrtc-handshake.test.ts).
 */

import { makeWrtcFactory } from "../src/gateway/wrtc-factory";

let wrtcAvailable = true;

beforeAll(() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@roamhq/wrtc");
  } catch {
    wrtcAvailable = false;
  }
});

describe("V23.3 A2 — wrtc factory wiring", () => {
  test("makeWrtcFactory() produces a factory that does not throw on create()", () => {
    if (!wrtcAvailable) {
      // eslint-disable-next-line no-console
      console.warn("[A2 wire test] @roamhq/wrtc unavailable — skipping");
      return;
    }
    const factory = makeWrtcFactory();
    expect(factory).toBeDefined();
    expect(typeof factory.create).toBe("function");

    const pc = factory.create("visitor-test-peer", [
      "stun:stun.l.google.com:19302",
    ]);
    try {
      expect(pc).toBeDefined();
      expect(typeof pc.createOffer).toBe("function");
      expect(typeof pc.acceptAnswer).toBe("function");
      expect(typeof pc.addRemoteIceCandidate).toBe("function");
      expect(typeof pc.close).toBe("function");
    } finally {
      pc.close();
    }
  });

  test("makeWrtcFactory().create() returns distinct instances per call", () => {
    if (!wrtcAvailable) {
      return;
    }
    const factory = makeWrtcFactory();
    const pc1 = factory.create("peer-a", []);
    const pc2 = factory.create("peer-b", []);
    try {
      expect(pc1).not.toBe(pc2);
    } finally {
      pc1.close();
      pc2.close();
    }
  });
});
