#!/usr/bin/env bash
# musu-backend.tar build pipeline — V23.2 Workstream B4a (wiki/370)
#
# This script produces a WSL2 rootfs tarball (NOT a Docker image) carrying:
#   - Alpine 3.19 base + busybox + OpenRC
#   - K3s 1.30.x binary + airgap-images (vendored, no Docker Hub on first boot)
#   - musu-relay gateway compiled JS + production node_modules (INCLUDING
#     @roamhq/wrtc — gateway needs WebRTC at runtime)
#   - OpenRC init layer with a single auto-enabled service (musu-init) that
#     orchestrates K3s start → account_key wait → gateway start
#
# The output tar is consumed by `wsl --import <name> <dir> <tar>`. It is NOT
# an OCI layered image; `docker save` would not work here.
#
# Build host: MUST be Alpine WSL2 (apk is the bootstrap tool; coreutils tar is
# required for POSIX uid=0 metadata). The companion build-musu-backend.ps1
# wraps this script with `wsl -d Alpine -- bash …`.
#
# ─────────────────────────────────────────────────────────────────────────────
# Critic Findings honored (wiki/370 §13):
#   C1 HIGH — Step 3 uses `npm ci --omit=dev` ONLY (KEEPS optionalDependencies).
#             @roamhq/wrtc must be in node_modules for step 4 smoke-import to
#             succeed. The signaling Dockerfile (B5) is the ONLY path that
#             uses `--omit=optional`; this gateway path does NOT.
#   C2 HIGH — Step 7 symlinks ONLY musu-init to /etc/runlevels/default. K3s
#             and musu-gateway OpenRC services are started BY musu-init in
#             sequence with explicit readiness gates — never auto-enabled.
#   C3 HIGH — K3s flags `--snapshotter=native --disable=traefik` are baked
#             into openrc-k3s.conf. If the operator's first validate run shows
#             K3s never goes Ready, the closure doc records the runtime spike
#             outcome + any flag adjustments needed.
#   C4 HIGH — Step 9 emits ${OUTPUT}.sha256 sidecar (sha256sum). Step 6.c
#             bakes /etc/musu-version with git_sha + build_iso_ts + version
#             pins for B4c per-host payload-identity verification.
#   C5..C14 — see §13 (180s K3s ready default, --force on musu-write-key,
#             [user] default=root in /etc/wsl.conf, b4c_host_class enum lock,
#             etc.).
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Arg parsing ────────────────────────────────────────────────────────────
ARCH="amd64"
K3S_VER=""
OUTPUT=""
ALLOW_OVERSIZE=""

usage() {
  cat <<EOF
Usage: $0 --arch <amd64|arm64> --k3s-version <v1.30.x> --output <path/to/musu-backend.tar> [--allow-oversize]

Required:
  --arch          Target architecture (amd64 validated; arm64 builds but unvalidated in V23.2)
  --k3s-version   K3s version pin (e.g., v1.30.4). Overrides manifest.yaml.
  --output        Output tar path (will be created/overwritten)

Optional:
  --allow-oversize  Skip the 500MB hard fail (warns only)

Build host requirement: Alpine WSL2 (apk + coreutils tar + curl + git).
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --arch)            ARCH="$2"; shift 2 ;;
    --k3s-version)     K3S_VER="$2"; shift 2 ;;
    --output)          OUTPUT="$2"; shift 2 ;;
    --allow-oversize)  ALLOW_OVERSIZE="1"; shift ;;
    -h|--help)         usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

if [ -z "$OUTPUT" ]; then echo "FATAL: --output required" >&2; usage; exit 1; fi
case "$ARCH" in amd64|arm64) ;; *) echo "FATAL: --arch must be amd64 or arm64" >&2; exit 1 ;; esac

# ── Resolve script location + read manifest.yaml ───────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MANIFEST="$SCRIPT_DIR/manifest.yaml"
if [ ! -f "$MANIFEST" ]; then
  echo "FATAL: manifest.yaml not found at $MANIFEST" >&2
  exit 1
fi

# Tiny YAML key=value reader (manifest.yaml is intentionally flat).
yaml_get() {
  local key="$1"
  awk -v k="$key" '
    $0 ~ "^" k ":" {
      sub("^" k ":[[:space:]]*", "")
      gsub(/^"|"$/, "")
      print
      exit
    }
  ' "$MANIFEST"
}

ALPINE_VER="$(yaml_get alpine_version)"
NODE_VER="$(yaml_get node_version)"
MANIFEST_K3S_VER="$(yaml_get k3s_version)"

# CLI --k3s-version takes precedence over manifest.
if [ -z "$K3S_VER" ]; then K3S_VER="$MANIFEST_K3S_VER"; fi
# Strip a leading "v" if present so the URL template can re-add it cleanly.
K3S_VER_NUM="${K3S_VER#v}"

if [ -z "$ALPINE_VER" ] || [ -z "$K3S_VER" ] || [ -z "$NODE_VER" ]; then
  echo "FATAL: manifest.yaml missing one of alpine_version, k3s_version, node_version" >&2
  exit 1
fi

echo "── musu-backend.tar build ─────────────────────────────────────────────"
echo "  arch:           $ARCH"
echo "  alpine_version: $ALPINE_VER"
echo "  k3s_version:    v${K3S_VER_NUM}"
echo "  node_version:   $NODE_VER"
echo "  output:         $OUTPUT"

# ── Build-host sanity checks ───────────────────────────────────────────────
for tool in apk curl tar sha256sum stat awk install ln mkdir; do
  command -v "$tool" >/dev/null 2>&1 || { echo "FATAL: build host missing '$tool'. Use Alpine WSL2." >&2; exit 1; }
done

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
echo "  staging:        $STAGING"

# ── Step 1: apk-bootstrap Alpine rootfs ────────────────────────────────────
# This is the canonical "build a chroot" idiom — NOT `docker save`, which
# would emit an OCI layered tar that wsl --import does not understand.
echo "[1/10] apk-bootstrap Alpine $ALPINE_VER rootfs into $STAGING"
apk -X "http://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VER}/main" \
    -X "http://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VER}/community" \
    -U --allow-untrusted --root="$STAGING" --initdb \
    add alpine-base nodejs openrc

# ── Step 2: K3s binary + airgap images (vendored — no docker.io on boot) ──
echo "[2/10] Download K3s v${K3S_VER_NUM} binary + airgap-images-${ARCH}"
mkdir -p "$STAGING/usr/local/bin"
curl -fsSL "https://github.com/k3s-io/k3s/releases/download/v${K3S_VER_NUM}+k3s1/k3s" \
    -o "$STAGING/usr/local/bin/k3s"
chmod 0755 "$STAGING/usr/local/bin/k3s"

mkdir -p "$STAGING/var/lib/rancher/k3s/agent/images"
curl -fsSL "https://github.com/k3s-io/k3s/releases/download/v${K3S_VER_NUM}+k3s1/k3s-airgap-images-${ARCH}.tar.zst" \
    -o "$STAGING/var/lib/rancher/k3s/agent/images/k3s-airgap-images-${ARCH}.tar.zst"

# k3s-install.sh is upstream's helper — baked in for operator convenience.
curl -fsSL "https://get.k3s.io" -o "$STAGING/usr/local/bin/k3s-install.sh"
chmod 0755 "$STAGING/usr/local/bin/k3s-install.sh"

# ── Step 3: Build gateway dist + production node_modules ──────────────────
# CRITIC C1 (HIGH) RESOLUTION: `--omit=dev` ONLY. We KEEP optionalDependencies
# because @roamhq/wrtc is in optionalDependencies (see musu-relay/package.json)
# and the gateway requires it at runtime. Step 4's smoke-import would false-
# positive-fail if we stripped optional here. The B5 signaling Dockerfile is
# the ONLY path that uses `--omit=optional` (signaling has no WebRTC use).
echo "[3/10] Compile gateway TypeScript + install production node_modules"
pushd "$SCRIPT_DIR/.." >/dev/null
npm ci
npx tsc -p tsconfig.json    # produces dist/gateway/{client.js,bridge.js,wrtc-factory.js}

mkdir -p "$STAGING/usr/local/lib/musu-gateway/dist"
cp -r dist/gateway "$STAGING/usr/local/lib/musu-gateway/dist/"

# Production deps — KEEP optional (see comment above).
STAGE_NM_PARENT="$STAGING/usr/local/lib/musu-gateway/node_modules-staging"
mkdir -p "$STAGE_NM_PARENT"
cp package.json package-lock.json "$STAGE_NM_PARENT/"
( cd "$STAGE_NM_PARENT" && npm ci --omit=dev )
mv "$STAGE_NM_PARENT/node_modules" "$STAGING/usr/local/lib/musu-gateway/node_modules"
rm -rf "$STAGE_NM_PARENT"
popd >/dev/null

# ── Step 4: musl smoke-import of @roamhq/wrtc ──────────────────────────────
# CRITIC C1 RESOLUTION (cont'd): with optional KEPT, @roamhq/wrtc exists in
# node_modules and we can prove it loads under musl-Alpine before the operator
# ever wsl --imports. Throwaway docker container — does not touch $STAGING.
echo "[4/10] musl smoke-import: require('@roamhq/wrtc') inside alpine:${ALPINE_VER}"
if command -v docker >/dev/null 2>&1; then
  if ! docker run --rm -v "$STAGING/usr/local/lib/musu-gateway:/g:ro" "alpine:${ALPINE_VER}" \
        sh -c "apk add --no-cache nodejs && node -e \"require('/g/node_modules/@roamhq/wrtc')\"" ; then
    echo "FATAL: @roamhq/wrtc failed to load under musl-Alpine ${ALPINE_VER}." >&2
    echo "       This is a real failure (not the C1 false-positive). Consider:" >&2
    echo "       (a) Pin to a @roamhq/wrtc version with musl prebuilds, or" >&2
    echo "       (b) Pivot the rootfs base from Alpine to debian-slim (V23.3 work)." >&2
    echo "       Record decision in the closure doc." >&2
    exit 1
  fi
else
  echo "WARN:  docker not present on build host — skipping musl smoke-import."
  echo "       The musl behavior of @roamhq/wrtc is then unverified until first boot."
fi

# ── Step 5: Install OpenRC services + helper binaries ──────────────────────
echo "[5/10] Install OpenRC services + /usr/local/bin helpers"
mkdir -p "$STAGING/etc/init.d"
install -m 0755 "$SCRIPT_DIR/openrc-musu-init.conf"    "$STAGING/etc/init.d/musu-init"
install -m 0755 "$SCRIPT_DIR/openrc-k3s.conf"          "$STAGING/etc/init.d/k3s"
install -m 0755 "$SCRIPT_DIR/openrc-musu-gateway.conf" "$STAGING/etc/init.d/musu-gateway"
install -m 0755 "$SCRIPT_DIR/musu-init"                "$STAGING/usr/local/bin/musu-init"
install -m 0755 "$SCRIPT_DIR/musu-write-key"           "$STAGING/usr/local/bin/musu-write-key"

# ── Step 6: Reserve B4b ABI directories (account_key + gateway state) ─────
echo "[6/10] Reserve /etc/musu/ and /var/lib/musu/ (0700 root:root, empty)"
mkdir -m 0700 -p "$STAGING/etc/musu"
mkdir -m 0700 -p "$STAGING/var/lib/musu"

# ── Step 6.b: WSL config — appliance distro, root default user ────────────
# Critic C6 (MEDIUM) RESOLUTION: musu-backend is non-interactive. Default user
# = root so musu-write-key can chmod 0600 root:root without sudo (busybox does
# not ship sudo), and /etc/musu/ ownership stays stable across wsl --import.
echo "[6.b/10] Bake /etc/wsl.conf ([user] default=root only — no [boot] command)"
# /etc/wsl.conf controls WSL2 distro init. We set ONLY [user]=root (per Critic
# C6 uid-mapping resolution); we deliberately do NOT use [boot] command= because
# OpenRC's runlevel default (single symlink to musu-init at step 7) is the sole
# entry point. Using both would spawn two concurrent musu-init processes on
# first boot (audit-fix M1).
cat > "$STAGING/etc/wsl.conf" <<'WSLCONF'
[user]
default=root
WSLCONF

# ── Step 6.c: /etc/musu-version provenance (Critic C4 HIGH) ───────────────
# Read by validate-import.ps1 (writes musu_version_raw into validation-result.json)
# and by the closure doc for B4c host comparison.
echo "[6.c/10] Bake /etc/musu-version provenance block"
GIT_SHA="$(git -C "$SCRIPT_DIR/.." rev-parse --short HEAD 2>/dev/null || echo unknown)"
BUILD_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$STAGING/etc/musu-version" <<VERS
git_sha=${GIT_SHA}
build_iso_ts=${BUILD_TS}
k3s_version=v${K3S_VER_NUM}
alpine_version=${ALPINE_VER}
node_version=${NODE_VER}
arch=${ARCH}
VERS

# ── Step 7: Enable ONLY musu-init at runlevel default ─────────────────────
# CRITIC C2 (HIGH) RESOLUTION: K3s + musu-gateway OpenRC services are NOT
# auto-enabled here. They are started in sequence by musu-init with explicit
# readiness gates (K3s API Ready + account_key existence). Direct auto-enable
# raced K3s API readiness on first boot.
echo "[7/10] Symlink ONLY musu-init under /etc/runlevels/default/"
mkdir -p "$STAGING/etc/runlevels/default"
ln -sf /etc/init.d/musu-init "$STAGING/etc/runlevels/default/musu-init"
# NO symlinks for k3s or musu-gateway. musu-init orchestrates them.

# ── Step 8: Pack the rootfs tarball ───────────────────────────────────────
echo "[8/10] Pack tar -cf $OUTPUT -C $STAGING ."
# Flat rootfs: contents of / at tar root (etc/, usr/, var/, …). NOT compressed
# — wsl --import handles either, but uncompressed is faster on import and we
# already pay the size cost of airgap-images regardless.
tar -cf "$OUTPUT" -C "$STAGING" .

# ── Step 9: SHA-256 sidecar (Critic C4 HIGH) ──────────────────────────────
# B4c verifies payload identity across 5 hosts using this hash.
echo "[9/10] Emit ${OUTPUT}.sha256 sidecar"
sha256sum "$OUTPUT" | awk '{print $1}' > "${OUTPUT}.sha256"
echo "       sha256: $(cat "${OUTPUT}.sha256")"

# ── Step 10: Size gate ────────────────────────────────────────────────────
SIZE_BYTES="$(stat -c %s "$OUTPUT")"
SIZE_MB=$(( SIZE_BYTES / 1024 / 1024 ))
echo "[10/10] musu-backend.tar size: ${SIZE_MB} MB"

if [ "$SIZE_MB" -gt 500 ] && [ -z "$ALLOW_OVERSIZE" ]; then
  echo "FATAL: tar > 500 MB hard limit." >&2
  echo "       Re-run with --allow-oversize to override and document in closure doc." >&2
  exit 1
fi
if [ "$SIZE_MB" -gt 300 ]; then
  echo "WARN:  tar > 300 MB soft target. Closure doc must enumerate top 3 size contributors and propose V23.3 trim work."
fi

echo "──────────────────────────────────────────────────────────────────────"
echo "Build complete:"
echo "  tar:      $OUTPUT"
echo "  size:     ${SIZE_MB} MB"
echo "  sha256:   $(cat "${OUTPUT}.sha256")"
echo "  manifest: $MANIFEST"
echo
echo "Next: run installer/validate-import.ps1 from a Windows host:"
echo "  .\\validate-import.ps1 -TarPath .\\$(basename "$OUTPUT") \\"
echo "                        -ExpectedSha256 (Get-Content .\\$(basename "$OUTPUT").sha256)"
