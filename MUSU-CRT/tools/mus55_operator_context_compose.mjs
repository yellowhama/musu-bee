#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

function usage() {
  return `Usage:
  node MUSU-CRT/tools/mus55_operator_context_compose.mjs \
    --context-id <id> \
    --mode <success|failure> \
    --lane2-proof <path> \
    --lane3-summary <path> \
    --lane3-operator-view <path> \
    --out-json <path>
`;
}

function parseArgs(argv) {
  const out = {};

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "-h" || flag === "--help" || flag === "help") {
      throw new Error(usage());
    }
    if (!flag.startsWith("--")) {
      throw new Error(`unknown argument: ${flag}`);
    }
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    out[flag.slice(2)] = value;
    i += 1;
  }

  const required = [
    "context-id",
    "mode",
    "lane2-proof",
    "lane3-summary",
    "lane3-operator-view",
    "out-json",
  ];
  for (const key of required) {
    if (!out[key]) {
      throw new Error(`--${key} is required`);
    }
  }
  if (out["mode"] !== "success" && out["mode"] !== "failure") {
    throw new Error("--mode must be success or failure");
  }
  return out;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function toStringOr(value, fallback) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function toNumberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function deriveBlocker(lane2Proof, lane3Summary, lane3View, mode) {
  const trustGateReason = toStringOr(
    lane2Proof?.trustGateReason ?? lane2Proof?.snapshot?.trust_gate_reason,
    "unknown",
  );
  const collisionState = toStringOr(lane3View?.collisionState, "unknown");
  const remoteSessionHealth = toStringOr(
    lane3Summary?.remoteSessionHealth,
    "unknown",
  );
  const attachState = toStringOr(lane3Summary?.attachState, "blocked");

  const noProjectedRoutes = toNumberOr(lane3Summary?.projectedRoutes, 0) === 0;
  const isHealthy = remoteSessionHealth === "healthy";
  const shouldBlock = mode === "failure" || attachState === "blocked";

  if (!shouldBlock) {
    return null;
  }

  let reasonCode = "operator-path-degraded";
  if (trustGateReason !== "unknown" && trustGateReason !== "peer-allowed") {
    reasonCode = trustGateReason;
  } else if (collisionState !== "clean" && collisionState !== "unknown") {
    reasonCode = collisionState;
  } else if (!isHealthy || noProjectedRoutes) {
    reasonCode = `remote-session-${remoteSessionHealth}`;
  }

  return {
    isBlocked: true,
    reasonCode,
    trustGateReason,
    collisionState,
    remoteSessionHealth,
    attachState,
    operatorMessage:
      `Operator flow blocked for context due to ${reasonCode}. ` +
      `Check lane-2 trust gate and lane-3 remote session health.`,
  };
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lane2Proof = await readJson(args["lane2-proof"]);
  const lane3Summary = await readJson(args["lane3-summary"]);
  const lane3View = await readJson(args["lane3-operator-view"]);

  const routeIdentity = {
    selectedService: toStringOr(lane3Summary?.selectedService, "unknown"),
    alias: toStringOr(lane3View?.importedServiceAlias, "unknown"),
    peerId: toStringOr(lane2Proof?.snapshot?.peer_id, "unknown"),
    pairingSession: toStringOr(lane3Summary?.pairingSession, "unknown"),
    quicSession: toStringOr(lane2Proof?.snapshot?.quic_session?.session_id, "unknown"),
    trustLevel: toStringOr(
      lane2Proof?.trustLevel ?? lane2Proof?.snapshot?.trust_level,
      "unknown",
    ),
    discoveryState: toStringOr(
      lane2Proof?.discoveryState ?? lane2Proof?.snapshot?.discovery_state,
      "unknown",
    ),
  };

  const crtSummary = {
    projectedRoutes: toNumberOr(lane3Summary?.projectedRoutes, 0),
    trustState: toStringOr(lane3Summary?.trustState, "unknown"),
    freshnessState: toStringOr(lane3Summary?.freshnessState, "unknown"),
    remoteSessionHealth: toStringOr(lane3Summary?.remoteSessionHealth, "unknown"),
    attachState: toStringOr(lane3Summary?.attachState, "blocked"),
    collisionState: toStringOr(lane3View?.collisionState, "unknown"),
  };

  const blocker = deriveBlocker(
    lane2Proof,
    lane3Summary,
    lane3View,
    args["mode"],
  );

  const artifact = {
    artifactKind: "mus55-operator-shared-context-v1",
    contextId: args["context-id"],
    mode: args["mode"],
    generatedAt: new Date().toISOString(),
    lane2ProofPath: args["lane2-proof"],
    lane3SummaryPath: args["lane3-summary"],
    lane3OperatorViewPath: args["lane3-operator-view"],
    routeIdentity,
    crtSummary,
    blocker,
    status: blocker ? "blocked" : crtSummary.attachState,
  };

  await writeJson(args["out-json"], artifact);
  console.log(`operator context written: ${args["out-json"]}`);
  console.log(`context id: ${artifact.contextId}`);
  console.log(`mode: ${artifact.mode}`);
  console.log(`status: ${artifact.status}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`mus55 operator context compose failed: ${message}`);
  process.exit(1);
});
