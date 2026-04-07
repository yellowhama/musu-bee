#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

function usage() {
  return `Usage:
  node MUSU-CRT/tools/mus71_dual_gpu_chain_compose.mjs \
    --chain-id <id> \
    --phase <canonical-success|failure|retry> \
    --attempt <number> \
    --lane2-proof <path> \
    --lane3-summary <path> \
    --lane3-operator-view <path> \
    --out-dir <path>
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
    "chain-id",
    "phase",
    "attempt",
    "lane2-proof",
    "lane3-summary",
    "lane3-operator-view",
    "out-dir",
  ];
  for (const key of required) {
    if (!out[key]) {
      throw new Error(`--${key} is required`);
    }
  }
  if (!["canonical-success", "failure", "retry"].includes(out.phase)) {
    throw new Error("--phase must be canonical-success, failure, or retry");
  }

  const parsedAttempt = Number.parseInt(out.attempt, 10);
  if (!Number.isInteger(parsedAttempt) || parsedAttempt <= 0) {
    throw new Error("--attempt must be a positive integer");
  }
  out.attempt = parsedAttempt;
  return out;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function strOr(value, fallback) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boolOr(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function hasProjectedRoutes(proof) {
  return Array.isArray(proof?.snapshot?.projected_routes) && proof.snapshot.projected_routes.length > 0;
}

function deriveGenerationStatus(proof) {
  const trustGateReason = strOr(
    proof?.trustGateReason ?? proof?.snapshot?.trust_gate_reason,
    "unknown",
  );
  if (trustGateReason !== "peer-allowed") {
    return { status: "blocked", reasonCode: trustGateReason };
  }
  if (!hasProjectedRoutes(proof)) {
    return { status: "blocked", reasonCode: "projected-routes-empty" };
  }
  return { status: "ready", reasonCode: null };
}

function deriveQaStatus(summary, view, generationStatus) {
  const projectedRoutes = numOr(summary?.projectedRoutes, 0);
  const health = strOr(summary?.remoteSessionHealth, "unknown");
  const trust = strOr(summary?.trustState, "unknown");
  const collision = strOr(view?.collisionState, "unknown");
  if (generationStatus !== "ready") {
    return { status: "blocked", reasonCode: "generation-not-ready" };
  }
  if (projectedRoutes === 0) {
    return { status: "blocked", reasonCode: "projected-routes-empty" };
  }
  if (health !== "healthy") {
    return { status: "blocked", reasonCode: `remote-session-${health}` };
  }
  if (collision !== "clean") {
    return { status: "blocked", reasonCode: `collision-${collision}` };
  }
  if (trust !== "trusted") {
    return { status: "blocked", reasonCode: `trust-${trust}` };
  }
  return { status: "ready", reasonCode: null };
}

function deriveOperatorStatus(generationStatus, qaStatus) {
  if (generationStatus === "ready" && qaStatus === "ready") {
    return {
      status: "ready",
      decision: "dispatch-next-step",
      reasonCode: null,
      operatorMessage: "Chain context is healthy. Proceed with next dispatch.",
    };
  }
  if (qaStatus !== "ready") {
    return {
      status: "blocked",
      decision: "retry-generation",
      reasonCode: "qa-not-ready",
      operatorMessage:
        "QA/tagging checks are not ready; retry generation under the same chain context.",
    };
  }
  return {
    status: "blocked",
    decision: "retry-generation",
    reasonCode: "generation-not-ready",
    operatorMessage:
      "Generation stage is not ready; retry generation under the same chain context.",
  };
}

function roleForStage(stage) {
  if (stage === "generation") return "strong-gpu-desktop";
  if (stage === "qa-tagging") return "support-gpu-desktop";
  return "cafe-laptop-operator";
}

function canonicalTags(summary) {
  const trust = strOr(summary?.trustState, "unknown");
  const freshness = strOr(summary?.freshnessState, "unknown");
  const health = strOr(summary?.remoteSessionHealth, "unknown");
  return [`trust:${trust}`, `freshness:${freshness}`, `session:${health}`];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lane2Proof = await readJson(args["lane2-proof"]);
  const lane3Summary = await readJson(args["lane3-summary"]);
  const lane3View = await readJson(args["lane3-operator-view"]);

  const generation = deriveGenerationStatus(lane2Proof);
  const qa = deriveQaStatus(lane3Summary, lane3View, generation.status);
  const operator = deriveOperatorStatus(generation.status, qa.status);
  const generatedAt = new Date().toISOString();

  const generationArtifact = {
    artifactKind: "mus71-stage-generation-v1",
    chainContextId: args["chain-id"],
    phase: args.phase,
    attempt: args.attempt,
    stage: "generation",
    executionRole: roleForStage("generation"),
    generatedAt,
    status: generation.status,
    reasonCode: generation.reasonCode,
    selectedService: strOr(lane2Proof?.selected_service, "unknown"),
    trustLevel: strOr(lane2Proof?.trustLevel ?? lane2Proof?.snapshot?.trust_level, "unknown"),
    discoveryState: strOr(
      lane2Proof?.discoveryState ?? lane2Proof?.snapshot?.discovery_state,
      "unknown",
    ),
    trustGateReason: strOr(
      lane2Proof?.trustGateReason ?? lane2Proof?.snapshot?.trust_gate_reason,
      "unknown",
    ),
    pairingOutcome: strOr(lane2Proof?.snapshot?.pairing_outcome, "unknown"),
    projectedRouteCount: Array.isArray(lane2Proof?.snapshot?.projected_routes)
      ? lane2Proof.snapshot.projected_routes.length
      : 0,
    lane2ProofPath: args["lane2-proof"],
    runtimeEvidencePath: strOr(lane2Proof?.runtimeEvidencePath, "unknown"),
  };

  const qaArtifact = {
    artifactKind: "mus71-stage-qa-tagging-v1",
    chainContextId: args["chain-id"],
    phase: args.phase,
    attempt: args.attempt,
    stage: "qa-tagging",
    executionRole: roleForStage("qa-tagging"),
    generatedAt,
    status: qa.status,
    reasonCode: qa.reasonCode,
    trustState: strOr(lane3Summary?.trustState, "unknown"),
    freshnessState: strOr(lane3Summary?.freshnessState, "unknown"),
    remoteSessionHealth: strOr(lane3Summary?.remoteSessionHealth, "unknown"),
    projectedRoutes: numOr(lane3Summary?.projectedRoutes, 0),
    selectedService: strOr(lane3Summary?.selectedService, "unknown"),
    collisionState: strOr(lane3View?.collisionState, "unknown"),
    hasOperatorConflict: boolOr(lane3View?.hasOperatorConflict, false),
    tags: canonicalTags(lane3Summary),
    lane3SummaryPath: args["lane3-summary"],
    lane3OperatorViewPath: args["lane3-operator-view"],
  };

  const operatorArtifact = {
    artifactKind: "mus71-stage-operator-review-v1",
    chainContextId: args["chain-id"],
    phase: args.phase,
    attempt: args.attempt,
    stage: "operator-review",
    executionRole: roleForStage("operator-review"),
    generatedAt,
    status: operator.status,
    decision: operator.decision,
    reasonCode: operator.reasonCode,
    operatorMessage: operator.operatorMessage,
    generationStatus: generation.status,
    qaStatus: qa.status,
    selectedService: strOr(lane3Summary?.selectedService, "unknown"),
    pairingSession: strOr(lane3Summary?.pairingSession, "unknown"),
    lane2ProofPath: args["lane2-proof"],
    lane3SummaryPath: args["lane3-summary"],
    lane3OperatorViewPath: args["lane3-operator-view"],
  };

  const outDir = args["out-dir"];
  const generationPath = path.join(outDir, "generation.artifact.json");
  const qaPath = path.join(outDir, "qa-tagging.artifact.json");
  const operatorPath = path.join(outDir, "operator-review.artifact.json");
  const indexPath = path.join(outDir, "stage-index.json");

  await writeJson(generationPath, generationArtifact);
  await writeJson(qaPath, qaArtifact);
  await writeJson(operatorPath, operatorArtifact);

  const stageIndex = {
    artifactKind: "mus71-stage-index-v1",
    chainContextId: args["chain-id"],
    phase: args.phase,
    attempt: args.attempt,
    generatedAt,
    artifacts: {
      generation: generationPath,
      qaTagging: qaPath,
      operatorReview: operatorPath,
    },
    statusSummary: {
      generation: generation.status,
      qaTagging: qa.status,
      operatorReview: operator.status,
    },
  };
  await writeJson(indexPath, stageIndex);

  console.log(`mus71 stage artifacts written under: ${outDir}`);
  console.log(`chain context id: ${args["chain-id"]}`);
  console.log(`phase: ${args.phase}`);
  console.log(`generation status: ${generation.status}`);
  console.log(`qa/tagging status: ${qa.status}`);
  console.log(`operator status: ${operator.status}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`mus71 dual gpu chain compose failed: ${message}`);
  process.exit(1);
});
