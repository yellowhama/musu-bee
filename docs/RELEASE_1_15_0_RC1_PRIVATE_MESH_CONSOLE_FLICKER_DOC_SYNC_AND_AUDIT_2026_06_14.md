# Release 1.15.0-rc.1 Private Mesh, Console Flicker, Doc Sync, And Audit

Date: 2026-06-14

## Scope

This report records the current product and code state after the desktop console
flicker hardening, local fleet refresh hardening, public setup documentation
cleanup, and follow-up code audit.

The user-facing product contract is now:

- MUSU must not require a Tailscale.com account for the default multi-machine
  path.
- Same-LAN use remains MUSU Core.
- Cross-network default is MUSU Private Mesh: a Tailscale-compatible client
  pointed at MUSU-managed or operator-managed Headscale through a
  `musu.device_add.v1` pass.
- Raw `tailscale up --login-server ... --authkey ...` remains an implementation
  primitive or manual fallback, not the default user or LLM instruction.
- The desktop cockpit must not behave like a CLI launcher. Passive fleet/status
  refresh must not create recurring transient `musu.exe` children.

## Research Grounding

The local official-doc snapshots remain the main repo evidence:

- `docs/vendor/official-network-docs/tailscale-docs/`
- `docs/vendor/official-network-docs/headscale/`
- `docs/MUSU_PRIVATE_MESH_OPEN_SOURCE_DOCS_MANIFEST_2026_06_13.md`
- `docs/MUSU_PRIVATE_MESH_DEEP_RESEARCH_AND_REDESIGN_2026_06_13.md`
- `docs/TAILSCALE_HEADSCALE_NETWORK_CONTRACT_2026_06_13.md`

The live official-doc recheck on 2026-06-14 confirmed the important current
semantics:

- Tailscale `up` without flags connects to the hosted Tailscale service.
- Tailscale `up --login-server=<url>` can point the client at a different
  control server, including Headscale.
- Headscale documents preauth-key enrollment, including the default one-use,
  one-hour shape and `tailscale up --login-server <YOUR_HEADSCALE_URL>
  --authkey <YOUR_AUTH_KEY>`.
- Headscale container docs still show version-pinned images such as
  `ghcr.io/juanfont/headscale:<VERSION>` and treat the container guide as
  community documentation, so MUSU's generated bundle must remain explicit and
  verifier-backed.

## What Changed

### Desktop process behavior

- `musu-bee/src-tauri/src/lib.rs` changed `list_fleet()` from
  `musu.exe nodes --json --local` subprocess polling to direct local bridge
  `GET /api/fleet/status` with bearer auth.
- The bearer header is trimmed and rejects CR, LF, DEL, and all other control
  characters.
- `musu-bee/src-tauri-shell/main.js` throttles `private_mesh_status` to a
  five-minute cache, reuses in-flight calls, and force-refreshes only after
  explicit proof, release-proof, or callback state transitions.
- The connected cockpit falls back to a local `this machine` row only when the
  bridge is otherwise usable and `list_fleet()` returns an empty list.

### Audit fix applied during this pass

The review found one real risk: local bridge auth failures could be collapsed to
an empty fleet. That would let the cockpit show the fallback local row and hide
that the token/control boundary was broken.

Fix:

- `list_fleet()` now parses the HTTP status code.
- `401` and `403` return `Err("local_fleet_auth_failed")`.
- Other non-200 local bridge states still degrade to an empty fleet.
- `http_status_code(...)` has a Rust unit test.
- The shell contract test asserts the auth-failure path is fail-closed.

### Public setup documentation

Updated user-facing setup docs so the default path is MUSU Private Mesh instead
of "Tailscale access":

- `INSTALL.md`
- `QUICKSTART.md`
- `docs/CONFIG.md`
- `docs/API.md`

The docs now say:

- LAN works directly where reachable.
- Across networks, use MUSU Private Mesh with
  `musu mesh join --device-add-pass <musu.device_add.v1.json>`.
- A Tailscale.com account is not required for the default path.
- `tailnet_ip` is the preferred public docs term; legacy `tailscale_ip` remains
  accepted for older tools and internal compatibility.

The shell contract test now scans these public docs and rejects stale default
phrases such as "sign up for Tailscale", "LAN/Tailscale access", and
"Tailscale + peer pairing".

## Installed Runtime Evidence

The installed MSIX runtime was verified as version `1.15.0.2`:

- `verify-installed-msix-package.ps1`: passed.
- `audit-msix-desktop-entrypoint.ps1`: `ok=true`, `fail_count=0`.
- Installed Start-menu application executable: `musu-desktop.exe`.
- Installed CLI alias: `musu.exe`.
- Installed startup helper: `musu-startup.exe`.

After launching the installed Start-menu entry
`shell:AppsFolder\blossompark.musu_f5h38pf4yt4gc!MUSU`, 60-second high-frequency
process sampling found:

```text
unique_musu_processes=2
nodes_processes=0
mesh_status_processes=0
other_child_cli_processes=0
```

Unique observed MUSU processes:

```text
musu-desktop.exe
musu.exe startup open
```

This closes the specific "terminal window keeps appearing and disappearing"
claim for the packaged MUSU runtime. A separate stale `claude.exe --resume`
process tree was also found running `tauri:build`, `cargo`, and `rustc`; that
external process tree was stopped. It was not MUSU product behavior.

## Verification

Completed:

- `npm run test:tauri-shell`: `42` passed after the public docs contract,
  console-flicker contract, and local fleet auth-failure contract changes.
- `cargo test --manifest-path musu-rs\Cargo.toml private_mesh --lib -j 1`:
  `25` passed.
- `cargo test --manifest-path musu-bee\src-tauri\Cargo.toml http_status_code --lib`:
  `1` passed.
- `cargo check --manifest-path musu-bee\src-tauri\Cargo.toml --quiet`:
  passed.
- `git diff --check`: passed.
- Forbidden public-doc phrase scan across `INSTALL.md`, `QUICKSTART.md`,
  `docs/CONFIG.md`, and `docs/API.md`: no matches.
- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`:
  indexed `3189 files` and `3471 symbols` in `94475 ms`.

## Qualitative Evaluation

Current product grade for the tested local desktop loop: A-.

Why it improved:

- The installed desktop no longer behaves like a CLI wrapper that flashes
  terminals during passive refresh.
- Fleet refresh is now bridge-native and does not require cloud login.
- Private Mesh language is product-owned: "MUSU Private Mesh" and
  `musu.device_add.v1`, not "go sign up for Tailscale".
- Retry, stale last-seen, and Private Mesh boundary drift are contract-tested.
- Failure explanation is better than before: bad auth now fails closed instead
  of hiding behind a local fallback row.

Why it is not S-grade yet:

- The final two-physical-machine packaged desktop Private Mesh release proof is
  still the decisive remaining gate.
- Headscale bootstrap exists as a generated bundle, but the cockpit does not yet
  provide true one-click create-pass, transfer-pass, consume-pass UX.
- `tailnet_ip` is now the public docs term, but internal structs and legacy API
  fields still use `tailscale_ip` in many places for compatibility. That is
  acceptable internally, but the public product surface should continue moving
  toward `tailnet_ip`/`private_mesh`.
- The current installed-runtime process proof was on one machine. It proves
  process behavior, not the final cross-network path on two physical PCs.

## Code Audit

Findings after this pass:

1. Fixed: local fleet auth failures were too quiet.
   - Risk: `401` or `403` from the local bridge could look like an empty fleet.
   - Fix: parse HTTP status and return `local_fleet_auth_failed` for auth
     failures.
   - Coverage: Rust `http_status_code` unit test and shell source contract.

2. No finding: recurring desktop CLI child processes.
   - Evidence: installed runtime sampling found only `musu-desktop.exe` and
     `musu.exe startup open`; no `nodes`, no `mesh status`, no other transient
     CLI child.

3. Residual risk: raw HTTP helper is intentionally minimal.
   - `http_get_with_headers` supports local `http://` bridge calls only. That is
     acceptable because `list_fleet()` reads the local bridge registry URL, but
     it should not be generalized into an internet HTTP client.

4. Residual risk: public docs are corrected, but historical release docs still
   contain old `Tailscale` references.
   - This is acceptable when they are historical evidence or protocol-level
     route names.
   - New user-facing setup docs must keep MUSU Private Mesh as the default.

## Next Steps

1. Run the final two-physical-machine packaged desktop Private Mesh proof:
   - both machines joined through MUSU Headscale,
   - target creates `musu.private_mesh_physical_peer_evidence.v1`,
   - source desktop runs Release proof from the installed app,
   - archive importer accepts the packaged desktop archive,
   - final go/no-go sees `private_mesh_packaged_release_proof_verified=true`.
2. Design and implement Cockpit Add PC pass UX:
   - create pass,
   - copy/transfer pass,
   - consume pass on target,
   - show proof status in fleet row.
3. Keep public docs guarded by the new contract test so the default setup never
   regresses to "use Tailscale.com".
