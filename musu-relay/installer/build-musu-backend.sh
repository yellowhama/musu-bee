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
ALLOW_IMAGE_OVERSIZE=""

usage() {
  cat <<EOF
Usage: $0 --arch <amd64|arm64> --k3s-version <v1.30.x> --output <path/to/musu-backend.tar> [--allow-oversize]

Required:
  --arch          Target architecture (amd64 validated; arm64 builds but unvalidated in V23.2)
  --k3s-version   K3s version pin (e.g., v1.30.4). Overrides manifest.yaml.
  --output        Output tar path (will be created/overwritten)

Optional:
  --allow-oversize        Skip the outer 500MB tar hard fail (warns only)
  --allow-image-oversize  Skip the 150MB bridge OCI image hard fail (V23.3 A1.a / wiki/380 H4)

Build host requirement: Alpine WSL2 (apk + coreutils tar + curl + git).
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --arch)            ARCH="$2"; shift 2 ;;
    --k3s-version)     K3S_VER="$2"; shift 2 ;;
    --output)          OUTPUT="$2"; shift 2 ;;
    --allow-oversize)  ALLOW_OVERSIZE="1"; shift ;;
    --allow-image-oversize) ALLOW_IMAGE_OVERSIZE="1"; shift ;;
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
# Base host tools.
for tool in apk curl tar sha256sum stat awk install ln mkdir; do
  command -v "$tool" >/dev/null 2>&1 || { echo "FATAL: build host missing '$tool'. Use Alpine WSL2." >&2; exit 1; }
done
# Node + npm for the gateway compile step.
for tool in node npm; do
  command -v "$tool" >/dev/null 2>&1 || { echo "FATAL: build host missing '$tool'. Run: apk add nodejs npm" >&2; exit 1; }
done
# Native build chain for node-gyp-compiled deps (better-sqlite3 has no
# Alpine/musl prebuilt; node-gyp falls back to source compile on first
# install). Without this the npm ci step at [3/10] fails with "Could not
# find any Python installation to use". Caught by initial B4a run on
# 2026-05-17 — make permanent.
for tool in python3 make g++; do
  command -v "$tool" >/dev/null 2>&1 || { echo "FATAL: build host missing '$tool' (needed by node-gyp for better-sqlite3). Run: apk add python3 make g++ linux-headers pkgconf" >&2; exit 1; }
done

# Reproducible-build chain (V23.3 B6 / wiki/392):
#   - GNU tar required for --sort=name --mtime=@SDE --format=pax flags.
#     BusyBox tar lacks these; the canonical reproducible-builds.org
#     recipe needs GNU. Run: apk add tar
#   - strip + objcopy (binutils) required to scrub gcc-embedded
#     timestamps/paths/host/user from native ELF binaries
#     (better_sqlite3.node). Run: apk add binutils
for tool in strip objcopy; do
  command -v "$tool" >/dev/null 2>&1 || { echo "FATAL: build host missing '$tool' (V23.3 B6 native-binary scrub). Run: apk add binutils" >&2; exit 1; }
done
# Probe that 'tar' is GNU tar, not BusyBox.
if ! tar --version 2>/dev/null | head -1 | grep -q "GNU tar"; then
  echo "FATAL: 'tar' is not GNU tar (need GNU for --sort/--format=pax). Run: apk add tar" >&2
  exit 1
fi

# V23.3 A1.a (wiki/380): buildah for OCI image build of musu-bridge.
# Alpine WSL2 + docker is flaky (B6 C-B6-F14); buildah is rootless + native.
# Run: apk add buildah
command -v buildah >/dev/null 2>&1 || { echo "FATAL: build host missing 'buildah' (V23.3 A1.a). Run: apk add buildah" >&2; exit 1; }

# ── Reproducibility: SOURCE_DATE_EPOCH + fixed STAGING path ───────────────
# V23.3 B6 (wiki/392): tie all timestamps inside the build to the HEAD
# commit's author-time, and make STAGING a constant path so node-gyp
# embedded build paths are constant across builds. Both required for
# sha256(tar) byte-identity.
export SOURCE_DATE_EPOCH="$(git -C "$SCRIPT_DIR/.." log -1 --format=%ct HEAD 2>/dev/null || echo 0)"
if [ "$SOURCE_DATE_EPOCH" = "0" ]; then
  echo "WARN: SOURCE_DATE_EPOCH=0 (git log failed). Build will not be reproducible." >&2
fi
echo "  source_date_epoch: $SOURCE_DATE_EPOCH"

STAGING="$SCRIPT_DIR/../.build-stage"
rm -rf "$STAGING"
mkdir -p "$STAGING"
trap 'rm -rf "$STAGING"' EXIT
echo "  staging:        $STAGING"

# ── Step 1: apk-bootstrap Alpine rootfs ────────────────────────────────────
# This is the canonical "build a chroot" idiom (NOT a docker-save flow,
# which would emit an OCI layered tar that wsl --import does not understand).
echo "[1/10] apk-bootstrap Alpine $ALPINE_VER rootfs into $STAGING"
# Reproducibility (V23.3 B6 / wiki/392 F4): exact-version pins from
# manifest.yaml. Falls back to floating versions only if manifest is missing
# the pin — emits WARN to flag the regression.
APK_ALPINE_BASE_VER="$(yaml_get apk_alpine_base_version)"
APK_NODEJS_VER="$(yaml_get apk_nodejs_version)"
APK_OPENRC_VER="$(yaml_get apk_openrc_version)"

APK_PINS=""
for p in "alpine-base:${APK_ALPINE_BASE_VER}" "nodejs:${APK_NODEJS_VER}" "openrc:${APK_OPENRC_VER}"; do
  pkg="${p%%:*}"
  ver="${p#*:}"
  if [ -n "$ver" ]; then
    APK_PINS="$APK_PINS ${pkg}=${ver}"
  else
    echo "WARN: manifest.yaml missing pin for '$pkg' — falling back to floating." >&2
    APK_PINS="$APK_PINS ${pkg}"
  fi
done

apk -X "http://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VER}/main" \
    -X "http://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VER}/community" \
    -U --allow-untrusted --root="$STAGING" --initdb \
    add $APK_PINS

# ── Step 2: K3s binary + airgap images (vendored — no docker.io on boot) ──
# V23.3 B6 (wiki/392 F5 / Critic C-B6-H3): sha256-enforced downloads; the
# old upstream-curled k3s-install.sh has been REMOVED (no operator path
# invokes it and its dynamic content broke intra-hour byte-identity).
echo "[2/10] Download K3s v${K3S_VER_NUM} binary + airgap-images-${ARCH} (sha256-enforced)"
K3S_BINARY_SHA="$(yaml_get k3s_binary_sha256_${ARCH})"
K3S_AIRGAP_SHA="$(yaml_get k3s_airgap_sha256_${ARCH})"

if [ -z "$K3S_BINARY_SHA" ] || [ "$K3S_BINARY_SHA" = "TODO-populate" ] || \
   [ "$K3S_BINARY_SHA" = "TODO-populate-from-k3s-release" ]; then
  echo "FATAL: manifest.yaml k3s_binary_sha256_${ARCH} is TODO. V23.3 B6 (wiki/392 §4.1 S2.b) requires this populated." >&2
  exit 1
fi
if [ -z "$K3S_AIRGAP_SHA" ] || [ "$K3S_AIRGAP_SHA" = "TODO-populate" ] || \
   [ "$K3S_AIRGAP_SHA" = "TODO-populate-from-k3s-release" ]; then
  echo "FATAL: manifest.yaml k3s_airgap_sha256_${ARCH} is TODO. V23.3 B6 (wiki/392 §4.1 S2.b) requires this populated." >&2
  exit 1
fi

mkdir -p "$STAGING/usr/local/bin"
curl -fsSL "https://github.com/k3s-io/k3s/releases/download/v${K3S_VER_NUM}+k3s1/k3s" \
    -o "$STAGING/usr/local/bin/k3s"
echo "${K3S_BINARY_SHA}  $STAGING/usr/local/bin/k3s" | sha256sum -c -
chmod 0755 "$STAGING/usr/local/bin/k3s"

mkdir -p "$STAGING/var/lib/rancher/k3s/agent/images"
AIRGAP_DST="$STAGING/var/lib/rancher/k3s/agent/images/k3s-airgap-images-${ARCH}.tar.zst"
curl -fsSL "https://github.com/k3s-io/k3s/releases/download/v${K3S_VER_NUM}+k3s1/k3s-airgap-images-${ARCH}.tar.zst" \
    -o "$AIRGAP_DST"
echo "${K3S_AIRGAP_SHA}  $AIRGAP_DST" | sha256sum -c -

# V23.4 T2-Z / FO-A1a-4 (wiki/445): trim airgap-images to the four containerd
# core images musu actually needs (pause, coredns, traefik, local-path-
# provisioner). Trimming saves ~40-60 MB off the final tar. The upstream sha
# was verified above against the untrimmed blob (integrity gate); the trimmed
# repack legitimately produces a different sha256, which is captured by the
# Step 9 outer sha256 sidecar over OUTPUT.
#
# Set MUSU_KEEP_FULL_AIRGAP=1 to skip the trim (e.g., when validating a
# build against an unmodified upstream airgap set during incident triage).
if [ "${MUSU_KEEP_FULL_AIRGAP:-0}" != "1" ]; then
  echo "[2.b/10] Trim airgap-images to {pause,coredns,traefik,local-path-provisioner}"
  AIRGAP_TRIM_DIR="$STAGING/.airgap-trim"
  rm -rf "$AIRGAP_TRIM_DIR"
  mkdir -p "$AIRGAP_TRIM_DIR"
  zstd -dc "$AIRGAP_DST" | tar -xf - -C "$AIRGAP_TRIM_DIR"
  # K3s airgap layout: index.json + manifests/blobs. We use crane/skopeo if
  # available; otherwise prune by image-tag refs in index.json.
  #
  # V23.4 T2-Z audit-fix HIGH #2: K3s upstream airgap refs use the
  # `rancher/mirrored-*` prefix convention (e.g.
  # `docker.io/rancher/mirrored-pause:3.6`,
  # `docker.io/rancher/mirrored-coredns-coredns:1.x`,
  # `docker.io/rancher/mirrored-library-traefik:3.x`,
  # `docker.io/rancher/local-path-provisioner:v0.0.x`).
  # The previous regex `(^|/)(pause|coredns|...)(:|@|$)` only matched
  # local-path-provisioner; the other three core refs were silently dropped,
  # leaving K3s unable to boot. Replaced with substring alternation that
  # matches the four real mirrored-* / non-mirrored refs and rejects all
  # `mirrored-metrics-server`, `mirrored-klipper-helm`, etc.
  if [ -f "$AIRGAP_TRIM_DIR/index.json" ]; then
    KEEP_RE='(mirrored-pause|mirrored-coredns-coredns|mirrored-library-traefik|local-path-provisioner)'
    # Rewrite index.json keeping only matching annotations.org.opencontainers.image.ref.name
    jq --arg re "$KEEP_RE" \
       '.manifests |= map(select((.annotations["org.opencontainers.image.ref.name"] // "") | test($re; "i")))' \
       "$AIRGAP_TRIM_DIR/index.json" > "$AIRGAP_TRIM_DIR/index.json.tmp"
    mv "$AIRGAP_TRIM_DIR/index.json.tmp" "$AIRGAP_TRIM_DIR/index.json"
  fi
  # Repack with the same SDE-clamped flags as the outer tar (B6 reproducibility).
  ( cd "$AIRGAP_TRIM_DIR" && tar --sort=name \
      --mtime="@${SOURCE_DATE_EPOCH}" \
      --owner=0 --group=0 --numeric-owner \
      --format=pax \
      --pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime \
      -cf - . | zstd -19 -T0 -o "$AIRGAP_DST.trimmed" )
  mv "$AIRGAP_DST.trimmed" "$AIRGAP_DST"
  rm -rf "$AIRGAP_TRIM_DIR"
  TRIMMED_SIZE_MB=$(( $(stat -c %s "$AIRGAP_DST") / 1024 / 1024 ))
  echo "[2.b/10] trimmed airgap-images: ${TRIMMED_SIZE_MB} MB"
fi

# k3s-install.sh REMOVED from the tar (Critic C-B6-H3 resolution).
#
# Earlier B4a builds curled `https://get.k3s.io` and baked the result into
# /usr/local/bin/k3s-install.sh as "operator convenience". Grep on the repo
# confirms NO path invokes that script — musu-init starts K3s directly via
# `rc-service k3s start` (openrc-k3s.conf:13 `command="/usr/local/bin/k3s"`)
# and validate-import.ps1 + validate-musu-backend.md never reference it.
# Meanwhile the URL serves a live upstream script that may be re-edited
# between intra-hour builds, breaking §7.1 byte-identity for a file no
# operator path actually uses. Cheapest fix: drop the download.

# ── Step 3: Build gateway dist + production node_modules ──────────────────
# CRITIC C1 (HIGH) RESOLUTION: `--omit=dev` ONLY. We KEEP optionalDependencies
# because @roamhq/wrtc is in optionalDependencies (see musu-relay/package.json)
# and the gateway requires it at runtime. Step 4's smoke-import would false-
# positive-fail if we stripped optional here. The B5 signaling Dockerfile is
# the ONLY path that uses `--omit=optional` (signaling has no WebRTC use).
echo "[3/10] Compile gateway TypeScript + install production node_modules"
pushd "$SCRIPT_DIR/.." >/dev/null

# V23.3 B6 (wiki/392 F3): node-gyp invokes gcc to compile better-sqlite3.
# gcc embeds the build directory's absolute path into DWARF debug info
# (.debug_info section) and into __FILE__ macro expansions. -ffile-prefix-map
# rewrites those at compile time so the resulting .node binary is path-
# independent. SOURCE_DATE_EPOCH alone does NOT fix this.
#
# Critic C-B6-M3: cover all THREE directories npm/node-gyp run in across
# the build (in order of encounter):
#   1. $SOURCE = $SCRIPT_DIR/.. (musu-relay source dir) — first npm ci below
#   2. $STAGE_NM_PARENT (per-build temp under STAGING) — second npm ci below
#   3. $STAGING = $SCRIPT_DIR/../.build-stage — where .node binaries land
SOURCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGE_NM_PARENT_PATH="$STAGING/usr/local/lib/musu-gateway/node_modules-staging"
PREFIX_MAPS="-ffile-prefix-map=${SOURCE_DIR}=/src -ffile-prefix-map=${STAGE_NM_PARENT_PATH}=/stage -ffile-prefix-map=${STAGING}=/build -fdebug-prefix-map=${SOURCE_DIR}=/src -fdebug-prefix-map=${STAGE_NM_PARENT_PATH}=/stage -fdebug-prefix-map=${STAGING}=/build"
export CFLAGS="${PREFIX_MAPS} ${CFLAGS:-}"
export CXXFLAGS="${PREFIX_MAPS} ${CXXFLAGS:-}"

npm ci --prefer-offline --no-audit --no-fund
npx tsc -p tsconfig.json    # produces dist/gateway/{client.js,bridge.js,wrtc-factory.js}

mkdir -p "$STAGING/usr/local/lib/musu-gateway/dist"
cp -r dist/gateway "$STAGING/usr/local/lib/musu-gateway/dist/"

# Production deps — KEEP optional (see comment above).
STAGE_NM_PARENT="$STAGING/usr/local/lib/musu-gateway/node_modules-staging"
mkdir -p "$STAGE_NM_PARENT"
cp package.json package-lock.json "$STAGE_NM_PARENT/"
( cd "$STAGE_NM_PARENT" && npm ci --omit=dev --prefer-offline --no-audit --no-fund )
mv "$STAGE_NM_PARENT/node_modules" "$STAGING/usr/local/lib/musu-gateway/node_modules"
# V23.3 B6 (wiki/392 F3): strip gcc-embedded metadata from compiled .node
# binaries. -ffile-prefix-map above handles paths inside DWARF; strip + objcopy
# remove the .comment section (gcc version string) and unneeded symbols
# (which would otherwise contain absolute paths from the link line).
echo "[3.b/10] Strip native ELF metadata from compiled .node binaries"
find "$STAGING/usr/local/lib/musu-gateway/node_modules" -name "*.node" -type f -print0 | \
  while IFS= read -r -d '' nodebin; do
    strip --strip-unneeded "$nodebin" || true
    objcopy --remove-section=.comment --remove-section=.note "$nodebin" || true
    # Force deterministic mtime; tar will rewrite again but this keeps
    # intermediate sha audits clean.
    touch -d "@${SOURCE_DATE_EPOCH}" "$nodebin"
  done

# V23.3 B6 audit-fix (Builder root-cause from §7.1 Step 1 mismatch
# 78d2bc... vs d66f14...): node-gyp leaves the entire build/ tree
# (Makefile, *.o, *.a, obj.target/) alongside the final .node binary.
# Those intermediate artifacts contain non-deterministic node-gyp output
# (Python dict-ordered dependency lists in Makefile, build host paths,
# gcc invocation timestamps). They are NOT needed at runtime — only
# build/Release/<addon>.node is. Promote the runtime .node up next to
# the package root and delete the rest of build/.
echo "[3.c/10] Prune node-gyp build/ intermediates (keep only build/Release/*.node)"
find "$STAGING/usr/local/lib/musu-gateway/node_modules" -type d -name build -print0 | \
  while IFS= read -r -d '' builddir; do
    # Move every compiled addon to build/Release/ (already its home) and
    # then nuke everything else under build/ (obj.target/, Makefile, deps/).
    if [ -d "$builddir/Release" ]; then
      find "$builddir" -mindepth 1 -maxdepth 1 ! -name Release -exec rm -rf {} +
      find "$builddir/Release" -mindepth 1 -maxdepth 1 ! -name '*.node' -exec rm -rf {} +
    fi
  done
rm -rf "$STAGE_NM_PARENT"
popd >/dev/null

# ── Step 3.c.1: Derive GIT_SHA / GIT_DESC / BUILD_TS for downstream consumers ─
# V23.4 T2-Z / FO-A1a-1 (wiki/440): these used to be derived only at Step 6.c
# (line ~575), which was AFTER step 3.d consumed them via --build-arg. The
# OCI labels org.opencontainers.image.revision and image.created consequently
# baked "unknown" into every bridge image. Moving the derivation up here so
# 3.d sees real values; Step 6.c still references the same variable names
# below (re-deriving with the same git command is a noop but harmless — the
# values are read once and used in both buildah --build-arg and the
# /etc/musu-version provenance block).
GIT_SHA="$(git -C "$SCRIPT_DIR/.." rev-parse --short HEAD 2>/dev/null || echo unknown)"
GIT_DESC="$(git -C "$SCRIPT_DIR/.." describe --always --dirty=-dirty 2>/dev/null || echo unknown)"
BUILD_TS="$(date -u -d "@${SOURCE_DATE_EPOCH}" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo unknown)"

# ── Step 3.d: Build musu-bridge OCI image (V23.3 A1.a / wiki/380) ─────────
echo "[3.d/10] Build musu-bridge OCI image (buildah --timestamp=SDE)"

# Critic H5 resolution: split bridge_image_tag into name + version to avoid
# yaml_get parser fragility on values containing ':' (the awk parser at :87
# was only ever tested with colonless values).
BRIDGE_IMAGE_NAME="$(yaml_get bridge_image_name)"
BRIDGE_IMAGE_VERSION="$(yaml_get bridge_image_version)"
if [ -z "$BRIDGE_IMAGE_NAME" ] || [ -z "$BRIDGE_IMAGE_VERSION" ]; then
  echo "FATAL: manifest.yaml missing bridge_image_name or bridge_image_version (V23.3 A1.a / wiki/380 H5)" >&2
  exit 1
fi
BRIDGE_TAG="${BRIDGE_IMAGE_NAME}:${BRIDGE_IMAGE_VERSION}"
BRIDGE_IMAGE_TAR="$STAGING/var/lib/rancher/k3s/agent/images/${BRIDGE_IMAGE_NAME}-${BRIDGE_IMAGE_VERSION}.tar"
mkdir -p "$(dirname "$BRIDGE_IMAGE_TAR")"

# buildah needs repo root as context (Dockerfile COPYs both musu-bridge/ and musu-core/).
BUILD_CONTEXT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Critic H1 step 1: build into a temporary OCI directory (NOT directly to tar)
# so we control the tar layout in step 2 below.
BRIDGE_OCI_DIR="$STAGING/.bridge-oci-tmp"
rm -rf "$BRIDGE_OCI_DIR"
mkdir -p "$BRIDGE_OCI_DIR"

buildah build \
    --timestamp "${SOURCE_DATE_EPOCH}" \
    --build-arg SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH}" \
    --build-arg GIT_SHA="${GIT_SHA:-unknown}" \
    --build-arg GIT_DESC="${GIT_DESC:-unknown}" \
    --build-arg BUILD_TS="${BUILD_TS:-unknown}" \
    --build-arg BRIDGE_VERSION="${BRIDGE_IMAGE_VERSION}" \
    -f "$BUILD_CONTEXT/musu-bridge/Dockerfile" \
    -t "${BRIDGE_TAG}" \
    "$BUILD_CONTEXT"

# Push to OCI directory format (uncompressed, layout-preserved).
buildah push "${BRIDGE_TAG}" "oci:${BRIDGE_OCI_DIR}:${BRIDGE_IMAGE_VERSION}"

# Critic H1 step 2: re-pack the OCI directory with the SAME B6 reproducible
# tar recipe used by the outer musu-backend.tar. Buildah's native oci-archive
# output does NOT guarantee --sort=name --format=pax --pax-option=... layout,
# so we don't trust it -- we re-pack ourselves with the proven recipe.
tar --sort=name \
    --mtime="@${SOURCE_DATE_EPOCH}" \
    --owner=0 --group=0 --numeric-owner \
    --format=pax \
    --pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime \
    -cf "$BRIDGE_IMAGE_TAR" -C "$BRIDGE_OCI_DIR" .
rm -rf "$BRIDGE_OCI_DIR"

# Verify against manifest.yaml-pinned sha256 (or populate-on-first-build).
EXPECTED_SHA="$(yaml_get bridge_image_oci_archive_sha256_${ARCH})"
ACTUAL_SHA="$(sha256sum "$BRIDGE_IMAGE_TAR" | awk '{print $1}')"
if [ -n "$EXPECTED_SHA" ] && [ "$EXPECTED_SHA" != "TODO-populate" ] && [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
  echo "FATAL: bridge image sha256 mismatch. expected=$EXPECTED_SHA actual=$ACTUAL_SHA" >&2
  exit 1
fi
echo "       bridge image: $BRIDGE_TAG"
echo "       oci archive:  $BRIDGE_IMAGE_TAR"
echo "       sha256:       $ACTUAL_SHA"

# Bake digest into /etc/musu-version (extends step 6.c).
BRIDGE_IMAGE_OCI_SHA="$ACTUAL_SHA"

# V23.3 A1.a (wiki/380 F8 + Critic H4): image hard-budget 150MB OCI archive.
# Critic H4: distinct flag --allow-image-oversize (NOT --allow-oversize, which
# is reserved for the outer 500MB tar). A single flag conflation would let an
# operator silently bypass both gates.
BRIDGE_IMG_BYTES="$(stat -c %s "$BRIDGE_IMAGE_TAR" 2>/dev/null || echo 0)"
BRIDGE_IMG_MB=$((BRIDGE_IMG_BYTES / 1024 / 1024))
echo "       bridge image size: ${BRIDGE_IMG_MB} MB"
if [ "$BRIDGE_IMG_MB" -gt 150 ] && [ -z "$ALLOW_IMAGE_OVERSIZE" ]; then
  echo "FATAL: bridge image > 150MB hard-budget (got ${BRIDGE_IMG_MB} MB). Use --allow-image-oversize to bypass." >&2
  exit 1
elif [ "$BRIDGE_IMG_MB" -gt 100 ]; then
  echo "WARN:  bridge image > 100MB soft-target (${BRIDGE_IMG_MB} MB). Closure should enumerate top contributors." >&2
fi

# ── Step 3.e: Bake K3s manifest for musu-bridge Pod (V23.3 A1.b / wiki/382) ─
# K3s's manifest-controller watches /var/lib/rancher/k3s/server/manifests/
# and applies any *.yaml files found there on startup. Plain YAML files
# (NOT HelmChart CRDs) are applied directly via kubectl-style apply.
#
# The manifest at musu-relay/installer/k3s/musu-bridge.yaml carries:
#   - Namespace musu
#   - ConfigMap musu-bridge-config
#   - Deployment musu-bridge (replicas: 0; musu-init scales to 1 post-Secret)
#   - Service musu-bridge (ClusterIP only — A1.c owns host-port surface)
#
# B6 byte-identity (wiki/392): the outer tar at step 8 normalizes ALL member
# mtimes to @SOURCE_DATE_EPOCH via --mtime=@${SOURCE_DATE_EPOCH}, so cp -p
# (preserve mtime) of a fresh file is safe — the tar pack overwrites mtime
# regardless. The explicit touch -d "@${SOURCE_DATE_EPOCH}" below is
# belt-and-suspenders + makes intent obvious.
echo "[3.e/10] Bake K3s manifest at /var/lib/rancher/k3s/server/manifests/"
MANIFEST_TARGET_DIR="$STAGING/var/lib/rancher/k3s/server/manifests"
mkdir -p "$MANIFEST_TARGET_DIR"
cp -p "$SCRIPT_DIR/k3s/musu-bridge.yaml" "$MANIFEST_TARGET_DIR/musu-bridge.yaml"
touch -d "@${SOURCE_DATE_EPOCH}" "$MANIFEST_TARGET_DIR/musu-bridge.yaml"
echo "       manifest: $MANIFEST_TARGET_DIR/musu-bridge.yaml"

# ── Step 3.f: Build signaling user-server dist + minimal node_modules ────
# V23.4 T2-F audit-fix (Auditor F12 HIGH, wiki/433 §6 line 537):
# openrc-musu-signaling.conf:18 references
# /usr/local/lib/musu-signaling/dist/signaling/user-server.js. The plan
# explicitly listed this checklist item but it was never honored in the
# build pipeline. Without this step, install-wsl2.ps1 Step 7.5 installs the
# OpenRC service that references a missing path, and musu-init swallows
# the rc-service failure under `|| echo` (line 158, tightened to log
# diagnostics in the companion fix). End result: silent broken install on
# rendezvous PC.
#
# What this step does:
#   1. Compile tsconfig.user-server.json (which includes ONLY
#      src/signaling/{shared.ts,user-server.ts} per HARD INVARIANT
#      C-T2F-H1: NO telemetry → NO better-sqlite3 transitive pull).
#   2. Stage dist/signaling/{shared.js,user-server.js} under
#      /usr/local/lib/musu-signaling/dist/signaling/ in the rootfs.
#   3. Build a MINIMAL production node_modules under
#      /usr/local/lib/musu-signaling/node_modules/ containing ONLY ws +
#      express + transitive deps. We do NOT reuse the gateway's
#      node_modules (which carries @roamhq/wrtc + better-sqlite3 + every
#      gateway dep) — minimizing surface honors the same "no telemetry
#      transitive pull" invariant.
#
# Build pattern matches Step 3 (gateway): scratch dir under STAGING for
# `npm install` (no lockfile since deps list is minimal), then `mv` the
# node_modules into final position.
echo "[3.f/10] Compile signaling user-server + stage minimal node_modules"
pushd "$SCRIPT_DIR/.." >/dev/null

# (1) Compile via tsconfig.user-server.json. Output goes to ./dist (the
# tsconfig sets outDir=dist; with include=[shared.ts, user-server.ts] and
# rootDir=src (inherited), tsc emits dist/signaling/{shared.js,user-server.js}).
# Use --outDir to redirect to a scratch path so we don't clobber the gateway
# dist already staged at Step 3.
SIGNALING_DIST_TMP="$STAGING/.signaling-dist-tmp"
rm -rf "$SIGNALING_DIST_TMP"
npx tsc -p tsconfig.user-server.json --outDir "$SIGNALING_DIST_TMP"

# (2) Stage compiled JS under /usr/local/lib/musu-signaling/dist/signaling/.
# Matches the path referenced at openrc-musu-signaling.conf:18.
mkdir -p "$STAGING/usr/local/lib/musu-signaling/dist/signaling"
cp -p "$SIGNALING_DIST_TMP/signaling/shared.js" \
      "$STAGING/usr/local/lib/musu-signaling/dist/signaling/shared.js"
cp -p "$SIGNALING_DIST_TMP/signaling/user-server.js" \
      "$STAGING/usr/local/lib/musu-signaling/dist/signaling/user-server.js"
rm -rf "$SIGNALING_DIST_TMP"

# (3) Minimal production node_modules — only ws + express + transitive deps.
# Scratch dir pattern (no lockfile): write a minimal package.json, run
# `npm install --omit=dev --omit=optional`, then mv node_modules into place.
SIG_NM_PARENT="$STAGING/usr/local/lib/musu-signaling/node_modules-staging"
mkdir -p "$SIG_NM_PARENT"

# Pin ws + express to the same versions as musu-relay/package.json
# dependencies block (read via jq if available, fall back to grep). This
# keeps the signaling deps in lockstep with the gateway's tested versions.
SIG_WS_VER="$(node -p "require('./package.json').dependencies.ws" 2>/dev/null || echo '^8.18.0')"
SIG_EXPRESS_VER="$(node -p "require('./package.json').dependencies.express" 2>/dev/null || echo '^4.19.2')"

cat > "$SIG_NM_PARENT/package.json" <<SIGPKG
{
  "name": "musu-signaling-deps",
  "version": "0.0.0",
  "private": true,
  "dependencies": {
    "ws": "${SIG_WS_VER}",
    "express": "${SIG_EXPRESS_VER}"
  }
}
SIGPKG

( cd "$SIG_NM_PARENT" && npm install --omit=dev --omit=optional --no-audit --no-fund --no-package-lock )
mv "$SIG_NM_PARENT/node_modules" "$STAGING/usr/local/lib/musu-signaling/node_modules"
rm -rf "$SIG_NM_PARENT"

popd >/dev/null

# ── Step 4: musl smoke-import of @roamhq/wrtc ──────────────────────────────
# CRITIC C1 RESOLUTION (cont'd): with optional KEPT, @roamhq/wrtc exists in
# node_modules and we can prove it loads under musl-Alpine before the operator
# ever wsl --imports. Throwaway docker container — does not touch $STAGING.
echo "[4/10] musl smoke-import: require('@roamhq/wrtc') inside alpine:${ALPINE_VER}"
# V23.3 B6: `command -v docker` is not sufficient on Alpine WSL2 because
# Docker Desktop's Windows-side shim at /mnt/c/Program Files/Docker/... is
# inherited via PATH, but actually invoking it errors when the per-distro
# WSL integration is off. Probe both presence AND ability to run a no-op.
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
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
  echo "WARN:  docker not usable on build host — skipping musl smoke-import."
  echo "       The musl behavior of @roamhq/wrtc is then unverified until first boot."
fi

# ── Step 5: Install OpenRC services + helper binaries ──────────────────────
echo "[5/10] Install OpenRC services + /usr/local/bin helpers"
mkdir -p "$STAGING/etc/init.d"
install -m 0755 "$SCRIPT_DIR/openrc-musu-init.conf"    "$STAGING/etc/init.d/musu-init"
install -m 0755 "$SCRIPT_DIR/openrc-k3s.conf"          "$STAGING/etc/init.d/k3s"
install -m 0755 "$SCRIPT_DIR/openrc-musu-gateway.conf" "$STAGING/etc/init.d/musu-gateway"
# V23.4 T2-F audit-fix (Auditor F12 HIGH): musu-signaling OpenRC service.
# NOT auto-enabled at runlevel default (per OQ-CRIT-4 boot model); musu-init
# `rc-service musu-signaling start`s it conditionally when
# MUSU_IS_RENDEZVOUS=true is set in /etc/musu/gateway.env. Service file MUST
# be installed on EVERY PC's musu-backend.tar so that role-flipping the
# rendezvous PC (V23.5 work) does not require re-tarring; the role gate is
# the env var, not the service file's presence.
install -m 0755 "$SCRIPT_DIR/openrc-musu-signaling.conf" "$STAGING/etc/init.d/musu-signaling"
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
# V23.3 B6 (wiki/392): provenance block uses SDE-derived timestamp and
# git describe (with --dirty) so a dirty working tree is visible in the
# tar's /etc/musu-version content.
#
# Critic C-B6-H1: emit BOTH git_sha (preserved for main.ts:171's
# /^git_sha=(.+)$/m regex which feeds install_completed.musu_version
# telemetry) AND git_desc (new, surfaces dirty-tree marker for
# validate-import.ps1 / B4c host comparison). Additive schema, no
# TypeScript source touch.
#
# V23.4 T2-Z / FO-A1a-1 (wiki/440): GIT_SHA / GIT_DESC / BUILD_TS already
# derived at Step 3.c.1 (above) so step 3.d's --build-arg sees real values
# instead of "unknown". The variables remain in scope here.
cat > "$STAGING/etc/musu-version" <<VERS
git_sha=${GIT_SHA}
git_desc=${GIT_DESC}
build_iso_ts=${BUILD_TS}
source_date_epoch=${SOURCE_DATE_EPOCH}
k3s_version=v${K3S_VER_NUM}
alpine_version=${ALPINE_VER}
node_version=${NODE_VER}
bridge_image_tag=${BRIDGE_TAG}
bridge_image_oci_sha256=${BRIDGE_IMAGE_OCI_SHA}
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
#
# V23.3 B6 (wiki/392 F1): reproducible tar. Citations:
#   - reproducible-builds.org/docs/source-date-epoch/
#   - reproducible-builds.org/docs/archives/
# Flags:
#   --sort=name         deterministic entry order (replaces readdir order)
#   --mtime=@SDE        every member's mtime = SDE (eliminates wall-clock leakage)
#   --owner=0/--group=0/--numeric-owner   uid/gid = 0 regardless of build user
#   --format=pax        portable extended headers (required to fit large mtimes)
#   --pax-option=...    strip atime/ctime from PaxHeaders and remove the
#                       random "archive build time" name in exthdr.name=
tar --sort=name \
    --mtime="@${SOURCE_DATE_EPOCH}" \
    --owner=0 --group=0 --numeric-owner \
    --format=pax \
    --pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime \
    -cf "$OUTPUT" -C "$STAGING" .

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
