# Session: cloud mesh control plane + one-line install + site fixes (2026-06-17)

Continues the S-tier push. This session took the "Windows-only machines" question
to a working answer and fixed real deploy/site gaps surfaced by the user.

## 1. What shipped (verified)

### Cloud mesh control plane (the "Windows-only" answer)
- Decision: mesh backend stays **Headscale** (Nebula evaluated and rejected — it
  loses the embedded-DERP relay that the V28 "laptop from outside / off-network"
  thesis needs, and Codex's design says do not switch). License BSD-3-Clause,
  obligation = NOTICE only (auto-generated).
- Control plane = **one cloud Linux VPS**; all work machines stay pure Windows
  (tailscale client + `--login-server https://mesh.musu.pro`, no Linux/Docker/WSL).
- DEPLOYED: Vultr Seoul `158.247.209.227`, Cloudflare DNS `mesh.musu.pro`
  (proxied=false), Caddy auto-HTTPS, `https://mesh.musu.pro/health` = 200.
- This PC joined as `100.64.0.1` (Headscale online, control_server_verified=true).
- Full deploy/enroll/proof recipe: `docs/MESH_CLOUD_CONTROL_PLANE_DEPLOY_2026_06_16.md`.

### One-line install (replaced raw .ps1 download)
- `irm https://musu.pro/install.ps1 | iex` (Bun/Deno/Scoop pattern).
- New `/install.ps1` Next route proxies the canonical Install-MUSU.ps1 from the
  GitHub release as text/plain. Install-MUSU.ps1 made `irm|iex`-compatible:
  self-elevates by re-fetching itself via -EncodedCommand (no $PSCommandPath
  dependency when piped), pins + verifies the cert thumbprint, installs the
  .appinstaller. (.exe deferred: NSIS self-signed → SmartScreen + no cert-trust gain.)

### GUI re-deploy (was stale)
- The published msix was a 6/15 build — this session's cockpit work (optimistic
  card, Add-PC pipes-hidden, command palette, aria-live/status-by-shape) was NOT
  in it. Rebuilt with current cockpit (6/17) and re-uploaded to the release.

### Site: login/signup were invisible
- `/auth/login` + `/auth/signup` (real Supabase email/password + Google/GitHub
  OAuth) existed and returned 200, but NOTHING in the nav linked to them. The home
  page (`/`) has its own nav (not PublicSiteShell), so the first fix missed it.
  Added "Log in" / "Sign up" to BOTH navs. Verified by real browser render
  (browse): nav shows them, `/auth/signup` renders the form, no "not configured".
- Supabase IS configured on Vercel (musu-pro project: NEXT_PUBLIC_SUPABASE_URL =
  poyclapxmvulvboiebxq.supabase.co — musu's own, separate from nongjida's).

## 2. Things learned (gotchas worth keeping)

- **next build**: must be `npm run build` (= `next build --webpack`); bare
  `next build` uses Turbopack and fails with a webpack config. (already memoed)
- **ssh-keygen -N '""' in PowerShell** sets a LITERAL `""` passphrase, not empty —
  the key ends up bcrypt-encrypted and fails BatchMode ssh. Use `-N ""` (no inner
  quotes) for a truly passphrase-less key.
- **Vultr `sshkey_id` on create/reinstall did NOT inject the key** in practice;
  cloud-init user_data also didn't take. What worked: `plink -batch -hostkey <fp>
  -pw <pw>` to drop the pubkey into authorized_keys, then key auth.
- **Cloudflare `cfk_` token = Invalid** for the DNS API; a zone-scoped `cfat_`
  token (DNS:Edit) works. `/user/tokens/verify` rejects it but zone calls succeed
  — check actual permissions, not the verify endpoint.
- **Windows system tailscaled warms up via NoState** after Headscale register
  before it actually connects — wait it out; not a control-plane fault.
- **Static HTML checks miss client-rendered nav** (Next use-client). Use real
  browser render (browse/gstack) to verify nav/auth UI.
- **PaaS (Railway/Fly) UDP/3478 is unreliable** → Headscale embedded DERP needs a
  plain VPS.

## 3. Qualitative assessment (honest)

**Strong / done:**
- Cloud self-hosted mesh control plane is genuinely live and verified (health 200,
  node registered) — the "Windows-only machines, self-hosted mesh" architecture is
  proven end-to-end up to the second-machine step.
- Install UX is now reference-grade (one line), GUI is current, login/signup are
  reachable and backed by configured Supabase.
- Repeatedly caught "looks done" vs "is done" gaps (stale GUI, invisible auth,
  home-vs-shell nav) by checking the real artifact, not the path/HTML.

**Honest gaps:**
- **Two-physical-machine cross-host ping = still 0** — needs a real 2nd Windows
  PC. Single-host proof (two WSL nodes) only proves coordination/routing, not two
  physical hosts. This is the one remaining S-tier differentiator and it is
  environment-bound, not code-bound.
- Windows tailscaled NoState warm-up could bite a 2nd-PC enroll; not yet smoothed.
- Real signup→login→app round trip not yet exercised by a human (backend ready).

## 4. Code audit (this session's changes)

Scope: install.ps1 route + Install-MUSU.ps1, PublicSiteShell/home nav, deploy docs.
- `/install.ps1` route: proxies release script as text/plain, no-store fetch with
  502 fallback — no secrets, no injection surface (static URL). OK.
- Install-MUSU.ps1: self-elevation re-fetches over HTTPS from a pinned SelfUrl and
  verifies the cert thumbprint before trust — same-channel caveat already
  documented; thumbprint pin is the real integrity gate. OK for beta.
- Nav links: static `<Link>` to `/auth/*`, no logic. OK.
- No Rust/bridge/security-surface code changed this session (mesh CLI unchanged;
  prior thermo-nuclear 3-pass audit still holds). No new CRITICAL/HIGH surface.

Verdict: no new audit findings; changes are deploy/UX/infra, security posture
unchanged from the converged 3-pass state.

## 5. Next steps

| # | Step | Blocker |
|---|------|---------|
| 1 | Second physical Windows PC: `irm https://musu.pro/install.ps1 \| iex`, issue device-add pass from the cloud control host, join, capture cross-host `tailscale ping` → two-machine release proof | **2nd PC** |
| 2 | Smooth Windows tailscaled NoState warm-up in the join flow (retry/poll until connected) | none (code) |
| 3 | Exercise real signup→login→/app round trip; confirm OAuth redirect URIs in Supabase | none |
| 4 | MS Store submission (removes cert-trust step entirely) | MS account |
| 5 | Firewall hardening on the VPS (currently relies on default; add explicit 22/80/443/3478udp group) | none |

## 6. Pointers
- Deploy: `docs/MESH_CLOUD_CONTROL_PLANE_DEPLOY_2026_06_16.md`
- Prior session: `docs/SESSION_S_TIER_HARDENING_SUMMARY_2026_06_16.md`
- Mesh design SSOT: `docs/MUSU_PRIVATE_MESH_DEEP_RESEARCH_AND_REDESIGN_2026_06_13.md`
- Cross-node (single-host) proof: `docs/PRIVATE_MESH_CROSS_NODE_PROOF_2026_06_16.md`
