# V23.4 Phase 4 T2-Z2 closure — wiki/441

**Date**: 2026-05-19
**Branch**: `v23/phase4`
**Scope**: 2 code items + 2 defer-paragraphs (~15 LOC code)
**Status**: shipped (2 items shipped, 2 deferred V23.5)

## Items

### 2a. F-A1c-3 — Dockerfile reproducibility (partial)

**Problem**: `musu-bridge/Dockerfile` line 16 `FROM python:3.11-slim-bookworm`
is tag-pinned, not digest-pinned. Tags are mutable on docker hub (re-tag
events are rare but recorded historically); the only byte-stable pin is
`FROM python:3.11-slim-bookworm@sha256:<digest>`. Additionally, `apt-get
install` leaves `.deb` cache files under `/var/cache/apt/archives/` with
download timestamps, which inflates the layer (~2-5 MB) and leaks
wall-clock mtime into layer content.

**Fix (partial)**:
1. Added `rm -rf /var/cache/apt/archives /var/cache/apt/*.bin` to the existing apt cleanup `RUN`. This is the cache-clear half of the fix.
2. Added a TODO + format-spec comment at the `FROM` line explaining the digest pin shape. **Did NOT** invent a digest value (per task constraint: "No FAKE digest values"). The pin requires resolving the current stable digest from docker hub via `crane digest python:3.11-slim-bookworm` from a network-connected build box.

**Deferred to V23.5**: the actual digest plumbing belongs in `manifest.yaml` (alongside the K3s binary + airgap digests) so it gets the same audit treatment. V23.5 should:
- Add `python_base_image_sha256_amd64` to `manifest.yaml`.
- Have `build-musu-backend.sh` substitute the digest into the Dockerfile (or pass it via a `--build-arg PYTHON_BASE_DIGEST`).
- Drop the TODO above.

**Files touched**:
- `musu-bridge/Dockerfile`

### 2b. F-A1c-4 — WSL2 portproxy fallback

**Problem**: When this PC plays the rendezvous role (T2-F step 5.9 sets
`$script:IsRendezvous = $true`), `musu-signaling` runs inside the WSL2 'musu'
distro and binds `0.0.0.0:9900`. WSL2 networking is NATed: a service listening
inside the distro is NOT reachable from the Windows host LAN by default —
external peers attempting to reach `<host-lan-ip>:9900` would hit no route.
The fix is a Windows-side `netsh interface portproxy add v4tov4` step that
DNATs incoming `:9900` to the WSL2 distro's vEthernet IP.

**Fix**: New Step 11.5 in `install-wsl2.ps1` (between gateway-readiness wait
at Step 11 and cleanup at Step 12). Behavior:

1. Skip entirely when `$script:IsRendezvous = $false` (peer role does not need the proxy).
2. Defensive `Get-Command netsh.exe -ErrorAction SilentlyContinue`. If `netsh.exe` is missing (highly unusual on Windows but enterprise images sometimes strip it), log a warning and continue — install must not fail just because reachability cannot be configured.
3. Resolve the WSL2 distro's vEthernet IPv4 via `wsl -d musu -- hostname -I` (takes the first `\d+\.\d+\.\d+\.\d+` token).
4. Best-effort `netsh interface portproxy delete v4tov4 listenport=9900 listenaddress=0.0.0.0` to keep re-installs idempotent.
5. `netsh interface portproxy add v4tov4 listenport=9900 listenaddress=0.0.0.0 connectport=9900 connectaddress=<wsl-ip>`. If exit code is non-zero, log a warning rather than throw — peer-role reachability is unaffected by this failure.

**Files touched**:
- `musu-relay/installer/install-wsl2.ps1`

### 2c. F-A1c-1 — worker-sidecar bench scenario — DEFER V23.5

The bench tool ergonomics forward-pointer specifically calls for a "worker-sidecar" benchmark scenario. The worker-sidecar pattern does NOT exist in the current architecture (V23.4 ships a single bridge daemon per K3s node, not a per-workload sidecar pair). Reactivation criterion: when V23.5/V23.6 adds a sidecar-per-workspace runtime pattern (forward-pointer in V23.4 master plan §5.Z notes).

### 2d. F-A1c-2 — bench tool wrapper for multiple scenarios — DEFER V23.5

Depends on F-A1c-1 (sidecar scenario) being on disk to wrap. Pure ergonomics; no functional gap until the dependent scenario lands. Same reactivation criterion as F-A1c-1.

## Verification

- `bash -n` clean on the build script (unrelated path).
- `grep -E "^FROM|^RUN|^COPY|^WORKDIR" musu-bridge/Dockerfile | head` shows the new `FROM` line + the existing `apt-get + rm` RUN block expanded with cache-clear half.
- PowerShell AST parse clean on `install-wsl2.ps1` (1057 lines).

## References

- master plan: `docs/V23_4_PHASE4_MASTER_PLAN_2026_05_18.md` §5.Z row Z2
- self-contained product memo: `[[feedback-self-contained-product]]`
- T2-F rendezvous role context: `docs/V23_4_F_T2F_CLOSURE_2026_05_18.md`
