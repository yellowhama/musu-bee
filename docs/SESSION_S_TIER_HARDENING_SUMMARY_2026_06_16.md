# S-tier hardening session — summary, qualitative assessment, next steps (2026-06-16)

Goal driving the session: *make MUSU an S-tier service comparable to overseas
reference services; so compelling a user can't not use it; research UX/UI/
service/structure, validate, critique, implement.*

Merged to `main` as `a8e8f8fb` (16 commits since PR #11). Branch:
`fix/audit-findings-2026-06-08`.

---

## 1. What shipped (verified)

### Security — adversarial audit, converged
- **thermo-nuclear audit**: 6-domain adversarial review of the 239-file / 52k-LOC
  session diff (63 agents, each finding cross-checked by 3 independent skeptics).
  19 findings confirmed: 1 CRITICAL, 8 HIGH, 5 MEDIUM, 5 LOW.
- **3 re-validation passes**, each catching regressions in the prior fixes:
  - Pass 2 caught that removing `std::env::set_var` killed the persisted default
    (no read-back), and that the shell-default guard was write-side only.
  - Pass 3 caught the bridge.env parser diverging from `token.rs`, an IPv6
    SSRF blind spot, and a `Promise.race` timer leak.
- **Converged**: final pass found CRITICAL/HIGH = 0. Residuals (DNS-rebinding
  fetch-pinning, bridge-proxy public-bind guard) documented as accepted.
- Headline fixes: `/api/mcp` auth gate (was unauth RCE via `musu_run_command`);
  `shell` excluded from `DEFAULTABLE_ADAPTERS` (write + read); `--image`
  OCI-ref validation (YAML injection); `mesh join` https-only; trait-adapter
  wall-clock timeout; bridge-proxy remote-auth; callback TOCTOU conditional
  UPDATE; SSRF DNS resolution (IPv4+IPv6); Install-MUSU thumbprint pin.

### UX vs reference services (Tailscale / Linear / Raycast / Warp / Vercel)
Gap analysis found musu already has the hard parts (command palette,
status-by-shape task cards, attention inbox, reduced-motion, boundary
disclosure). 8 gaps closed and verified by CDP/dogfood:
1. aria-live announcements (was zero live regions in a status-centric app)
2. connection dot status-by-shape (was colour+animation only)
3. pre-send target guard (offline target → disabled Send + reason, no failed-card detour)
4. command palette core verb — "Target <machine>" completes the primary action keyboard-only
5. Add PC pipes hidden — buttons over raw `musu mesh` CLI, readiness collapsed to a drawer
6. honest landing copy — removed Antigravity/Vibe-Coder/superlatives
7. optimistic order card — 0ms feedback on Send (a dogfood finding: card previously waited for the IPC)
8. landing demo shows the real cockpit (order box + Running/Done status-by-shape + OS-notify), not Town/Butler/CEO agents

### Self-hosted mesh trust
- Brought Docker engine back up, restarted Headscale+Caddy (healthy), joined
  TWO distinct nodes to the self-hosted tailnet, captured **bidirectional
  WireGuard ping** (1ms, direct P2P, zero Tailscale.com).
- See `docs/PRIVATE_MESH_CROSS_NODE_PROOF_2026_06_16.md`.

### Deploy
- musu.pro download artifacts live (HTTP 200): `Install-MUSU.ps1`,
  `musu.appinstaller`, `musu-desktop-x64.msix` (26.3 MB), `blossompark.musu.cer`.
- Store submission bundle prepared (`store-reviewed-immediate-registration`
  MSIX, identity `blossompark.musu`, no Yellowhama placeholder).

---

## 2. Qualitative assessment (honest)

**Strong**: security posture is now adversarially-verified clean (3-pass
convergence is real evidence, not a single look). The cockpit's UX foundation
genuinely matches reference-tier patterns, and the polish gaps that remained are
closed. The "hide the pipes" thesis is now realised in Add PC. Build/deploy path
verified (`npm run build` ✓; the earlier "build failure" was a wrong CLI flag).

**Honest limits**:
- **Two-PHYSICAL-machine release proof is NOT done.** The cross-node proof is two
  isolated instances on one WSL host — it proves coordination + routing, not two
  real machines. A second physical PC is required; on a single Windows host the
  second node is blocked by WinTun driver contention with the system Tailscale
  service. This is the one remaining "쓸 수밖에 없는 self-hosted mesh trust"
  differentiator that cannot be closed in code alone.
- musu.pro still serves the pre-merge landing/download until Vercel redeploys
  from `main`; the one-click install UX goes live only after that redeploy.
- The center landing demo was rebuilt as a static mockup of the cockpit; it is
  not a live/interactive embed.

**Net**: foundation (security + structure) and UX polish are S-tier-grade and
verified. The decisive *service-trust* proof (two real machines) is staged and
unblocked-by-code — it needs a 2nd physical PC + a Vercel redeploy.

---

## 3. Next steps

| # | Step | Owner | Blocker |
|---|------|-------|---------|
| 1 | Vercel redeploy from `main` → musu.pro shows one-click install + honest landing | auto on push / verify | none (should auto-trigger) |
| 2 | Two-physical-machine proof: install on a real 2nd PC from musu.pro, issue device-add pass from this host's Headscale, join, capture cross-host `tailscale ping` | user provides 2nd PC; Claude drives join+ping | **2nd physical PC** |
| 3 | Microsoft Store submission (removes the cert-trust step entirely) | user (Partner Center login) | MS account |
| 4 | Landing center demo: optionally upgrade the static cockpit mockup to a short screen capture / interactive embed | Claude | none (polish) |
| 5 | Address documented residuals if scope expands: SSRF fetch IP-pinning, bridge-proxy explicit `MUSU_DESKTOP_LOCAL` flag | Claude | none (low priority) |

---

## 4. Pointers
- Mesh proof: `docs/PRIVATE_MESH_CROSS_NODE_PROOF_2026_06_16.md`
- Boundary spec (updated): `docs/PRODUCT_CHARTER/NETWORK_BOUNDARY_SPEC.md` (2026-06-16 refinements)
- Build note: `npm run build` (= `next build --webpack`); bare `next build` uses Turbopack and fails.
- Install: `scripts/windows/Install-MUSU.ps1`; Store bundle via `scripts/windows/prepare-store-submission-bundle.ps1`.
