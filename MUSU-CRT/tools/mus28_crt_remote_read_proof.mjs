#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

import { buildRemoteOperatorView } from "../harness/canonical/lane2_remote_read_runtime.mjs";

function usage() {
  return `Usage:
  node MUSU-CRT/tools/mus28_crt_remote_read_proof.mjs --lane2-proof <path> --summary-json <path> [--operator-view-json <path>]
`;
}

function parseArgs(argv) {
  let lane2Proof;
  let summaryJson;
  let operatorViewJson;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];

    if (flag === "--lane2-proof") {
      if (!value) throw new Error("--lane2-proof requires a value");
      lane2Proof = value;
      i += 1;
      continue;
    }
    if (flag === "--summary-json") {
      if (!value) throw new Error("--summary-json requires a value");
      summaryJson = value;
      i += 1;
      continue;
    }
    if (flag === "--operator-view-json") {
      if (!value) throw new Error("--operator-view-json requires a value");
      operatorViewJson = value;
      i += 1;
      continue;
    }
    if (flag === "-h" || flag === "--help" || flag === "help") {
      throw new Error(usage());
    }
    throw new Error(`unknown argument: ${flag}`);
  }

  if (!lane2Proof) throw new Error("--lane2-proof is required");
  if (!summaryJson) throw new Error("--summary-json is required");

  return {
    lane2Proof,
    summaryJson,
    operatorViewJson,
  };
}

async function writeJson(outputPath, payload) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await fs.readFile(args.lane2Proof, "utf8");
  const lane2Proof = JSON.parse(raw);

  const view = buildRemoteOperatorView(lane2Proof);
  const summary = {
    selectedService: view.selectedService,
    projectedRoutes: view.projectedRoutes,
    pairingSession: view.pairingSession,
    trustGateReason: view.trustGateReason,
    importDecisionReason: view.importDecisionReason,
    trustState: view.trustState,
    freshnessState: view.freshnessState,
    remoteSessionHealth: view.remoteSessionHealth,
    attachState: view.attachState,
  };

  await writeJson(args.summaryJson, summary);
  if (args.operatorViewJson) {
    await writeJson(args.operatorViewJson, view);
  }

  console.log(`summary written: ${args.summaryJson}`);
  if (args.operatorViewJson) {
    console.log(`operator view written: ${args.operatorViewJson}`);
  }
  console.log(`selected service: ${summary.selectedService}`);
  console.log(`projected routes: ${summary.projectedRoutes}`);
  console.log(`pairing session: ${summary.pairingSession}`);
  console.log(`trust state: ${summary.trustState}`);
  console.log(`freshness state: ${summary.freshnessState}`);
  console.log(`remote session health: ${summary.remoteSessionHealth}`);
  console.log(`attach state: ${summary.attachState}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`mus28 crt remote read proof failed: ${message}`);
  process.exit(1);
});
