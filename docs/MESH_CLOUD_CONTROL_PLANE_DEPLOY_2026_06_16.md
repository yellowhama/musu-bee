# MUSU Private Mesh — cloud control-plane deploy (2026-06-16)

## STATUS: DEPLOYED & VERIFIED (2026-06-17)

The cloud control plane is **live**:
- VPS: Vultr Seoul (`vc2-1c-1gb`, Ubuntu 24.04), public IPv4 `158.247.209.227`
- DNS: `mesh.musu.pro` A → `158.247.209.227` (Cloudflare, proxied=false / DNS-only)
- `https://mesh.musu.pro/health` = **200** (Caddy auto Let's Encrypt HTTPS in front of headscale:8080)
- Containers: `musu-headscale` (healthy) + `musu-headscale-caddy`, via `docker compose up -d`
- This Windows PC joined as node `100.64.0.1` (Headscale `online`, `control_server_verified=true`,
  "no Tailscale.com account"). NOTE: the Windows system tailscaled briefly sat in
  `NoState` after register before it connected — a known Windows-engine warm-up,
  not a MUSU/Headscale fault.

Remaining: a second physical Windows PC to capture the cross-host `tailscale ping`
(two-physical-machine release proof). Everything up to that point is live.

---

The control plane (Headscale + embedded DERP) runs on ONE small cloud Linux VPS.
All MUSU work machines stay pure Windows — they only run the tailscale client
with `--login-server https://mesh.musu.pro`. No Linux/Docker/WSL on user PCs.

Why a VPS (not Railway/Fly): embedded DERP needs UDP/3478 (STUN + relay for
off-network / hard-NAT peers, the V28 "laptop from outside" scenario). PaaS UDP
support is unreliable; a plain VPS with open ports is the documented Headscale path.

## Bundle (generated, ready)
`musu mesh bootstrap --server-url https://mesh.musu.pro --derp-ipv4 <VPS_IP> --output <dir> --force`

Current generated bundle: `.local-build/mesh-cloud-bundle/` (DERP ipv4 is a
placeholder `203.0.113.10` until the real VPS IP is known — regenerate with the
real IP). Contents:
- `docker-compose.yaml` — headscale (127.0.0.1:8080) + caddy (0.0.0.0:80/443) + DERP STUN (0.0.0.0:3478/udp)
- `Caddyfile` — `mesh.musu.pro { reverse_proxy headscale:8080 }` (auto Let's Encrypt HTTPS)
- `config/config.yaml` — server_url https://mesh.musu.pro, embedded DERP region 999
- `config/policy.json`, `scripts/create-join-key.{ps1,sh}`, `scripts/check-public-endpoint.{ps1,sh}`, NOTICE.headscale.md

## Operator steps (one-time, on the VPS)

1. **Provision VPS** — Hetzner/Vultr/DigitalOcean, 1 vCPU / 1 GB, Ubuntu, public IPv4.
   Note the public IP.
2. **DNS** — point `mesh.musu.pro` (A record) at the VPS IP (musu.pro DNS is on Vercel;
   add the A record there). Caddy needs this resolvable before it can get a cert.
3. **Firewall / security group** — open inbound: `80/tcp`, `443/tcp` (HTTPS + ACME),
   `3478/udp` (DERP STUN). 8080 stays internal (Caddy proxies it).
4. **Regenerate the bundle with the real IP**:
   `musu mesh bootstrap --server-url https://mesh.musu.pro --derp-ipv4 <VPS_IP> --output <dir> --force`
5. **Copy the bundle to the VPS** and `docker compose up -d` (install Docker on the
   VPS — that is fine, the VPS is the control host, NOT a user machine).
6. **Verify**: `curl https://mesh.musu.pro/health` → 200, and `docker compose ps` healthy.

## Enroll a Windows machine (per PC, pure Windows)

1. Install MUSU on the Windows PC: `irm https://musu.pro/install.ps1 | iex`.
2. On the control host, create a one-use device-add pass:
   `docker compose exec headscale ... ` via `scripts/create-join-key.sh` (writes
   `musu.device_add.v1` pass).
3. Copy the pass file to the Windows PC; join:
   `musu mesh join --device-add-pass <musu.device_add.v1.json>`.
4. The Windows tailscale client connects to `https://mesh.musu.pro`; DERP relays
   off-network/hard-NAT traffic.

## Two-physical-machine release proof (the remaining S-tier blocker)

With the cloud control plane up + two real Windows PCs joined:
- `musu mesh physical-peer-evidence --json` on PC B → copy JSON + .sha256 to PC A
- `musu mesh release-proof --target-node <B> --target-ip <100.x> --expected-control-server-url https://mesh.musu.pro --physical-peer-evidence <copied.json> --json`
- Expect `release_evidence_trusted=true` (distinct physical hosts + verified control server + cross-host route + callback).

## What needs the user
- VPS account + IP (provisioning, billing).
- `mesh.musu.pro` A record (Vercel DNS).
- A second physical Windows PC for the final two-machine proof.

Once the IP + DNS exist, Claude can regenerate the bundle and walk the deploy/enroll/proof.
