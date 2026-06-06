# 2026-06-07 - Release Payload Preflight Required Metadata Gate

Decision: `/api/v1/relay/payload` release payload preflight now requires
`tunnel_id`, `payload_kind=forwarded_task_envelope`, and 64-hex
`payload_sha256` before owner-scoped lease lookup.

Why: metadata-only preflight should not be able to look release-ready with an
underspecified tunnel payload. The change keeps MUSU.PRO as remote
input/control plane and avoids accidental payload ingress while the release
relay tunnel runtime is still missing.

Validation:

- `npm run test:p2p -- --test-name-pattern "release payload"` passed `112/112`
- `npm run typecheck` passed
- P2P relay contract audit passed with `ok=true`, `fail_count=0`
- P2P env status remained expected No-Go
- release verifier passed with `case_count=104`, `failed_case_count=0`

Release status: public release remains No-Go.
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`,
`RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`, and
`RELAY_TRANSPORT_KIND=websocket_tunnel` remain unchanged. Clean go/no-go keeps
current packaged local desktop evidence accepted because this is server-only
P2P control-plane source, while public release remains blocked by second-PC,
hosted P2P/relay, support mailbox, and Store proof.
