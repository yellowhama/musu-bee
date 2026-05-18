# syntax=docker/dockerfile:1.7
# V23.3 A1.a (wiki/380): musu-bridge OCI image.
#
# BUILD CONTEXT: repo root (sibling to musu-core/).
#   Run: buildah build -f musu-bridge/Dockerfile <repo-root>
#   NOT: buildah build musu-bridge/    <- `COPY musu-core/...` would fail
# (Critic M3: Dockerfile in isolation does not signal context requirement.)
#
# Built via `buildah build --timestamp ${SOURCE_DATE_EPOCH}` inside Alpine WSL2.
# Baked into musu-backend.tar as
#   var/lib/rancher/k3s/agent/images/<bridge_image_name>-<bridge_image_version>.tar
# K3s containerd auto-imports on first boot. The OCI archive is re-packed
# with the B6 reproducible tar recipe by build-musu-backend.sh step 3.d
# (Critic H1) -- do NOT rely on buildah's native oci-archive layout.

# V23.4 T2-Z / F-A1c-3 (wiki/441): full reproducibility requires a digest
# pin (FROM python:3.11-slim-bookworm@sha256:<digest>). The current build
# host has no network access to docker hub from the sealed builder pipeline
# so the live digest cannot be resolved here without breaking the airgap
# property. Until V23.5 wires a manifest.yaml digest field, pin format is:
#   FROM python:3.11-slim-bookworm@sha256:<resolve-current-stable-digest>
# Run `crane digest python:3.11-slim-bookworm` (or `skopeo inspect`) from
# a network-connected build box, drop the resulting sha256 into manifest.yaml,
# and replace this line with the pinned form. See V23.4 Z2 closure (wiki/441).
# TODO(V23.5): pin to digest for byte-reproducibility — verify digest at next build.
FROM python:3.11-slim-bookworm

# Provenance labels (V23.3 A1.a F16). Values passed via --build-arg.
ARG GIT_SHA=unknown
ARG GIT_DESC=unknown
ARG BUILD_TS=unknown
ARG BRIDGE_VERSION=0.1.0
ARG SOURCE_DATE_EPOCH=0
LABEL org.opencontainers.image.source="https://github.com/yellowhama/musu-bee" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_TS}" \
      org.opencontainers.image.title="musu-bridge" \
      org.opencontainers.image.version="${BRIDGE_VERSION}" \
      org.opencontainers.image.description="musu-bridge daemon (FastAPI+uvicorn watch-dispatcher)"

# tini for clean PID 1 signal handling (F9). Pinned version (Critic L1) for
# byte-identity across Debian point-releases. Verify with `apt-cache madison tini`
# inside the build distro and bump in lockstep with Bookworm minor bumps.
#
# Builder amendments (wiki/380 §12 — surfaced for Auditor):
#  (1) Plan pinned `tini=0.19.0-1`; Bookworm's current binary rebuild is
#      `0.19.0-1+b3` (the unrebuilt `0.19.0-1` is not installable).
#  (2) Plan's `find ... || true` placed `|| true` at the end of the chained
#      && expression — shell precedence makes that
#      `(apt && install && rm && find) || true`, silently swallowing an
#      apt-install failure (first build shipped without tini; container CMD
#      failed to start). Split into two RUN segments so apt errors propagate.
#  (3) B6 byte-identity regression source: apt-get writes wall-clock
#      timestamps into /var/log/apt/history.log + /var/log/dpkg.log;
#      SDE clamps file mtime but not file CONTENT. Scrub these in the same
#      RUN as apt-install so they never enter the layer.
RUN apt-get update && \
    apt-get install -y --no-install-recommends tini=0.19.0-1+b3 && \
    rm -rf /var/lib/apt/lists/* /var/log/apt /var/log/dpkg.log /var/log/alternatives.log /var/cache/ldconfig/aux-cache && \
    rm -rf /var/cache/apt/archives /var/cache/apt/*.bin
# V23.4 T2-Z / F-A1c-3 (wiki/441): the extra `rm -rf /var/cache/apt/archives`
# scrubs the downloaded .deb files apt-get keeps after install. Pre-fix, the
# layer carried ~2-5 MB of apt-cached .debs (timestamped on download) which
# both inflated the image and leaked wall-clock mtime into the layer. This is
# half of the F-A1c-3 fix; the other half (FROM <digest>) is gated on V23.5
# manifest.yaml digest plumbing (see TODO above).
RUN find /usr/bin/tini /usr/share/doc/tini -exec touch -h -d "@${SOURCE_DATE_EPOCH}" {} + 2>/dev/null || true

# Non-root user for A1.b Secret mount compat (F10). UID 1000 matches
# K3s SecurityContext pinning convention. HOME = /home/musu; A1.b mounts
# Secret at /home/musu/.musu/account_key (Critic H2 -- matches host
# convention scripts/start-bridge.sh:288).
RUN groupadd -g 1000 musu && \
    useradd -u 1000 -g musu -m -s /sbin/nologin musu

# Lockfile-driven, hash-verified pip install (F11). Preserves B6 byte-identity.
COPY --chown=musu:musu musu-bridge/requirements-lock.txt /tmp/
RUN pip install --no-cache-dir --no-compile --no-deps --require-hashes \
        -r /tmp/requirements-lock.txt && \
    rm /tmp/requirements-lock.txt

# Source layout (F1, F3): wholesale copy of musu-bridge + musu_core sibling.
# Critic M5: PYTHONPATH=/app only (musu_core is importable as /app/musu_core;
# the second prior entry /app/musu-core/src pointed to a non-existent dir).
COPY --chown=musu:musu musu-bridge/ /app/
COPY --chown=musu:musu musu-core/src/musu_core /app/musu_core
ENV PYTHONPATH=/app

# Scrub .pyc/.pyo timestamps for B6 byte-identity (F4 belt-and-suspenders).
RUN find /app -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null; \
    find /app -name '*.pyc' -delete; \
    find /app -name '*.pyo' -delete

USER musu
WORKDIR /app

EXPOSE 8070

# Critic L4: BRIDGE_HOST/BRIDGE_PORT ENV are NOT set here because the CMD
# below hardcodes --host/--port; config.py defaults are only consulted by
# `python -m server` (the __main__ path), which CMD does not invoke.
# Keeping it minimal avoids dead-code env vars that mislead future readers.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# MUSU_BRIDGE_TOKEN is REQUIRED at runtime (server.py:204-207 FATAL-exits
# without it). The image deliberately does NOT set a default -- A1.b
# ConfigMap/Secret must inject. See Critic H3 + plan §10.3.

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8070"]
