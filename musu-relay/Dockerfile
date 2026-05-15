# musu.pro signaling server — V23.2 production image.
#
# What's in here:
#   - The compiled signaling server (src/signaling/server.ts → dist/...)
#   - The compiled telemetry router (src/signaling/telemetry.ts)
#   - better-sqlite3 native build (musl) for the telemetry DB
#
# What's NOT in here:
#   - The gateway (src/gateway/*) — runs on the user's PC, not here.
#   - The visitor client (src/visitor/*) — bundled into musu-bee web.
#   - @roamhq/wrtc — gateway-only, optionalDependency; skipped here.
#   - Any test files.
#
# Build:   docker build -t musu-signaling .
# Run:     docker run -p 9900:9900 -e MUSU_TELEMETRY_SHARED_SECRET=... \
#                                  -e MUSU_TELEMETRY_DB=/data/telemetry.db \
#                                  -e NODE_ENV=production musu-signaling
# Fly.io:  fly deploy   (uses fly.toml at repo root)

# ── Stage 1: build TypeScript + compile better-sqlite3 native bindings ──
FROM node:20-alpine AS builder

# better-sqlite3 needs a C toolchain on Alpine. python3 + make + g++ are
# the standard trio; pkgconfig optional but cheap.
RUN apk add --no-cache python3 make g++ pkgconfig

WORKDIR /app

# Install deps first so the layer caches well when only src/ changes.
COPY package*.json ./
# Skip optionalDependencies — @roamhq/wrtc is gateway-only and pulls
# a large native binding we do not need in the signaling image.
RUN npm ci --omit=optional

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev dependencies so the second-stage copy is lean.
RUN npm prune --omit=dev --omit=optional

# ── Stage 2: runtime — slim Alpine + only what we need ─────────────────
FROM node:20-alpine

# Drop privileges. The Fly.io volume gets mounted at /data — own it from
# inside the container so SQLite writes succeed without root.
RUN addgroup -g 1001 musu && \
    adduser -D -u 1001 -G musu musu && \
    mkdir -p /data && chown musu:musu /data

WORKDIR /app

# Copy compiled JS + the pruned production node_modules (which already
# contains better-sqlite3's pre-built .node file from stage 1).
COPY --from=builder --chown=musu:musu /app/dist ./dist
COPY --from=builder --chown=musu:musu /app/node_modules ./node_modules
COPY --from=builder --chown=musu:musu /app/package.json ./package.json

USER musu

ENV NODE_ENV=production \
    PORT=9900 \
    MUSU_TELEMETRY_DB=/data/telemetry.db

# Document the port; actual binding is in src/signaling/server.ts.
EXPOSE 9900

# Use the npm "start" script so package.json's `main` is the source of
# truth. That's `dist/signaling/server.js` as of V23.2.
CMD ["npm", "start", "--silent"]
