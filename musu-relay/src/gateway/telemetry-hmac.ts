// V23.3 A3 (wiki/379 §2 A3): structural extraction of the HMAC body-identity
// pattern that V23.2 B1 introduced. Two call sites — recordOutcome in
// client.ts and emitInstallCompleted in main.ts — duplicated the
// "rawBody used for both signing input AND POST body" pattern verbatim.
// V23.2 qual eval §7 lesson 5 flagged that this invariant should be
// structural, not Builder-discipline. This file delivers the structure.
//
// The helper is HMAC-only. recordOutcome's legacy shared-secret branch
// stays at the call site (mutually exclusive with HMAC; recordOutcome
// picks the auth scheme before delegating here).
//
// Body-identity invariant: rawBody is computed ONCE by the caller via
// JSON.stringify(record) and passed in as a string. signAndPost uses the
// same string for both signing input (`${t}.${rawBody}`) and fetch body.
// Re-stringifying would risk producing different bytes for non-
// deterministic serializers and the server-side raw-body signature
// check would 401.

import { createHmac } from "crypto";

export interface SignAndPostInput {
  /** Absolute URL to POST to (e.g. `https://signaling.musu.pro/v1/telemetry/install`). */
  url: string;
  /** The body bytes — JSON.stringify(record) called ONCE by the caller. */
  rawBody: string;
  /** 32-byte hex account_key (from /etc/musu/account_key or bootstrap path). */
  accountKey: string;
  /** Logical user ID (sent as `x-musu-user-id` header). */
  userId: string;
  /** fetch implementation; defaults to globalThis.fetch for production. */
  fetchImpl?: typeof fetch;
  /** Optional logger for best-effort failure reporting. */
  log?: (line: string) => void;
  /** Optional Unix-seconds timestamp; defaults to `Math.floor(Date.now()/1000)`.
   *  Exposed so tests can pin the value; production callers should omit. */
  tSeconds?: number;
}

export interface SignAndPostResult {
  /** HTTP status if fetch resolved; undefined if fetch threw. */
  status?: number;
  /** Error if fetch threw (telemetry is best-effort; caller must NOT throw). */
  error?: unknown;
}

/** Sign and POST a telemetry record using the V23.2 B1 HMAC scheme.
 *
 *  Header shape:
 *    content-type: application/json
 *    x-musu-user-id: <userId>
 *    x-musu-telemetry-signature: t=<unix-seconds>,v1=<hmac-sha256(t.rawBody)>
 *
 *  The function is best-effort: it never throws. Network/HTTP errors are
 *  returned in `result.error` and logged via `log` if provided.
 */
export async function signAndPost(
  input: SignAndPostInput,
): Promise<SignAndPostResult> {
  const t = input.tSeconds ?? Math.floor(Date.now() / 1000);
  const signedString = `${t}.${input.rawBody}`;
  const v1 = createHmac("sha256", input.accountKey)
    .update(signedString)
    .digest("hex");

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-musu-user-id": input.userId,
    "x-musu-telemetry-signature": `t=${t},v1=${v1}`,
  };

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  try {
    const resp = await fetchImpl(input.url, {
      method: "POST",
      headers,
      body: input.rawBody, // SAME bytes as signed above — do not re-stringify.
    });
    return { status: resp.status };
  } catch (err) {
    if (input.log) {
      input.log(
        `[telemetry-hmac] POST ${input.url} failed (best-effort, ignored): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return { error: err };
  }
}
