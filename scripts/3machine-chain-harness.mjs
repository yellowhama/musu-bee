#!/usr/bin/env node
/**
 * 3-machine chain harness for MUS-432.
 *
 * Topology:
 *   operator_laptop  -> gpu_primary (5070Ti)  -> gpu_secondary (4060Ti)
 *
 * ENVIRONMENT LIMITATION (WSL single-node):
 * This harness runs on a single WSL host ("hughsecond"). Real inter-machine
 * transit across 3 physically separate hosts is NOT possible in this
 * environment. Each hop is executed on the same host. All 3 hops will carry
 * the same host_identifier.
 *
 * Per MUS-432 acceptance criteria §3:
 *   "At least 2 hops have distinct host_identifier values ... OR issue is
 *    escalated as blocked with explicit rationale (WSL limitation) + partial
 *    evidence for same-machine simulation."
 *
 * This harness documents the WSL blocker and produces a PARTIAL chain proof.
 * chainComplete is set to false for real runs; in --dry-run mode it validates
 * schema correctness using synthetic host identifiers.
 *
 * Chain proof output schema:
 * {
 *   proofVersion: string          // "1.0"
 *   generatedAt:  string          // ISO 8601 timestamp
 *   chainId:      string          // unique run identifier
 *   workItemId:   string          // opaque work item id
 *   workItemTitle: string         // human-readable title
 *   chainComplete: boolean        // true iff distinctHostIdentifiers >= 3 (real multi-machine)
 *   partialReason?: string        // present when chainComplete is false; explains why
 *   distinctHostIdentifiers: number // count of unique host_identifier values across hops
 *   hopsRequested: number         // always 3 for this harness
 *   hopsCompleted: number         // hops actually written (0..3)
 *   hops: Hop[]                   // per-hop detail (see Hop type below)
 *   wslBlocker?: WSLBlocker       // present when running on single WSL node
 *   verdict: "PASS" | "PARTIAL" | "DRY_RUN_SCHEMA_OK"
 *   verdictNote: string
 * }
 *
 * Hop schema:
 * {
 *   hop_index: number             // 1-based
 *   node_key: string              // "operator_laptop" | "gpu_primary" | "gpu_secondary"
 *   role: string                  // functional role of this node
 *   profile: string               // musu-connects profile name
 *   host_identifier: string       // hostname of the machine that executed this hop
 *   host_ip: string               // primary IP
 *   os_info: string               // uname -r output
 *   expected_host_identifier: string  // the hostname expected for real multi-machine run
 *   host_is_expected: boolean     // host_identifier === expected_host_identifier
 *   received_at: string           // ISO 8601
 *   input_artifact_ref: string|null   // path of artifact received from previous hop
 *   output_artifact_ref: string   // path of artifact produced by this hop
 *   work_item_id: string
 *   work_item_title: string
 *   chain_id: string
 *   simulated: boolean            // true when running on wrong/same host
 *   simulation_reason?: string    // explanation when simulated=true
 * }
 */

import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Parse CLI args: --out <path>, --dry-run
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
let outPath = null;
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && args[i + 1]) {
    outPath = resolve(args[i + 1]);
  } else if (args[i] === "--dry-run") {
    dryRun = true;
  }
}

if (!outPath) {
  console.error("Usage: node 3machine-chain-harness.mjs --out <path/chain-proof.json> [--dry-run]");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// JSON schema validator (no external deps)
// ---------------------------------------------------------------------------

/**
 * Validate a chain proof object against the expected schema.
 * Returns { valid: boolean, errors: string[] }.
 */
function validateChainProof(proof) {
  const errors = [];

  function check(cond, msg) {
    if (!cond) errors.push(msg);
  }

  check(typeof proof.proofVersion === "string", "proofVersion must be string");
  check(typeof proof.generatedAt === "string" && /\d{4}-\d{2}-\d{2}T/.test(proof.generatedAt),
    "generatedAt must be ISO 8601 string");
  check(typeof proof.chainId === "string" && proof.chainId.length > 0, "chainId must be non-empty string");
  check(typeof proof.workItemId === "string" && proof.workItemId.length > 0, "workItemId must be non-empty string");
  check(typeof proof.workItemTitle === "string", "workItemTitle must be string");

  // chainComplete: boolean — true iff distinctHostIdentifiers >= 3 for real multi-machine
  check(typeof proof.chainComplete === "boolean", "chainComplete must be boolean");

  // distinctHostIdentifiers: integer >= 0
  check(
    typeof proof.distinctHostIdentifiers === "number" &&
    Number.isInteger(proof.distinctHostIdentifiers) &&
    proof.distinctHostIdentifiers >= 0,
    "distinctHostIdentifiers must be non-negative integer"
  );

  // hopsRequested / hopsCompleted
  check(typeof proof.hopsRequested === "number" && Number.isInteger(proof.hopsRequested), "hopsRequested must be integer");
  check(typeof proof.hopsCompleted === "number" && Number.isInteger(proof.hopsCompleted), "hopsCompleted must be integer");
  check(proof.hopsCompleted <= proof.hopsRequested, "hopsCompleted must be <= hopsRequested");

  // hops array
  check(Array.isArray(proof.hops), "hops must be array");
  if (Array.isArray(proof.hops)) {
    proof.hops.forEach((hop, idx) => {
      const p = `hops[${idx}]`;
      check(typeof hop.hop_index === "number", `${p}.hop_index must be number`);
      check(typeof hop.node_key === "string", `${p}.node_key must be string`);
      check(typeof hop.role === "string", `${p}.role must be string`);
      check(typeof hop.profile === "string", `${p}.profile must be string`);
      check(typeof hop.host_identifier === "string", `${p}.host_identifier must be string`);
      check(typeof hop.host_ip === "string", `${p}.host_ip must be string`);
      check(typeof hop.os_info === "string", `${p}.os_info must be string`);
      check(typeof hop.expected_host_identifier === "string", `${p}.expected_host_identifier must be string`);
      check(typeof hop.host_is_expected === "boolean", `${p}.host_is_expected must be boolean`);
      check(typeof hop.received_at === "string", `${p}.received_at must be string`);
      check(hop.input_artifact_ref === null || typeof hop.input_artifact_ref === "string",
        `${p}.input_artifact_ref must be null or string`);
      check(typeof hop.output_artifact_ref === "string", `${p}.output_artifact_ref must be string`);
      check(typeof hop.work_item_id === "string", `${p}.work_item_id must be string`);
      check(typeof hop.chain_id === "string", `${p}.chain_id must be string`);
      check(typeof hop.simulated === "boolean", `${p}.simulated must be boolean`);
    });
  }

  // verdict
  check(
    ["PASS", "PARTIAL", "DRY_RUN_SCHEMA_OK"].includes(proof.verdict),
    `verdict must be one of PASS, PARTIAL, DRY_RUN_SCHEMA_OK — got: ${proof.verdict}`
  );
  check(typeof proof.verdictNote === "string", "verdictNote must be string");

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Runtime host info (skipped / mocked in --dry-run)
// ---------------------------------------------------------------------------
function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Topology definition
// ---------------------------------------------------------------------------
const topology = [
  {
    node_key: "operator_laptop",
    role: "review_and_control",
    profile: "remote-operator-laptop",
    expected_host: "operator-laptop",
    mock_host: "mock-operator-laptop",
  },
  {
    node_key: "gpu_primary",
    role: "generation",
    profile: "home-gpu-primary-5070ti",
    expected_host: "gpu-primary-5070ti",
    mock_host: "mock-gpu-primary",
  },
  {
    node_key: "gpu_secondary",
    role: "vision_qa",
    profile: "home-gpu-secondary-4060ti",
    expected_host: "gpu-secondary-4060ti",
    mock_host: "mock-gpu-secondary",
  },
];

// ---------------------------------------------------------------------------
// Build hops
// ---------------------------------------------------------------------------
const chainId = `mus432-3machine-${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}Z`;
const now = () => new Date().toISOString();

const workItemId = `work-${Math.random().toString(36).slice(2, 10)}`;
const workItemTitle = "MUS-432 proof: 3-machine chain harness end-to-end run";

const artifactDir = dirname(outPath);

if (!dryRun) {
  mkdirSync(artifactDir, { recursive: true });
}

// Real host info (unused in dry-run mode)
const realHostIdentifier = dryRun ? null : runCmd("hostname");
const realHostIp = dryRun ? null : (runCmd("hostname -I").split(" ")[0] || "unknown");
const realOsInfo = dryRun ? null : runCmd("uname -r");

const hops = [];
let previousArtifactRef = null;

for (let i = 0; i < topology.length; i++) {
  const node = topology[i];
  const artifactFilename = `hop-${i + 1}-${node.node_key}.json`;
  const artifactPath = resolve(artifactDir, artifactFilename);

  // In dry-run mode each hop gets a distinct synthetic host_identifier so
  // distinctHostIdentifiers=3 and chainComplete=true — proving the schema
  // can represent a fully-successful run without real hardware.
  const hostIdentifier = dryRun ? node.mock_host : realHostIdentifier;
  const hostIp = dryRun ? "192.168.0." + (i + 10) : realHostIp;
  const osInfo = dryRun ? "dry-run-synthetic" : realOsInfo;
  const simulated = dryRun ? false : true;

  const hop = {
    hop_index: i + 1,
    node_key: node.node_key,
    role: node.role,
    profile: node.profile,
    host_identifier: hostIdentifier,
    host_ip: hostIp,
    os_info: osInfo,
    expected_host_identifier: dryRun ? node.mock_host : node.expected_host,
    host_is_expected: hostIdentifier === (dryRun ? node.mock_host : node.expected_host),
    received_at: now(),
    input_artifact_ref: previousArtifactRef,
    output_artifact_ref: artifactPath,
    work_item_id: workItemId,
    work_item_title: workItemTitle,
    chain_id: chainId,
    simulated,
    ...(simulated
      ? {
          simulation_reason:
            "WSL single-node: this hop ran on the same physical host as all others. " +
            "Real inter-machine transit requires separate physical machines on the network.",
        }
      : {}),
  };

  if (!dryRun) {
    writeFileSync(artifactPath, JSON.stringify(hop, null, 2) + "\n", "utf8");
  }

  hops.push(hop);
  previousArtifactRef = artifactPath;
}

// ---------------------------------------------------------------------------
// Evaluate distinct host identifiers
// distinctHostIdentifiers: count of unique host_identifier values across hops.
// In a real 3-machine run, this must equal 3 for chainComplete to be true.
// In WSL single-node runs it will be 1 (all same host → chainComplete=false).
// In --dry-run mode synthetic mock hosts yield 3 → chainComplete=true.
// ---------------------------------------------------------------------------
const distinctHosts = new Set(hops.map((h) => h.host_identifier)).size;

// chainComplete is true only when every hop ran on a distinct physical host
// (distinctHostIdentifiers equals hopsCompleted and equals hopsRequested).
const chainComplete = distinctHosts >= topology.length;

// ---------------------------------------------------------------------------
// WSL Blocker documentation (only for real single-node runs)
// ---------------------------------------------------------------------------
const wslBlocker = (!dryRun && !chainComplete)
  ? {
      blocker_id: `blocker-wsl-${Math.random().toString(36).slice(2, 10)}`,
      blocker_type: "environment_limitation",
      title: "WSL single-node: cannot produce real 3-machine inter-host transit",
      description: [
        "This harness runs inside WSL2 on a single Windows host ('hughsecond').",
        "The 3-machine topology requires operator_laptop, gpu_primary (5070Ti), and",
        "gpu_secondary (4060Ti) to be physically distinct networked machines.",
        "In this environment, all 3 hops resolve to the same host_identifier.",
        "A real multi-machine proof requires: (a) a network-reachable 5070Ti node,",
        "(b) a network-reachable 4060Ti node, (c) a shared artifact store or relay,",
        "and (d) the musu-connects QUIC transport wired to route work items across hosts.",
      ].join(" "),
      partial_evidence: "Same-machine simulation provided. chain_complete: false.",
      resolution_needed:
        "Deploy musu-connectsd on gpu_primary and gpu_secondary nodes and re-run harness.",
      opened_at: now(),
    }
  : undefined;

// ---------------------------------------------------------------------------
// Chain proof
// chainComplete: true  → all 3 hops ran on distinct physical hosts (real multi-machine)
// chainComplete: false → WSL single-node or fewer than 3 distinct hosts detected
// distinctHostIdentifiers: integer count — the key metric for multi-machine verification
// ---------------------------------------------------------------------------
const verdict = dryRun ? "DRY_RUN_SCHEMA_OK" : (chainComplete ? "PASS" : "PARTIAL");

const chainProof = {
  proofVersion: "1.0",
  generatedAt: now(),
  chainId,
  workItemId,
  workItemTitle,
  // chainComplete is true when every hop executed on a separate physical machine
  // (distinctHostIdentifiers >= hopsRequested). False in WSL or single-node runs.
  chainComplete,
  ...((!chainComplete && !dryRun) ? {
    partialReason:
      "WSL single-node environment: all 3 hops executed on the same host. " +
      "Real 3-machine inter-host transit not demonstrated.",
  } : {}),
  // distinctHostIdentifiers: number of unique hostname values seen across all hops.
  // Target value for a successful Wave F run: 3 (one per topology node).
  distinctHostIdentifiers: distinctHosts,
  hopsRequested: topology.length,
  hopsCompleted: hops.length,
  hops,
  ...(wslBlocker ? { wslBlocker } : {}),
  verdict,
  verdictNote: dryRun
    ? "Dry-run mode: schema validated with synthetic hosts. No real transport executed."
    : chainComplete
    ? "All 3 hops completed on distinct physical hosts. Full multi-machine chain verified."
    : "Per MUS-432 AC §3: PARTIAL is allowed when WSL blocker is documented " +
      "and partial same-machine evidence is provided.",
};

// ---------------------------------------------------------------------------
// Schema validation (always run — catches regressions)
// ---------------------------------------------------------------------------
const validation = validateChainProof(chainProof);
if (!validation.valid) {
  console.error("[3machine-chain-harness] SCHEMA VALIDATION FAILED:");
  validation.errors.forEach((e) => console.error("  - " + e));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Write output (skipped in dry-run mode)
// ---------------------------------------------------------------------------
if (!dryRun) {
  writeFileSync(outPath, JSON.stringify(chainProof, null, 2) + "\n", "utf8");
} else {
  // In dry-run, write to stdout for inspection
  process.stdout.write(JSON.stringify(chainProof, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Print summary
// ---------------------------------------------------------------------------
console.log(`[3machine-chain-harness] mode=${dryRun ? "DRY-RUN" : "REAL"}`);
console.log(`[3machine-chain-harness] chain_id=${chainId}`);
console.log(`[3machine-chain-harness] hops_completed=${hops.length}`);
console.log(`[3machine-chain-harness] distinct_hosts=${distinctHosts}`);
console.log(`[3machine-chain-harness] chain_complete=${chainComplete}`);
console.log(`[3machine-chain-harness] verdict=${verdict}`);
console.log(`[3machine-chain-harness] schema_valid=true`);
if (!dryRun) {
  console.log(`[3machine-chain-harness] proof artifact: ${outPath}`);
}
if (!dryRun && wslBlocker) {
  console.log(`\n[WSL BLOCKER] ${wslBlocker.title}`);
}
