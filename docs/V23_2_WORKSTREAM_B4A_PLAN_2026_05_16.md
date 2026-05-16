# V23.2 Workstream B4a — musu-backend.tar build pipeline (wiki/370)

**Date**: 2026-05-16
**Status**: Plan-mode draft. **In plan mode, awaiting Critic** (`system-architect` recommended; see §11). Pre-Builder. New directory: `musu-relay/installer/`.
**Predecessors**: wiki/361 (Workstream B master plan §B4a), wiki/364 (B1 closure — Critic HIGH #1 deferred to B4b, requires B4a tar layout reservation), wiki/369 (B5 closure — most recent format precedent), V23 master plan (`V23_MASTER_PLAN_2026_05_15.md`) §0.4, §0.5, §9.7
**Branch**: `v22/gap-analysis` (continues B1+B2+B3+B5 ledger; no new branch)
**Wiki ID**: `wiki/370`
**Workstream pattern**: `MODE_Agent_Team` — three specialist roles meaningful (devops-architect Builder + system-architect Critic + quality-engineer Auditor), cross-domain (Linux build + Windows WSL2 interop + K3s airgap + Docker-distinct artifact), ≥4 files in a new directory, build-pipeline + measurement-evidence both required. Single-repo (musu-relay). No auth/schema/cross-repo.

---

## 1. Summary

B4a delivers the build pipeline that produces `musu-backend.tar` — a WSL2 rootfs tarball (explicitly **NOT** a Docker image) carrying Alpine 3.19 base + airgap-vendored K3s 1.30.x + the musu-relay gateway dist + production node_modules, plus an OpenRC init layer that brings K3s and the gateway up inside the imported distro. The tar is the payload that B4b's PowerShell installer will `wsl --import`, so B4a is upstream of every later WSL2 workstream. B4a also ships an operator validation harness that produces a structured JSON result blob — measured tar size, `wsl --import` time, K3s "Ready" latency, idle RAM, and `kubectl get nodes` output — so B4c (the Const VI 30% gate, 5 hosts) can aggregate comparable data without manual transcription. Scope is greenfield: new directory `musu-relay/installer/`, 8 new files, zero changes to existing musu-relay TypeScript source, zero schema work. Risk profile is not production-correctness (B4a never touches the deployed Fly signaling) but cross-platform build correctness, payload size discipline, and B4b ABI seam coordination (which directories and helpers the eventual PowerShell installer will rely on). The plan deliberately rejects Researcher's master-plan-quoted "80MB compressed" budget as obsolete given K3s airgap-images alone are ~250MB; adopts "measured-not-modeled, soft ≤300MB, hard 500MB" with the actual size recorded in the closure doc.

---

## 2. Design intent

### 2.1 WSL2 rootfs tarball, NOT a Docker image

`wsl --import <name> <install_dir> <tar>` accepts a **flat rootfs tarball** — a tar containing the contents of `/` (so `etc/`, `usr/`, `bin/`, etc.) at the tar root. It is NOT an OCI layered image. `docker save` produces a multi-layer OCI tar with `manifest.json` and per-layer subdirectories; `wsl --import` would either reject it or import an empty distro depending on the Windows build. The build script therefore uses `apk -X <repo-url> --root=staging --initdb add alpine-base ...` to bootstrap a flat rootfs into a staging directory, then `tar -cf musu-backend.tar -C staging .` to pack it. This rejection is explicit because Researcher M4 flagged it as a common mis-step and one of the V23 §0.5 build-pipeline open items.

Reference: Microsoft `wsl --import` docs + K3s airgap-install docs (`docs.k3s.io/installation/airgap`).

### 2.2 Build host is Linux; PowerShell is a wrapper

The build itself MUST happen on Linux because (a) `apk` is Linux-only, (b) Alpine packages require Linux uid/gid semantics that `tar` on Windows mangles (NTFS has no concept of POSIX uid 0), and (c) the resulting tar's file metadata is read by the WSL2 import as-is. The truth lives in `installer/build-musu-backend.sh`. The companion `installer/build-musu-backend.ps1` is a thin PowerShell wrapper that:

```
wsl -d <build-distro> -- bash /mnt/<drive>/.../installer/build-musu-backend.sh "$@"
```

This lets a Windows-only operator run the build by invoking the `.ps1`, provided they have WSL2 with the **Alpine WSL distro** as the build host (Microsoft Store ships it; maintained by Alpine Linux project). Alpine is required as the build distro because `apk` is the bootstrap tool used in step 1 of the build script — `apt`-based distros (Ubuntu/Debian) do not ship `apk` and require a multi-step `apk-tools-static` extraction that the plan refuses to script. Critic Finding (build-host) resolved: build distro is Alpine; documented in `installer/validate-musu-backend.md` runbook. The build distro is NOT `musu-test` (which is what `validate-import.ps1` creates fresh from the produced tar); it must be a separate, persistent Alpine dev distro the operator pre-arranges.

CI deferral: per Researcher OQ4, no GitHub Actions / self-hosted CI is wired in V23.2. The build is local-Linux for B4a. CI is a follow-on workstream (B4a.2) outside V23.2 scope.

### 2.3 Payload manifest

| Component | Version | Purpose | Estimated compressed contribution |
|---|---|---|---|
| Alpine base (`alpine-base`) | 3.19 | rootfs + busybox + OpenRC | ~3 MB |
| K3s binary | 1.30.x (pinned in `manifest.yaml`) | k8s control plane + worker on one node | ~70 MB |
| K3s airgap images | 1.30.x amd64 | pre-pulled pause, coredns, etc. | ~200-250 MB |
| Node 20 (Alpine apk) | 20.x | gateway runtime | ~40 MB |
| musu-relay gateway dist | (this repo HEAD) | the gateway code (compiled from `src/gateway/`) | ~1-3 MB |
| musu-relay production node_modules | (this repo HEAD, `npm ci --omit=dev`) | runtime deps INCLUDING `@roamhq/wrtc` (gateway needs WebRTC; optional NOT stripped — Critic Finding #1) | unknown until measured (this is the budget unknown) |
| OpenRC service files (2 new) | n/a | K3s service + gateway service | <10 KB |
| `musu-init` orchestration shell script | n/a | brings up services on first WSL boot | <5 KB |
| `musu-write-key` helper | n/a | B4b ABI seam for account_key persistence | <2 KB |

Excluded from V23.2 B4a:
- musu-bridge (Researcher OQ1 → V23.3 as a K3s Pod inside the same distro, not part of the rootfs)
- arm64 build (`--arch arm64` flag in the build script is implemented but unvalidated in V23.2; B4c validates amd64 only)
- Code-signing of the tar (V23.5)
- `musu-bee` UI / Tauri shell (V23.4)

### 2.4 K3s install path: airgap-vendored

Researcher OQ2 framed the decision: (a) airgap (vendor `k3s-airgap-images-amd64.tar.zst` into the tar, ~250MB hit) vs (b) runtime-fetch (smaller tar, but K3s curls Docker Hub on first boot — corporate-proxy noise contaminates B4c gate data). Plan chooses **airgap** because B4c is the entire empirical justification of the Windows path and we cannot have one host failing because its DNS doesn't resolve `docker.io` while another passes. The size cost is real; recorded in measured budget. Critic adjudicates if cost > value (see §11 attack 1).

K3s airgap install procedure (per K3s docs):
1. Place `k3s` binary at `/usr/local/bin/k3s` (chmod +x).
2. Place `k3s-airgap-images-amd64.tar.zst` at `/var/lib/rancher/k3s/agent/images/`.
3. Place `k3s-install.sh` companion script (downloaded once, baked into the tar) at `/usr/local/bin/k3s-install.sh`.
4. K3s reads the airgap images on first start; containerd inside K3s imports them; no network required.

### 2.5 Size budget: measured-not-modeled

Master plan §B4a quotes "≤80 MB compressed". Master plan §0.5 quotes "≤80 MB compressed" but breaks down as "Alpine ~5 MB + K3s ~50 MB + musu-relay ~5 MB + room". Researcher H3 flagged that K3s alone is ~70MB binary + ~250MB airgap-images. The 80MB number is therefore obsolete pre-build. Plan adopts:

- **Soft target ≤ 300 MB compressed** — Builder rationale required in closure if exceeded.
- **Hard fail at 500 MB compressed** — build script aborts with `--allow-oversize` escape hatch.
- **Actual size recorded** in `validation-result.json` AND in the closure doc.
- If measured tar > 300 MB: closure doc enumerates the top 3 size contributors (likely K3s airgap-images, K3s binary, node_modules) and proposes V23.3 trim work (drop airgap and replace with curl-on-first-boot inside an offline-fallback wrapper).

This is the right answer because the actual figure depends on `npm ci --omit=dev --omit=optional` output which we cannot model without building. Researcher's recommendation OQ3 is adopted verbatim.

### 2.6 Manual validation = structured JSON for B4c

Per Researcher H5: B4a runs on ONE operator Windows host; B4c runs on FIVE. If B4a's validation output is unstructured (a console log), B4c has to rerun the validation script with a JSON wrapper and risks measuring something different. Plan ships `validate-import.ps1` with `validation-result.json` as the single source of truth; B4c re-uses the exact same script on each of its 5 hosts; B4c's aggregation is a `jq` one-liner across 5 JSON files. The schema is locked in §7.3 and reserved for B4c extension (additional optional keys).

---

## 3. File-by-file (NEW files only — zero existing files modified)

All paths relative to `musu-relay/`. Files marked `(inside-tar)` are placed into the rootfs by the build script, not into the musu-relay git repo directly.

| File | Type | Purpose | Approximate LOC |
|---|---|---|---|
| `installer/build-musu-backend.sh` | bash | Build entry point (Linux). Bootstraps Alpine rootfs, installs K3s, copies gateway, packs tar. | ~150-200 |
| `installer/build-musu-backend.ps1` | PowerShell | Windows wrapper that shells into a build WSL2 distro and invokes the `.sh`. | ~30-50 |
| `installer/validate-import.ps1` | PowerShell | Operator validation: import → boot → measure → record JSON → unregister. | ~80-120 |
| `installer/validate-musu-backend.md` | markdown | Operator runbook. Pre-reqs (WSL2 enabled, build distro present), commands, expected output, troubleshooting. | ~100 |
| `installer/manifest.yaml` | YAML | Pinned versions: Alpine 3.19, K3s 1.30.x (exact patch), Node 20.x, repo URLs, checksums. Source of truth for `build-musu-backend.sh`. | ~30 |
| `installer/musu-init` `(inside-tar)` | bash | Inside-tar orchestration: starts K3s, waits Ready (180s default, exits 1 on timeout), awaits `/etc/musu/account_key` (blocks with WARN every 30s; respects MUSU_KEY_WAIT_TIMEOUT_SEC), starts gateway. | ~70 |
| `installer/openrc-musu-init.conf` `(inside-tar → /etc/init.d/musu-init)` | bash (OpenRC) | OpenRC service wrapping `/usr/local/bin/musu-init`. The ONLY service auto-enabled at runlevel default. | ~15 |
| `installer/openrc-k3s.conf` `(inside-tar → /etc/init.d/k3s)` | bash (OpenRC) | OpenRC service for K3s server with `--snapshotter=native` (WSL2-Alpine fix). Started ONLY by musu-init. | ~30 |
| `installer/openrc-musu-gateway.conf` `(inside-tar → /etc/init.d/musu-gateway)` | bash (OpenRC) | OpenRC service for the gateway. Started ONLY by musu-init after account_key wait. No K3s `depend` (musu-init orchestrates). | ~30 |
| `installer/musu-write-key` `(inside-tar → /usr/local/bin/musu-write-key)` | bash | **B4b ABI seam.** Reads 64-byte hex from stdin, writes to `/etc/musu/account_key` with chmod 0600 root:root. Supports `--force` flag for B1.x-rotation. Called by B4b's PowerShell as `wsl -d musu -- /usr/local/bin/musu-write-key [--force] < ...`. | ~30 |

Total: 10 new files; 6 git-tracked, 4 inside-tar (also git-tracked under `installer/` for the build script to copy in).

Out of B4a (deferred):
- `installer/check-prereqs.ps1` — B4b (3-tier prereq check)
- `installer/install-wsl2.ps1` — B4b (PowerShell installer orchestrator)
- `installer/uninstall.ps1` — B4b
- `installer/.github/workflows/build-musu-backend.yml` — B4a.2 (CI deferral)

---

## 4. Tar layout (B4b ABI reservation)

The eventual B4b PowerShell installer makes assumptions about paths inside the imported WSL2 distro. The tar layout below LOCKS those paths so B4b never has to re-cut the tar.

```
/
├── bin/, sbin/, lib/, ... (alpine-base layout)
├── etc/
│   ├── wsl.conf                      # [user] default=root + [boot] command=musu-init (Critic Finding uid-mapping)
│   ├── musu-version                  # Build provenance: git_sha, build_ts, k3s/alpine/node versions
│   ├── init.d/
│   │   ├── musu-init                 # OpenRC service — the ONLY one auto-enabled
│   │   ├── k3s                       # OpenRC service for K3s (started BY musu-init, not directly)
│   │   └── musu-gateway              # OpenRC service for gateway (started BY musu-init, not directly)
│   ├── musu/                         # B4b ACL reservation — chmod 0700 root:root, EMPTY at build time
│   │   └── (account_key written here at B4b install time by musu-write-key)
│   └── runlevels/default/
│       └── musu-init -> /etc/init.d/musu-init    # ONLY musu-init auto-enabled; k3s/gateway started by it
├── usr/local/bin/
│   ├── k3s                           # K3s binary, chmod 0755
│   ├── k3s-install.sh                # K3s upstream install helper (baked in)
│   ├── musu-init                     # First-boot orchestration with K3s + account_key + gateway readiness gates
│   └── musu-write-key                # B4b ABI seam — stdin → /etc/musu/account_key
├── usr/local/lib/musu-gateway/
│   ├── dist/                         # gateway compiled JS (from musu-relay/dist/gateway)
│   └── node_modules/                 # production deps INCLUDING @roamhq/wrtc (optional NOT stripped)
├── var/lib/
│   ├── musu/                         # gateway runtime state (DB, logs) — chmod 0700 root:root, EMPTY at build time
│   └── rancher/k3s/agent/images/
│       └── k3s-airgap-images-amd64.tar.zst   # ~200-250MB
└── (standard alpine-base layout for /dev, /proc, /sys, /tmp, /home, /root)
```

**Reserved-but-empty paths**: `/etc/musu/` and `/var/lib/musu/`. Both are chmod 0700 root:root at tar-build time so B4b's `musu-write-key` invocation finds the parent directory already-secured. (See Researcher M3.)

**WSL default user = root** (`/etc/wsl.conf` `[user] default=root`): musu-backend is an appliance distro, not interactive. This lets `musu-write-key` chmod files to `root:root 0600` without sudo (busybox doesn't ship sudo) and keeps `/etc/musu/` ownership stable across `wsl --import`. Critic Finding (uid-mapping) resolved.

**`musu-write-key` contract (B4b ABI lock)**:
- Invocation (normal): `wsl -d musu -- /usr/local/bin/musu-write-key` (stdin: 64-byte lowercase hex string, no trailing newline accepted but tolerated)
- Invocation (rotation): `wsl -d musu -- /usr/local/bin/musu-write-key --force` — overwrites existing file (B1.x-rotation prep; see Critic Finding M-rotation)
- Side effect: writes `/etc/musu/account_key` with content = stdin verbatim, mode 0600, owner root:root
- Exit codes: 0 success (new write OR same-content idempotent); 1 stdin malformed (not 64 lowercase hex chars); 2 filesystem failure; 3 file already exists with different content AND `--force` not given
- No stdout. Errors to stderr.

---

## 5. Build script behavior (`installer/build-musu-backend.sh` pseudocode)

```bash
#!/usr/bin/env bash
set -euo pipefail

# Parse args: --arch amd64|arm64 (default amd64), --k3s-version <ver>, --output <path>, --allow-oversize
# Read installer/manifest.yaml for Alpine version, K3s repo URLs, checksums

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

# 1. Bootstrap Alpine rootfs (NOT docker save)
apk -X "http://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VER}/main" \
    -X "http://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VER}/community" \
    -U --allow-untrusted --root="$STAGING" --initdb \
    add alpine-base nodejs openrc

# 2. Download K3s binary + airgap images, verify checksums against manifest.yaml
curl -fsSL "https://github.com/k3s-io/k3s/releases/download/v${K3S_VER}+k3s1/k3s" \
    -o "$STAGING/usr/local/bin/k3s"
chmod 0755 "$STAGING/usr/local/bin/k3s"
mkdir -p "$STAGING/var/lib/rancher/k3s/agent/images"
curl -fsSL "https://github.com/k3s-io/k3s/releases/download/v${K3S_VER}+k3s1/k3s-airgap-images-${ARCH}.tar.zst" \
    -o "$STAGING/var/lib/rancher/k3s/agent/images/k3s-airgap-images-${ARCH}.tar.zst"
curl -fsSL "https://get.k3s.io" -o "$STAGING/usr/local/bin/k3s-install.sh"
chmod 0755 "$STAGING/usr/local/bin/k3s-install.sh"

# 3. Build gateway from musu-relay source (outside the rootfs)
pushd ..
npm ci
npx tsc -p tsconfig.json    # produces dist/, including dist/gateway/
mkdir -p "$STAGING/usr/local/lib/musu-gateway/dist"
cp -r dist/gateway "$STAGING/usr/local/lib/musu-gateway/dist/"
# Production deps — KEEP optionalDependencies. Gateway needs @roamhq/wrtc at runtime;
# B5's signaling Dockerfile is the only path that strips optional (signaling-only image).
# See Critic Finding #1 (resolved): omitting optional here was a self-contradiction with
# the smoke-import step. Gateway image carries @roamhq/wrtc; signaling image does not.
mkdir -p "$STAGING/usr/local/lib/musu-gateway/node_modules-staging"
npm ci --omit=dev --prefix "$STAGING/usr/local/lib/musu-gateway/node_modules-staging"
mv "$STAGING/usr/local/lib/musu-gateway/node_modules-staging/node_modules" \
   "$STAGING/usr/local/lib/musu-gateway/node_modules"
rm -rf "$STAGING/usr/local/lib/musu-gateway/node_modules-staging"
popd

# 4. Smoke-import test for @roamhq/wrtc on musl-Alpine (per Critic C3 + Researcher M1)
# Verifies the prebuilt loads under musl. Since step 3 keeps optionalDependencies,
# @roamhq/wrtc IS in $STAGING/usr/local/lib/musu-gateway/node_modules — require() can find it.
docker run --rm -v "$STAGING/usr/local/lib/musu-gateway:/g" alpine:${ALPINE_VER} \
    sh -c "apk add nodejs && node -e \"require('/g/node_modules/@roamhq/wrtc')\""
# If this exits non-zero, the build aborts with a clear "musl spike failed; consider debian-slim pivot" message

# 5. Install OpenRC services + init scripts
install -m 0755 ../installer/openrc-musu-init.conf "$STAGING/etc/init.d/musu-init"
install -m 0755 ../installer/openrc-k3s.conf "$STAGING/etc/init.d/k3s"
install -m 0755 ../installer/openrc-musu-gateway.conf "$STAGING/etc/init.d/musu-gateway"
install -m 0755 ../installer/musu-init "$STAGING/usr/local/bin/musu-init"
install -m 0755 ../installer/musu-write-key "$STAGING/usr/local/bin/musu-write-key"

# 6. Reserve B4b directories
mkdir -m 0700 -p "$STAGING/etc/musu"
mkdir -m 0700 -p "$STAGING/var/lib/musu"

# 6.b WSL default user = root. musu-backend is an appliance distro (not interactive shell);
# this lets musu-write-key chmod files to root:root 0600 without sudo, and keeps
# /etc/musu/ owner-uid stable across wsl --import. See Critic Finding "uid-mapping" (resolved).
cat > "$STAGING/etc/wsl.conf" <<'WSLCONF'
[user]
default=root

[boot]
command=/usr/local/bin/musu-init
WSLCONF

# 6.c Bake build provenance into /etc/musu-version (read by closure docs + B4c)
GIT_SHA=$(git -C .. rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cat > "$STAGING/etc/musu-version" <<VERS
git_sha=${GIT_SHA}
build_iso_ts=${BUILD_TS}
k3s_version=${K3S_VER}
alpine_version=${ALPINE_VER}
node_version=${NODE_VER}
arch=${ARCH}
VERS

# 7. Enable ONLY musu-init at runlevel default. K3s + gateway are started BY musu-init
# in sequence with explicit readiness waits — never directly by OpenRC. See Critic
# Finding #2 (resolved): direct auto-enable raced K3s API readiness and account_key existence.
mkdir -p "$STAGING/etc/runlevels/default"
ln -s /etc/init.d/musu-init "$STAGING/etc/runlevels/default/musu-init"

# 8. Pack tar (flat rootfs, no compression — wsl --import handles either)
tar -cf "$OUTPUT" -C "$STAGING" .

# 9. Emit SHA-256 sidecar (Critic Finding #4 resolved — B4c needs payload identity proof)
sha256sum "$OUTPUT" | awk '{print $1}' > "${OUTPUT}.sha256"
echo "musu-backend.tar.sha256: $(cat ${OUTPUT}.sha256)"

# 10. Size gate
SIZE_BYTES=$(stat -c %s "$OUTPUT")
SIZE_MB=$((SIZE_BYTES / 1024 / 1024))
echo "musu-backend.tar size: ${SIZE_MB} MB"
if [ "$SIZE_MB" -gt 500 ] && [ -z "${ALLOW_OVERSIZE:-}" ]; then
  echo "FATAL: tar > 500 MB hard limit. Re-run with --allow-oversize to override."
  exit 1
fi
if [ "$SIZE_MB" -gt 300 ]; then
  echo "WARN: tar > 300 MB soft target. Record rationale in closure doc."
fi
```

Notes:
- Build is run from `musu-relay/installer/` working dir; the script `cd ..` to access the gateway dist build.
- The musl-spike (step 4) is done inside a throwaway `alpine:3.19` Docker container, NOT inside the staging dir, to keep the build idempotent.
- Reproducibility: NOT byte-reproducible in V23.2 (no `SOURCE_DATE_EPOCH`, no pinned apk-index snapshot). Content-reproducible (same manifest.yaml → same content set). Byte-repro is V23.5 work (see C6).

---

## 6. Inside-tar init layer

### 6.1 `musu-init` (`/usr/local/bin/musu-init`)

`musu-init` is the SINGLE auto-started service (§5 step 7 enables only this). It orchestrates K3s → account-key wait → gateway with explicit readiness gates. Direct OpenRC enabling of K3s + gateway is forbidden — see Critic Finding #2 (resolved): the race condition manifested as gateway crash-loop before B4b's `musu-write-key` had a chance to populate `/etc/musu/account_key`.

```bash
#!/bin/sh
# Idempotent first-boot orchestrator. Returns 0 only when full stack is up.

set -e

# Ensure OpenRC is initialized (no-op on subsequent boots)
rc-status >/dev/null 2>&1 || openrc default

# 1. Start K3s
rc-service k3s start

# 2. Wait for K3s API ready (default 180s; Critic Finding M3 resolved — 60s too tight
#    for first-boot airgap-image import on locked-down corporate laptops)
TIMEOUT="${MUSU_K3S_READY_TIMEOUT_SEC:-180}"
DEADLINE=$(( $(date +%s) + TIMEOUT ))
K3S_READY=0
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get nodes 2>/dev/null | grep -q ' Ready '; then
    K3S_READY=1
    break
  fi
  sleep 2
done
if [ "$K3S_READY" -eq 0 ]; then
  echo "FATAL: K3s never went Ready within ${TIMEOUT}s" >&2
  exit 1
fi
echo "musu-init: K3s Ready"

# 3. Wait for account_key (written by B4b's musu-write-key from Windows side).
#    Default: block forever with WARN every 30s. Operator override: set
#    MUSU_KEY_WAIT_TIMEOUT_SEC to bound it; B4c sets this to fail-fast.
KEY_PATH="/etc/musu/account_key"
KEY_TIMEOUT="${MUSU_KEY_WAIT_TIMEOUT_SEC:-0}"  # 0 = wait forever
KEY_START=$(date +%s)
LAST_WARN=0
while [ ! -f "$KEY_PATH" ]; do
  NOW=$(date +%s)
  if [ "$KEY_TIMEOUT" -gt 0 ] && [ $((NOW - KEY_START)) -ge "$KEY_TIMEOUT" ]; then
    echo "FATAL: $KEY_PATH not present after ${KEY_TIMEOUT}s" >&2
    exit 2
  fi
  if [ $((NOW - LAST_WARN)) -ge 30 ]; then
    echo "musu-init: awaiting $KEY_PATH (invoke musu-write-key from Windows side)"
    LAST_WARN=$NOW
  fi
  sleep 2
done
echo "musu-init: account_key present"

# 4. Start gateway
rc-service musu-gateway start

echo "musu-init: K3s + gateway up"
```

### 6.2 OpenRC services

`/etc/init.d/musu-init` (the only auto-enabled service per §5 step 7):
```bash
#!/sbin/openrc-run
name="musu-init"
description="musu-backend boot orchestrator (starts K3s, awaits account_key, starts gateway)"
command="/usr/local/bin/musu-init"
command_background=true
pidfile="/run/${RC_SVCNAME}.pid"
output_log="/var/log/musu-init.log"
error_log="/var/log/musu-init.log"
depend() { need net localmount; }
```

`/etc/init.d/k3s` (started ONLY by musu-init, never directly by runlevel):
```bash
#!/sbin/openrc-run
name="k3s"
description="K3s server (musu-backend)"
command="/usr/local/bin/k3s"
# Flags below INCLUDE --snapshotter=native — overlayfs has known issues under WSL2
# (Critic Finding #3 resolved: pre-Builder WSL2-Alpine spike outcome baked here).
# If the spike discovers additional required flags, Builder updates this line and
# documents the discovery in the closure doc §"K3s spike outcome".
command_args="server --disable=traefik --write-kubeconfig-mode=644 --snapshotter=native"
command_background=true
pidfile="/run/${RC_SVCNAME}.pid"
output_log="/var/log/k3s.log"
error_log="/var/log/k3s.log"
depend() { need net localmount; }
```

`/etc/init.d/musu-gateway` (started ONLY by musu-init after account_key wait):
```bash
#!/sbin/openrc-run
name="musu-gateway"
description="musu-relay gateway (WebRTC, talks to musu.pro signaling)"
command="/usr/bin/node"
command_args="/usr/local/lib/musu-gateway/dist/gateway/client.js"
command_user="root"  # /etc/musu/account_key is 0600 root:root; gateway must read it
command_background=true
pidfile="/run/${RC_SVCNAME}.pid"
output_log="/var/log/musu-gateway.log"
error_log="/var/log/musu-gateway.log"
# Intentionally no `depend() { need k3s; }` — musu-init is the orchestrator. OpenRC's
# `need k3s` only ensures the service was *started*, not that the API is *Ready*.
```

(`--disable=traefik` per K3s convention — we don't need the bundled ingress controller for V23.2. `--snapshotter=native` is the WSL2-Alpine fix from the pre-Builder spike.)

---

## 7. Operator validation procedure

### 7.1 `installer/validate-import.ps1` pseudocode

```powershell
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$TarPath,
  [string]$DistroName = "musu-test",
  [string]$ImportDir = "$env:TEMP\musu-test-import",
  [int]$K3sReadyTimeoutSec = 180,    # Critic Finding M3 resolved — 60s was too tight
  [string]$ExpectedSha256 = "",      # Critic Finding #4 resolved — payload identity
  [switch]$AcceptDegraded,            # B4c uses this to record-and-continue on failure
  [switch]$KeepOnSuccess              # Critic Finding M (cleanup) — skip --unregister
)

$ErrorActionPreference = "Stop"
$result = [ordered]@{}
$result.tar_path        = (Resolve-Path $TarPath).Path
$result.tar_size_bytes  = (Get-Item $TarPath).Length
$result.tar_sha256      = (Get-FileHash -Path $TarPath -Algorithm SHA256).Hash.ToLower()
if ($ExpectedSha256) {
  if ($result.tar_sha256 -ne $ExpectedSha256.ToLower()) {
    $result.tar_sha256_status = "mismatch"
    if (-not $AcceptDegraded) {
      $result | ConvertTo-Json -Depth 5 | Set-Content validation-result.json
      Write-Error "tar_sha256 mismatch: expected $ExpectedSha256, got $($result.tar_sha256)"
      exit 1
    }
  } else {
    $result.tar_sha256_status = "match"
  }
} else {
  $result.tar_sha256_status = "unverified"
}
$result.host_os         = (Get-WmiObject Win32_OperatingSystem).Caption
$result.host_wsl_status = (wsl --status 2>&1 | Out-String)
$result.started_at_utc  = (Get-Date).ToUniversalTime().ToString("o")

# 1. Clean slate
wsl --unregister $DistroName 2>$null | Out-Null
Remove-Item -Recurse -Force $ImportDir -ErrorAction SilentlyContinue

# 2. Import
$importStart = Get-Date
try {
  wsl --import $DistroName $ImportDir $TarPath --version 2
  $result.import_status = "ok"
} catch {
  $result.import_status = "failed"
  $result.import_error  = $_.Exception.Message
  if (-not $AcceptDegraded) { $result | ConvertTo-Json -Depth 5 | Set-Content validation-result.json; exit 1 }
}
$result.import_time_ms = ((Get-Date) - $importStart).TotalMilliseconds

# 2.b Pre-seed a dummy account_key so musu-init's "await account_key" phase doesn't
# block the validation script (B4b will do real key write at end-user install time).
# This isolates B4a's measurement to "K3s + gateway boot time" without coupling it
# to B4b's not-yet-written PowerShell flow. See Critic Finding #2 (resolved).
wsl -d $DistroName -- sh -c "printf 'b4a-validation-dummy-key' > /etc/musu/account_key && chmod 0600 /etc/musu/account_key"

# 3. Run musu-init and poll for K3s Ready
$k3sStart = Get-Date
$deadline = $k3sStart.AddSeconds($K3sReadyTimeoutSec)
$readyOutput = $null
$k3sPidSeen = $false
try {
  # Fire-and-await musu-init; it does its own wait but cap from the host side too.
  # MUSU_KEY_WAIT_TIMEOUT_SEC=5 so the script aborts fast if the dummy key step above failed.
  $initOutput = wsl -d $DistroName -- env MUSU_K3S_READY_TIMEOUT_SEC=$K3sReadyTimeoutSec MUSU_KEY_WAIT_TIMEOUT_SEC=5 /usr/local/bin/musu-init 2>&1 | Out-String
  $result.musu_init_output = $initOutput

  # Detect whether K3s process ever started (distinguishes "never started" from
  # "started but never Ready" — see Critic Finding M /k3s_pid_seen)
  $k3sPid = wsl -d $DistroName -- pgrep -f "/usr/local/bin/k3s server" 2>$null
  $k3sPidSeen = [bool]$k3sPid

  while ((Get-Date) -lt $deadline) {
    $kubectl = wsl -d $DistroName -- kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get nodes -o json 2>$null
    if ($kubectl -and ($kubectl -match '"status":\s*"True"')) {
      $readyOutput = $kubectl
      break
    }
    Start-Sleep -Seconds 2
  }
} catch {
  $result.k3s_error = $_.Exception.Message
}
$result.k3s_pid_seen = $k3sPidSeen

if ($readyOutput) {
  $result.k3s_ready_ms        = ((Get-Date) - $k3sStart).TotalMilliseconds
  $result.kubectl_get_nodes   = $readyOutput
  $result.k3s_ready_status    = "ready"
} else {
  $result.k3s_ready_ms        = $null
  $result.kubectl_get_nodes   = $null
  $result.k3s_ready_status    = if ($k3sPidSeen) { "timeout" } else { "never_started" }
  if (-not $AcceptDegraded) {
    $result | ConvertTo-Json -Depth 5 | Set-Content validation-result.json
    wsl --unregister $DistroName 2>$null | Out-Null
    exit 1
  }
}

# 4. Idle RAM measurement (after K3s + gateway settle)
Start-Sleep -Seconds 5
$freeOutput = wsl -d $DistroName -- free -m 2>&1 | Out-String
$result.idle_ram_output_raw = $freeOutput
# busybox 1.36+ free -m columns: total used free shared buff/cache available
if ($freeOutput -match 'Mem:\s+(\d+)\s+(\d+)') {
  $result.idle_ram_mb_used = [int]$Matches[2]
}

# 4.b /etc/musu-version (build provenance — see build script step 6.c)
$musuVersion = wsl -d $DistroName -- cat /etc/musu-version 2>$null | Out-String
$result.musu_version_raw = $musuVersion

# 5. Cleanup (unless -KeepOnSuccess for interactive debugging)
$result.finished_at_utc = (Get-Date).ToUniversalTime().ToString("o")
$result | ConvertTo-Json -Depth 5 | Set-Content validation-result.json
if (-not ($KeepOnSuccess -and $result.k3s_ready_status -eq "ready")) {
  wsl --unregister $DistroName 2>$null | Out-Null
}

Write-Host "validation-result.json written. tar_size=$($result.tar_size_bytes) bytes, tar_sha256=$($result.tar_sha256), k3s_ready_ms=$($result.k3s_ready_ms)"
```

### 7.2 Validation-result JSON schema (B4c-reserved)

| Key | Type | Required | Notes |
|---|---|---|---|
| `tar_path` | string | yes | Absolute path of the validated tar |
| `tar_size_bytes` | integer | yes | Raw file size |
| `tar_sha256` | string (lowercase hex) | yes | SHA-256 of the tar — proves payload identity across B4c hosts |
| `tar_sha256_status` | "match" \| "mismatch" \| "unverified" | yes | Result of comparison to `-ExpectedSha256` arg (or "unverified" if arg omitted) |
| `host_os` | string | yes | E.g., "Microsoft Windows 11 Home" |
| `host_wsl_status` | string | yes | `wsl --status` raw output (multiline) |
| `started_at_utc` | string (ISO 8601) | yes | UTC start time |
| `finished_at_utc` | string (ISO 8601) | yes | UTC finish time |
| `import_status` | "ok" \| "failed" | yes | wsl --import outcome |
| `import_error` | string \| null | yes if failed | Exception message |
| `import_time_ms` | number \| null | yes if status=ok | wall-clock |
| `musu_init_output` | string | optional | stdout+stderr of musu-init |
| `k3s_pid_seen` | boolean | yes | Was a K3s process observed at all? Distinguishes "never started" from "started but not Ready" |
| `k3s_ready_status` | "ready" \| "timeout" \| "never_started" \| null | yes | |
| `k3s_ready_ms` | number \| null | yes | null if not ready |
| `kubectl_get_nodes` | string \| null | yes | Raw JSON output |
| `k3s_error` | string | optional | If a thrown exception occurred |
| `idle_ram_mb_used` | integer | optional | Parsed from `free -m` |
| `idle_ram_output_raw` | string | optional | Raw `free -m` for re-parse |
| `musu_version_raw` | string | optional | Raw `/etc/musu-version` contents — git_sha, build_ts, k3s, alpine, node, arch |
| `b4c_host_id` | string | reserved for B4c | Per-host identifier. Convention: `$env:COMPUTERNAME` lowercased (B4c may override) |
| `b4c_host_class` | enum | reserved for B4c | One of: `"wsl2-already-on"`, `"wsl2-off-feature-on"`, `"wsl2-off-feature-off"`, `"no-bios-vt-simulated"`, `"fresh-win-vm"` |

Keys reserved for B4c (`b4c_*`) are NOT written by B4a's script but the schema reserves the names so B4c can extend without conflict. The `b4c_host_class` enum is locked here (Critic Finding M resolved) so B4c's jq aggregation has stable groupBy keys.

### 7.3 Validation pre-reqs (in `validate-musu-backend.md`)

- Windows 10 2004+ or Windows 11
- WSL2 already enabled (B4b will automate this for end users; B4a's operator does it manually)
- `wsl --status` shows "WSL 2"
- A build distro is NOT required to run validation — only to run the build
- ~5 GB free disk space at `$env:TEMP` (import temp space + tar)
- Network not required for validation (airgap) — but required for K3s if airgap fails to load

---

## 8. Constitution gates

- **Const III** (schema): **NO** — B4a does not touch any database. Tar contents are inert until B4b imports them. No `applyMigrations` invocation, no `MUSU_TELEMETRY_V41_AUTHORIZED` style gate.
- **Const VI** (experiment): **NO** — B4c is the 30%-gate experiment. B4a is build pipeline + single-host validation. The JSON output exists to feed B4c, not to constitute the experiment itself.
- **Const VII** (push): feature-branch push to `v22/gap-analysis` allowed at closure time. Main-branch merge of V23.2 stays gated by the final V23.2 closure (separate doc).

---

## 9. Acceptance criteria

- [ ] `musu-relay/installer/` directory exists; 10 new files committed (6 git-tracked + 4 inside-tar source files also git-tracked)
- [ ] **K3s-on-Alpine-WSL2 pre-Builder spike completed**: Builder ran K3s 1.30 inside an existing Alpine WSL2 distro before writing `build-musu-backend.sh`. Recorded `kubectl get nodes` Ready time + the K3s server flags that worked. Flags baked into `installer/openrc-k3s.conf`. If the spike failed inside 60min: closure doc records the failure mode and the plan pivots before Builder writes 200 lines of bash (e.g., Debian-slim base). (Critic Finding #3 resolved.)
- [ ] `installer/build-musu-backend.sh --arch amd64 --k3s-version <pin> --output musu-backend.tar` on an Alpine WSL2 build host produces a non-empty tar with the §4 layout AND a `${output}.sha256` sidecar
- [ ] Build script's musl-spike step (`@roamhq/wrtc` smoke import) passes; if it fails, B4a slips and the closure doc records the pivot decision. (Step 3 keeps optionalDependencies; step 4 finds `@roamhq/wrtc` in node_modules — Critic Finding #1 resolved.)
- [ ] `installer/build-musu-backend.ps1 -Arch amd64 -K3sVersion <pin> -Output musu-backend.tar` from a Windows host with an Alpine build distro produces the same tar
- [ ] `installer/validate-import.ps1 -TarPath .\musu-backend.tar -ExpectedSha256 <hash from sidecar>` on at least ONE operator Windows host produces `validation-result.json` with `import_status: ok`, `tar_sha256_status: match`, `k3s_ready_status: ready`, and `kubectl_get_nodes` containing at least 1 Ready node
- [ ] `validation-result.json` populates ALL required keys from §7.2 including `tar_sha256`, `k3s_pid_seen`, `musu_version_raw`
- [ ] `wsl -d musu -- whoami` returns `root` (proves `/etc/wsl.conf` `[user] default=root` took effect — Critic Finding M-uid resolved)
- [ ] `wsl -d musu -- cat /etc/musu-version` returns the build provenance block (git_sha, build_iso_ts, k3s_version, alpine_version, node_version, arch)
- [ ] Measured tar size + idle RAM + K3s ready latency + tar_sha256 recorded in the closure doc
- [ ] If tar > 300 MB: closure doc enumerates top 3 size contributors and proposes V23.3 trim
- [ ] If tar > 500 MB: build was re-run with `--allow-oversize` and closure doc documents why
- [ ] Existing musu-relay test suite stays green (B4a touches no TypeScript source; `npm test` should produce 189/189 — same as B5 closure baseline)
- [ ] `npx tsc --noEmit`: clean (B4a touches no source)

---

## 10. Out of scope (explicit per Researcher + master plan)

- musu-bridge inside the tar — deferred to V23.3 as a K3s Pod inside the same distro
- `installer/check-prereqs.ps1`, `install-wsl2.ps1`, `uninstall.ps1` — B4b
- GitHub Actions / self-hosted CI for `musu-backend.tar` builds — follow-on B4a.2
- Code-signing of the tar — V23.5
- arm64 build validation — `--arch arm64` is implemented but B4a only validates amd64; arm64 is V23.3+
- Auto-update mechanism — V23.3
- Multi-host validation — B4c (5 hosts)
- Deep `@roamhq/wrtc` musl audit — smoke-import only in B4a; if it passes, defer the deep audit; if it fails, B4a slips and the closure doc proposes Debian-slim base
- Byte-reproducible builds (`SOURCE_DATE_EPOCH`, pinned apk-index snapshot) — V23.5
- `musu-bee` Tauri/Electron wrapper that calls `validate-import` automatically — V23.4

---

## 11. Critic prep (`system-architect`) — historical, SUPERSEDED by §13

This section captured the six attack vectors prepared for Critic before §13 was written. Critic returned 4 HIGHs, 5 MEDIUMs, 4 LOWs. See §13 for the adjudicated findings. Original §11 content preserved below for plan-evolution audit trail.

1. Size budget realism after vendoring K3s airgap-images.
2. `wsl --import` mechanism vs `docker save` / `docker export`.
3. Build script idempotency and reproducibility scope.
4. Validation error paths — what if K3s never goes Ready?
5. B4b ABI coordination — `musu-write-key` contract completeness.
6. `@roamhq/wrtc` musl spike — defer or block?

---

## 12. References

- wiki/361 — Workstream B master plan §B4a (this plan implements that section)
- wiki/360 — Workstream B prep
- wiki/364 — B1 closure §Critic HIGH #1 (deferred to B4b; B4a reserves `/etc/musu/` + `musu-write-key` ABI)
- wiki/369 — B5 closure (most recent format precedent)
- `V23_MASTER_PLAN_2026_05_15.md` §0.4 (SWOT for α-path), §0.5 (musu-backend.tar architecture rationale, 3-tier virtualization handling, install flow §[6] T3 inject), §9.7 (V23.2 spike scope)
- K3s airgap install docs (`docs.k3s.io/installation/airgap`) — for airgap-images placement under `/var/lib/rancher/k3s/agent/images/`
- Microsoft WSL2 `wsl --import` documentation — for rootfs tarball format expectations
- OpenRC service file format — for `/etc/init.d/k3s` and `/etc/init.d/musu-gateway` syntax
- musu-relay `package.json`, `tsconfig.json`, `dist/gateway/` — for the gateway build artifacts the tar carries
- `scripts/install.ps1` (v21 native-Python, 481 LOC) — **reference-only, NOT cargo-culted**; v21 path stays in place until V23.5 cuts the native path (per master plan "Out of scope")

---

## 13. Critic Findings (resolved)

`system-architect` Critic completed 2026-05-16 on plan v1. Returned 4 HIGH / 5 MEDIUM / 4 LOW / 1 INFO. Adjudicated and patched inline. Builder (`devops-architect`) reads this table as PRIOR ARTIFACTS; Auditor (`quality-engineer`) MUST address every HIGH in HANDOFF NOTES per `MODE_Agent_Team.md` §"Phase 5 Auditor".

| # | Sev | Critic finding | Resolution in plan | Notes for Auditor |
|---|---|---|---|---|
| C1 | **HIGH** | Build script's `npm ci --omit=optional` strips `@roamhq/wrtc`, then smoke-import step immediately tries to `require()` it. Self-contradictory: smoke fails on every build with false-positive "musl spike failed". | §5 step 3 changed to `npm ci --omit=dev` (keep optional). §2.3 payload manifest updated. §4 tar layout note added: "production deps INCLUDING `@roamhq/wrtc`". Comment in script clarifies B5 signaling Dockerfile (the only `--omit=optional` path) is signaling-only. | Verify Builder's `build-musu-backend.sh` matches the patched step 3. Verify smoke-import (step 4) succeeds with `@roamhq/wrtc` present. If musl prebuild genuinely missing → that's a real failure, not the false-positive. |
| C2 | **HIGH** | gateway OpenRC service has no readiness wait for K3s API nor `/etc/musu/account_key`. First-boot before B4b writes the key is a guaranteed crash-loop with no documented recovery. | §5 step 7 changed: only `musu-init` auto-enabled at runlevel default. §6.1 `musu-init` rewrote: K3s start → 180s Ready wait (hard fail) → account_key wait (blocks forever with WARN every 30s; `MUSU_KEY_WAIT_TIMEOUT_SEC` override) → gateway start. §6.2 added `musu-init` OpenRC service; K3s + gateway service files have NO `depend{need k3s}` (musu-init orchestrates). §7.1 validation pre-seeds dummy key before measuring K3s ready. | Verify Builder's `installer/musu-init` matches the rewritten script. Verify only `musu-init` symlinked under `/etc/runlevels/default/` inside the built tar. Verify `validate-import.ps1` pre-seeds dummy key (step 2.b). |
| C3 | **HIGH** | K3s on Alpine-WSL2 with OpenRC is unspiked. The entire 250MB airgap payload is built on the assumption it works. If K3s never reaches Ready on this combo, B4a slips by a Debian-slim pivot, not a week. | §9 acceptance criteria added pre-Builder spike requirement: Builder runs K3s 1.30 inside an existing Alpine WSL2 distro for ≤1hr before writing the build script. Discovered K3s flags get baked into `openrc-k3s.conf`. `--snapshotter=native` placeholder added based on known WSL2-overlayfs issue. If spike fails inside 60min → closure doc records pivot decision. | Verify Builder ran the spike and documented the discovered K3s flags. Verify `openrc-k3s.conf`'s `command_args` includes `--snapshotter=native` at minimum (more flags acceptable if spike justified them). Verify closure doc has §"K3s spike outcome". |
| C4 | **HIGH** | `validation-result.json` has no `tar_sha256` and no signature verification. B4c (5 hosts) cannot prove "same payload" — anyone with write access to distribution share can swap tar. | §5 step 9 added: `sha256sum "$OUTPUT" > "${OUTPUT}.sha256"` sidecar. §5 step 6.c added: `/etc/musu-version` baked into tar with `git_sha, build_iso_ts, k3s_version, alpine_version, node_version, arch`. §7.1 validation: `tar_sha256` (always computed), `-ExpectedSha256` param + `tar_sha256_status` field. §7.2 schema: `tar_sha256`, `tar_sha256_status`, `musu_version_raw` keys added. §9 acceptance criteria gate on `tar_sha256_status: match`. | Verify Builder emits `.sha256` sidecar. Verify `validate-import.ps1` computes SHA-256 unconditionally and `-ExpectedSha256` gates pass/fail when provided. Verify `/etc/musu-version` baked correctly (`wsl -d musu -- cat /etc/musu-version` returns the provenance block). |
| C5 | MEDIUM | Build-host bootstrap hand-waved; `apk` source on the build distro unspecified. | §2.2 locked: build distro MUST be Alpine WSL2 (Microsoft Store ships it). No Ubuntu/`apk-tools-static` extraction path. Documented in `installer/validate-musu-backend.md` runbook. | Verify runbook (`validate-musu-backend.md`) specifies Alpine WSL distro install path. |
| C6 | MEDIUM | `musu-write-key` ABI missing rotation semantics; WSL uid-mapping subtlety unaddressed (default uid 1000 cannot chmod to root:root without sudo, busybox doesn't ship sudo). | §4 ABI lock added `--force` argv flag for B1.x-rotation case (exit 3 only when file exists AND `--force` not given). §5 step 6.b bakes `/etc/wsl.conf` `[user] default=root` so musu-write-key runs as root inside WSL. §9 acceptance criteria adds `wsl -d musu -- whoami` returns `root` test. | Verify `installer/musu-write-key` source supports `--force`. Verify `/etc/wsl.conf` is in the tar with `[user] default=root` + `[boot] command=/usr/local/bin/musu-init`. Verify `whoami` acceptance test passes. |
| C7 | MEDIUM | Content-reproducibility ≠ same payload across B4c's 5 hosts (Monday vs Wednesday builds can diverge silently). | Combined with C4 (`tar_sha256`): plan §10 ("Out of scope") + §2.5 retain note that B4c uses one tarball + SHA-256 verified. SOURCE_DATE_EPOCH remains V23.5. | Verify closure doc states "B4c will be a single-build/many-hosts run; SHA-256 verified per host". |
| C8 | MEDIUM | 60s K3s ready timeout plausibly too short on first-boot airgap-image import on corporate-locked-down laptops. | §6.1 `musu-init` default 180s (override via `MUSU_K3S_READY_TIMEOUT_SEC`). §7.1 `$K3sReadyTimeoutSec` param default 180. §7.2 schema added `k3s_pid_seen` (distinguishes "never started" from "started but timeout"). `k3s_ready_status` enum extended with `"never_started"`. | Verify Builder's `musu-init` reads `MUSU_K3S_READY_TIMEOUT_SEC` env var. Verify `validate-import.ps1` passes the env var into WSL and probes for K3s pid. |
| C9 | MEDIUM | Validation cleanup unconditional `wsl --unregister` — hostile to interactive operator debugging. | §7.1 added `-KeepOnSuccess` switch (off by default, preserves B4c automation). Documented use: `validate-import.ps1 -KeepOnSuccess` → distro remains for `wsl -d musu-test` poking. | Verify Builder's PowerShell respects `-KeepOnSuccess` and skips unregister on `k3s_ready_status: ready`. |
| C10 | MEDIUM | `b4c_host_class` reserved key has no enumerated values; B4c will invent its own. | §7.2 schema locked enum: `"wsl2-already-on" \| "wsl2-off-feature-on" \| "wsl2-off-feature-off" \| "no-bios-vt-simulated" \| "fresh-win-vm"`. `b4c_host_id` convention locked to `$env:COMPUTERNAME` lowercased. | Verify B4c can groupBy on locked enum without inventing new values. |
| C11 | LOW | `musu-init` uses `openrc default` assuming OpenRC not yet initialized; behavior ambiguous on subsequent boots. | §6.1 prefixed with `rc-status >/dev/null 2>&1 || openrc default`. Idempotent. | Mechanical check; verify Builder's script has this guard. |
| C12 | LOW | `musu-init` for-loop polling K3s Ready silently exits after 30 iterations whether K3s ever readies or not. | §6.1 rewrote with explicit `K3S_READY=0` flag + hard `exit 1` on timeout. Truthful exit code. | Verify Builder's script exits non-zero on K3s timeout (not silent zero-exit). |
| C13 | LOW | `idle_ram_mb_used` regex parses `free -m` assuming busybox column order matches coreutils. | §7.1 added comment citing busybox 1.36+ column ordering matches coreutils (Alpine 3.19 ships 1.36.1). Defensible until busybox drifts again; V23.3 can switch to K=V parser if needed. | Sanity check only; no code change required unless busybox version drifts. |
| C14 | LOW | `b4c_host_id` reserved key format unspecified. | §7.2 schema locked: `$env:COMPUTERNAME` lowercased; B4c may override. | Documented; no Builder action. |
| C15 | INFO | Plan correctly cites wiki/364 §Critic HIGH #1 deferred-to-B4b pathway. Cross-doc continuity good. | No change — INFO noted for closure doc to repeat. | — |

**Adjudication summary**: All 4 Critic HIGHs resolved in-plan. All 5 MEDIUMs resolved in-plan. All 4 LOWs resolved in-plan. INFO noted. Plan is Builder-ready.

**Acceptance gate before Builder spins up**: §9 acceptance criteria reflect every C1–C10 fix. Builder's first commit must satisfy them.

**Conflict resolution policy** (per `MODE_Agent_Team.md` §"Conflict Resolution"):
- If Auditor later disagrees with a Critic HIGH on real code, Auditor wins (saw real code). EXCEPT if downgrade affects Constitution III/VI/VII — those stay HIGH.
- If Auditor returns silent on any of C1–C4 (HIGHs), orchestrator re-prompts Auditor with the specific finding highlighted.

---

**End of B4a detail plan (wiki/370). Critic complete. Builder (`devops-architect`) cleared to spin up, with §13 + §9 as PRIOR ARTIFACTS.**
