# V23.1 T1.7 — Signaling server deploy target decision

**Date**: 2026-05-16
**Status**: Decision recorded. Locks Fly.io for V23.1; reassess at V23.5.
**Scope**: musu.pro signaling server only (`musu-relay/src/signaling/`). Does NOT cover the user-PC `musu-relay-gateway` (T1.8), which runs on the user's hardware.

---

## What's actually being deployed

A single Node 20 process. Two surfaces:

1. **WebSocket `/signaling`** — accepts HELLO from peers, brokers OFFER/ANSWER/ICE_CANDIDATE between peers in the same per-user room, never inspects payloads. Stateless w.r.t. SDP/ICE — only holds an in-memory map of `userId → Set<Peer>` for the lifetime of the WS connections.
2. **HTTP** — `/health`, `/metrics`, `POST /v1/telemetry/{install,nat_pierce,agent_spawn}`, `GET /v1/telemetry/summary`. Telemetry persists to a **local SQLite file** (`telemetry.db`) — schema in `v40_telemetry.sql`.

Resource shape: WS connections idle most of the time (signaling is bursty — open, exchange ICE for ~5–30s, close once DataChannel is up). Telemetry writes are small (~200 bytes/event, ~3 events per active install per day). At 1k installs / 10k installs / 100k installs the steady-state load is still tiny — the bottleneck is **concurrent WS connections during the handshake window**, not CPU or disk.

L2 in the master plan forbids this server from ever carrying P2P traffic. So the relevant resource axes are:
- **WS connection capacity** — how many simultaneous SDP/ICE exchanges before the box CPU/file-descriptor caps out.
- **Region count + latency** — signaling RTT matters because ICE candidate exchange is the slow part of P2P setup. Fewer regions = some users handshake from across the planet.
- **Egress bandwidth** — almost zero (no traffic relay). Only the JSON of SDP/ICE frames, kilobytes per session.
- **Disk persistence** — telemetry.db must survive restarts.

## Candidates considered

| Provider | Free tier (2026-05) | WS support | Regions | Persistent disk | Notable |
|---|---|---|---|---|---|
| **Fly.io** | 3 shared-cpu-1x VMs, 256MB, 3GB volume per org | ✅ native | 30+ | ✅ `fly volumes` | Anycast routes user to nearest region; per-app TLS; `fly deploy` from Dockerfile |
| Hetzner CX11 | none — €4.51/mo from day 1 | ✅ | 4 (DE/FI/US/SG) | ✅ | Cheapest sustained price; manual systemd/Docker |
| Hostinger VPS | none — $4.99/mo entry | ✅ | ~10 | ✅ | Underrated price; no native anycast |
| Railway | $5/mo Hobby plan; no free tier since 2023 | ✅ | 4 (US-W/-E/EU/SG) | ✅ | The musu-relay README mentions Railway, but only because the v21 tunnel-broker design predates V23 |
| Render | 750 free hrs/mo on free web service | ✅ | 4 | volume on paid only | Free tier sleeps after 15min idle — **disqualifying for signaling** (cold start kills in-flight ICE exchange) |
| Vercel / Netlify Functions | generous | ❌ WS not native | — | — | Excluded: signaling requires persistent WS, not request/response |
| Cloudflare Workers | generous | ⚠ via Durable Objects | global edge | DO storage | Anycast is great, but Durable Objects pricing escalates at concurrent-WS scale; also conflicts with L7 "no Cloudflare relay" by association — keeps the brand promise cleaner if musu.pro infra has zero Cloudflare touchpoints |

## Decision: Fly.io for V23.1

Three reasons it wins for this phase:

1. **Free tier is real and persistent.** Three shared-cpu-1x VMs at 256MB plus 3GB volume — enough for one signaling app with a SQLite volume mounted for `telemetry.db`, no cold-start sleep, no surprise bill during the 3-week spike.
2. **Anycast region selection helps signaling latency.** A US user connecting to a US-based gateway shouldn't have their ICE exchange routed via Frankfurt. Fly's edge picks the nearest region per WS connection automatically. Hetzner gives one fixed region per VM.
3. **Lowest deploy friction for "single Node app + persistent volume".** `fly launch` from the existing Dockerfile-shaped project + `fly volumes create musu_telemetry --size 1` + `fly secrets set MUSU_VALIDATION_API=...` is a 10-minute path. Hetzner/Hostinger are an hour of systemd-unit + nginx-reverse-proxy work for zero V23.1 benefit.

Reasons it might not win for V23.5+:
- **Egress pricing**. Free tier covers 160GB/mo outbound. Signaling itself is tiny but the telemetry summary endpoint, if hit by a dashboard, could add up. At paid tier this becomes a line item.
- **Geographic compliance**. If a German user demands their signaling stays in the EU, Fly's anycast picks the nearest region but doesn't pin — we'd need per-app region rules.
- **Vendor consolidation risk**. Fly went through funding turbulence in 2023–2024; Hetzner is older and boring.

These are V23.5 concerns, not V23.1 concerns. V23.1 success criteria are *technical* (WebRTC handshake works), not *cost-optimized*. The migration target is one `git push` away.

## Provisioning checklist (when authorized — Const VII gate applies)

The repo now contains `musu-relay/Dockerfile` and `musu-relay/fly.toml`
committed in V23.2 T1.7.a/b — no manual edits needed before first deploy.

```
cd musu-relay
fly launch --no-deploy --copy-config   # uses the checked-in fly.toml
fly volumes create musu_telemetry --size 1 --region <your-region>
fly secrets set \
    MUSU_VALIDATION_API=https://musu.pro/api/v1/nodes/validate \
    MUSU_TELEMETRY_SHARED_SECRET="$(openssl rand -hex 32)"
fly deploy
fly logs                               # verify "[signaling] listening on 9900"
```

After first deploy: redeploys are just `fly deploy` from this directory.

**Save the shared secret** — the installer (V23.2 Workstream B) bakes
the same value into gateway builds via `MUSU_TELEMETRY_SHARED_SECRET`.
Rotating it requires a coordinated installer rebuild + redeploy.

DNS: point `signaling.musu.pro` (CNAME) at the Fly app domain. `<user>.musu.pro` (wildcard) keeps pointing at musu.pro's main web, which knows how to redirect WS upgrade requests to `signaling.musu.pro`.

## Telemetry persistence note

`telemetry.db` lives on the Fly volume. Volume is single-region by design — if we ever scale to multiple regions for signaling, telemetry writes from non-primary regions need to either (a) POST to the primary region's HTTP endpoint cross-region, or (b) move telemetry to a separate aggregator service. (b) is the cleaner long-term split and aligns with V23.5's "separate aggregation job" TODO already noted in `src/signaling/telemetry.ts`.

## Reassessment trigger

Re-open this decision at V23.5 (closed-beta launch) if any of the following are true:
- Paid-tier MAU > 1000 (egress/concurrent-WS load starts mattering)
- A customer requires region pinning for compliance
- Fly.io's pricing or operational reliability degrades materially

Until then: **Fly.io free tier, single region (user picks at deploy time), SQLite on a 1GB volume.**

---

## Open items

- **T1.7.a** — ✅ Closed in V23.2. `musu-relay/Dockerfile` written
  (multi-stage Alpine, drops to non-root, mounts /data, signaling-only
  — gateway's `@roamhq/wrtc` excluded via `--omit=optional`).
- **T1.7.b** — ✅ Closed in V23.2. `musu-relay/fly.toml` checked in with
  shared-cpu-1x / 256MB / WebSocket-friendly settings, /health probe
  wired, single-region mount on `musu_telemetry` volume.
- **T1.7.c** — Token validation endpoint (`MUSU_VALIDATION_API`) must
  exist on musu.pro before the signaling server can validate paid-tier
  tokens. The production musu.pro keeps the v21-era `/api/v1/nodes/validate`
  route. **V23.2 audit HIGH #3 (T2.AUTH.3)** added a requirement: the
  endpoint should return `{ user_id }` in its 200 body so the signaling
  server can use the canonical id as the room key instead of trusting
  HELLO's user_id. Signaling server tolerates the v21 behavior with a
  one-time warning until musu.pro is upgraded — needed before V23.5
  launch.
