#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { buildRemoteOperatorView } from "../harness/canonical/lane2_remote_read_runtime.mjs";

const DEFAULT_PROOF_PATH = "/home/hugh51/musu-functions/MUSU-CRT/mock/lane2_live_proof_fixture.json";
const DEFAULT_OUTPUT_DIR = "/home/hugh51/musu-functions/work/mus28-crt-qa-states";

function usage() {
  return `Usage:
  node MUSU-CRT/tools/mus58_remote_session_health_matrix.mjs [--lane2-proof <path>] [--output-dir <path>]
`;
}

function parseArgs(argv) {
  let lane2ProofPath = DEFAULT_PROOF_PATH;
  let outputDir = DEFAULT_OUTPUT_DIR;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--lane2-proof") {
      if (!value) throw new Error("--lane2-proof requires a value");
      lane2ProofPath = value;
      i += 1;
      continue;
    }
    if (flag === "--output-dir") {
      if (!value) throw new Error("--output-dir requires a value");
      outputDir = value;
      i += 1;
      continue;
    }
    if (flag === "-h" || flag === "--help" || flag === "help") {
      throw new Error(usage());
    }
    throw new Error(`unknown argument: ${flag}`);
  }

  return { lane2ProofPath, outputDir };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureProjectedRoute(proof) {
  if (!proof.snapshot || typeof proof.snapshot !== "object") proof.snapshot = {};
  if (!Array.isArray(proof.snapshot.projected_routes)) proof.snapshot.projected_routes = [];
  if (proof.snapshot.projected_routes.length === 0) {
    proof.snapshot.projected_routes.push({
      import_id: "peer-a::demo-api",
      alias: "demo-api",
      collision_state: "clean",
      available: true,
    });
  }
  return proof.snapshot.projected_routes[0];
}

function ensureSessionShape(proof) {
  if (!proof.snapshot || typeof proof.snapshot !== "object") proof.snapshot = {};
  if (!proof.snapshot.quic_session || typeof proof.snapshot.quic_session !== "object") {
    proof.snapshot.quic_session = {};
  }
}

function buildScenario(base, scenario) {
  const proof = cloneJson(base);
  let route = ensureProjectedRoute(proof);
  ensureSessionShape(proof);

  if (scenario === "trusted_fresh") {
    route.collision_state = "clean";
    route.import_state = "active";
    route.available = true;
    proof.trustGateReason = "peer-allowed";
    proof.importDecisionReason = "clean";
    proof.transportEvidenceKind = "runtime-musu-port-http-route-plane-v1";
    proof.sessionEvidenceMode = "runtime-peer-authenticated";
    proof.sessionRemoteAddrSource = "quic-session-event.remote_addr";
    proof.snapshot.trust_gate_reason = "peer-allowed";
    proof.snapshot.import_decision_reason = "clean";
    proof.snapshot.transport_evidence_kind = "runtime-musu-port-http-route-plane-v1";
    proof.snapshot.session_evidence_mode = "runtime-peer-authenticated";
    proof.snapshot.session_remote_addr_source = "quic-session-event.remote_addr";
    proof.snapshot.pairing_session_id = "session-a";
    proof.snapshot.quic_session.session_id = "session-a";
  } else if (scenario === "degraded") {
    route.collision_state = "clean";
    route.import_state = "active";
    route.available = false;
    proof.trustGateReason = "peer-allowed";
    proof.importDecisionReason = "clean";
    proof.transportEvidenceKind = "runtime-musu-port-http-route-plane-v1";
    proof.sessionEvidenceMode = "runtime-unauthenticated";
    proof.sessionRemoteAddrSource = "quic-session-event.remote_addr";
    proof.snapshot.trust_gate_reason = "peer-allowed";
    proof.snapshot.import_decision_reason = "clean";
    proof.snapshot.transport_evidence_kind = "runtime-musu-port-http-route-plane-v1";
    proof.snapshot.session_evidence_mode = "runtime-unauthenticated";
    proof.snapshot.session_remote_addr_source = "quic-session-event.remote_addr";
    proof.snapshot.pairing_session_id = "session-a";
    proof.snapshot.quic_session.session_id = "session-z";
  } else if (scenario === "stale_withdrawn") {
    route.collision_state = "stale-timeout";
    route.import_state = "withdrawn";
    route.available = false;
    proof.trustGateReason = "peer-allowed";
    proof.importDecisionReason = "stale-timeout";
    proof.transportEvidenceKind = "runtime-musu-port-http-route-plane-v1";
    proof.sessionEvidenceMode = "runtime-unauthenticated";
    proof.sessionRemoteAddrSource = "quic-session-event.remote_addr";
    proof.snapshot.trust_gate_reason = "peer-allowed";
    proof.snapshot.import_decision_reason = "stale-timeout";
    proof.snapshot.transport_evidence_kind = "runtime-musu-port-http-route-plane-v1";
    proof.snapshot.session_evidence_mode = "runtime-unauthenticated";
    proof.snapshot.session_remote_addr_source = "quic-session-event.remote_addr";
    proof.snapshot.pairing_session_id = "session-a";
    proof.snapshot.quic_session.session_id = "session-a";
  } else if (scenario === "blocked") {
    proof.trustGateReason = "peer-blocked";
    proof.importDecisionReason = "peer-blocked";
    proof.transportEvidenceKind = "trust-gate-suppressed";
    proof.sessionEvidenceMode = "not-generated";
    proof.sessionRemoteAddrSource = "none";
    proof.snapshot.trust_gate_reason = "peer-blocked";
    proof.snapshot.import_decision_reason = "peer-blocked";
    proof.snapshot.transport_evidence_kind = "trust-gate-suppressed";
    proof.snapshot.session_evidence_mode = "not-generated";
    proof.snapshot.session_remote_addr_source = "none";
    proof.snapshot.projected_routes = [];
    proof.snapshot.suppressed_routes = [
      {
        import_id: "peer-a::demo-api",
        alias: "demo-api",
        collision_state: "peer-blocked",
        import_state: "suppressed",
        available: false,
      },
    ];
    proof.snapshot.pairing_session_id = null;
    proof.snapshot.quic_session = null;
  } else {
    throw new Error(`unknown scenario: ${scenario}`);
  }

  return proof;
}

function summarize(view) {
  return {
    selectedService: view.selectedService,
    projectedRoutes: view.projectedRoutes,
    pairingSession: view.pairingSession,
    trustState: view.trustState,
    freshnessState: view.freshnessState,
    remoteSessionHealth: view.remoteSessionHealth,
    attachState: view.attachState,
  };
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const { lane2ProofPath, outputDir } = parseArgs(process.argv.slice(2));
  const base = JSON.parse(await fs.readFile(lane2ProofPath, "utf8"));
  await fs.mkdir(outputDir, { recursive: true });

  const matrix = [
    {
      name: "trusted_fresh",
      expected: {
        trustState: "trusted",
        freshnessState: "fresh",
        remoteSessionHealth: "healthy",
        attachState: "attach-ready",
      },
    },
    {
      name: "degraded",
      expected: {
        trustState: "unknown",
        freshnessState: "degraded",
        remoteSessionHealth: "degraded",
        attachState: "projection-only",
      },
    },
    {
      name: "stale_withdrawn",
      expected: {
        trustState: "unknown",
        freshnessState: "stale",
        remoteSessionHealth: "stale",
        attachState: "projection-only",
      },
    },
    {
      name: "blocked",
      expected: {
        trustState: "untrusted",
        freshnessState: "degraded",
        remoteSessionHealth: "blocked",
        attachState: "blocked",
      },
    },
  ];

  for (const entry of matrix) {
    const proof = buildScenario(base, entry.name);
    const view = buildRemoteOperatorView(proof);
    const summary = summarize(view);

    assert.equal(summary.trustState, entry.expected.trustState, `${entry.name}: trustState mismatch`);
    assert.equal(summary.freshnessState, entry.expected.freshnessState, `${entry.name}: freshnessState mismatch`);
    assert.equal(summary.remoteSessionHealth, entry.expected.remoteSessionHealth, `${entry.name}: remoteSessionHealth mismatch`);
    assert.equal(summary.attachState, entry.expected.attachState, `${entry.name}: attachState mismatch`);

    await writeJson(path.join(outputDir, `${entry.name}.proof.json`), proof);
    await writeJson(path.join(outputDir, `${entry.name}.summary.json`), summary);
    await writeJson(path.join(outputDir, `${entry.name}.operator-view.json`), view);
  }

  console.log(`mus58 matrix verified: ${outputDir}`);
  for (const entry of matrix) {
    console.log(`- ${entry.name}: ${entry.expected.remoteSessionHealth}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`mus58 remote session health matrix failed: ${message}`);
  process.exit(1);
});
