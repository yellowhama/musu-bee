// V23.2 B1 commit 1 of 6: type augmentation for raw-body capture.
//
// `express.json({ verify })` is the only Express-blessed seam for grabbing
// the exact bytes a client POSTed before JSON.parse mangles whitespace and
// key order. We attach those bytes to `req.rawBody` so the HMAC middleware
// (commit 3) can sign the literal payload. See
// docs/V23_2_WORKSTREAM_B1_PLAN_2026_05_16.md §2.1 + §5 for the wire-format
// rationale and the "bytes-not-equal-to-restringify" invariant.
//
// Without this augmentation, route handlers and middleware would need
// `(req as any).rawBody` at every consumer site. The `verify` callback
// itself still uses `as any` because @types/express doesn't model the
// `verify` parameter's request shape cleanly; the augmentation flows from
// the callback into the rest of the request lifecycle.

declare global {
  namespace Express {
    interface Request {
      /**
       * Raw request body bytes captured by `express.json({ verify })` in
       * `makeTelemetryRouter()`. Present on POSTs with a JSON content-type
       * that pass through the body parser; undefined for GETs and for any
       * request handled outside that router.
       *
       * HMAC signing (V23.2 B1 commit 3) computes
       *   HMAC_SHA256(account_key, `${t}.` + rawBody.toString("utf8"))
       * over THESE bytes — re-stringifying `req.body` reorders keys and
       * normalizes whitespace, which would break the signature.
       */
      rawBody?: Buffer;
    }
  }
}

// Marker export so this file is treated as a module rather than a script;
// without it the `declare global` block is implicitly ambient and harder
// to attribute when debugging type resolution.
export {};
