/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";

const ROOT = process.cwd();

function source(relativePath: string) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function loadShellDom() {
  const dom = new JSDOM(source("src-tauri-shell/index.html"), {
    url: "http://localhost/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const win = dom.window as typeof dom.window & {
    __TAURI__?: { core: { invoke: (command: string) => Promise<unknown> } };
    renderTaskCard?: (
      taskId: string,
      data: {
        status: string;
        text?: string;
        target?: string;
        output?: string;
        error?: string;
        artifact?: string;
        routeProof?: Record<string, unknown>;
        orderBoundary?: { boundary: string; text: string; fingerprint?: string };
        retryDisabled?: boolean;
      }
    ) => void;
    renderFleet?: (
      nodes: Array<Record<string, unknown>>,
      thisPcActivity?: string | null,
      thisPcBridgeOk?: boolean
    ) => void;
  };
  win.setInterval = (() => 0) as typeof win.setInterval;
  win.clearInterval = (() => undefined) as typeof win.clearInterval;
  Object.defineProperty(win.navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => undefined },
  });
  win.__TAURI__ = {
    core: {
      invoke: async (command: string) => {
        if (command === "cockpit_state") {
          return { auth_status: "Local Only", bridge_status: "ok", version: "test" };
        }
        if (command === "list_fleet") {
          return [{ node_name: "this machine", last_seen: "", public_url: "", is_this_pc: true }];
        }
        return {};
      },
    },
  };
  win.eval(source("src-tauri-shell/main.js"));
  return dom;
}

test("public setup docs present MUSU Private Mesh, not Tailscale.com signup, as the default", () => {
  const userDocs = [
    "../INSTALL.md",
    "../QUICKSTART.md",
    "../docs/CONFIG.md",
    "../docs/API.md",
  ]
    .map((file) => `${file}\n${source(file)}`)
    .join("\n\n");

  assert.match(userDocs, /musu mesh join --device-add-pass <musu\.device_add\.v1\.json>/);
  assert.match(userDocs, /Tailscale\.com account is not required/);
  assert.match(userDocs, /MUSU Private Mesh/);
  assert.match(userDocs, /tailnet_ip/);
  assert.doesNotMatch(userDocs, /sign up for Tailscale/i);
  assert.doesNotMatch(userDocs, /For LAN\/Tailscale access/);
  assert.doesNotMatch(userDocs, /over Tailscale and the mesh router/);
  assert.doesNotMatch(userDocs, /Tailscale \+ peer pairing/);
  assert.doesNotMatch(userDocs, /Tailscale IP \(leave empty for local-only\)/);
});

test("failed-card retry resubmits the stored order tuple, not the current composer target", () => {
  const text = source("src-tauri-shell/main.js");

  assert.match(text, /li\.dataset\.orderText\s*=\s*text/);
  assert.match(text, /li\.dataset\.orderTarget\s*=\s*target\s*\|\|\s*""/);
  assert.match(text, /const target\s*=\s*li\.dataset\.orderTarget\s*\|\|\s*""/);
  assert.match(text, /submitText\(t,\s*target,\s*\{/);
  assert.match(text, /expectedBoundary:\s*\{/);
  assert.match(text, /boundary:\s*li\.dataset\.orderBoundary/);
  assert.match(text, /fingerprint:\s*li\.dataset\.orderBoundaryFingerprint/);
  assert.doesNotMatch(text, /submitText\(t,\s*\$\("order-target"\)/);
  assert.match(text, /function orderBoundaryMismatch\(expected, current\)/);
  assert.match(text, /expected\.fingerprint !== \(current\?\.fingerprint \|\| ""\)/);
  assert.match(text, /li\.dataset\.orderBoundaryFingerprint = contract\.fingerprint/);
  assert.match(text, /function orderBoundaryFingerprintDiffReason\(expected, current\)/);
  assert.match(text, /changed\.push\("tailnet IP changed"\)/);
  assert.match(text, /changed\.push\("control server changed"\)/);
  assert.match(text, /Retry blocked: execution boundary changed/);
  assert.match(text, /Retry blocked: execution boundary identity changed within/);
  assert.match(text, /retryDisabled:\s*true/);
  assert.match(text, /li\.dataset\.retryDisabled === "true"/);
  assert.match(text, /className = "task-review-target"/);
  assert.match(text, /function reviewTaskTarget\(li\)/);
  assert.match(text, /updateOrderTargetDisclosure\(\)/);
  assert.match(text, /const orderBoundary = orderTargetBoundarySnapshot\(orderTarget\)/);
  assert.match(text, /pollTask\(result\.task_id, text, orderTarget, orderBoundary\)/);
  assert.match(text, /function orderTargetIsAvailable\(target\)/);
  assert.match(text, /if \(!orderTargetIsAvailable\(orderTarget\)\)/);
});

test("submit fails closed before native IPC when target is disabled", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const now = new Date().toISOString();
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];

  win.__TAURI__.core.invoke = async (command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    if (command === "submit_order") {
      throw new Error("submit_order should not be called for disabled target");
    }
    return {};
  };

  win.renderFleet(
    [
      {
        node_name: "this machine",
        last_seen: now,
        public_url: "http://127.0.0.1:8070",
        is_this_pc: true,
      },
      {
        node_name: "studio-pc",
        last_seen: now,
        status_error: "node status unreadable",
        public_url: "http://100.64.0.11:8070",
        is_this_pc: false,
      },
    ],
    "idle",
    true
  );

  await win.submitText("restart the build", "studio-pc");

  assert.equal(calls.some((call) => call.command === "submit_order"), false);
  const failed = dom.window.document.querySelector(
    '[data-group="done"] .task-card'
  ) as HTMLElement;
  assert.match(failed?.textContent || "", /Target studio-pc is offline or not available/);
  assert.equal(failed?.dataset.orderBoundary, "unverified");
  assert.equal(failed?.querySelector(".task-boundary")?.textContent, "unverified");

  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("retry fails closed before native IPC when the stored execution boundary changed", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const now = new Date().toISOString();
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];

  win.__TAURI__.core.invoke = async (command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    if (command === "submit_order") {
      throw new Error("submit_order should not be called after boundary drift");
    }
    return {};
  };

  win.renderTaskCard("failed-private-order", {
    status: "failed",
    text: "summarize build",
    target: "studio-pc",
    error: "adapter rejected the order",
    orderBoundary: {
      boundary: "private",
      text: "Private Mesh: this order targets studio-pc over MUSU-managed Headscale/private routing. No Tailscale.com signup is required.",
      fingerprint: "studio-pc|false|private|100.64.0.11|https://mesh.example|true",
    },
  });

  win.renderFleet(
    [
      {
        node_name: "this machine",
        last_seen: now,
        public_url: "http://127.0.0.1:8070",
        is_this_pc: true,
      },
      {
        node_name: "studio-pc",
        last_seen: now,
        public_url: "http://100.64.0.11:8070",
        tailscale_ip: "100.64.0.11",
        mesh_mode: "external_tailnet",
        is_this_pc: false,
      },
    ],
    "idle",
    true
  );

  (doc.querySelector('[data-task="failed-private-order"] .task-retry') as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls.some((call) => call.command === "submit_order"), false);
  const blocked = [...doc.querySelectorAll(".task-card")].find((card) =>
    /Retry blocked: execution boundary changed/.test(card.textContent || "")
  ) as HTMLElement;
  assert.ok(blocked);
  assert.equal(blocked.dataset.orderTarget, "studio-pc");
  assert.equal(blocked.dataset.orderBoundary, "external");
  assert.equal(blocked.dataset.retryDisabled, "true");
  assert.equal(blocked.querySelector(".task-boundary")?.textContent, "external");
  assert.equal((blocked.querySelector(".task-retry") as HTMLElement).hidden, true);
  const reviewTarget = blocked.querySelector(".task-review-target") as HTMLButtonElement;
  assert.equal(reviewTarget.hidden, false);
  assert.equal(reviewTarget.disabled, false);
  (doc.querySelector('#order-target option[value="studio-pc"]') as HTMLOptionElement)?.remove();
  reviewTarget.click();
  assert.equal((doc.querySelector("#order-target") as HTMLSelectElement).value, "studio-pc");
  assert.equal((doc.querySelector("#order-target-disclosure") as HTMLElement).dataset.boundary, "external");
  assert.match(doc.querySelector("#order-target-disclosure")?.textContent || "", /Review only/);
  assert.match(blocked.textContent || "", /changed from Private Mesh to external/);

  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("retry fails closed before native IPC when Private Mesh peer fingerprint changed", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const now = new Date().toISOString();
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];

  win.__TAURI__.core.invoke = async (command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    if (command === "submit_order") {
      throw new Error("submit_order should not be called after peer fingerprint drift");
    }
    return {};
  };

  win.renderTaskCard("failed-private-fingerprint-order", {
    status: "failed",
    text: "summarize build",
    target: "studio-pc",
    error: "adapter rejected the order",
    orderBoundary: {
      boundary: "private",
      text: "Private Mesh: this order targets studio-pc over MUSU-managed Headscale/private routing. No Tailscale.com signup is required.",
      fingerprint: "studio-pc|false|private|100.64.0.11|https://mesh.example|true",
    },
  });

  win.renderFleet(
    [
      {
        node_name: "this machine",
        last_seen: now,
        public_url: "http://127.0.0.1:8070",
        is_this_pc: true,
      },
      {
        node_name: "studio-pc",
        last_seen: now,
        public_url: "http://100.64.0.99:8070",
        tailscale_ip: "100.64.0.99",
        mesh_mode: "musu_headscale",
        control_server_url: "https://mesh.example",
        control_server_verified: true,
        is_this_pc: false,
      },
    ],
    "idle",
    true
  );

  (doc.querySelector('[data-task="failed-private-fingerprint-order"] .task-retry') as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls.some((call) => call.command === "submit_order"), false);
  const blocked = [...doc.querySelectorAll(".task-card")].find((card) =>
    /Retry blocked: execution boundary identity changed/.test(card.textContent || "")
  ) as HTMLElement;
  assert.ok(blocked);
  assert.equal(blocked.dataset.orderBoundary, "private");
  assert.equal(blocked.dataset.retryDisabled, "true");
  assert.equal(blocked.querySelector(".task-boundary")?.textContent, "Private Mesh");
  assert.match(blocked.textContent || "", /identity changed within Private Mesh/);
  assert.match(blocked.textContent || "", /tailnet IP changed/);
  assert.equal((blocked.querySelector(".task-review-target") as HTMLElement).hidden, false);

  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("task cards expose route and terminal result actions", () => {
  const text = source("src-tauri-shell/main.js");
  const css = source("src-tauri-shell/styles.css");

  assert.match(text, /class="task-route"/);
  assert.match(text, /class="task-boundary"/);
  assert.match(text, /auto-route/);
  assert.match(text, /to \$\{li\.dataset\.orderTarget\}/);
  assert.match(text, /function orderTargetBoundarySnapshot\(target\)/);
  assert.match(text, /function applyTaskBoundary\(li, orderBoundary\)/);
  assert.match(text, /li\.dataset\.resultText\s*=\s*body/);
  assert.match(text, /className\s*=\s*"task-copy"/);
  assert.match(text, /navigator\.clipboard\.writeText\(result\)/);
  assert.match(text, /className\s*=\s*"task-details"/);
  assert.match(text, /function appendTaskLog\(li, status, body\)/);
  assert.match(text, /function renderTaskInspector\(li,/);
  assert.match(text, /function renderProofSummary\(li, routeProof\)/);
  assert.match(text, /function markFleetRowCallbackProof\(routeProof, fallbackTarget\)/);
  assert.match(text, /function proofGrade\(proof\)/);
  assert.match(text, /class="task-proof-summary"/);
  assert.match(text, /returned from \$\{peer\}/);
  assert.match(text, /sent to \$\{peer\}/);
  assert.match(text, /class="task-inspector"/);
  assert.match(text, /routeProof: st\.route_proof/);
  assert.match(text, /st\.route_proof\?\.callback_delivered/);
  assert.match(text, /markFleetRowCallbackProof\(st\.route_proof, target\)/);
  assert.match(text, /refreshPrivateMeshStatus\(\)/);
  assert.match(text, /rows\.push\(\["Path", proofValue\(routeProof, "route_kind"\)/);
  assert.match(text, /rows\.push\(\["Proof", proofGrade\(routeProof\)/);
  assert.match(text, /const boundaryLabel = orderBoundaryLabel\(li\.dataset\.orderBoundary/);
  assert.match(text, /\["Boundary", boundaryLabel\]/);
  assert.match(text, /rows\.push\(\["Boundary note", boundaryNote\]\)/);
  assert.match(text, /routeProof\.callback_delivered/);
  assert.match(text, /rows\.push\(\["Callback", "delivered"\]/);
  assert.match(text, /rows\.push\(\["Remote task", proofValue\(routeProof, "callback_remote_task_id"\)/);
  assert.match(css, /\.task-route/);
  assert.match(css, /\.task-boundary/);
  assert.match(css, /\.task-card\[data-order-boundary="private"\] \.task-boundary/);
  assert.match(css, /\.task-card\[data-order-boundary="external"\] \.task-boundary/);
  assert.match(css, /\.task-proof-summary/);
  assert.match(css, /\.task-proof-delivery/);
  assert.match(css, /\.task-copy/);
  assert.match(css, /\.task-inspector/);
  assert.match(css, /\.task-log/);
});

test("task cards render collapsed route and callback proof summaries", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;

  win.renderTaskCard("task-proof-1", {
    status: "done",
    text: "summarize build",
    target: "studio-pc",
    output: "remote result ok",
    routeProof: {
      route_kind: "lan",
      target_node_id: "studio-pc",
      result: "success",
      encryption: "none_http_bearer",
      callback_delivered: true,
      callback_node: "studio-pc",
    },
  });

  const summary = dom.window.document.querySelector(
    '[data-task="task-proof-1"] .task-proof-summary'
  );
  assert.ok(summary);
  assert.equal(summary.hasAttribute("hidden"), false);
  assert.match(summary.textContent || "", /returned from studio-pc/);
  assert.match(summary.textContent || "", /lan · success · bearer route/);
  const card = dom.window.document.querySelector('[data-task="task-proof-1"]') as HTMLElement;
  assert.equal(card.dataset.orderBoundary, "unverified");
  assert.equal(card.querySelector(".task-boundary")?.textContent, "unverified");
  (card.querySelector(".task-details") as HTMLButtonElement).click();
  assert.match(card.querySelector(".task-meta")?.textContent || "", /Boundary/);
  assert.match(card.querySelector(".task-meta")?.textContent || "", /unverified/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("browser shell QA rebuilds ignored out artifact before opening it", () => {
  const pkg = JSON.parse(source("package.json")) as {
    scripts?: Record<string, string>;
  };
  const buildScript = source("scripts/build-tauri-shell.mjs");
  const artifactVerifier = source("scripts/verify-tauri-shell-build.mjs");
  const browserSpec = source("src-tauri-shell/cockpit-browser.spec.ts");

  assert.match(
    pkg.scripts?.["test:tauri-shell:browser"] || "",
    /^playwright test --config=playwright\.tauri-shell\.config\.ts$/
  );
  assert.match(browserSpec, /import \{ execFileSync \} from "node:child_process"/);
  assert.match(browserSpec, /test\.beforeAll\(\(\) => \{/);
  assert.match(browserSpec, /execFileSync\(process\.execPath, \["scripts\/build-tauri-shell\.mjs"\]/);
  assert.match(browserSpec, /path\.join\(process\.cwd\(\), "out", "index\.html"\)/);
  assert.match(buildScript, /schema:\s*"musu\.tauri_shell_build\.v1"/);
  assert.match(buildScript, /source_hashes:\s*\{/);
  assert.match(buildScript, /output_hashes:\s*\{/);
  assert.match(buildScript, /source_to_output:\s*\{/);
  assert.match(
    pkg.scripts?.["test:tauri-shell:artifact"] || "",
    /npm run build:tauri-shell && node scripts\/verify-tauri-shell-build\.mjs/
  );
  assert.match(artifactVerifier, /musu\.tauri_shell_build\.v1/);
  assert.match(artifactVerifier, /source hash mismatch for \$\{name\}/);
  assert.match(artifactVerifier, /output hash mismatch for \$\{name\}/);
  assert.match(artifactVerifier, /VERSION substitution/);
  assert.match(artifactVerifier, /byte-for-byte copy/);
  assert.match(browserSpec, /desktop shell build metadata binds source and output artifacts/);
  assert.match(browserSpec, /metadata\.source_hashes\["index\.html"\]/);
  assert.match(browserSpec, /metadata\.output_hashes\["index\.html"\]/);
});

test("desktop child CLI commands are hidden, and fleet refresh avoids child processes", () => {
  const tauri = source("src-tauri/src/lib.rs");
  const main = source("src-tauri-shell/main.js");
  const listFleet = tauri.match(/fn list_fleet\(\)[\s\S]*?\n}\n\n\/\/\/ `submit_order`/)?.[0] || "";

  assert.match(tauri, /fn no_window\(cmd: &mut std::process::Command\) -> &mut std::process::Command/);
  assert.match(tauri, /use std::os::windows::process::CommandExt/);
  assert.match(tauri, /const CREATE_NO_WINDOW:\s*u32\s*=\s*0x0800_0000/);
  assert.match(tauri, /cmd\.creation_flags\(CREATE_NO_WINDOW\)/);
  assert.match(
    tauri,
    /fn start_login\(\)[\s\S]*?no_window\(&mut cmd\)\s*[\r\n\s]*\.spawn\(\)/
  );
  assert.match(
    tauri,
    /fn spawn_musu_startup_open\(\)[\s\S]*?no_window\(&mut cmd\)\s*[\r\n\s]*\.spawn\(\)/
  );
  assert.match(
    tauri,
    /fn run_command_with_timeout\([\s\S]*?let mut child = no_window\(&mut cmd\)\s*[\r\n\s]*\.spawn\(\)/
  );
  assert.match(listFleet, /http_get_with_bearer\(&base_url,\s*"\/api\/fleet\/status",\s*&token\)/);
  assert.match(listFleet, /status_code == 401 \|\| status_code == 403/);
  assert.match(listFleet, /return Err\("local_fleet_auth_failed"\.to_string\(\)\)/);
  assert.match(listFleet, /fleet_nodes_from_bridge_dashboard\(&dashboard\)/);
  assert.doesNotMatch(listFleet, /run_command_with_timeout\(/);
  assert.doesNotMatch(listFleet, /musu_command_path\(/);
  assert.match(tauri, /fn submit_order\([\s\S]*?run_command_with_timeout\(/);
  assert.match(tauri, /fn desktop_status\(\)[\s\S]*?run_command_with_timeout\(/);
  assert.match(tauri, /fn http_get_with_bearer\(base: &str,\s*path: &str,\s*token: &str\)/);
  assert.match(tauri, /fn bearer_authorization_header\(token: &str\) -> Result<String, String>/);
  assert.match(tauri, /token\.bytes\(\)\.any\(\|byte\| byte <= 0x1f \|\| byte == 0x7f\)/);
  assert.match(tauri, /format!\("Authorization: Bearer \{token\}"\)/);
  assert.match(tauri, /fn http_status_code\(response: &str\) -> Option<u16>/);
  assert.match(
    main,
    /if \(connected\) \{[\s\S]*?const nodes = await invoke\("list_fleet"\);[\s\S]*?const list = Array\.isArray\(nodes\) && nodes\.length \? nodes : \[[\s\S]*?node_name: "this machine"[\s\S]*?renderFleet\(list, thisPcActivity, bridgeOk\);/
  );
  assert.match(main, /const PRIVATE_MESH_STATUS_REFRESH_MS = 300_000/);
  assert.match(main, /let lastPrivateMeshStatusRefreshAt = 0/);
  assert.match(main, /let privateMeshStatusRefreshInFlight = null/);
  assert.match(
    main,
    /async function refreshPrivateMeshStatus\(\{ force = false \} = \{\}\)[\s\S]*?now - lastPrivateMeshStatusRefreshAt < PRIVATE_MESH_STATUS_REFRESH_MS[\s\S]*?return lastPrivateMeshStatus;/
  );
  assert.match(
    main,
    /if \(privateMeshStatusRefreshInFlight\) \{[\s\S]*?return privateMeshStatusRefreshInFlight;/
  );
  assert.match(main, /refreshPrivateMeshStatus\(\{ force: true \}\)/);
});

test("Private Mesh release proof bundle is bound to the current contract and toolchain", () => {
  const tauri = source("src-tauri/src/lib.rs");
  const runner = source("../scripts/windows/run-private-mesh-release-proof.ps1");
  const bundleVerifier = source("../scripts/windows/verify-private-mesh-release-proof-bundle.ps1");
  const archiver = source("../scripts/windows/archive-private-mesh-release-proof-bundle.ps1");
  const archiveVerifier = source("../scripts/windows/verify-private-mesh-release-proof-archive.ps1");
  const privateMesh = source("../musu-rs/src/install/private_mesh.rs");

  assert.match(
    tauri,
    /PRIVATE_MESH_RELEASE_BUNDLE_CONTRACT:\s*&str\s*=\s*"musu\.private_mesh_release_bundle_contract\.v20260614_toolchain_bound"/
  );
  assert.match(tauri, /"release_bundle_contract":\s*PRIVATE_MESH_RELEASE_BUNDLE_CONTRACT/);
  assert.match(tauri, /PHYSICAL_PEER_EVIDENCE_MAX_AGE_SECONDS:\s*i64\s*=\s*86_400/);
  assert.match(tauri, /physical_peer_evidence_generated_at_error/);
  assert.match(tauri, /regenerate it on the target PC within 24 hours/);
  assert.match(tauri, /native peer_identity target_hostname is missing/);
  assert.match(tauri, /physical peer evidence hostname does not match native peer_identity target_hostname/);
  assert.match(
    tauri,
    /require_manifest_string_match\(\s*&manifest,\s*"release_bundle_contract",\s*PRIVATE_MESH_RELEASE_BUNDLE_CONTRACT/
  );
  assert.match(
    tauri,
    /require_manifest_string_match\(\s*&archive_manifest,\s*"release_bundle_contract",\s*PRIVATE_MESH_RELEASE_BUNDLE_CONTRACT/
  );
  assert.match(
    runner,
    /\$ReleaseBundleContract = "musu\.private_mesh_release_bundle_contract\.v20260614_toolchain_bound"/
  );
  assert.match(runner, /release_bundle_contract = \$ReleaseBundleContract/);
  assert.match(runner, /function Get-ReleaseProofToolHashes/);
  assert.match(runner, /schema = "musu\.private_mesh_release_proof_tool_hashes\.v1"/);
  assert.match(runner, /Get-EvidenceFileSha256 -Path \$path/);
  assert.match(runner, /archive_verifier = Join-Path \$scriptDir "verify-private-mesh-release-proof-archive\.ps1"/);
  assert.match(bundleVerifier, /function Add-ReleaseToolHashChecks/);
  assert.match(bundleVerifier, /release bundle contract/);
  assert.match(bundleVerifier, /recorded release proof tool hash must match current verifier toolchain/);
  assert.match(bundleVerifier, /archive_verifier = "verify-private-mesh-release-proof-archive\.ps1"/);
  assert.match(bundleVerifier, /\$PhysicalPeerEvidenceMaxAgeSeconds = 86400/);
  assert.match(bundleVerifier, /generated_at_fresh/);
  assert.match(bundleVerifier, /runner completed_at/);
  assert.match(bundleVerifier, /release proof completed_at/);
  assert.match(bundleVerifier, /be generated within 24 hours of release proof completed_at/);
  assert.match(bundleVerifier, /function Add-PhysicalNativeHostnameConsistencyCheck/);
  assert.match(bundleVerifier, /physical peer evidence hostname must match native peer_identity target_hostname/);
  assert.match(bundleVerifier, /function Add-PrivateMeshRouteTransportCheck/);
  assert.match(bundleVerifier, /private mesh route transport/);
  assert.match(bundleVerifier, /tailscale_wireguard_overlay/);
  assert.match(bundleVerifier, /musu_private_mesh_tailnet_route/);
  assert.match(bundleVerifier, /release_tool_hashes = Get-PropertyValue -Value \$runner -Name "release_tool_hashes"/);
  assert.match(archiver, /release_bundle_contract = Get-StringProperty -Value \$manifest -Name "release_bundle_contract"/);
  assert.match(archiver, /release_tool_hashes = Get-PropertyValue -Value \$manifest -Name "release_tool_hashes"/);
  assert.match(archiver, /\$archiveNow = \[DateTimeOffset\]::UtcNow/);
  assert.match(archiver, /archived_at_unix_ms = \$archiveNow\.ToUnixTimeMilliseconds\(\)/);
  assert.match(archiver, /-Role "verification"/);
  assert.doesNotMatch(archiver, /-Role "runner_verification"/);
  assert.match(archiver, /function Copy-OptionalArtifactPair/);
  assert.match(archiver, /Copy-OptionalArtifactPair -Copied \$copied -Role "native_release_evidence"/);
  assert.match(archiver, /Copy-OptionalArtifactPair -Copied \$copied -Role "native_verification"/);
  assert.match(archiver, /verify-private-mesh-release-proof-archive\.ps1/);
  assert.match(archiver, /Archive verifier failed; zip was not created/);
  assert.match(archiver, /archive_verifier_exit_code = \$archiveVerifierExitCode/);
  assert.match(archiver, /archive_verifier_ok = \[bool\]\$archiveVerifierParsed\.ok/);
  assert.match(archiver, /archive_verifier_schema = \[string\]\$archiveVerifierParsed\.schema/);
  assert.match(archiver, /archive_verifier_kind = "powershell_current_toolchain"/);
  assert.match(runner, /\$result\.archive_verifier_kind = \[string\]\$archive\.parsed\.archive_verifier_kind/);
  assert.match(archiveVerifier, /musu\.private_mesh_release_proof_archive_verification\.v1/);
  assert.match(archiveVerifier, /archive artifact file and sidecar must be inside archive directory/);
  assert.match(archiveVerifier, /evidence_inside_archive/);
  assert.match(archiveVerifier, /archived bundle target must match archive manifest/);
  assert.match(archiveVerifier, /archived bundle control server URL must match archive manifest/);
  assert.match(archiveVerifier, /archive tool hash must match current verifier toolchain/);
  assert.match(archiveVerifier, /function Add-PrivateMeshRouteTransportCheck/);
  assert.match(archiveVerifier, /function Add-ArchivedBundleRequiredCheck/);
  assert.match(archiveVerifier, /function Add-ArchivedVerificationBindingCheck/);
  assert.match(archiveVerifier, /function Add-ArchivedPeerIdentityBindingCheck/);
  assert.match(archiveVerifier, /function Add-ArchivedPhysicalEvidenceReleaseTimeBindingCheck/);
  assert.match(archiveVerifier, /private mesh route transport/);
  assert.match(archiveVerifier, /archived route evidence must prove successful MUSU Headscale\/Tailnet WireGuard overlay delivery/);
  assert.match(archiveVerifier, /archived verification target binding/);
  assert.match(archiveVerifier, /archived verification must be ok and match archive target node\/IP\/control server with valid completed_at/);
  assert.match(archiveVerifier, /archived peer identity target binding/);
  assert.match(archiveVerifier, /archived route peer_identity must match archive target node\/IP, be release-bound, and match archived physical peer hostname/);
  assert.match(archiveVerifier, /archived physical peer evidence release time binding/);
  assert.match(archiveVerifier, /archived verification completed_at/);
  assert.match(archiveVerifier, /tailscale_wireguard_overlay/);
  assert.match(archiveVerifier, /private_mesh_control_server_url/);
  assert.match(archiveVerifier, /musu_private_mesh_tailnet_route/);
  assert.match(archiveVerifier, /foreach \(\$role in @\("bundle_manifest", "route_evidence", "physical_peer_evidence"\)\)/);
  assert.match(archiveVerifier, /archive must contain \$role artifact/);
  assert.match(tauri, /fn verify_archived_route_transport_binding/);
  assert.match(tauri, /fn verify_archived_verification_binding/);
  assert.match(tauri, /fn verify_archived_peer_identity_binding/);
  assert.match(tauri, /fn verify_archived_physical_peer_time_binding/);
  assert.match(tauri, /archived verification \{field\} does not match archive manifest/);
  assert.match(tauri, /archived peer_identity is not bound to archive target and physical evidence/);
  assert.match(tauri, /archived route evidence transport binding failed/);
  assert.match(tauri, /archived physical peer evidence release time binding failed/);
  assert.match(tauri, /verify_private_mesh_route_transport_contract/);
  assert.match(tauri, /fn read_physical_peer_evidence_summary_for_release/);
  assert.match(tauri, /release proof completed_at is missing/);
  assert.match(tauri, /physical peer evidence release time binding/);
  assert.match(tauri, /require_manifest_check_ok\(checks, "physical peer evidence release time binding"\)/);
  assert.match(privateMesh, /--physical-peer-evidence is required for `musu mesh release-proof`/);
  assert.match(privateMesh, /release identity is not bound to a distinct physical target PC/);
  assert.match(privateMesh, /was generated on the same host as this source PC/);
});

test("fleet view has local targetable/stale/online/offline filters with count chips", () => {
  const html = source("src-tauri-shell/index.html");
  const text = source("src-tauri-shell/main.js");
  const css = source("src-tauri-shell/styles.css");

  assert.match(html, /data-fleet-filter="all"/);
  assert.match(html, /data-fleet-filter="online"/);
  assert.match(html, /data-fleet-filter="targetable"/);
  assert.match(html, /data-fleet-filter="this-pc"/);
  assert.match(html, /data-fleet-filter="stale"/);
  assert.match(html, /data-fleet-filter="offline"/);
  assert.match(html, /data-fleet-count="targetable"/);
  assert.match(html, /data-fleet-count="this-pc"/);
  assert.match(html, /data-fleet-count="stale"/);
  assert.match(html, /data-fleet-count="offline"/);
  assert.match(html, /No Tailscale\.com signup required/);
  assert.match(html, /Headscale \+ Caddy HTTPS \+ embedded DERP/);
  // Add PC step 1 is an in-app action now (input + Generate bundle button driving
  // the private_mesh_bootstrap IPC), not a copied `musu mesh bootstrap` command.
  assert.match(html, /id="bootstrap-server-url"/);
  assert.match(html, /id="bootstrap-generate"[^>]*>Generate bundle</);
  assert.match(html, /docker compose config --quiet/);
  assert.match(html, /check-public-endpoint\.ps1/);
  assert.match(html, /Device-add pass/);
  assert.match(html, /musu\.device_add\.v1/);
  assert.match(html, /writes a one-use MUSU device-add pass file/);
  assert.match(html, /device-add-passes\//);
  assert.match(html, /prints only the file path plus the target join command/);
  assert.match(html, /scripts\\create-join-key\.ps1/);
  assert.match(html, /Copy that generated pass file to each target PC/);
  assert.match(html, /consumes the secret-bearing file after a successful join/);
  assert.doesNotMatch(html, /Save the printed device-add pass/);
  assert.doesNotMatch(html, /prints a one-use MUSU device-add pass/);
  assert.match(html, /musu mesh join --device-add-pass &lt;musu\.device_add\.v1\.json&gt;/);
  assert.match(html, /musu mesh verify --target-ip/);
  assert.match(html, /musu mesh physical-peer-evidence --json/);
  assert.match(html, /Release proof/);
  assert.match(html, /musu mesh release-proof --target-node/);
  assert.match(html, /--physical-peer-evidence &lt;copied-target-pc-physical-peer-evidence\.json&gt;/);
  assert.doesNotMatch(html, /run-private-mesh-release-proof\.ps1/);
  assert.match(html, /id="mesh-status-card"/);
  assert.match(html, /id="mesh-status-title"/);
  assert.match(html, /id="mesh-status-proof"/);
  assert.match(html, /id="mesh-proof-strip"/);
  assert.match(html, /id="mesh-proof-strip-diagnostic"/);
  assert.match(html, /id="release-evidence-strip"/);
  assert.match(html, /id="release-evidence-readiness"/);
  assert.match(html, /id="release-evidence-checks"/);
  assert.match(html, /id="release-evidence-path"/);
  assert.match(html, /id="physical-peer-evidence-path"/);
  assert.match(html, /id="physical-peer-evidence-latest"/);
  assert.match(html, /id="physical-peer-evidence-check"/);
  assert.match(html, /id="physical-peer-evidence-status"/);
  assert.match(html, /data-copy-release-evidence/);
  assert.match(html, /data-open-release-evidence/);
  assert.match(html, /data-copy-release-next-action/);
  assert.match(html, /Open folder/);
  assert.match(html, /Copy evidence/);
  assert.match(html, /Copy next/);
  assert.match(html, /id="add-pc-toggle"/);
  assert.match(html, /aria-controls="add-pc-panel"/);
  assert.match(html, /id="add-pc-panel"/);
  assert.match(html, /id="empty-add-pc"/);
  assert.match(html, /data-mesh-copy-proof/);
  assert.match(html, /Copy proof/);
  assert.match(html, /id="mesh-doctor"/);
  assert.match(html, /Run local check/);
  assert.match(html, /data-copy-text="musu mesh doctor --json"/);
  // bootstrap step is now an in-app input+button action (asserted above), so the
  // old copy-the-command affordance is intentionally gone.
  assert.match(html, /data-copy-text="docker compose config --quiet && docker compose up -d && docker compose exec headscale headscale health"/);
  assert.match(html, /data-copy-text="powershell -ExecutionPolicy Bypass -File \.\\scripts\\check-public-endpoint\.ps1"/);
  assert.match(html, /data-copy-text="musu mesh join --device-add-pass &lt;musu\.device_add\.v1\.json&gt;"/);
  assert.match(html, /data-copy-text="musu mesh release-proof --target-node &lt;node&gt; --target-ip &lt;peer-100\.x\.y\.z&gt; --expected-control-server-url https:\/\/mesh\.your-domain --physical-peer-evidence &lt;copied-target-pc-physical-peer-evidence\.json&gt; --json"/);
  assert.match(html, /id="connector-policy"/);
  assert.match(html, /Connector gate/);
  assert.match(html, /External APIs are reviewed before MUSU uses them/);
  assert.match(html, /id="connector-review-form"/);
  assert.match(html, /id="connector-review-input"/);
  assert.match(html, /Scraping\/lead\/download gets blocked or warned/);
  assert.match(html, /id="connector-registry"/);
  assert.match(html, /Curated connector runway/);
  assert.match(html, /review-ready, not marketplace import/);
  assert.match(html, /id="order-target-disclosure"/);
  assert.match(html, /Auto-route: MUSU will choose an online target/);
  assert.match(
    text,
    /const FLEET_FILTERS = new Set\(\["all", "online", "targetable", "this-pc", "stale", "offline"\]\)/
  );
  assert.match(text, /const CONNECTOR_RISK_RULES = \[/);
  assert.match(text, /const GENERATED_MARKETPLACE_CATALOG_RE/);
  assert.match(text, /raw\\\.githubusercontent\\\.com/);
  assert.match(text, /const CURATED_CONNECTORS = \[/);
  assert.match(text, /id: "openapi-to-mcp"/);
  assert.match(text, /id: "github"/);
  assert.match(text, /function connectorToolContractForUi\(connector\)/);
  assert.match(text, /schema: "musu\.tool_contract\.v1"/);
  assert.match(text, /requires_account/);
  assert.match(text, /data_leaves_device/);
  assert.match(text, /explicit_user_enablement_required/);
  assert.match(text, /li\.dataset\.connectorProvider = toolContract\.provider/);
  assert.match(text, /li\.dataset\.connectorAccount = toolContract\.requires_account \? "required" : "none"/);
  assert.match(text, /li\.dataset\.connectorEgress = toolContract\.data_leaves_device \? "external" : "local"/);
  assert.match(text, /connector-card-trust/);
  assert.match(text, /tool_contract: toolContract/);
  assert.match(text, /function orderTargetBoundary\(option\)/);
  assert.match(text, /function updateOrderTargetDisclosure\(\)/);
  assert.match(text, /Retry preserves auto-route instead of re-reading the dropdown/);
  assert.match(text, /No Tailscale\.com signup is required/);
  assert.match(text, /Run Private Mesh proof before treating it as release evidence/);
  assert.match(text, /opt\.dataset\.meshState = mesh\.state/);
  assert.match(text, /\$\("order-target"\)\?\.addEventListener\("change", updateOrderTargetDisclosure\)/);
  assert.match(text, /function classifyConnectorCandidate\(value\)/);
  assert.match(text, /function reviewConnectorCandidate\(value\)/);
  assert.match(text, /function renderConnectorRegistry\(\)/);
  assert.match(text, /async function runConnectorProof\(btn, connector\)/);
  assert.match(text, /async function copyConnectorPlan\(btn, connector\)/);
  assert.match(text, /button\.dataset\.connectorReview = connector\.id/);
  assert.match(text, /copyPlan\.dataset\.connectorPlan = connector\.id/);
  assert.match(text, /runProof\.dataset\.connectorProofRun = connector\.id/);
  assert.match(text, /method: "musu_run_connector_health_check"/);
  assert.match(text, /musu\.connector_proof_plan\.v1/);
  assert.match(text, /renderConnectorRegistry\(\)/);
  assert.match(text, /\$\("connector-review-form"\)\?\.addEventListener\("submit"/);
  assert.match(text, /function applyFleetFilter\(\)/);
  assert.match(text, /li\.dataset\.fleetState = online \? "online" : "offline"/);
  assert.match(text, /li\.dataset\.fleetTargetable = online \? "true" : "false"/);
  assert.match(text, /li\.dataset\.fleetThisPc = n\.is_this_pc \? "true" : "false"/);
  assert.match(text, /li\.dataset\.fleetStale = stale \? "true" : "false"/);
  assert.match(text, /function meshLabelForNode\(n\)/);
  assert.match(text, /function peerVerifyCommandForNode\(n, mesh, online\)/);
  assert.match(text, /function releaseProofTargetForNode\(n, mesh, online\)/);
  assert.match(text, /function releaseProofCommandForTarget\(target, evidencePath = validatedPhysicalPeerEvidencePathForTarget\(target\)\)/);
  assert.match(text, /function exactReleaseProofCommandForTarget\(target\)/);
  assert.match(text, /exactReleaseProofCommandForTarget\(releaseProofTarget\)/);
  assert.match(text, /let lastPhysicalPeerEvidenceValidation = null/);
  assert.match(text, /function rememberPhysicalPeerEvidenceValidation\(path, target, validation\)/);
  assert.match(text, /function validatedPhysicalPeerEvidencePathForTarget\(target\)/);
  assert.match(text, /async function copyReleaseProofCommand\(btn, target\)/);
  assert.match(text, /validatePhysicalPeerEvidenceForTarget\(path, target\)/);
  assert.match(text, /clearPhysicalPeerEvidenceValidation\(\)/);
  assert.match(text, /musu mesh release-proof/);
  assert.match(text, /run-private-mesh-release-proof\.ps1/);
  assert.match(text, /powershellSingleQuote\(target\.nodeName\)/);
  assert.match(text, /function runPeerVerify\(btn, targetIp\)/);
  assert.match(text, /let lastReleaseProofResult = null/);
  assert.match(text, /let lastReleaseProofTarget = null/);
  assert.match(text, /function releaseProofEvidencePath\(result\)/);
  assert.match(text, /function releaseProofOpenPath\(result\)/);
  assert.match(text, /function releaseProofIntegrityLabel\(result\)/);
  assert.match(text, /function releaseProofIdentityLabel\(result\)/);
  assert.match(text, /function releaseProofTrusted\(result\)/);
  assert.match(text, /function releaseProofTrustError\(result\)/);
  assert.match(text, /function renderReleaseProofEvidence\(result, target, state = "idle"\)/);
  assert.match(text, /function runPeerReleaseProof\(btn, target\)/);
  assert.match(text, /function physicalPeerEvidencePath\(\)/);
  assert.match(text, /function warnMissingPhysicalPeerEvidence\(target\)/);
  assert.match(text, /copy the JSON and its \.sha256 sidecar/);
  assert.match(text, /Its \.sha256 sidecar must sit next to it/);
  assert.match(text, /function normalizeNodeName\(value\)/);
  assert.match(text, /function normalizeControlUrl\(value\)/);
  assert.match(text, /function physicalEvidenceTargetMismatchFields\(result, target\)/);
  assert.match(text, /function physicalEvidenceMatchesTarget\(result, target\)/);
  assert.match(text, /function releaseProofTargetFromResult\(result\)/);
  assert.match(
    text,
    /lastReleaseProofTarget = target \|\| releaseProofTargetFromResult\(result\) \|\| null/
  );
  assert.match(text, /renderReleaseProofEvidence\(null, null, "idle"\)/);
  assert.match(text, /function validatePhysicalPeerEvidenceResultForTarget\(result, target\)/);
  assert.match(text, /function physicalEvidenceHostMismatchMessage\(result\)/);
  assert.match(text, /function physicalEvidencePlatformLabel\(result\)/);
  assert.match(text, /function validatePhysicalPeerEvidenceForTarget\(path, target\)/);
  assert.match(text, /function useLatestPhysicalPeerEvidence\(btn\)/);
  assert.match(text, /function checkPhysicalPeerEvidence\(btn\)/);
  assert.match(text, /invoke\("latest_physical_peer_evidence"\)/);
  assert.match(text, /invoke\("validate_physical_peer_evidence_path", \{ path \}\)/);
  assert.match(text, /validatePhysicalPeerEvidenceResultForTarget\(result, lastReleaseProofTarget\)/);
  assert.match(text, /validatePhysicalPeerEvidenceForTarget\(path, lastReleaseProofTarget\)/);
  assert.match(text, /normalizeNodeName\(result\?\.node_name\) === normalizeNodeName\(target\?\.nodeName\)/);
  assert.match(text, /result\?\.tailnet_ip === target\?\.tailnetIp/);
  assert.match(text, /normalizeControlUrl\(result\?\.control_server_url\) === normalizeControlUrl\(target\?\.controlUrl\)/);
  assert.match(text, /result\.physical_host_distinct !== true/);
  assert.match(text, /same host/);
  assert.match(text, /validatePhysicalPeerEvidenceForTarget\(physicalEvidencePath, target\)/);
  assert.match(text, /invoke\("private_mesh_release_proof_target"/);
  assert.match(text, /const physicalEvidencePath = physicalPeerEvidencePath\(\)/);
  assert.match(text, /physicalPeerEvidencePath: physicalEvidencePath/);
  assert.match(text, /lastReleaseProofResult = result \|\| null/);
  assert.match(text, /const releaseReady = readiness\?\.ready === true/);
  assert.match(text, /renderReleaseProofEvidence\(lastReleaseProofResult, target, releaseReady \? "ready" : "error"\)/);
  assert.doesNotMatch(text, /renderReleaseProofEvidence\(lastReleaseProofResult, target, trusted \? "ready" : "error"\)/);
  assert.match(text, /targetNode: target\.nodeName/);
  assert.match(text, /targetIp: target\.tailnetIp/);
  assert.match(text, /expectedControlServerUrl: target\.controlUrl/);
  assert.match(text, /row\?\.querySelector\("\.node-proof-status"\)/);
  assert.match(text, /row\.dataset\.verifyState = "archive-required"/);
  assert.match(text, /btn\.textContent = "Archive needed"/);
  assert.match(text, /function sendPrivateMeshProofOrder\(btn, nodeName\)/);
  assert.match(text, /MUSU Private Mesh proof: reply with the executing machine name and current time\./);
  assert.match(text, /musu mesh verify --target-ip \$\{tailnetIp\} --json/);
  assert.match(text, /invoke\("private_mesh_verify_target", \{ targetIp \}\)/);
  assert.match(text, /refreshPrivateMeshStatus\(\)/);
  assert.match(text, /submitText\(PRIVATE_MESH_PROOF_ORDER, nodeName\)/);
  assert.match(text, /className = "node-verify node-verify-run"/);
  assert.match(text, /className = "node-verify node-proof-order"/);
  assert.match(text, /className = "node-verify node-release-run"/);
  assert.match(text, /className = "node-verify node-verify-copy"/);
  assert.match(text, /className = "node-verify node-physical-evidence-copy"/);
  assert.match(text, /className = "node-verify node-release-copy"/);
  assert.match(text, /function physicalPeerEvidenceCommandForTarget\(target\)/);
  assert.match(text, /musu mesh physical-peer-evidence --json/);
  assert.match(text, /<copied-target-pc-physical-peer-evidence\.json>/);
  assert.match(text, /id: "add-pc", label: "Show Add PC guide"/);
  assert.match(text, /function copySetupCommand\(btn\)/);
  assert.match(text, /function renderPrivateMeshStatus\(status\)/);
  assert.match(text, /function compactDiagnostic\(value\)/);
  assert.match(text, /lastPrivateMeshStatus = status \|\| null/);
  assert.match(text, /let lastDerpProbe = null/);
  assert.match(text, /lastDerpProbe = \{/);
  assert.match(text, /function copyPrivateMeshProof\(event\)/);
  assert.match(text, /function copyReleaseProofEvidence\(event\)/);
  assert.match(text, /function copyReleaseNextAction\(event\)/);
  assert.match(text, /function physicalPeerEvidenceValidationSnapshotForClipboard\(/);
  assert.match(text, /function releaseEvidenceReadiness\(result\)/);
  assert.match(text, /function releaseReadinessNextAction\(result, failedChecks\)/);
  assert.match(text, /musu\.private_mesh_release_next_action\.v1/);
  assert.match(text, /next_action_detail: nextActionDetail/);
  assert.match(text, /const nextAction = \$\("release-evidence-next"\)/);
  assert.match(text, /next_action: readiness\.next_action_detail/);
  assert.match(text, /musu\.private_mesh_release_next_action_clipboard\.v1/);
  assert.match(text, /release_readiness_missing: readiness\.missing/);
  assert.match(text, /btn\.textContent = "Copied next"/);
  assert.match(text, /function releaseReadinessCheckDetail\(result, key\)/);
  assert.match(text, /function releaseProofRenderStateForResult\(result\)/);
  assert.match(text, /function openReleaseProofEvidence\(event\)/);
  assert.match(text, /function refreshLatestReleaseEvidence\(\)/);
  assert.match(text, /invoke\("latest_release_evidence"\)/);
  assert.match(text, /const evidencePath = releaseProofOpenPath\(lastReleaseProofResult\)/);
  assert.match(text, /invoke\("open_release_evidence_folder", \{ path: evidencePath \}\)/);
  assert.match(text, /releaseProofRenderStateForResult\(lastReleaseProofResult\)/);
  assert.doesNotMatch(text, /releaseProofTrusted\(lastReleaseProofResult\) \? "ready" : "error"/);
  assert.match(text, /musu\.private_mesh_release_evidence_clipboard\.v1/);
  assert.match(text, /musu\.private_mesh_release_readiness\.v1/);
  assert.match(text, /musu\.private_mesh_release_readiness_summary\.v1/);
  assert.match(text, /blocking_details: blockingDetails/);
  assert.match(text, /readiness_summary: readinessSummary/);
  assert.match(text, /const readinessEl = \$\("release-evidence-readiness"\)/);
  assert.match(text, /release_readiness_summary: readiness\.readiness_summary/);
  assert.match(text, /physical_peer_evidence_validation: physicalPeerEvidenceValidationSnapshotForClipboard\(/);
  assert.match(text, /status: "verified_by_release_result"/);
  assert.match(text, /release_target: snapshotReleaseProofTarget\(lastReleaseProofTarget\)/);
  assert.match(text, /hash verified/);
  assert.match(text, /hash not verified/);
  assert.match(text, /identity bound · physical peer missing/);
  assert.match(text, /identity \+ physical peer bound/);
  assert.match(text, /identity not verified/);
  assert.match(text, /route_evidence_integrity_verified/);
  assert.match(text, /route_transport_verified/);
  assert.match(text, /route_transport_error/);
  assert.match(text, /Route transport and identity bound to selected peer/);
  assert.match(text, /software_route_trusted/);
  assert.match(text, /physical_peer_verified/);
  assert.match(text, /physical_peer_error/);
  assert.match(text, /release_evidence_trusted/);
  assert.match(text, /bundle_manifest_ok/);
  assert.match(text, /bundle_manifest_fail_count/);
  assert.match(text, /release_archive_ready/);
  assert.match(text, /archive_verifier_passed/);
  assert.match(text, /releaseArchiveVerifierPassed\(result\)/);
  assert.doesNotMatch(text, /archive_verifier_ok === true\) return true/);
  assert.match(text, /result\.archive_verifier_ok === true &&/);
  assert.match(text, /archive_verifier_schema/);
  assert.match(text, /archive_verifier_fail_count/);
  assert.match(text, /archive_verifier_kind/);
  assert.match(text, /function releaseArchiveVerifierScope\(result\)/);
  assert.match(text, /function releaseDesktopRuntimePackaged\(result\)/);
  assert.match(text, /function releaseDesktopRuntimeLabel\(result\)/);
  assert.match(text, /desktop_runtime_packaged/);
  assert.match(text, /desktop_runtime_kind/);
  assert.match(text, /Packaged desktop runtime/);
  assert.match(text, /dev\/unpackaged desktop runtime/);
  assert.match(text, /external CLI release runner/);
  assert.match(text, /native structural replay/);
  assert.match(text, /standalone current-toolchain replay/);
  assert.match(text, /archive_manifest_path/);
  assert.match(text, /archive_artifact_count/);
  assert.match(text, /const readiness = releaseEvidenceReadiness\(lastReleaseProofResult\)/);
  assert.match(text, /release_readiness: readiness/);
  assert.match(text, /Release evidence archived/);
  assert.match(text, /Release archive required/);
  assert.match(text, /archive verified \(\$\{releaseArchiveVerifierScope\(result\)\}\)/);
  assert.match(text, /Software route proof trusted/);
  assert.match(text, /Release evidence needs review/);
  assert.match(text, /Target physical evidence required/);
  assert.match(text, /state === "input"/);
  assert.match(text, /currentState !== "idle"/);
  assert.match(text, /event\?\.currentTarget \|\| document\.querySelector\("\[data-mesh-copy-proof\]"\)/);
  assert.match(text, /function setAddPcPanelOpen\(open,/);
  assert.match(text, /function openAddPcGuide\(\)/);
  assert.match(text, /setAddPcPanelOpen\(isEmpty\)/);
  assert.match(text, /\$\("add-pc-toggle"\)\?\.addEventListener\("click"/);
  assert.match(text, /\$\("empty-add-pc"\)\?\.addEventListener\("click", openAddPcGuide\)/);
  assert.match(text, /musu\.private_mesh_desktop_proof_clipboard\.v1/);
  assert.match(text, /navigator\.clipboard\.writeText\(JSON\.stringify\(payload, null, 2\)\)/);
  assert.match(text, /document\.querySelectorAll\("\[data-mesh-copy-proof\]"\)/);
  assert.match(text, /document\.querySelectorAll\("\[data-copy-release-evidence\]"\)/);
  assert.match(text, /document\.querySelectorAll\("\[data-copy-release-next-action\]"\)/);
  assert.match(text, /document\.querySelectorAll\("\[data-open-release-evidence\]"\)/);
  assert.match(text, /refreshLatestReleaseEvidence\(\)/);
  assert.match(text, /verified_target_tailnet_ip/);
  assert.match(text, /callback_tailnet_ip/);
  assert.match(text, /target_callback_match/);
  assert.match(text, /derp_policy/);
  assert.match(text, /derp_readiness/);
  assert.match(text, /derp_private_declared/);
  assert.match(text, /derp_probe_ran/);
  assert.match(text, /derp_probe_ok/);
  assert.match(text, /DERP probe ok/);
  assert.match(text, /DERP probe failed/);
  assert.match(text, /DERP detail:/);
  assert.match(text, /DERP private/);
  assert.match(text, /DERP external/);
  assert.match(text, /DERP missing/);
  assert.match(text, /bound proof/);
  assert.match(text, /function runPrivateMeshDoctor\(\)/);
  assert.match(text, /invoke\("private_mesh_status"\)/);
  assert.match(text, /invoke\("private_mesh_doctor"\)/);
  assert.match(text, /Private Mesh proof complete/);
  assert.match(text, /document\.querySelectorAll\("\[data-copy-text\]"\)/);
  assert.match(text, /btn\.addEventListener\("click", copyPrivateMeshProof\)/);
  assert.match(text, /li\.dataset\.meshState = mesh\.state/);
  assert.match(text, /className = `node-network \$\{mesh\.state\}`/);
  assert.match(css, /\.fleet-filters/);
  assert.match(css, /\.section-action/);
  assert.match(css, /\.fleet-filter-empty/);
  assert.match(css, /\.add-pc-panel/);
  assert.match(css, /\.add-pc-panel\[hidden\]/);
  assert.match(css, /\.mesh-status-card/);
  assert.match(css, /\.mesh-status-card\[data-state="ready"\]/);
  assert.match(css, /\.mesh-proof-strip/);
  assert.match(css, /\.release-evidence-strip/);
  assert.match(css, /\.release-evidence-checks/);
  assert.match(css, /\.release-evidence-checks li\[data-state="pass"\]/);
  assert.match(css, /\.release-evidence-checks li\[data-state="fail"\]/);
  assert.match(css, /\.connector-policy/);
  assert.match(css, /\.connector-policy\[data-policy="blocked-warning"\]/);
  assert.match(css, /\.connector-review-row/);
  assert.match(css, /\.connector-registry/);
  assert.match(css, /\.connector-card/);
  assert.match(css, /\.connector-card-trust/);
  assert.match(css, /\.connector-card-disclosure/);
  assert.match(css, /\.connector-card\[data-connector-egress="external"\]/);
  assert.match(css, /\.connector-card\[data-connector-provider="local"\]/);
  assert.match(css, /\.connector-card-proof/);
  assert.match(css, /\.connector-proof-result/);
  assert.match(css, /\.connector-card-actions/);
  assert.match(css, /\.order-target-disclosure/);
  assert.match(css, /\.order-target-disclosure\[data-boundary="private"\]/);
  assert.match(css, /\.order-target-disclosure\[data-boundary="external"\]/);
  assert.match(css, /\[data-connector-plan\]/);
  assert.match(css, /\[data-connector-proof-run\]/);
  assert.match(css, /\.connector-card\[data-connector-proof="proof_captured"\]/);
  assert.match(css, /\.connector-card\[data-connector-proof="source_url_blocked"\]/);
  assert.match(css, /\.release-evidence-strip\[data-state="ready"\]/);
  assert.match(css, /\.release-evidence-strip code/);
  assert.match(css, /\.release-evidence-input/);
  assert.match(css, /\.release-evidence-input-actions/);
  assert.match(css, /\.release-evidence-input-status/);
  assert.match(css, /\.release-evidence-actions/);
  assert.match(css, /\.mesh-status-proof/);
  assert.match(css, /\.mesh-status-diagnostic/);
  assert.match(css, /\.mesh-status-actions/);
  assert.match(css, /\.device-add-pass/);
  assert.match(css, /\.command-row/);
  assert.match(css, /\.node-network\.private/);
  assert.match(css, /\.node-network\.external/);
  assert.match(css, /\.node-network\.mesh-needed/);
  assert.match(css, /\.node-verify-actions/);
  assert.match(css, /\.node-verify/);
  assert.match(css, /\.node-proof-order/);
  assert.match(css, /\.node-release-run/);
  assert.match(css, /\.node-release-copy/);
  assert.match(css, /\.node-proof-status/);
  assert.match(css, /\.fleet-row\[data-verify-state="reachable"\]/);
  assert.match(css, /\.fleet-row\[data-verify-state="callback-proof"\]/);
  assert.match(css, /\.fleet-row\[data-verify-state="archive-required"\]/);
});

test("connector gate blocks risky scraping candidates in the desktop shell", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const input = doc.querySelector("#connector-review-input") as HTMLInputElement;
  const form = doc.querySelector("#connector-review-form") as HTMLFormElement;
  const card = doc.querySelector("#connector-policy") as HTMLElement;
  const result = doc.querySelector("#connector-review-result") as HTMLElement;

  input.value = "LinkedIn email lead scraper with phone extraction and proxy rotation";
  form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

  assert.equal(card.dataset.policy, "blocked-warning");
  assert.equal(result.hidden, false);
  assert.match(result.textContent || "", /Blocked \/ explicit warning/);
  assert.match(result.textContent || "", /privacy/);
  assert.match(result.textContent || "", /lead/);
  await new Promise((resolve) => setTimeout(resolve, 20));
  dom.window.close();
});

test("connector gate treats marketplace actor URLs as discovery-only", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const input = doc.querySelector("#connector-review-input") as HTMLInputElement;
  const form = doc.querySelector("#connector-review-form") as HTMLFormElement;
  const card = doc.querySelector("#connector-policy") as HTMLElement;
  const result = doc.querySelector("#connector-review-result") as HTMLElement;

  input.value = "https://apify.com/example/website-to-markdown?fpr=p2hrc6";
  form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

  assert.equal(card.dataset.policy, "blocked-warning");
  assert.equal(result.hidden, false);
  assert.match(result.textContent || "", /Blocked \/ explicit warning/);
  assert.match(result.textContent || "", /discovery-only/);
  assert.match(result.textContent || "", /marketplace/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("connector gate treats generated API catalog repos as discovery-only", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const input = doc.querySelector("#connector-review-input") as HTMLInputElement;
  const form = doc.querySelector("#connector-review-form") as HTMLFormElement;
  const card = doc.querySelector("#connector-policy") as HTMLElement;
  const result = doc.querySelector("#connector-review-result") as HTMLElement;

  input.value = "https://github.com/cporter202/scraping-apis-for-devs";
  form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

  assert.equal(card.dataset.policy, "blocked-warning");
  assert.equal(result.hidden, false);
  assert.match(result.textContent || "", /Blocked \/ explicit warning/);
  assert.match(result.textContent || "", /discovery-only/);
  assert.match(result.textContent || "", /marketplace_catalog_index/);
  assert.doesNotMatch(result.textContent || "", /Allowed with source proof/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("connector gate treats generic generated API catalog repos as discovery-only", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const input = doc.querySelector("#connector-review-input") as HTMLInputElement;
  const form = doc.querySelector("#connector-review-form") as HTMLFormElement;
  const card = doc.querySelector("#connector-policy") as HTMLElement;
  const result = doc.querySelector("#connector-review-result") as HTMLElement;

  input.value = "https://github.com/example/awesome-scraping-apis";
  form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

  assert.equal(card.dataset.policy, "blocked-warning");
  assert.equal(result.hidden, false);
  assert.match(result.textContent || "", /Blocked \/ explicit warning/);
  assert.match(result.textContent || "", /discovery-only/);
  assert.match(result.textContent || "", /marketplace_catalog_index/);
  assert.doesNotMatch(result.textContent || "", /Allowed with source proof/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("connector gate treats raw generated API catalog READMEs as discovery-only", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const input = doc.querySelector("#connector-review-input") as HTMLInputElement;
  const form = doc.querySelector("#connector-review-form") as HTMLFormElement;
  const card = doc.querySelector("#connector-policy") as HTMLElement;
  const result = doc.querySelector("#connector-review-result") as HTMLElement;

  input.value =
    "https://raw.githubusercontent.com/cporter202/scraping-apis-for-devs/main/README.md";
  form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

  assert.equal(card.dataset.policy, "blocked-warning");
  assert.equal(result.hidden, false);
  assert.match(result.textContent || "", /Blocked \/ explicit warning/);
  assert.match(result.textContent || "", /discovery-only/);
  assert.match(result.textContent || "", /marketplace_catalog_index/);
  assert.doesNotMatch(result.textContent || "", /Allowed with source proof/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("connector gate blocks private network source URLs before proof", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const input = doc.querySelector("#connector-review-input") as HTMLInputElement;
  const form = doc.querySelector("#connector-review-form") as HTMLFormElement;
  const card = doc.querySelector("#connector-policy") as HTMLElement;
  const result = doc.querySelector("#connector-review-result") as HTMLElement;

  input.value = "http://127.0.0.1:8070/private";
  form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

  assert.equal(card.dataset.policy, "blocked");
  assert.equal(result.hidden, false);
  assert.match(result.textContent || "", /Blocked/);
  assert.match(result.textContent || "", /private-network URLs/);
  assert.match(result.textContent || "", /127\.0\.0\.1/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("connector gate does not treat public hostnames with private-like prefixes as local", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const input = doc.querySelector("#connector-review-input") as HTMLInputElement;
  const form = doc.querySelector("#connector-review-form") as HTMLFormElement;
  const card = doc.querySelector("#connector-policy") as HTMLElement;
  const result = doc.querySelector("#connector-review-result") as HTMLElement;

  input.value = "https://fca.example/docs";
  form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

  assert.equal(card.dataset.policy, "allow-source");
  assert.equal(result.hidden, false);
  assert.match(result.textContent || "", /Allowed with source proof/);
  assert.doesNotMatch(result.textContent || "", /private-network URLs/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("connector gate blocks source URLs with embedded secrets", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const input = doc.querySelector("#connector-review-input") as HTMLInputElement;
  const form = doc.querySelector("#connector-review-form") as HTMLFormElement;
  const card = doc.querySelector("#connector-policy") as HTMLElement;
  const result = doc.querySelector("#connector-review-result") as HTMLElement;

  input.value =
    "https://user:pass@docs.example.test/page?api_key=sk_live_123&x-api-key=sk_live_456&refresh_token=rt_789&topic=ok";
  form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

  assert.equal(card.dataset.policy, "blocked");
  assert.equal(result.hidden, false);
  assert.match(result.textContent || "", /Blocked/);
  assert.match(result.textContent || "", /embedded credentials/);
  assert.match(result.textContent || "", /query:api_key/);
  assert.match(result.textContent || "", /query:x-api-key/);
  assert.match(result.textContent || "", /query:refresh_token/);
  assert.doesNotMatch(result.textContent || "", /sk_live_123|sk_live_456|rt_789/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("connector gate allows ordinary public source URL query parameters", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const input = doc.querySelector("#connector-review-input") as HTMLInputElement;
  const form = doc.querySelector("#connector-review-form") as HTMLFormElement;
  const card = doc.querySelector("#connector-policy") as HTMLElement;
  const result = doc.querySelector("#connector-review-result") as HTMLElement;

  input.value = "https://docs.example.test/page?topic=mesh&version=1";
  form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

  assert.equal(card.dataset.policy, "allow-source");
  assert.equal(result.hidden, false);
  assert.match(result.textContent || "", /Allowed with source proof/);
  assert.doesNotMatch(result.textContent || "", /embedded credentials/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("connector registry renders curated cards and feeds the gate", async () => {
  const dom = loadShellDom();
  const doc = dom.window.document;
  const github = doc.querySelector('[data-connector="github"]') as HTMLElement;
  const localBrowser = doc.querySelector('[data-connector="local-browser"]') as HTMLElement;
  const review = github?.querySelector("[data-connector-review]") as HTMLButtonElement;
  const card = doc.querySelector("#connector-policy") as HTMLElement;
  const result = doc.querySelector("#connector-review-result") as HTMLElement;
  const input = doc.querySelector("#connector-review-input") as HTMLInputElement;

  assert.ok(github);
  assert.match(github.textContent || "", /GitHub/);
  assert.match(github.textContent || "", /scoped key/);
  assert.match(github.textContent || "", /authenticated user/);
  assert.equal(github.dataset.connectorProvider, "external_api");
  assert.equal(github.dataset.connectorAccount, "required");
  assert.equal(github.dataset.connectorEgress, "external");
  assert.equal(github.dataset.connectorRisk, "high");
  assert.match(github.textContent || "", /provider: external_api/);
  assert.match(github.textContent || "", /account required/);
  assert.match(github.textContent || "", /data leaves device/);
  assert.match(github.textContent || "", /explicit enable/);
  assert.match(github.textContent || "", /show account, scope, egress, cost, and proof/);

  assert.ok(localBrowser);
  assert.equal(localBrowser.dataset.connectorProvider, "local");
  assert.equal(localBrowser.dataset.connectorAccount, "none");
  assert.equal(localBrowser.dataset.connectorEgress, "local");
  assert.match(localBrowser.textContent || "", /no account/);
  assert.match(localBrowser.textContent || "", /local data/);
  assert.match(localBrowser.textContent || "", /default on/);

  review.click();
  assert.equal(card.dataset.policy, "allow-source");
  assert.equal(result.hidden, false);
  assert.match(result.textContent || "", /Allowed with source proof/);
  assert.match(input.value, /GitHub official API/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("connector registry copies deterministic proof plan", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  Object.defineProperty(dom.window.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (value: string) => {
        win.__copiedText = value;
      },
    },
  });
  const copyPlan = doc.querySelector(
    '[data-connector="github"] [data-connector-plan]'
  ) as HTMLButtonElement;

  copyPlan.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const copied = JSON.parse(win.__copiedText || "{}");
  assert.equal(copied.schema, "musu.connector_proof_plan.v1");
  assert.equal(copied.connector_id, "github");
  assert.equal(copied.tool_contract.schema, "musu.tool_contract.v1");
  assert.equal(copied.tool_contract.provider, "external_api");
  assert.equal(copied.tool_contract.requires_account, true);
  assert.equal(copied.tool_contract.data_leaves_device, true);
  assert.equal(copied.tool_contract.default_enabled, false);
  assert.equal(copied.tool_contract.run_policy, "explicit_user_enablement_required");
  assert.match(copied.tool_contract.disclosure, /show account, scope, egress, cost, and proof/);
  assert.ok(copied.risk_ledger.some((item: any) => item.dimension === "license"));
  assert.ok(copied.risk_ledger.some((item: any) => item.dimension === "egress"));
  assert.equal(copied.approval_gate.allowed_to_recommend_or_run, false);
  assert.equal(copied.approval_gate.state, "blocked_until_proven");
  assert.ok(copied.approval_gate.required_before_use.includes("configure scoped user-owned credential"));
  assert.ok(copied.approval_gate.required_before_use.includes("confirm data egress boundary and provider terms"));
  assert.equal(copied.retry_contract.deterministic, true);
  assert.deepEqual(copied.retry_contract.preserve, [
    "order",
    "target",
    "connector_id",
    "input_payload",
  ]);
  assert.ok(copied.retry_contract.forbidden.includes("silently switch machine"));
  dom.window.close();
});

test("connector registry runs MCP health check and records proof state", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  win.fetch = async (url: string, init: RequestInit) => {
    win.__connectorProofRequest = { url, init };
    return {
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: "connector-proof-test",
        result: {
          ok: true,
          readiness: "proof_captured",
          proof: {
            result: "success",
            proof_recorded_at: "2026-06-13T00:00:00.000Z",
            approval_gate: {
              allowed_to_recommend_or_run: true,
              state: "approved",
            },
          },
        },
      }),
    } as Response;
  };

  const card = doc.querySelector('[data-connector="mcp-validator"]') as HTMLElement;
  const runProof = card?.querySelector("[data-connector-proof-run]") as HTMLButtonElement;
  runProof.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = JSON.parse(win.__connectorProofRequest.init.body);
  assert.equal(win.__connectorProofRequest.url, "/api/mcp");
  assert.equal(body.method, "musu_run_connector_health_check");
  assert.equal(body.params.id, "mcp-validator");
  assert.equal(card.dataset.connectorProof, "proof_captured");
  assert.match(card.textContent || "", /Proof captured/);
  assert.match(card.textContent || "", /Approval gate: approved/);
  dom.window.close();
});

test("source-url connectors fail closed before health check when URL is missing", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  win.fetch = async () => {
    throw new Error("fetch should not run without source_url");
  };

  const card = doc.querySelector('[data-connector="website-to-markdown"]') as HTMLElement;
  const runProof = card?.querySelector("[data-connector-proof-run]") as HTMLButtonElement;
  runProof.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(card.dataset.connectorProof, "input_required");
  assert.match(card.textContent || "", /paste an http\(s\) source URL/);
  dom.window.close();
});

test("source-url connector proof surfaces blocked source-gate reasons", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const input = doc.querySelector("#connector-review-input") as HTMLInputElement;
  const policyCard = doc.querySelector("#connector-policy") as HTMLElement;
  const reviewResult = doc.querySelector("#connector-review-result") as HTMLElement;
  input.value = "https://apify.com/example/linkedin-lead-scraper?fpr=p2hrc6";
  win.fetch = async (url: string, init: RequestInit) => {
    win.__connectorProofRequest = { url, init };
    return {
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: "connector-source-gate-test",
        result: {
          ok: false,
          readiness: "source_url_blocked",
          proof: {
            result: "not_run",
            error:
              "Personal-data or social-profile scraping has high privacy and platform ToS risk.",
            source_gate: {
              policy: "blocked_or_explicit_warning",
              risk_profile: "personal_data_scraping",
              reason:
                "Personal-data or social-profile scraping has high privacy and platform ToS risk.",
              matched_terms: ["lead", "linkedin"],
            },
            approval_gate: {
              allowed_to_recommend_or_run: false,
              state: "blocked_until_proven",
            },
          },
        },
      }),
    } as Response;
  };

  const card = doc.querySelector('[data-connector="website-to-markdown"]') as HTMLElement;
  const runProof = card?.querySelector("[data-connector-proof-run]") as HTMLButtonElement;
  runProof.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = JSON.parse(win.__connectorProofRequest.init.body);
  assert.equal(body.method, "musu_run_connector_health_check");
  assert.equal(body.params.id, "website-to-markdown");
  assert.equal(
    body.params.source_url,
    "https://apify.com/example/linkedin-lead-scraper?fpr=p2hrc6"
  );
  assert.equal(policyCard.dataset.policy, "blocked-warning");
  assert.match(reviewResult.textContent || "", /privacy/);
  assert.equal(card.dataset.connectorProof, "source_url_blocked");
  assert.match(card.textContent || "", /source blocked before fetch/);
  assert.match(card.textContent || "", /personal_data_scraping/);
  assert.match(card.textContent || "", /Approval gate: blocked_until_proven/);
  dom.window.close();
});

test("release proof accepts normalized physical peer evidence binding before native IPC", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  Object.defineProperty(dom.window.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (value: string) => {
        win.__copiedReleaseEvidence = value;
      },
    },
  });
  const input = doc.querySelector("#physical-peer-evidence-path") as HTMLInputElement;
  input.value = "C:\\proofs\\studio-pc.physical-peer-evidence.json";
  win.__TAURI__.core.invoke = async (command: string, args: Record<string, unknown>) => {
    if (command === "validate_physical_peer_evidence_path") {
      win.__physicalEvidencePreflight = { command, args };
      return {
        ok: true,
        path: args.path,
        node_name: "STUDIO-PC",
        tailnet_ip: "100.64.0.11",
        control_server_url: "https://mesh.example/",
        hostname: "studio-pc",
        os: "windows",
        arch: "x86_64",
        source_hostname: "this-laptop",
        physical_host_distinct: true,
        integrity_verified: true,
      };
    }
    if (command === "private_mesh_release_proof_target") {
      win.__releaseProofInvoke = { command, args };
      return {
        ok: true,
        target_node: "studio-pc",
        target_ip: "100.64.0.11",
        release_evidence_trusted: true,
        software_route_trusted: true,
        physical_peer_verified: true,
        integrity_verified: true,
        route_evidence_integrity_verified: true,
        route_transport_verified: true,
        release_identity_bound: true,
        bundle_manifest_ok: true,
        bundle_manifest_fail_count: 0,
        archive_dir: "C:\\proofs\\archive\\private-mesh-release-proof-studio-pc",
        archive_manifest_path:
          "C:\\proofs\\archive\\private-mesh-release-proof-studio-pc\\private-mesh-release-proof.archive.json",
        archive_manifest_sha256_path:
          "C:\\proofs\\archive\\private-mesh-release-proof-studio-pc\\private-mesh-release-proof.archive.json.sha256",
        archive_artifact_count: 4,
        archive_verifier_ok: true,
        archive_verifier_schema: "musu.private_mesh_release_proof_archive_verification.v1",
        archive_verifier_fail_count: 0,
        archive_verifier_kind: "native_desktop_internal",
        desktop_runtime_kind: "packaged_desktop",
        desktop_runtime_packaged: true,
        desktop_runtime_exe_path: "C:\\Program Files\\MUSU\\musu-desktop.exe",
        desktop_runtime_exe_sha256: "a".repeat(64),
      };
    }
    if (command === "open_release_evidence_folder") {
      win.__openedReleaseEvidence = { command, args };
      return { ok: true, output: args.path };
    }
    return {};
  };

  await win.runPeerReleaseProof(
    doc.createElement("button"),
    {
      nodeName: "studio-pc",
      tailnetIp: "100.64.0.11",
      controlUrl: "https://mesh.example",
    }
  );

  assert.equal(win.__physicalEvidencePreflight.command, "validate_physical_peer_evidence_path");
  assert.equal(
    win.__physicalEvidencePreflight.args.path,
    "C:\\proofs\\studio-pc.physical-peer-evidence.json"
  );
  assert.equal(win.__releaseProofInvoke.command, "private_mesh_release_proof_target");
  assert.equal(
    win.__releaseProofInvoke.args.physicalPeerEvidencePath,
    "C:\\proofs\\studio-pc.physical-peer-evidence.json"
  );
  const strip = doc.querySelector("#release-evidence-strip") as HTMLElement;
  assert.equal(strip.dataset.state, "ready");
  assert.match(doc.querySelector("#release-evidence-title")?.textContent || "", /Release evidence archived/);
  assert.match(doc.querySelector("#release-evidence-detail")?.textContent || "", /archive verified/);
  assert.match(doc.querySelector("#release-evidence-detail")?.textContent || "", /packaged desktop runtime/);
  assert.match(doc.querySelector("#release-evidence-detail")?.textContent || "", /native structural replay/);
  assert.doesNotMatch(doc.querySelector("#release-evidence-detail")?.textContent || "", /native_desktop_internal/);
  assert.match(doc.querySelector("#release-evidence-checks")?.textContent || "", /OK Packaged desktop runtime \(packaged desktop runtime\)/);
  assert.match(doc.querySelector("#release-evidence-checks")?.textContent || "", /OK Archive verifier passed \(native structural replay\)/);
  assert.match(doc.querySelector("#release-evidence-path")?.textContent || "", /private-mesh-release-proof\.archive\.json/);
  (doc.querySelector("[data-open-release-evidence]") as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(win.__openedReleaseEvidence.command, "open_release_evidence_folder");
  assert.equal(
    win.__openedReleaseEvidence.args.path,
    "C:\\proofs\\archive\\private-mesh-release-proof-studio-pc\\private-mesh-release-proof.archive.json"
  );
  (doc.querySelector("[data-copy-release-evidence]") as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const copied = JSON.parse(win.__copiedReleaseEvidence || "{}");
  assert.equal(copied.schema, "musu.private_mesh_release_evidence_clipboard.v1");
  assert.equal(copied.release_target.nodeName, "studio-pc");
  assert.equal(copied.release_target.tailnetIp, "100.64.0.11");
  assert.equal(copied.physical_peer_evidence_validation.path, "C:\\proofs\\studio-pc.physical-peer-evidence.json");
  assert.equal(copied.physical_peer_evidence_validation.validated_for_target, true);
  assert.equal(copied.physical_peer_evidence_validation.status, "validated_for_target");
  assert.equal(copied.physical_peer_evidence_validation.result.node_name, "STUDIO-PC");
  assert.equal(copied.physical_peer_evidence_validation.result.os, "windows");
  assert.equal(copied.physical_peer_evidence_validation.result.arch, "x86_64");
  assert.match(doc.querySelector("#physical-peer-evidence-status")?.textContent || "", /platform windows\/x86_64/);
  assert.equal(
    copied.release_readiness.checks.some(
      (check: any) => check.key === "archive_verifier_passed" && check.ok === true
    ),
    true
  );
  assert.equal(copied.release_readiness.next_action_detail.area, "release-notes");
  assert.equal(copied.next_action.area, "release-notes");
  assert.match(copied.next_action.summary, /Attach the verified release archive/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("release proof holds trusted evidence for review when archive is missing", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const input = doc.querySelector("#physical-peer-evidence-path") as HTMLInputElement;
  input.value = "C:\\proofs\\studio-pc.physical-peer-evidence.json";
  win.__TAURI__.core.invoke = async (command: string, args: Record<string, unknown>) => {
    if (command === "validate_physical_peer_evidence_path") {
      return {
        ok: true,
        path: args.path,
        node_name: "studio-pc",
        tailnet_ip: "100.64.0.11",
        control_server_url: "https://mesh.example",
        hostname: "studio-pc",
        source_hostname: "this-laptop",
        physical_host_distinct: true,
        integrity_verified: true,
      };
    }
    if (command === "private_mesh_release_proof_target") {
      return {
        ok: true,
        target_node: "studio-pc",
        target_ip: "100.64.0.11",
        release_evidence_trusted: true,
        software_route_trusted: true,
        physical_peer_verified: true,
        integrity_verified: true,
        route_evidence_integrity_verified: true,
        route_transport_verified: true,
        release_identity_bound: true,
        bundle_manifest_ok: true,
        bundle_manifest_fail_count: 0,
        desktop_runtime_kind: "packaged_desktop",
        desktop_runtime_packaged: true,
        desktop_runtime_exe_path: "C:\\Program Files\\MUSU\\musu-desktop.exe",
        desktop_runtime_exe_sha256: "a".repeat(64),
        archive_error: "archive verifier failed before zip creation",
      };
    }
    return {};
  };

  const button = doc.createElement("button");
  button.textContent = "Run proof";
  await win.runPeerReleaseProof(
    button,
    {
      nodeName: "studio-pc",
      tailnetIp: "100.64.0.11",
      controlUrl: "https://mesh.example",
    }
  );

  const strip = doc.querySelector("#release-evidence-strip") as HTMLElement;
  assert.equal(strip.dataset.state, "error");
  assert.match(doc.querySelector("#release-evidence-title")?.textContent || "", /Release archive required/);
  assert.match(doc.querySelector("#release-evidence-detail")?.textContent || "", /release archive is not complete/);
  assert.match(doc.querySelector("#release-evidence-detail")?.textContent || "", /Release evidence archive present/);
  assert.match(doc.querySelector("#release-evidence-detail")?.textContent || "", /Archive verifier passed/);
  assert.match(doc.querySelector("#release-evidence-detail")?.textContent || "", /archive verifier failed before zip creation/);
  assert.match(doc.querySelector("#release-evidence-next")?.textContent || "", /Next: Create or verify the release archive/);
  assert.match(doc.querySelector("#release-evidence-next")?.textContent || "", /archive-private-mesh-release-proof-bundle\.ps1/);
  assert.match(doc.querySelector("#release-evidence-checks")?.textContent || "", /archive verifier failed before zip creation/);
  assert.equal(button.textContent, "Archive needed");
  assert.match(button.title, /Release evidence archive present/);
  assert.match(button.title, /Archive verifier passed/);
  await new Promise((resolve) => setTimeout(resolve, 20));
  dom.window.close();
});

test("latest release evidence reload does not mark trusted unarchived proof as ready", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  Object.defineProperty(dom.window.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (value: string) => {
        win.__copiedReleaseEvidence = value;
      },
    },
  });
  win.__TAURI__.core.invoke = async (command: string) => {
    if (command === "latest_release_evidence") {
      return {
        ok: true,
        target_node: "studio-pc",
        target_ip: "100.64.0.11",
        release_evidence_trusted: true,
        software_route_trusted: true,
        physical_peer_verified: true,
        integrity_verified: true,
        route_evidence_integrity_verified: true,
        route_transport_verified: true,
        release_identity_bound: true,
        bundle_manifest_ok: true,
        bundle_manifest_fail_count: 0,
        desktop_runtime_kind: "packaged_desktop",
        desktop_runtime_packaged: true,
        desktop_runtime_exe_path: "C:\\Program Files\\MUSU\\musu-desktop.exe",
        desktop_runtime_exe_sha256: "a".repeat(64),
        expected_control_server_url: "https://mesh.example",
        physical_peer_evidence_path: "C:\\proofs\\studio-pc.physical-peer-evidence.json",
        physical_peer_evidence_sha256_path: "C:\\proofs\\studio-pc.physical-peer-evidence.json.sha256",
        physical_peer_evidence_sha256: "abc123",
        archive_error: "release proof archive is missing after restart",
        verification_path: "C:\\proofs\\studio-pc\\private-mesh-release-proof.verification.json",
      };
    }
    return {};
  };

  await win.refreshLatestReleaseEvidence();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const strip = doc.querySelector("#release-evidence-strip") as HTMLElement;
  assert.equal(strip.dataset.state, "error");
  assert.match(doc.querySelector("#release-evidence-title")?.textContent || "", /Release archive required/);
  assert.match(doc.querySelector("#release-evidence-detail")?.textContent || "", /Release evidence archive present/);
  assert.match(doc.querySelector("#release-evidence-detail")?.textContent || "", /Archive verifier passed/);
  (doc.querySelector("[data-copy-release-evidence]") as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const copied = JSON.parse(win.__copiedReleaseEvidence || "{}");
  assert.equal(copied.physical_peer_evidence_validation.status, "verified_by_release_result");
  assert.equal(copied.physical_peer_evidence_validation.validated_for_target, true);
  assert.equal(
    copied.physical_peer_evidence_validation.validated_path,
    "C:\\proofs\\studio-pc.physical-peer-evidence.json"
  );
  assert.equal(
    copied.physical_peer_evidence_validation.result.physical_peer_evidence_sha256_path,
    "C:\\proofs\\studio-pc.physical-peer-evidence.json.sha256"
  );
  assert.equal(
    copied.release_readiness.blocking_details.some(
      (detail: any) =>
        detail.key === "release_archive_ready" &&
        /archive is missing/.test(detail.detail)
    ),
    true
  );
  assert.equal(copied.release_readiness.next_action_detail.area, "release-archive");
  assert.equal(copied.next_action.area, "release-archive");
  assert.match(copied.next_action.command, /archive-private-mesh-release-proof-bundle\.ps1/);
  dom.window.close();
});

test("archive verifier ok flag alone does not mark release evidence ready", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  win.__TAURI__.core.invoke = async (command: string) => {
    if (command === "latest_release_evidence") {
      return {
        ok: true,
        target_node: "studio-pc",
        target_ip: "100.64.0.11",
        release_evidence_trusted: true,
        software_route_trusted: true,
        physical_peer_verified: true,
        integrity_verified: true,
        route_evidence_integrity_verified: true,
        route_transport_verified: true,
        release_identity_bound: true,
        bundle_manifest_ok: true,
        bundle_manifest_fail_count: 0,
        desktop_runtime_kind: "packaged_desktop",
        desktop_runtime_packaged: true,
        desktop_runtime_exe_path: "C:\\Program Files\\MUSU\\musu-desktop.exe",
        desktop_runtime_exe_sha256: "a".repeat(64),
        archive_manifest_path: "C:\\proofs\\studio-pc\\archive\\private-mesh-release-proof.archive.json",
        archive_manifest_sha256_path: "C:\\proofs\\studio-pc\\archive\\private-mesh-release-proof.archive.json.sha256",
        archive_artifact_count: 4,
        archive_verifier_ok: true,
        verification_path: "C:\\proofs\\studio-pc\\private-mesh-release-proof.verification.json",
      };
    }
    return {};
  };

  await win.refreshLatestReleaseEvidence();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const strip = doc.querySelector("#release-evidence-strip") as HTMLElement;
  assert.equal(strip.dataset.state, "error");
  assert.match(doc.querySelector("#release-evidence-title")?.textContent || "", /Release archive required/);
  assert.match(doc.querySelector("#release-evidence-detail")?.textContent || "", /Archive verifier passed/);
  assert.doesNotMatch(doc.querySelector("#release-evidence-title")?.textContent || "", /archived/i);
  dom.window.close();
});

test("release readiness requires packaged desktop runtime", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  win.__TAURI__.core.invoke = async (command: string) => {
    if (command === "latest_release_evidence") {
      return {
        ok: true,
        target_node: "studio-pc",
        target_ip: "100.64.0.11",
        release_evidence_trusted: true,
        software_route_trusted: true,
        physical_peer_verified: true,
        integrity_verified: true,
        route_evidence_integrity_verified: true,
        route_transport_verified: true,
        release_identity_bound: true,
        bundle_manifest_ok: true,
        bundle_manifest_fail_count: 0,
        desktop_runtime_kind: "dev_or_unpackaged_desktop",
        desktop_runtime_packaged: false,
        desktop_runtime_exe_path: "F:\\workspace\\musu-bee\\musu-bee\\src-tauri\\target\\release\\musu-bee.exe",
        desktop_runtime_exe_sha256: "b".repeat(64),
        archive_manifest_path: "C:\\proofs\\studio-pc\\archive\\private-mesh-release-proof.archive.json",
        archive_manifest_sha256_path: "C:\\proofs\\studio-pc\\archive\\private-mesh-release-proof.archive.json.sha256",
        archive_artifact_count: 4,
        archive_verifier_ok: true,
        archive_verifier_schema: "musu.private_mesh_release_proof_archive_verification.v1",
        archive_verifier_fail_count: 0,
        archive_verifier_kind: "native_desktop_internal",
        verification_path: "C:\\proofs\\studio-pc\\private-mesh-release-proof.verification.json",
      };
    }
    return {};
  };

  await win.refreshLatestReleaseEvidence();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const strip = doc.querySelector("#release-evidence-strip") as HTMLElement;
  assert.equal(strip.dataset.state, "error");
  assert.match(doc.querySelector("#release-evidence-title")?.textContent || "", /Release archive required/);
  assert.match(doc.querySelector("#release-evidence-detail")?.textContent || "", /Packaged desktop runtime/);
  assert.match(doc.querySelector("#release-evidence-checks")?.textContent || "", /Needs Packaged desktop runtime \(dev\/unpackaged desktop runtime\)/);
  assert.doesNotMatch(doc.querySelector("#release-evidence-title")?.textContent || "", /archived/i);
  dom.window.close();
});

test("release proof fails closed before native IPC when physical evidence is from same host", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const input = doc.querySelector("#physical-peer-evidence-path") as HTMLInputElement;
  input.value = "C:\\proofs\\same-host.physical-peer-evidence.json";
  win.__TAURI__.core.invoke = async (command: string, args: Record<string, unknown>) => {
    if (command === "validate_physical_peer_evidence_path") {
      win.__physicalEvidencePreflight = { command, args };
      return {
        ok: true,
        path: args.path,
        node_name: "studio-pc",
        tailnet_ip: "100.64.0.11",
        control_server_url: "https://mesh.example",
        hostname: "this-laptop",
        source_hostname: "this-laptop",
        physical_host_distinct: false,
        integrity_verified: true,
      };
    }
    if (command === "private_mesh_release_proof_target") {
      throw new Error("private_mesh_release_proof_target should not run for same-host evidence");
    }
    return {};
  };

  const button = doc.createElement("button");
  await win.runPeerReleaseProof(
    button,
    {
      nodeName: "studio-pc",
      tailnetIp: "100.64.0.11",
      controlUrl: "https://mesh.example",
    }
  );

  const status = doc.querySelector("#physical-peer-evidence-status") as HTMLElement;
  const strip = doc.querySelector("#release-evidence-strip") as HTMLElement;
  assert.equal(win.__physicalEvidencePreflight.command, "validate_physical_peer_evidence_path");
  assert.equal(win.__releaseProofInvoke, undefined);
  assert.equal(status.dataset.state, "error");
  assert.match(status.textContent || "", /same host/);
  assert.match(status.textContent || "", /separate target physical PC/);
  assert.equal(strip.dataset.state, "error");
  assert.match(doc.querySelector("#release-evidence-detail")?.textContent || "", /same host/);
  assert.equal(button.textContent, "Evidence invalid");
  await new Promise((resolve) => setTimeout(resolve, 20));
  dom.window.close();
});

test("release proof fails closed before native IPC when physical evidence targets another peer", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const input = doc.querySelector("#physical-peer-evidence-path") as HTMLInputElement;
  input.value = "C:\\proofs\\wrong-pc.physical-peer-evidence.json";
  win.__TAURI__.core.invoke = async (command: string, args: Record<string, unknown>) => {
    if (command === "validate_physical_peer_evidence_path") {
      win.__physicalEvidencePreflight = { command, args };
      return {
        ok: true,
        path: args.path,
        node_name: "garage-pc",
        tailnet_ip: "100.64.0.22",
        control_server_url: "https://mesh.example",
        hostname: "garage-pc",
        source_hostname: "this-laptop",
        physical_host_distinct: true,
        integrity_verified: true,
      };
    }
    if (command === "private_mesh_release_proof_target") {
      throw new Error("private_mesh_release_proof_target should not run for mismatched evidence");
    }
    return {};
  };

  const button = doc.createElement("button");
  await win.runPeerReleaseProof(
    button,
    {
      nodeName: "studio-pc",
      tailnetIp: "100.64.0.11",
      controlUrl: "https://mesh.example",
    }
  );

  const status = doc.querySelector("#physical-peer-evidence-status") as HTMLElement;
  const strip = doc.querySelector("#release-evidence-strip") as HTMLElement;
  assert.equal(win.__physicalEvidencePreflight.command, "validate_physical_peer_evidence_path");
  assert.equal(win.__releaseProofInvoke, undefined);
  assert.equal(status.dataset.state, "error");
  assert.match(status.textContent || "", /does not match target studio-pc/);
  assert.match(status.textContent || "", /garage-pc/);
  assert.match(status.textContent || "", /Fields: node_name, tailnet_ip/);
  assert.equal(strip.dataset.state, "error");
  assert.match(doc.querySelector("#release-evidence-detail")?.textContent || "", /does not match target/);
  assert.equal(button.textContent, "Evidence invalid");
  await new Promise((resolve) => setTimeout(resolve, 20));
  dom.window.close();
});

test("release proof fails closed before native IPC when physical peer evidence is missing", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  win.__TAURI__.core.invoke = async (command: string) => {
    if (command === "private_mesh_release_proof_target") {
      throw new Error("private_mesh_release_proof_target should not run without physical evidence");
    }
    return {};
  };

  await win.runPeerReleaseProof(
    doc.createElement("button"),
    {
      nodeName: "studio-pc",
      tailnetIp: "100.64.0.11",
      controlUrl: "https://mesh.example",
    }
  );

  const status = doc.querySelector("#physical-peer-evidence-status") as HTMLElement;
  const strip = doc.querySelector("#release-evidence-strip") as HTMLElement;
  assert.equal(status.dataset.state, "error");
  assert.match(status.textContent || "", /Final release trust needs target-generated evidence/);
  assert.match(status.textContent || "", /Run Evidence cmd on studio-pc/);
  assert.match(status.textContent || "", /\.sha256 sidecar/);
  assert.equal(win.__releaseProofInvoke, undefined);
  assert.equal(strip.dataset.state, "error");
  assert.match(doc.querySelector("#release-evidence-detail")?.textContent || "", /Physical peer evidence is required/);
  assert.match(doc.querySelector("#release-evidence-next")?.textContent || "", /Generate target physical evidence on studio-pc/);
  assert.match(doc.querySelector("#release-evidence-next")?.textContent || "", /musu mesh physical-peer-evidence --json/);
  await new Promise((resolve) => setTimeout(resolve, 20));
  dom.window.close();
});

test("physical peer evidence controls load latest and validate before release proof", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  win.__TAURI__.core.invoke = async (command: string, args: Record<string, unknown>) => {
    if (command === "latest_physical_peer_evidence") {
      return {
        ok: true,
        path: "C:\\proofs\\latest.physical-peer-evidence.json",
        node_name: "studio-pc",
        tailnet_ip: "100.64.0.11",
        control_server_url: "https://mesh.example",
        hostname: "studio-pc",
        source_hostname: "this-laptop",
        physical_host_distinct: true,
        integrity_verified: true,
      };
    }
    if (command === "validate_physical_peer_evidence_path") {
      win.__validatedPhysicalEvidence = args;
      return {
        ok: true,
        path: args.path,
        node_name: "studio-pc",
        tailnet_ip: "100.64.0.11",
        control_server_url: "https://mesh.example",
        hostname: "studio-pc",
        source_hostname: "this-laptop",
        physical_host_distinct: true,
        integrity_verified: true,
      };
    }
    return {};
  };

  (doc.querySelector("#physical-peer-evidence-latest") as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const input = doc.querySelector("#physical-peer-evidence-path") as HTMLInputElement;
  const status = doc.querySelector("#physical-peer-evidence-status") as HTMLElement;
  assert.equal(input.value, "C:\\proofs\\latest.physical-peer-evidence.json");
  assert.equal(status.dataset.state, "ready");
  assert.match(status.textContent || "", /studio-pc/);

  (doc.querySelector("#physical-peer-evidence-check") as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    win.__validatedPhysicalEvidence.path,
    "C:\\proofs\\latest.physical-peer-evidence.json"
  );
  dom.window.close();
});

test("latest physical peer evidence is validated against the current release target", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const now = new Date().toISOString();

  win.__TAURI__.core.invoke = async (command: string) => {
    if (command === "latest_physical_peer_evidence") {
      return {
        ok: true,
        path: "C:\\proofs\\garage-pc.physical-peer-evidence.json",
        node_name: "garage-pc",
        tailnet_ip: "100.64.0.22",
        control_server_url: "https://mesh.example",
        hostname: "garage-pc",
        source_hostname: "this-laptop",
        physical_host_distinct: true,
        integrity_verified: true,
      };
    }
    return {};
  };

  win.renderFleet(
    [
      {
        node_name: "this machine",
        last_seen: now,
        public_url: "http://127.0.0.1:8070",
        is_this_pc: true,
        mesh_mode: "musu_headscale",
        route_label: "Private Mesh",
        control_server_url: "https://mesh.example",
        control_server_verified: true,
        tailscale_ip: "100.64.0.10",
      },
      {
        node_name: "studio-pc",
        last_seen: now,
        public_url: "http://100.64.0.11:8070",
        is_this_pc: false,
        mesh_mode: "musu_headscale",
        route_label: "Private Mesh",
        control_server_url: "https://mesh.example",
        control_server_verified: true,
        tailscale_ip: "100.64.0.11",
      },
    ],
    "idle",
    true
  );

  (doc.querySelector("#physical-peer-evidence-latest") as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const input = doc.querySelector("#physical-peer-evidence-path") as HTMLInputElement;
  const status = doc.querySelector("#physical-peer-evidence-status") as HTMLElement;
  assert.equal(input.value, "C:\\proofs\\garage-pc.physical-peer-evidence.json");
  assert.equal(status.dataset.state, "error");
  assert.match(status.textContent || "", /does not match target studio-pc/);
  assert.match(status.textContent || "", /Fields: node_name, tailnet_ip/);

  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("latest physical peer evidence is not checked against a stale release target", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const now = new Date().toISOString();

  win.__TAURI__.core.invoke = async (command: string) => {
    if (command === "latest_physical_peer_evidence") {
      return {
        ok: true,
        path: "C:\\proofs\\garage-pc.physical-peer-evidence.json",
        node_name: "garage-pc",
        tailnet_ip: "100.64.0.22",
        control_server_url: "https://mesh.example",
        hostname: "garage-pc",
        source_hostname: "this-laptop",
        physical_host_distinct: true,
        integrity_verified: true,
      };
    }
    return {};
  };

  win.renderFleet(
    [
      {
        node_name: "this machine",
        last_seen: now,
        public_url: "http://127.0.0.1:8070",
        is_this_pc: true,
        mesh_mode: "musu_headscale",
        route_label: "Private Mesh",
        control_server_url: "https://mesh.example",
        control_server_verified: true,
        tailscale_ip: "100.64.0.10",
      },
      {
        node_name: "studio-pc",
        last_seen: now,
        public_url: "http://100.64.0.11:8070",
        is_this_pc: false,
        mesh_mode: "musu_headscale",
        route_label: "Private Mesh",
        control_server_url: "https://mesh.example",
        control_server_verified: true,
        tailscale_ip: "100.64.0.11",
      },
    ],
    "idle",
    true
  );

  win.renderFleet(
    [
      {
        node_name: "this machine",
        last_seen: now,
        public_url: "http://127.0.0.1:8070",
        is_this_pc: true,
        mesh_mode: "musu_headscale",
        route_label: "Private Mesh",
        control_server_url: "https://mesh.example",
        control_server_verified: true,
        tailscale_ip: "100.64.0.10",
      },
    ],
    "idle",
    true
  );

  (doc.querySelector("#physical-peer-evidence-latest") as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const input = doc.querySelector("#physical-peer-evidence-path") as HTMLInputElement;
  const status = doc.querySelector("#physical-peer-evidence-status") as HTMLElement;
  assert.equal(input.value, "C:\\proofs\\garage-pc.physical-peer-evidence.json");
  assert.equal(status.dataset.state, "ready");
  assert.match(status.textContent || "", /garage-pc/);
  assert.doesNotMatch(status.textContent || "", /does not match target studio-pc/);

  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("fleet rows distinguish MUSU Private Mesh from external or unclassified tailnets", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const now = new Date().toISOString();
  Object.defineProperty(dom.window.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (value: string) => {
        win.__copiedText = value;
      },
    },
  });
  const originalInvoke = win.__TAURI__.core.invoke;
  win.__TAURI__.core.invoke = async (command: string, args: Record<string, unknown>) => {
    if (command === "validate_physical_peer_evidence_path") {
      win.__validatedPhysicalEvidence = { command, args };
      return {
        ok: true,
        path: args.path,
        node_name: "studio-pc",
        tailnet_ip: "100.64.0.11",
        control_server_url: "https://mesh.example",
        hostname: "studio-pc",
        source_hostname: "this-laptop",
        physical_host_distinct: true,
        integrity_verified: true,
      };
    }
    return originalInvoke(command);
  };

  win.renderFleet(
    [
      {
        node_name: "this machine",
        last_seen: now,
        public_url: "http://127.0.0.1:8070",
        is_this_pc: true,
        mesh_mode: "musu_headscale",
        route_label: "Private Mesh",
        control_server_url: "https://mesh.example",
        control_server_verified: true,
        tailscale_ip: "100.64.0.10",
      },
      {
        node_name: "studio-pc",
        last_seen: now,
        public_url: "http://100.64.0.11:8070",
        is_this_pc: false,
        mesh_mode: "musu_headscale",
        route_label: "Private Mesh",
        control_server_url: "https://mesh.example",
        control_server_verified: true,
        tailscale_ip: "100.64.0.11",
      },
      {
        node_name: "external-pc",
        last_seen: now,
        public_url: "http://100.64.0.12:8070",
        is_this_pc: false,
        mesh_mode: "external_tailscale_opt_in",
        tailscale_ip: "100.64.0.12",
      },
      {
        node_name: "unclassified-tailnet",
        last_seen: now,
        public_url: "http://100.64.0.13:8070",
        is_this_pc: false,
        tailscale_ip: "100.64.0.13",
      },
    ],
    "idle",
    true
  );

  const privateBadge = dom.window.document.querySelector(
    '[data-node="studio-pc"][data-mesh-state="private"] .node-network'
  );
  const externalBadge = dom.window.document.querySelector(
    '[data-node="external-pc"][data-mesh-state="external"] .node-network'
  );
  const missingBadge = dom.window.document.querySelector(
    '[data-node="unclassified-tailnet"][data-mesh-state="mesh-needed"] .node-network'
  );

  assert.equal(privateBadge?.textContent, "Private Mesh");
  assert.equal(externalBadge?.textContent, "External Tailnet");
  assert.equal(missingBadge?.textContent, "Mesh setup needed");
  assert.equal(
    doc
      .querySelector('[data-node="studio-pc"] .node-verify-copy')
      ?.getAttribute("data-copy-text"),
    "musu mesh verify --target-ip 100.64.0.11 --json"
  );
  assert.equal(
    doc
      .querySelector('[data-node="studio-pc"] .node-release-copy')
      ?.getAttribute("data-copy-text"),
    ""
  );
  assert.equal(
    doc
      .querySelector('[data-node="studio-pc"] .node-physical-evidence-copy')
      ?.getAttribute("data-copy-text"),
    "musu mesh physical-peer-evidence --json"
  );
  const releaseCopy = doc.querySelector(
    '[data-node="studio-pc"] .node-release-copy'
  ) as HTMLButtonElement;
  assert.equal(
    doc.querySelector('[data-node="studio-pc"] .node-verify-run')?.textContent,
    "Run verify"
  );
  assert.equal(
    doc.querySelector('[data-node="studio-pc"] .node-proof-order')?.textContent,
    "Proof order"
  );
  assert.equal(
    doc.querySelector('[data-node="studio-pc"] .node-release-run')?.textContent,
    "Run proof"
  );
  releaseCopy.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(win.__copiedText, undefined);
  assert.equal(releaseCopy.textContent, "Evidence needed");
  assert.equal(
    (doc.querySelector("#physical-peer-evidence-status") as HTMLElement).dataset.state,
    "error"
  );
  assert.match(
    doc.querySelector("#physical-peer-evidence-status")?.textContent || "",
    /Final release trust needs target-generated evidence/
  );
  assert.equal(
    (doc.querySelector("#release-evidence-strip") as HTMLElement)?.dataset.state,
    "input"
  );
  assert.equal(
    doc.querySelector("#release-evidence-title")?.textContent,
    "Target physical evidence required"
  );
  const initialProofStatus = doc.querySelector('[data-node="studio-pc"] .node-proof-status');
  assert.equal(!initialProofStatus || initialProofStatus.hasAttribute("hidden"), true);
  assert.equal(doc.querySelector('[data-node="external-pc"] .node-verify-copy'), null);
  assert.equal(doc.querySelector('[data-node="external-pc"] .node-release-copy'), null);
  assert.equal(doc.querySelector('[data-node="external-pc"] .node-physical-evidence-copy'), null);
  assert.equal(doc.querySelector('[data-node="external-pc"] .node-release-run'), null);
  assert.equal(doc.querySelector('[data-node="external-pc"] .node-proof-order'), null);
  assert.equal(
    doc.querySelector('[data-node="unclassified-tailnet"] .node-verify-copy'),
    null
  );
  assert.equal(
    doc.querySelector('[data-node="unclassified-tailnet"] .node-release-copy'),
    null
  );
  assert.equal(
    doc.querySelector('[data-node="unclassified-tailnet"] .node-release-run'),
    null
  );
  (doc.querySelector("#physical-peer-evidence-path") as HTMLInputElement).value =
    "C:\\proofs\\studio-pc.physical-peer-evidence.json";
  releaseCopy.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    win.__validatedPhysicalEvidence.args.path,
    "C:\\proofs\\studio-pc.physical-peer-evidence.json"
  );
  assert.equal(
    (doc.querySelector("#physical-peer-evidence-status") as HTMLElement).dataset.state,
    "ready"
  );
  assert.equal(
    win.__copiedText,
    "musu mesh release-proof --target-node 'studio-pc' --target-ip '100.64.0.11' --expected-control-server-url 'https://mesh.example' --physical-peer-evidence 'C:\\proofs\\studio-pc.physical-peer-evidence.json' --json"
  );
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(releaseCopy.textContent, "Release cmd");
  assert.equal(releaseCopy.disabled, false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("local fleet rendering does not fabricate stale last-seen timestamps", () => {
  const main = source("src-tauri-shell/main.js");
  const cli = source("../musu-rs/src/install/cli_commands.rs");
  const fleet = source("../musu-rs/src/bridge/handlers/fleet.rs");

  assert.match(main, /function nodeStatusError\(node\)/);
  assert.match(main, /function nodeIsOnline\(node, thisPcBridgeOk\)/);
  assert.match(main, /return !nodeStatusError\(node\) && isOnline\(node\?\.last_seen\)/);
  assert.match(main, /const online = nodeIsOnline\(n, thisPcBridgeOk\)/);
  assert.match(main, /statusError\s*\|\|\s*\(seen\s*\?\s*`seen \$\{seen\}`\s*:\s*"offline"\)/);
  assert.doesNotMatch(cli, /Duration::days\(30\)/);
  assert.doesNotMatch(cli, /last_seen":\s*if healthy/);
  assert.match(cli, /"last_seen":\s*p\.get\("last_seen"\)/);
  assert.match(cli, /"status_error":\s*p\.get\("status_error"\)/);
  assert.match(fleet, /Err\(_\)\s*=>\s*peer_fallback_status\(peer,\s*"node status unreadable"\)/);
  assert.doesNotMatch(fleet, /Err\(_\)\s*=>\s*FleetNodeStatus\s*\{[\s\S]*?healthy:\s*true/);
  assert.match(fleet, /fn peer_fallback_status[\s\S]*?healthy:\s*false/);
});

test("fleet row shows unreadable status without pretending stale seen timestamp", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;

  win.renderFleet(
    [
      {
        node_name: "this machine",
        last_seen: new Date().toISOString(),
        public_url: "http://127.0.0.1:8070",
        is_this_pc: true,
        mesh_mode: "musu_headscale",
        route_label: "Private Mesh",
        control_server_url: "https://mesh.example",
        control_server_verified: true,
        tailscale_ip: "100.64.0.10",
      },
      {
        node_name: "broken-pc",
        last_seen: "",
        status_error: "node status unreadable",
        public_url: "http://100.64.0.73:8070",
        is_this_pc: false,
        mesh_mode: "musu_headscale",
        route_label: "Private Mesh",
        control_server_url: "https://mesh.example",
        control_server_verified: true,
        tailscale_ip: "100.64.0.73",
      },
    ],
    "idle",
    true
  );

  const row = dom.window.document.querySelector('[data-node="broken-pc"]') as HTMLElement;
  const meta = row.querySelector(".node-meta") as HTMLElement;

  assert.equal(row.dataset.fleetState, "offline");
  assert.equal(row.dataset.fleetTargetable, "false");
  assert.equal(row.dataset.fleetStale, "false");
  assert.equal(meta.textContent, "node status unreadable");
  assert.equal(meta.title, "node status unreadable");

  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("order composer discloses selected target execution boundary", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const now = new Date().toISOString();

  win.renderFleet(
    [
      {
        node_name: "this machine",
        last_seen: now,
        public_url: "http://127.0.0.1:8070",
        is_this_pc: true,
      },
      {
        node_name: "studio-pc",
        last_seen: now,
        public_url: "http://100.64.0.11:8070",
        tailscale_ip: "100.64.0.11",
        mesh_mode: "musu_headscale",
        control_server_url: "https://mesh.example.test",
        control_server_verified: true,
        is_this_pc: false,
      },
      {
        node_name: "managed-tailnet",
        last_seen: now,
        public_url: "http://100.64.0.12:8070",
        tailscale_ip: "100.64.0.12",
        mesh_mode: "external_tailnet",
        is_this_pc: false,
      },
      {
        node_name: "lan-box",
        last_seen: now,
        public_url: "http://192.0.2.10:8070",
        is_this_pc: false,
      },
    ],
    "idle",
    true
  );

  const select = doc.querySelector("#order-target") as HTMLSelectElement;
  const disclosure = doc.querySelector("#order-target-disclosure") as HTMLElement;

  assert.equal(disclosure.dataset.boundary, "auto");
  assert.match(disclosure.textContent || "", /Auto-route/);
  assert.match(disclosure.textContent || "", /Retry preserves auto-route/);

  select.value = "this machine";
  select.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.equal(disclosure.dataset.boundary, "local");
  assert.match(disclosure.textContent || "", /No machine-to-machine route/);

  select.value = "studio-pc";
  select.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.equal(disclosure.dataset.boundary, "private");
  assert.match(disclosure.textContent || "", /Private Mesh/);
  assert.match(disclosure.textContent || "", /No Tailscale\.com signup is required/);

  select.value = "managed-tailnet";
  select.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.equal(disclosure.dataset.boundary, "external");
  assert.match(disclosure.textContent || "", /External route/);
  assert.match(disclosure.textContent || "", /Run Private Mesh proof/);

  select.value = "lan-box";
  select.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.equal(disclosure.dataset.boundary, "unverified");
  assert.match(disclosure.textContent || "", /Unverified route/);

  const studioRow = doc.querySelector('[data-node="studio-pc"]') as HTMLElement;
  select.value = "";
  select.dispatchEvent(new win.Event("change", { bubbles: true }));
  studioRow.click();
  assert.equal(select.value, "studio-pc");
  assert.equal(disclosure.dataset.boundary, "private");

  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("task card preserves the target execution boundary captured at send time", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const doc = dom.window.document;
  const now = new Date().toISOString();
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];

  win.__TAURI__.core.invoke = async (command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    if (command === "submit_order") {
      return { task_id: "task-boundary-1" };
    }
    if (command === "get_order_status") {
      return { status: "done", output: "remote result ok" };
    }
    return {};
  };

  win.renderFleet(
    [
      {
        node_name: "this machine",
        last_seen: now,
        public_url: "http://127.0.0.1:8070",
        is_this_pc: true,
      },
      {
        node_name: "studio-pc",
        last_seen: now,
        public_url: "http://100.64.0.11:8070",
        tailscale_ip: "100.64.0.11",
        mesh_mode: "musu_headscale",
        control_server_url: "https://mesh.example.test",
        control_server_verified: true,
        is_this_pc: false,
      },
    ],
    "idle",
    true
  );

  const select = doc.querySelector("#order-target") as HTMLSelectElement;
  select.value = "studio-pc";
  select.dispatchEvent(new win.Event("change", { bubbles: true }));

  await win.submitText("summarize build", "studio-pc");
  select.value = "";
  select.dispatchEvent(new win.Event("change", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));

  const card = doc.querySelector('[data-task="task-boundary-1"]') as HTMLElement;
  const boundary = card.querySelector(".task-boundary") as HTMLElement;
  assert.equal(calls.find((call) => call.command === "submit_order")?.args?.target, "studio-pc");
  assert.equal(card.dataset.orderTarget, "studio-pc");
  assert.equal(card.dataset.orderBoundary, "private");
  assert.equal(boundary.textContent, "Private Mesh");
  assert.match(boundary.title, /No Tailscale\.com signup is required/);
  (card.querySelector(".task-details") as HTMLButtonElement).click();
  const meta = card.querySelector(".task-meta") as HTMLElement;
  assert.match(meta.textContent || "", /Boundary/);
  assert.match(meta.textContent || "", /Private Mesh/);
  assert.match(meta.textContent || "", /No Tailscale\.com signup is required/);
  assert.equal((doc.querySelector("#order-target-disclosure") as HTMLElement).dataset.boundary, "auto");

  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});

test("order target dropdown disables offline or unreadable machines", async () => {
  const dom = loadShellDom();
  const win = dom.window as any;
  const now = new Date().toISOString();

  win.renderFleet(
    [
      {
        node_name: "this machine",
        last_seen: now,
        public_url: "http://127.0.0.1:8070",
        is_this_pc: true,
      },
      {
        node_name: "studio-pc",
        last_seen: now,
        public_url: "http://100.64.0.11:8070",
        is_this_pc: false,
      },
    ],
    "idle",
    true
  );

  const select = dom.window.document.querySelector("#order-target") as HTMLSelectElement;
  select.value = "studio-pc";

  win.renderFleet(
    [
      {
        node_name: "this machine",
        last_seen: now,
        public_url: "http://127.0.0.1:8070",
        is_this_pc: true,
      },
      {
        node_name: "studio-pc",
        last_seen: now,
        status_error: "node status unreadable",
        public_url: "http://100.64.0.11:8070",
        is_this_pc: false,
      },
    ],
    "idle",
    true
  );

  const studio = [...select.options].find((option) => option.value === "studio-pc");
  const studioRow = dom.window.document.querySelector('[data-node="studio-pc"]') as HTMLElement;
  assert.equal(studio?.disabled, true);
  assert.match(studio?.textContent || "", /node status unreadable/);
  assert.equal(select.value, "");
  assert.equal(studioRow.getAttribute("aria-disabled"), "true");
  assert.match(studioRow.getAttribute("aria-label") || "", /not targetable/);

  studioRow.click();
  assert.equal(select.value, "");
  assert.equal(studioRow.classList.contains("selected"), false);

  studioRow.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })
  );
  assert.equal(select.value, "");
  assert.equal(studioRow.classList.contains("selected"), false);

  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();
});
