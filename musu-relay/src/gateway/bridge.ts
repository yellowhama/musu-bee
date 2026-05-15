// musu-relay-gateway DataChannel ↔ local HTTP bridge (V23.1 T1.10).
//
// Once the WebRTC DataChannel is open (T1.9), the gateway must shuttle
// HTTP requests from the remote visitor to a local HTTP target — in
// V23 production this is `kubectl proxy` exposing the K3s API on
// 127.0.0.1:8001, but the bridge is target-agnostic so musu-bee dev
// mode (T1.11) and other local services can ride the same channel.
//
// Wire format (JSON over the DC, one envelope per message):
//
//   request:  { id, kind: "req", method, path, headers, body? }
//   response: { id, kind: "res", status, headers, body? }
//   error:    { id, kind: "err", message }
//
// `id` is a UUID per request; the visitor side correlates response to
// request by id. `body` is base64-encoded bytes when present so binary
// payloads (e.g. kubectl proxy returning gzipped pod logs) survive
// JSON.stringify round-trips. Empty/no body is omitted.
//
// V23.1 keeps this single-message-per-request — no chunking for large
// responses. kubectl proxy responses fit in a few KB for the spike's
// target endpoints (/api, /api/v1/namespaces). Streaming is a V23.3
// concern when pod-log tailing becomes the use case.

import http from "http";
import { randomUUID } from "crypto";

// ── Minimal DataChannel surface ──────────────────────────────────────────
// Matches both RTCDataChannel (browser) and @roamhq/wrtc's
// RTCDataChannel. Kept narrow so tests can stub.

export interface DataChannelLike {
  readyState: "connecting" | "open" | "closing" | "closed";
  send(data: string): void;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: (() => void) | null;
}

// ── Wire envelopes ───────────────────────────────────────────────────────

interface ReqEnvelope {
  id: string;
  kind: "req";
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string; // base64
}

interface ResEnvelope {
  id: string;
  kind: "res";
  status: number;
  headers: Record<string, string>;
  body?: string; // base64
}

interface ErrEnvelope {
  id: string;
  kind: "err";
  message: string;
}

type Envelope = ReqEnvelope | ResEnvelope | ErrEnvelope;

// ── Path normalization (V23.2 T2.SEC.1, closes audit MED #4) ─────────────
//
// `startsWith(prefix)` is not safe — `/api/../admin/secret` starts with
// `/api/` but resolves to `/admin/secret`. We:
//   1. Reject paths that do not begin with `/`.
//   2. Reject paths containing any percent-encoded `..`, NUL byte, or
//      backslash. Don't try to be clever; the bridge only ever forwards
//      to a known local service, so a strict whitelist of what the path
//      may look like is safer than a normalizer that tries to be
//      universal.
//   3. Parse via WHATWG URL with a fake origin, take `.pathname`.
//   4. Reject if the normalized path still contains a `..` segment after
//      WHATWG normalization (defense in depth — URL normalization
//      *should* collapse them, but the API doesn't guarantee it for all
//      inputs).
//
// Returns the normalized path (with original query string preserved), or
// null if the path is rejected.
//
// Strategy: instead of "normalize then check," we "tokenize and reject
// any sketchy segment." This is paranoid but the bridge is a security
// boundary, not a router — being strict is the right default.
export function normalizePath(rawPath: string): string | null {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  if (!rawPath.startsWith("/")) return null;
  // Reject percent-encoded `.`, NUL, backslash. Not valid in k8s API
  // paths; exist mainly as encoding-bypass vectors.
  if (
    /%2e/i.test(rawPath) ||
    rawPath.includes("\0") ||
    rawPath.includes("\\")
  ) {
    return null;
  }
  // Split into path + query without involving the WHATWG URL parser,
  // which would silently collapse `..` and `.` segments and `//` runs —
  // hiding the very vectors we want to reject.
  const qIdx = rawPath.indexOf("?");
  const pathPart = qIdx === -1 ? rawPath : rawPath.slice(0, qIdx);
  const queryPart = qIdx === -1 ? "" : rawPath.slice(qIdx);
  if (pathPart.includes("//")) return null;
  const segments = pathPart.split("/");
  // Skip the empty leading segment from the leading `/`.
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === "" || seg === "." || seg === "..") return null;
  }
  return `${pathPart}${queryPart}`;
}

// ── Gateway side — receives reqs, calls local HTTP, sends responses ──────

export interface BridgeServerConfig {
  dc: DataChannelLike;
  /** Where to forward requests. Example: { host: "127.0.0.1", port: 8001 } */
  target: { host: string; port: number };
  /** Allow only paths matching this prefix (defaults to allow-all). */
  pathAllowPrefix?: string;
  onLog?: (line: string) => void;
}

export class BridgeServer {
  private readonly log: (line: string) => void;

  constructor(private readonly cfg: BridgeServerConfig) {
    this.log = cfg.onLog ?? ((l) => console.log(l));
    cfg.dc.onmessage = (ev) => this.handleMessage(ev.data);
  }

  private send(env: ResEnvelope | ErrEnvelope): void {
    if (this.cfg.dc.readyState !== "open") return;
    this.cfg.dc.send(JSON.stringify(env));
  }

  private async handleMessage(raw: string): Promise<void> {
    let env: Envelope;
    try {
      env = JSON.parse(raw) as Envelope;
    } catch {
      this.log(`[bridge] bad JSON on DC`);
      return;
    }
    if (env.kind !== "req") return; // ignore stray res/err on server side

    const normalizedPath = normalizePath(env.path);
    if (normalizedPath === null) {
      this.log(`[bridge] rejected malformed path: ${env.path}`);
      this.send({
        id: env.id,
        kind: "err",
        message: `path not allowed`, // audit LOW #8: don't echo user path
      } as ErrEnvelope);
      return;
    }
    if (
      this.cfg.pathAllowPrefix !== undefined &&
      !normalizedPath.startsWith(this.cfg.pathAllowPrefix)
    ) {
      this.log(
        `[bridge] rejected out-of-prefix path raw=${env.path} ` +
          `normalized=${normalizedPath}`,
      );
      this.send({
        id: env.id,
        kind: "err",
        message: `path not allowed`,
      } as ErrEnvelope);
      return;
    }
    // Forward the normalized path, not the raw one — defends downstream
    // targets that don't normalize themselves.
    const safeEnv: ReqEnvelope = { ...env, path: normalizedPath };

    try {
      const res = await this.forward(safeEnv);
      this.send(res);
    } catch (err) {
      this.send({
        id: env.id,
        kind: "err",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private forward(env: ReqEnvelope): Promise<ResEnvelope> {
    return new Promise((resolve, reject) => {
      const reqBody = env.body ? Buffer.from(env.body, "base64") : undefined;
      const headers: Record<string, string | number> = { ...env.headers };
      if (reqBody) headers["content-length"] = reqBody.byteLength;

      const req = http.request(
        {
          host: this.cfg.target.host,
          port: this.cfg.target.port,
          method: env.method,
          path: env.path,
          headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const respBody = Buffer.concat(chunks);
            const respHeaders: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              if (typeof v === "string") respHeaders[k] = v;
              else if (Array.isArray(v)) respHeaders[k] = v.join(", ");
            }
            resolve({
              id: env.id,
              kind: "res",
              status: res.statusCode ?? 0,
              headers: respHeaders,
              body: respBody.byteLength > 0 ? respBody.toString("base64") : undefined,
            });
          });
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      if (reqBody) req.write(reqBody);
      req.end();
    });
  }
}

// ── Visitor side — fetch-shaped client over the DC ───────────────────────

export interface BridgeClientResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export class BridgeClient {
  private readonly pending = new Map<
    string,
    {
      resolve: (r: BridgeClientResponse) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();

  constructor(
    private readonly dc: DataChannelLike,
    private readonly defaultTimeoutMs = 10000,
  ) {
    dc.onmessage = (ev) => this.handleMessage(ev.data);
  }

  private handleMessage(raw: string): void {
    let env: Envelope;
    try {
      env = JSON.parse(raw) as Envelope;
    } catch {
      return;
    }
    if (env.kind === "req") return; // ignore stray reqs on client side

    const p = this.pending.get(env.id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(env.id);

    if (env.kind === "err") {
      p.reject(new Error(env.message));
      return;
    }
    p.resolve({
      status: env.status,
      headers: env.headers,
      body: env.body ? Buffer.from(env.body, "base64") : Buffer.alloc(0),
    });
  }

  async request(opts: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: Buffer | string;
    timeoutMs?: number;
  }): Promise<BridgeClientResponse> {
    const id = randomUUID();
    const env: ReqEnvelope = {
      id,
      kind: "req",
      method: opts.method,
      path: opts.path,
      headers: opts.headers ?? {},
    };
    if (opts.body !== undefined) {
      const buf = Buffer.isBuffer(opts.body) ? opts.body : Buffer.from(opts.body);
      env.body = buf.toString("base64");
    }

    return new Promise<BridgeClientResponse>((resolve, reject) => {
      const timeoutMs = opts.timeoutMs ?? this.defaultTimeoutMs;
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`bridge request ${opts.method} ${opts.path} timeout`));
        }
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.dc.send(JSON.stringify(env));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
}
