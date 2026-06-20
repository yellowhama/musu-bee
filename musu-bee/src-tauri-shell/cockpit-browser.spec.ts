/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHELL_URL = pathToFileURL(path.join(process.cwd(), "out", "index.html")).toString();

function fileSha256(relativePath: string) {
  return createHash("sha256")
    .update(readFileSync(path.join(process.cwd(), relativePath)))
    .digest("hex");
}

test.beforeAll(() => {
  execFileSync(process.execPath, ["scripts/build-tauri-shell.mjs"], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
});

test("desktop shell build metadata binds source and output artifacts", () => {
  const metadata = JSON.parse(
    readFileSync(path.join(process.cwd(), "out", "desktop-shell.json"), "utf8")
  ) as {
    schema: string;
    source_hashes: Record<string, string>;
    output_hashes: Record<string, string>;
    source_to_output: Record<string, string>;
  };

  expect(metadata.schema).toBe("musu.tauri_shell_build.v1");
  expect(metadata.source_hashes["index.html"]).toBe(fileSha256("src-tauri-shell/index.html"));
  expect(metadata.source_hashes["main.js"]).toBe(fileSha256("src-tauri-shell/main.js"));
  expect(metadata.source_hashes["styles.css"]).toBe(fileSha256("src-tauri-shell/styles.css"));
  expect(metadata.output_hashes["index.html"]).toBe(fileSha256("out/index.html"));
  expect(metadata.output_hashes["main.js"]).toBe(fileSha256("out/main.js"));
  expect(metadata.output_hashes["styles.css"]).toBe(fileSha256("out/styles.css"));
  expect(metadata.source_to_output["index.html"]).toContain("__MUSU_VERSION__");
  expect(metadata.source_to_output["fonts/"]).toBe("copy recursively");
});

async function installMockTauri(
  page: import("@playwright/test").Page,
  options: {
    releaseProofResult?: Record<string, unknown>;
    fleet?: Array<Record<string, unknown>>;
    orderStatusResult?: Record<string, unknown>;
  } = {}
) {
  await page.addInitScript((mockOptions: {
    releaseProofResult?: Record<string, unknown>;
    fleet?: Array<Record<string, unknown>>;
    orderStatusResult?: Record<string, unknown>;
  }) => {
    const routeProof = {
      schema: "musu.route_evidence.v1",
      route_kind: "lan",
      source_node_id: "this-laptop",
      target_node_id: "studio-pc",
      candidate_addr: "127.0.0.1:10538",
      result: "success",
      peer_identity_verified: false,
      encryption: "none_http_bearer",
      recorded_at: "2026-06-12T15:22:20.402084900+00:00",
      callback_delivered: true,
      callback_remote_task_id: "remote-task-9",
      callback_node: "studio-pc",
      callback_status: "done",
      callback_received_at: "2026-06-12T15:22:20.514444800+00:00",
    };
    const now = new Date().toISOString();
    const staleSeen = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const defaultFleet = [
      {
        node_name: "this-laptop",
        last_seen: now,
        public_url: "http://127.0.0.1:10539",
        is_this_pc: true,
      },
      {
        node_name: "studio-pc",
        last_seen: now,
        public_url: "http://100.64.0.11:10538",
        is_this_pc: false,
        mesh_mode: "musu_headscale",
        route_label: "Private Mesh",
        control_server_url: "https://mesh.example",
        control_server_verified: true,
        tailscale_ip: "100.64.0.11",
      },
      {
        node_name: "garage-pc",
        last_seen: staleSeen,
        public_url: "http://127.0.0.1:65530",
        is_this_pc: false,
      },
    ];
    const fleet = mockOptions.fleet || defaultFleet;

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as any).__copiedText = value;
        },
      },
    });

    (window as any).__TAURI__ = {
      core: {
        invoke: async (command: string, args?: Record<string, unknown>) => {
          if (command === "cockpit_state") {
            return {
              auth_status: "Local Only",
              bridge_status: "ok",
              version: "1.15.0-rc.1",
            };
          }
          if (command === "list_fleet") return (window as any).__fleetOverride || fleet;
          if (command === "private_mesh_status") {
            (window as any).__meshStatusCalls = ((window as any).__meshStatusCalls || 0) + 1;
            return {
              ok: true,
              mode: "musu_headscale",
              route_label: "Private Mesh",
              account_requirement: "no Tailscale.com account",
              control_server_url: "https://mesh.example",
              control_server_verified: true,
              derp_policy: "musu_or_operator_managed",
              derp_readiness: "declared_private",
              local_tailnet_ip: "100.64.0.10",
              verified_target_tailnet_ip: "100.64.0.11",
              callback_tailnet_ip: "100.64.0.11",
              target_callback_match: true,
              compatible_client_found: true,
              tailscale_ping_verified: true,
              bridge_health_verified: true,
              callback_verified: true,
              release_grade: true,
              warnings: [],
              next_steps: [],
              error: null,
            };
          }
          if (command === "private_mesh_doctor") {
            (window as any).__doctorCalls = ((window as any).__doctorCalls || 0) + 1;
            return {
              ok: true,
              mode: "musu_headscale",
              route_label: "Private Mesh",
              account_requirement: "no Tailscale.com account",
              control_server_url: "https://mesh.example",
              control_server_verified: true,
              derp_policy: "musu_or_operator_managed",
              derp_readiness: "declared_private",
              derp_probe_ran: true,
              derp_probe_ok: true,
              derp_probe_detail: "headscale ok",
              local_tailnet_ip: "100.64.0.10",
              verified_target_tailnet_ip: "100.64.0.11",
              callback_tailnet_ip: "100.64.0.11",
              target_callback_match: true,
              compatible_client_found: true,
              tailscale_ping_verified: true,
              bridge_health_verified: true,
              callback_verified: true,
              release_grade: true,
              warnings: [],
              next_steps: [],
              error: null,
            };
          }
          if (command === "private_mesh_bootstrap") {
            (window as any).__bootstrapCalls = ((window as any).__bootstrapCalls || 0) + 1;
            (window as any).__lastBootstrapArgs = args;
            return {
              ok: true,
              server_url: String(args?.serverUrl || ""),
              output_dir: "C:\\Users\\empty\\.musu\\private-mesh-control-plane",
              tailnet_name: "musu",
              generated_files: [
                "docker-compose.yml",
                "config/headscale.yaml",
                "scripts/create-join-key.ps1",
              ],
              next_commands: [],
              error: null,
              output: "{}",
            };
          }
          if (command === "private_mesh_start_control_host") {
            (window as any).__startControlHostCalls =
              ((window as any).__startControlHostCalls || 0) + 1;
            return {
              ok: true,
              bundle_dir: "C:\\Users\\empty\\.musu\\private-mesh-control-plane",
              output: JSON.stringify({ schema: "musu.start_control_host.v1", healthy: true }),
              error: null,
            };
          }
          if (command === "private_mesh_create_join_key") {
            (window as any).__createJoinKeyCalls =
              ((window as any).__createJoinKeyCalls || 0) + 1;
            return {
              ok: true,
              pass_path:
                "C:\\Users\\empty\\.musu\\private-mesh-control-plane\\device-add-passes\\musu.device_add.musu.20260615-120000.json",
              login_server: "https://mesh.example",
              tailnet: "musu",
              expires_after_seconds: 3600,
              join_command: "musu mesh join --device-add-pass <musu.device_add.v1.json>",
              error: null,
              output: "{}",
            };
          }
          if (command === "desktop_status") {
            (window as any).__desktopStatusCalls =
              ((window as any).__desktopStatusCalls || 0) + 1;
            return {
              version: "1.15.0-rc.1",
              bridge_status: "ok",
              auth_status: "Local Only",
              runtime_process_count: 1,
              dashboard_status: "ok",
              dashboard_url: "http://127.0.0.1:3001",
              dashboard_detail: "optional developer dashboard is running",
              package_status: "ok",
              runtime_profile_status: "ok",
              process_ownership_status: "ok",
              owned_node_process_count: 0,
              owned_webview2_process_count: 2,
              warnings: [],
              can_start_runtime: false,
            };
          }
          if (command === "open_dashboard") {
            (window as any).__openDashboardCalls =
              ((window as any).__openDashboardCalls || 0) + 1;
            return { ok: true, message: "dashboard opened", output: "http://127.0.0.1:3001" };
          }
          if (command === "latest_release_evidence") {
            (window as any).__latestEvidenceCalls =
              ((window as any).__latestEvidenceCalls || 0) + 1;
            return null;
          }
          if (command === "validate_physical_peer_evidence_path") {
            (window as any).__lastPhysicalEvidenceValidation = args;
            return {
              ok: true,
              path: args?.path,
              node_name: "studio-pc",
              tailnet_ip: "100.64.0.11",
              control_server_url: "https://mesh.example",
              hostname: "studio-pc",
              source_hostname: "this-laptop",
              physical_host_distinct: true,
              physical_peer_verified: true,
              integrity_verified: true,
            };
          }
          if (command === "private_mesh_verify_target") {
            (window as any).__lastVerify = args;
            return {
              ok: true,
              target_ip: "100.64.0.11",
              ping_ok: true,
              bridge_health_ok: true,
              bridge_health_status: 200,
              callback_verified: false,
              release_grade: false,
              next_steps: ["Run delegated task proof and callback reconciliation."],
              error: null,
              output: "{}",
            };
          }
          if (command === "private_mesh_release_proof_target") {
            (window as any).__lastReleaseProof = args;
            const trustedReleaseProof = {
              ok: true,
              target_node: "studio-pc",
              target_ip: "100.64.0.11",
              evidence_root:
                "C:\\Users\\empty\\.musu\\private-mesh-release-proof\\20260613",
              route_evidence_path:
                "C:\\Users\\empty\\.musu\\private-mesh-release-proof\\20260613\\private-mesh-route-proof.evidence.json",
              route_evidence_sha256_path:
                "C:\\Users\\empty\\.musu\\private-mesh-release-proof\\20260613\\private-mesh-route-proof.evidence.json.sha256",
              route_evidence_sha256: "fedcba9876543210",
              route_evidence_integrity_verified: true,
              route_evidence_integrity_error: null,
              verification_path:
                "C:\\Users\\empty\\.musu\\private-mesh-release-proof\\20260613\\private-mesh-release-proof.verification.json",
              verification_sha256_path:
                "C:\\Users\\empty\\.musu\\private-mesh-release-proof\\20260613\\private-mesh-release-proof.verification.json.sha256",
              verification_sha256: "0123456789abcdef",
              integrity_verified: true,
              integrity_error: null,
              peer_identity: {
                schema: "musu.private_mesh_peer_identity.v1",
                source_node_name: "this-laptop",
                source_tailnet_ip: "100.64.0.10",
                source_hostname: "this-laptop",
                target_node: "studio-pc",
                target_ip: "100.64.0.11",
                target_hostname: "studio-pc",
                target_url: "http://100.64.0.11:8070",
                target_url_host: "100.64.0.11",
                node_distinct: true,
                tailnet_ip_distinct: true,
                physical_host_distinct: true,
                target_url_host_matches_target_ip: true,
                physical_peer_verified: true,
                release_identity_bound: true,
              },
              release_identity_bound: true,
              route_transport_verified: true,
              peer_identity_error: null,
              physical_peer_verified: true,
              physical_peer_error: null,
              software_route_trusted: true,
              release_evidence_trusted: true,
              desktop_runtime_kind: "packaged_desktop",
              desktop_runtime_packaged: true,
              desktop_runtime_exe_path:
                "C:\\Program Files\\WindowsApps\\blossompark.musu_1.15.0.0_x64__f5h38pf4yt4gc\\musu.exe",
              bundle_manifest_path:
                "C:\\Users\\empty\\.musu\\private-mesh-release-proof\\20260613\\private-mesh-release-proof.bundle-manifest.json",
              bundle_manifest_sha256_path:
                "C:\\Users\\empty\\.musu\\private-mesh-release-proof\\20260613\\private-mesh-release-proof.bundle-manifest.json.sha256",
              bundle_manifest_ok: true,
              bundle_manifest_fail_count: 0,
              bundle_manifest_error: null,
              archive_dir:
                "C:\\Users\\empty\\.musu\\private-mesh-release-proof\\20260613\\archive\\private-mesh-release-proof-studio-pc",
              archive_manifest_path:
                "C:\\Users\\empty\\.musu\\private-mesh-release-proof\\20260613\\archive\\private-mesh-release-proof-studio-pc\\private-mesh-release-proof.archive.json",
              archive_manifest_sha256_path:
                "C:\\Users\\empty\\.musu\\private-mesh-release-proof\\20260613\\archive\\private-mesh-release-proof-studio-pc\\private-mesh-release-proof.archive.json.sha256",
              archive_artifact_count: 4,
              archive_error: null,
              archive_verifier_schema:
                "musu.private_mesh_release_proof_archive_verification.v1",
              archive_verifier_kind: "native_desktop_internal",
              archive_verifier_ok: true,
              archive_verifier_fail_count: 0,
              archive_verifier_error: null,
              expected_control_server_url: "https://mesh.example",
              error: null,
              output: "{}",
            };
            return {
              ...trustedReleaseProof,
              ...(mockOptions.releaseProofResult || {}),
            };
          }
          if (command === "open_release_evidence_folder") {
            (window as any).__lastOpenEvidence = args;
            return { ok: true, message: "opened", output: String(args?.path || "") };
          }
          if (command === "submit_order") {
            (window as any).__lastSubmit = args;
            (window as any).__submitCalls = [
              ...((window as any).__submitCalls || []),
              args,
            ];
            return { task_id: "task-proof-1" };
          }
          if (command === "get_order_status") {
            return {
              task_id: "task-proof-1",
              status: "done",
              output: "remote result ok",
              error: null,
              artifact_path: null,
              route_proof: routeProof,
              ...(mockOptions.orderStatusResult || {}),
            };
          }
          if (command === "notify_task_result") return null;
          if (command === "read_startup_marker") return null;
          return null;
        },
      },
    };
  }, options);
}

test("diagnostics exposes optional dashboard only when desktop_status provides it", async ({ page }) => {
  await installMockTauri(page);
  await page.goto(SHELL_URL);
  await page.getByText("Having trouble?").click();
  await expect.poll(() => page.evaluate(() => (window as any).__desktopStatusCalls || 0)).toBe(1);
  await expect(page.locator("#d-dashboard")).toHaveText("available");
  await expect(page.getByRole("button", { name: "Open dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Open dashboard" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__openDashboardCalls || 0)).toBe(1);
});

async function renderProofScenario(page: import("@playwright/test").Page) {
  await page.goto(SHELL_URL);
  await expect(page.getByText("Your machines")).toBeVisible();
  await expect(page.getByRole("button", { name: /Online 2/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Targetable 2/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /This PC 1/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Stale 1/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Offline 1/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add PC" })).toBeVisible();
  await expect(page.locator("#add-pc-panel")).toBeHidden();
  await page.getByRole("button", { name: "Add PC" }).click();
  const addPcPanel = page.locator("#add-pc-panel");
  await expect(addPcPanel).toBeVisible();
  await expect(addPcPanel.getByText("No Tailscale.com signup required.")).toBeVisible();
  // W-5: the primary surface is the happy path — "just log in on the other PC".
  // It is visible without any disclosure; the docker/device-pass enrollment is
  // collapsed into the Advanced disclosure below it.
  await expect(addPcPanel.locator("#add-pc-primary")).toBeVisible();
  await expect(addPcPanel.getByText("joins your fleet automatically")).toBeVisible();
  await expect(addPcPanel.getByText("no Docker, no control host, no pass file")).toBeVisible();
  await expect(addPcPanel.locator("#add-pc-advanced")).toBeAttached();
  // The docker/Headscale steps are hidden until Advanced is expanded.
  await expect(addPcPanel.locator("#bootstrap-server-url")).toBeHidden();
  await addPcPanel.locator("#add-pc-advanced > summary").click();
  await expect(addPcPanel.locator("#bootstrap-server-url")).toBeVisible();
  await expect(addPcPanel.getByRole("button", { name: "Generate bundle" })).toBeVisible();
  await expect(addPcPanel.getByRole("button", { name: "Start control host" })).toBeVisible();
  await expect(addPcPanel.getByText("MUSU runs docker compose")).toBeVisible();
  await expect(addPcPanel.getByText("check-public-endpoint.ps1")).toBeVisible();
  await expect(addPcPanel.getByText("Device-add pass", { exact: true })).toBeVisible();
  await expect(addPcPanel.getByText("musu.device_add.v1", { exact: true })).toBeVisible();
  await expect(addPcPanel.getByText("issue a one-use MUSU device-add pass")).toBeVisible();
  await expect(addPcPanel.getByText("device-add-passes/")).toBeVisible();
  await expect(addPcPanel.getByRole("button", { name: "Issue pass" })).toBeVisible();
  await expect(addPcPanel.getByText("scripts\\create-join-key.ps1")).toHaveCount(0);
  await addPcPanel.getByRole("button", { name: "Generate bundle" }).click();
  await expect(addPcPanel.locator("#bootstrap-result")).toContainText(
    "Enter your mesh host URL first"
  );
  await expect.poll(() => page.evaluate(() => (window as any).__bootstrapCalls || 0)).toBe(0);
  await addPcPanel.locator("#bootstrap-server-url").fill("mesh.example");
  await addPcPanel.getByRole("button", { name: "Generate bundle" }).click();
  await expect(addPcPanel.locator("#bootstrap-result")).toContainText(
    "Use a full mesh host URL"
  );
  await expect.poll(() => page.evaluate(() => (window as any).__bootstrapCalls || 0)).toBe(0);
  await addPcPanel.locator("#bootstrap-server-url").fill("https://mesh.example");
  await addPcPanel.getByRole("button", { name: "Generate bundle" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__bootstrapCalls || 0)).toBe(1);
  await expect
    .poll(() => page.evaluate(() => (window as any).__lastBootstrapArgs?.serverUrl || ""))
    .toBe("https://mesh.example");
  await expect(addPcPanel.locator("#bootstrap-result")).toContainText(
    "Bundle ready in C:\\Users\\empty\\.musu\\private-mesh-control-plane"
  );
  await expect(addPcPanel.locator("#bootstrap-files")).toContainText("docker-compose.yml");
  await expect(addPcPanel.locator("#bootstrap-files")).toContainText("config/headscale.yaml");
  await addPcPanel.getByRole("button", { name: "Start control host" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__startControlHostCalls || 0)).toBe(1);
  await expect(addPcPanel.locator("#start-control-host-result")).toContainText(
    "Control host is up"
  );
  await addPcPanel.getByRole("button", { name: "Issue pass" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__createJoinKeyCalls || 0)).toBe(1);
  await expect(addPcPanel.locator("#device-add-pass-result")).toContainText("Pass ready:");
  await expect(addPcPanel.locator("#device-add-pass-result")).toContainText("https://mesh.example");
  await addPcPanel.getByRole("button", { name: "Copy path" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__copiedText || ""))
    .toContain("musu.device_add.musu.20260615-120000.json");
  // W-5: these assertions referenced copy ("Copy that generated pass file…",
  // "musu mesh join --device-add-pass", "musu mesh release-proof --target-node")
  // that the earlier hide-the-pipes work already removed from index.html — they
  // were stale dead asserts (the strings exist nowhere in the rendered DOM).
  // Replaced with the copy that the Advanced enrollment steps actually render.
  await expect(addPcPanel.getByText("Install MUSU on the target PC from musu.pro")).toBeVisible();
  await expect(addPcPanel.getByText("Release proof", { exact: true })).toBeVisible();
  await addPcPanel.getByRole("button", { name: "Run local check" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__doctorCalls || 0)).toBe(1);
  await expect(page.locator("#mesh-proof-strip-detail")).toContainText("DERP probe ok");
  await expect(page.locator("#mesh-proof-strip-diagnostic")).toContainText(
    "DERP detail: headscale ok"
  );
  await expect(page.locator("#mesh-status-next")).toContainText("DERP detail: headscale ok");
  await page.getByRole("button", { name: "Hide setup" }).click();
  await expect(addPcPanel).toBeHidden();
  await expect(page.getByRole("button", { name: "Send an order to studio-pc" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "garage-pc is not targetable: last seen 30m ago" })
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__latestEvidenceCalls || 0)).toBe(1);
  await expect(page.locator("#release-evidence-strip")).toBeVisible();
  await expect(page.locator("#release-evidence-title")).toHaveText(
    "Target physical evidence required"
  );
  await expect(page.locator("#release-evidence-detail")).toContainText(
    "run Evidence cmd on the target PC"
  );

  await page.getByRole("button", { name: /Targetable 2/ }).click();
  await expect(page.getByRole("button", { name: "Send an order to studio-pc" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send an order to garage-pc" })).toBeHidden();
  await page.getByRole("button", { name: /All 3/ }).click();
  await page.getByRole("button", { name: /Stale 1/ }).click();
  await expect(
    page.getByRole("button", { name: "garage-pc is not targetable: last seen 30m ago" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Send an order to studio-pc" })).toBeHidden();
  await page.getByRole("button", { name: /All 3/ }).click();

  await page.getByRole("button", { name: "Run verify" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__lastVerify))
    .toEqual({ targetIp: "100.64.0.11" });
  await expect(page.locator('[data-node="studio-pc"]')).toHaveAttribute(
    "data-verify-state",
    "reachable"
  );
  await expect(page.locator('[data-node="studio-pc"] .node-proof-status')).toHaveText(
    "reachable"
  );

  await page
    .locator("#physical-peer-evidence-path")
    .fill("C:\\proofs\\studio-pc.physical-peer-evidence.json");
  await page.locator('[data-node="studio-pc"] .node-release-run').click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__lastPhysicalEvidenceValidation))
    .toEqual({ path: "C:\\proofs\\studio-pc.physical-peer-evidence.json" });
  await expect
    .poll(() => page.evaluate(() => (window as any).__lastReleaseProof))
    .toEqual({
      targetNode: "studio-pc",
      targetIp: "100.64.0.11",
      expectedControlServerUrl: "https://mesh.example",
      physicalPeerEvidencePath: "C:\\proofs\\studio-pc.physical-peer-evidence.json",
    });
  await expect(page.locator('[data-node="studio-pc"]')).toHaveAttribute(
    "data-verify-state",
    "release-grade"
  );
  await expect(page.locator('[data-node="studio-pc"] .node-proof-status')).toHaveText(
    "release proof"
  );
  await expect(page.locator("#release-evidence-strip")).toBeVisible();
  await expect(page.locator("#release-evidence-title")).toHaveText("Release evidence archived");
  await expect(page.locator("#release-evidence-readiness")).toHaveText(
    "Release-ready: 9/9 checks passed"
  );
  await expect(page.locator("#release-evidence-detail")).toContainText(
    "Target studio-pc · 100.64.0.11 · verifier ok · packaged desktop runtime · hash verified · identity + physical peer bound · archive verified (native structural replay)"
  );
  await expect(page.locator("#release-evidence-next")).toContainText(
    "Attach the verified release archive"
  );
  await expect(page.locator("#release-evidence-checks")).toContainText(
    "OK Final release evidence trusted"
  );
  await expect(page.locator("#release-evidence-checks")).toContainText(
    "OK Bundle manifest verified"
  );
  await expect(page.locator("#release-evidence-path")).toContainText(
    "private-mesh-release-proof.archive.json"
  );
  await page.locator("[data-open-release-evidence]").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__lastOpenEvidence))
    .toEqual({
      path: "C:\\Users\\empty\\.musu\\private-mesh-release-proof\\20260613\\archive\\private-mesh-release-proof-studio-pc\\private-mesh-release-proof.archive.json",
    });
  await page.locator("[data-copy-release-evidence]").click();
  const copiedEvidence = await page.evaluate(() =>
    JSON.parse((window as any).__copiedText || "{}")
  );
  expect(copiedEvidence.schema).toBe("musu.private_mesh_release_evidence_clipboard.v1");
  expect(copiedEvidence.release_readiness.schema).toBe(
    "musu.private_mesh_release_readiness.v1"
  );
  expect(copiedEvidence.release_readiness.ready).toBe(true);
  expect(copiedEvidence.release_readiness.missing).toEqual([]);
  expect(copiedEvidence.release_readiness.readiness_summary.label).toBe(
    "Release-ready: 9/9 checks passed"
  );
  expect(copiedEvidence.release_readiness.next_action_detail.area).toBe("release-notes");
  expect(copiedEvidence.next_action.area).toBe("release-notes");
  expect(copiedEvidence.result.target_node).toBe("studio-pc");
  expect(copiedEvidence.result.integrity_verified).toBe(true);
  expect(copiedEvidence.result.route_evidence_integrity_verified).toBe(true);
  expect(copiedEvidence.result.release_identity_bound).toBe(true);
  expect(copiedEvidence.result.release_evidence_trusted).toBe(true);
  expect(copiedEvidence.result.peer_identity.release_identity_bound).toBe(true);
  expect(copiedEvidence.evidence_path).toContain(
    "private-mesh-release-proof.verification.json"
  );
  await page.locator("[data-copy-release-next-action]").click();
  const copiedNextAction = await page.evaluate(() =>
    JSON.parse((window as any).__copiedText || "{}")
  );
  expect(copiedNextAction.schema).toBe(
    "musu.private_mesh_release_next_action_clipboard.v1"
  );
  expect(copiedNextAction.release_readiness_ready).toBe(true);
  expect(copiedNextAction.release_readiness_missing).toEqual([]);
  expect(copiedNextAction.release_readiness_summary.label).toBe(
    "Release-ready: 9/9 checks passed"
  );
  expect(copiedNextAction.next_action.area).toBe("release-notes");
  expect(copiedNextAction.next_action.schema).toBe("musu.private_mesh_release_next_action.v1");
  expect(copiedNextAction.result).toBeUndefined();
  expect(copiedNextAction.release_target.nodeName).toBe("studio-pc");

  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__copiedText || ""))
    .toBe("musu mesh verify --target-ip 100.64.0.11 --json");
  await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeVisible();
  await page.locator('[data-node="studio-pc"] .node-physical-evidence-copy').click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__copiedText || ""))
    .toBe("musu mesh physical-peer-evidence --json");
  await page.locator('[data-node="studio-pc"] .node-release-copy').click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__copiedText || ""))
    .toBe(
      "musu mesh release-proof --target-node 'studio-pc' --target-ip '100.64.0.11' --expected-control-server-url 'https://mesh.example' --physical-peer-evidence 'C:\\proofs\\studio-pc.physical-peer-evidence.json' --json"
    );

  await page.getByRole("button", { name: "Proof order" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__lastSubmit)).toEqual({
    text: "MUSU Private Mesh proof: reply with the executing machine name and current time.",
    target: "studio-pc",
  });

  await page.getByLabel("Target machine").selectOption("studio-pc");
  await page.getByPlaceholder("What should they do?").fill("summarize build");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const card = page.locator('[data-task="task-proof-1"]');
  await expect(card).toBeVisible();
  await expect(card.locator(".task-route")).toHaveText("to studio-pc");
  await expect(card.locator(".task-boundary")).toHaveText("Private Mesh");
  await expect(card.locator(".task-boundary")).toHaveAttribute(
    "title",
    /No Tailscale\.com signup is required/
  );
  await expect(card.locator(".task-proof-summary")).toContainText("returned from studio-pc");
  await expect(card.locator(".task-proof-summary")).toContainText("lan · success · bearer route");
  await expect(card.getByText("remote result ok")).toBeVisible();
  await expect(page.locator('[data-node="studio-pc"]')).toHaveAttribute(
    "data-verify-state",
    "callback-proof"
  );
  await expect(page.locator('[data-node="studio-pc"] .node-proof-status')).toHaveText(
    "callback proof"
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).__meshStatusCalls || 0))
    .toBeGreaterThan(1);
  await expect(page.locator("#mesh-status-proof")).toContainText(
    "target 100.64.0.11 · callback 100.64.0.11 · bound proof"
  );
  await expect(page.locator("#mesh-proof-strip-detail")).toContainText("DERP private");
  await page.getByRole("button", { name: "Add PC" }).click();
  await expect(addPcPanel).toBeVisible();
  const stripProofCopy = page.locator("#mesh-proof-strip [data-mesh-copy-proof]");
  const panelProofCopy = page.locator("#add-pc-panel [data-mesh-copy-proof]");
  await panelProofCopy.click();
  await expect(panelProofCopy).toHaveText("Copied proof");
  await expect(stripProofCopy).toHaveText("Copy proof");
  await expect(panelProofCopy).toHaveText("Copy proof");
  await page.getByRole("button", { name: "Hide setup" }).click();
  await expect(addPcPanel).toBeHidden();
  await page.getByRole("button", { name: "Copy proof" }).click();
  const copiedProof = await page.evaluate(() =>
    JSON.parse((window as any).__copiedText || "{}")
  );
  expect(copiedProof.schema).toBe("musu.private_mesh_desktop_proof_clipboard.v1");
  expect(copiedProof.verified_target_tailnet_ip).toBe("100.64.0.11");
  expect(copiedProof.callback_tailnet_ip).toBe("100.64.0.11");
  expect(copiedProof.target_callback_match).toBe(true);
  expect(copiedProof.derp_readiness).toBe("declared_private");
  expect(copiedProof.derp_private_declared).toBe(true);
  expect(copiedProof.derp_probe_ran).toBe(true);
  expect(copiedProof.derp_probe_ok).toBe(true);
  expect(copiedProof.release_grade).toBe(true);
  await expect(page.getByRole("button", { name: "Copy proof" })).toBeVisible();

  await card.getByRole("button", { name: "Details" }).click();
  await expect(card.getByText("Boundary", { exact: true })).toBeVisible();
  await expect(card.getByText("Private Mesh").last()).toBeVisible();
  await expect(card.getByText(/No Tailscale\.com signup is required/)).toBeVisible();
  await expect(card.getByText("Remote task")).toBeVisible();
  await expect(card.getByText("remote-task-9")).toBeVisible();
  await expect(card.getByText("Callback node")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  return card;
}

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    html: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport);
  expect(overflow.html).toBeLessThanOrEqual(overflow.viewport);
}

test("desktop shell renders fleet, remote completion proof, retry, and copy affordances", async ({
  page,
}, testInfo) => {
  await installMockTauri(page);
  const card = await renderProofScenario(page);

  const screenshot = await page.screenshot({ fullPage: false });
  await testInfo.attach("tauri-shell-proof-summary.png", {
    body: screenshot,
    contentType: "image/png",
  });
  await expect(page).toHaveScreenshot("tauri-shell-proof-summary.png", {
    fullPage: false,
    mask: [page.locator(".task-log-time")],
    maxDiffPixelRatio: 0.01,
  });

  await card.getByRole("button", { name: "Copy result" }).click();
  const copiedText = await page.evaluate(() => (window as any).__copiedText || "");
  expect(copiedText).toContain("remote result ok");

  await expect.poll(() => page.evaluate(() => (window as any).__lastSubmit)).toEqual({
    text: "summarize build",
    target: "studio-pc",
  });
});

test("desktop shell discloses target execution boundary before send", async ({ page }) => {
  const now = new Date().toISOString();
  await installMockTauri(page, {
    fleet: [
      {
        node_name: "this-laptop",
        last_seen: now,
        public_url: "http://127.0.0.1:10539",
        is_this_pc: true,
      },
      {
        node_name: "studio-pc",
        last_seen: now,
        public_url: "http://100.64.0.11:10538",
        tailscale_ip: "100.64.0.11",
        mesh_mode: "musu_headscale",
        control_server_url: "https://mesh.example",
        control_server_verified: true,
        is_this_pc: false,
      },
      {
        node_name: "managed-tailnet",
        last_seen: now,
        public_url: "http://100.64.0.12:10538",
        tailscale_ip: "100.64.0.12",
        mesh_mode: "external_tailnet",
        is_this_pc: false,
      },
      {
        node_name: "lan-box",
        last_seen: now,
        public_url: "http://192.0.2.10:10538",
        is_this_pc: false,
      },
    ],
  });

  await page.goto(SHELL_URL);
  const target = page.getByLabel("Target machine");
  const disclosure = page.locator("#order-target-disclosure");

  await expect(disclosure).toHaveAttribute("data-boundary", "auto");
  await expect(disclosure).toContainText("Auto-route");
  await expect(disclosure).toContainText("Retry preserves auto-route");

  await target.selectOption("this-laptop");
  await expect(disclosure).toHaveAttribute("data-boundary", "local");
  await expect(disclosure).toContainText("No machine-to-machine route");

  await target.selectOption("studio-pc");
  await expect(disclosure).toHaveAttribute("data-boundary", "private");
  await expect(disclosure).toContainText("Private Mesh");
  await expect(disclosure).toContainText("No Tailscale.com signup is required");

  await target.selectOption("managed-tailnet");
  await expect(disclosure).toHaveAttribute("data-boundary", "external");
  await expect(disclosure).toContainText("External route");
  await expect(disclosure).toContainText("Run Private Mesh proof");

  await target.selectOption("lan-box");
  await expect(disclosure).toHaveAttribute("data-boundary", "unverified");
  await expect(disclosure).toContainText("Unverified route");

  await page.getByRole("button", { name: "Send an order to studio-pc" }).click();
  await expect(target).toHaveValue("studio-pc");
  await expect(disclosure).toHaveAttribute("data-boundary", "private");
});

test("retry resubmits the original order target even when the dropdown changed", async ({
  page,
}) => {
  await installMockTauri(page, {
    orderStatusResult: {
      status: "failed",
      output: null,
      error: "adapter rejected the order",
      artifact_path: null,
      route_proof: null,
    },
  });

  await page.goto(SHELL_URL);
  await page.getByLabel("Target machine").selectOption("studio-pc");
  await page.getByPlaceholder("What should they do?").fill("summarize build");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const card = page.locator('[data-task="task-proof-1"]');
  await expect(card).toHaveClass(/failed/);
  await expect(card.locator(".task-route")).toHaveText("to studio-pc");
  await expect(card.locator(".task-boundary")).toHaveText("Private Mesh");
  await expect(card.locator(".task-detail")).toHaveText("error: adapter rejected the order");

  await page.getByLabel("Target machine").selectOption("");
  await card.getByRole("button", { name: "Retry" }).click();

  await expect
    .poll(() => page.evaluate(() => (window as any).__submitCalls || []))
    .toEqual([
      { text: "summarize build", target: "studio-pc" },
      { text: "summarize build", target: "studio-pc" },
    ]);
});

test("retry fails closed when the stored execution boundary changed", async ({ page }) => {
  const now = new Date().toISOString();
  await installMockTauri(page, {
    orderStatusResult: {
      status: "failed",
      output: null,
      error: "adapter rejected the order",
      artifact_path: null,
      route_proof: null,
    },
  });

  await page.goto(SHELL_URL);
  await page.getByLabel("Target machine").selectOption("studio-pc");
  await page.getByPlaceholder("What should they do?").fill("summarize build");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const card = page.locator('[data-task="task-proof-1"]');
  await expect(card).toHaveClass(/failed/);
  await expect(card.locator(".task-boundary")).toHaveText("Private Mesh");

  await page.evaluate(async (seen) => {
    (window as any).__fleetOverride = [
      {
        node_name: "this-laptop",
        last_seen: seen,
        public_url: "http://127.0.0.1:10539",
        is_this_pc: true,
      },
      {
        node_name: "studio-pc",
        last_seen: seen,
        public_url: "http://100.64.0.11:10538",
        is_this_pc: false,
        mesh_mode: "external_tailnet",
        tailscale_ip: "100.64.0.11",
      },
    ];
    await (window as any).refresh();
  }, now);

  await card.getByRole("button", { name: "Retry" }).click();

  await expect
    .poll(() => page.evaluate(() => (window as any).__submitCalls || []))
    .toEqual([{ text: "summarize build", target: "studio-pc" }]);
  const blocked = page.locator(".task-card").filter({
    hasText: "Retry blocked: execution boundary changed",
  });
  await expect(blocked).toBeVisible();
  await expect(blocked.locator(".task-boundary")).toHaveText("external");
  await expect(blocked.locator(".task-detail")).toContainText(
    "changed from Private Mesh to external"
  );
  await expect(blocked.getByRole("button", { name: "Retry" })).toBeHidden();
  await expect(blocked.getByRole("button", { name: "Review target" })).toBeVisible();
  await blocked.getByRole("button", { name: "Review target" }).click();
  await expect(page.getByLabel("Target machine")).toHaveValue("studio-pc");
  await expect(page.locator("#order-target-disclosure")).toHaveAttribute("data-boundary", "external");
  await expect(page.locator("#order-target-disclosure")).toContainText("External route");
});

test("retry fails closed when Private Mesh peer identity changed", async ({ page }) => {
  const now = new Date().toISOString();
  await installMockTauri(page, {
    orderStatusResult: {
      status: "failed",
      output: null,
      error: "adapter rejected the order",
      artifact_path: null,
      route_proof: null,
    },
  });

  await page.goto(SHELL_URL);
  await page.getByLabel("Target machine").selectOption("studio-pc");
  await page.getByPlaceholder("What should they do?").fill("summarize build");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const card = page.locator('[data-task="task-proof-1"]');
  await expect(card).toHaveClass(/failed/);
  await expect(card.locator(".task-boundary")).toHaveText("Private Mesh");

  await page.evaluate(async (seen) => {
    (window as any).__fleetOverride = [
      {
        node_name: "this-laptop",
        last_seen: seen,
        public_url: "http://127.0.0.1:10539",
        is_this_pc: true,
      },
      {
        node_name: "studio-pc",
        last_seen: seen,
        public_url: "http://100.64.0.99:10538",
        is_this_pc: false,
        mesh_mode: "musu_headscale",
        route_label: "Private Mesh",
        control_server_url: "https://mesh.example",
        control_server_verified: true,
        tailscale_ip: "100.64.0.99",
      },
    ];
    await (window as any).refresh();
  }, now);

  await card.getByRole("button", { name: "Retry" }).click();

  await expect
    .poll(() => page.evaluate(() => (window as any).__submitCalls || []))
    .toEqual([{ text: "summarize build", target: "studio-pc" }]);
  const blocked = page.locator(".task-card").filter({
    hasText: "Retry blocked: execution boundary identity changed",
  });
  await expect(blocked).toBeVisible();
  await expect(blocked.locator(".task-boundary")).toHaveText("Private Mesh");
  await expect(blocked.locator(".task-detail")).toContainText(
    "identity changed within Private Mesh"
  );
  await expect(blocked.locator(".task-detail")).toContainText("tailnet IP changed");
  await expect(blocked.getByRole("button", { name: "Retry" })).toBeHidden();
  await expect(blocked.getByRole("button", { name: "Review target" })).toBeVisible();
});

test("fleet keeps unknown offline peers offline instead of fabricating a seen time", async ({
  page,
}) => {
  const now = new Date().toISOString();
  await installMockTauri(page, {
    fleet: [
      {
        node_name: "this-laptop",
        last_seen: now,
        public_url: "http://127.0.0.1:10539",
        is_this_pc: true,
      },
      {
        node_name: "studio-pc",
        last_seen: now,
        public_url: "http://100.64.0.11:10538",
        is_this_pc: false,
      },
      {
        node_name: "unknown-pc",
        last_seen: "",
        public_url: "http://127.0.0.1:65530",
        is_this_pc: false,
      },
    ],
  });

  await page.goto(SHELL_URL);
  await expect(page.getByRole("button", { name: /Online 2/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Offline 1/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Stale 0/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "unknown-pc is not targetable: offline" })
  ).toBeVisible();
  await expect(page.getByText(/seen \d+d ago/)).toHaveCount(0);
  await expect(page.getByText(/last seen \d+d ago/i)).toHaveCount(0);
});

test("release proof ok is held for review when trust evidence is not bound", async ({ page }) => {
  await installMockTauri(page, {
    releaseProofResult: {
      ok: true,
      route_evidence_sha256_path: null,
      route_evidence_sha256: null,
      route_evidence_integrity_verified: false,
      route_evidence_integrity_error:
        "route evidence SHA256 sidecar does not match evidence file",
      peer_identity: null,
      release_identity_bound: false,
      peer_identity_error: "route evidence SHA256 sidecar does not match evidence file",
      physical_peer_verified: false,
      physical_peer_error: "route evidence SHA256 sidecar does not match evidence file",
      software_route_trusted: false,
      release_evidence_trusted: false,
    },
  });

  await page.goto(SHELL_URL);
  await expect(page.getByRole("button", { name: /Online 2/ })).toBeVisible();
  await page
    .locator("#physical-peer-evidence-path")
    .fill("C:\\proofs\\studio-pc.physical-peer-evidence.json");
  await page.locator('[data-node="studio-pc"] .node-release-run').click();

  const studio = page.locator('[data-node="studio-pc"]');
  await expect(studio).toHaveAttribute("data-verify-state", "failed");
  await expect(studio.locator(".node-release-run")).toHaveText("Proof review");
  await expect(studio.locator(".node-proof-status")).toHaveText("needs review");
  await expect(page.locator("#release-evidence-strip")).toBeVisible();
  await expect(page.locator("#release-evidence-title")).toHaveText(
    "Release evidence needs review"
  );
  await expect(page.locator("#release-evidence-detail")).toContainText(
    "route evidence SHA256 sidecar does not match evidence file"
  );
  await expect(page.locator("#release-evidence-readiness")).toContainText("No-Go:");
  await expect(page.locator("#release-evidence-readiness")).toContainText(
    "First blocker: Evidence hashes verified"
  );
  await expect(page.locator("#release-evidence-checks")).toContainText(
    "Needs Evidence hashes verified"
  );
  await expect(page.locator("#release-evidence-next")).toContainText(
    "Resolve Evidence hashes verified"
  );

  await page.locator("[data-copy-release-evidence]").click();
  const copiedEvidence = await page.evaluate(() =>
    JSON.parse((window as any).__copiedText || "{}")
  );
  expect(copiedEvidence.result.ok).toBe(true);
  expect(copiedEvidence.result.route_evidence_integrity_verified).toBe(false);
  expect(copiedEvidence.result.release_identity_bound).toBe(false);
  expect(copiedEvidence.result.release_evidence_trusted).toBe(false);
  expect(copiedEvidence.release_readiness.ready).toBe(false);
  expect(copiedEvidence.release_readiness.missing).toContain("Evidence hashes verified");
  expect(copiedEvidence.release_readiness.readiness_summary.first_blocker.label).toBe(
    "Evidence hashes verified"
  );
  expect(copiedEvidence.next_action.area).toBe("hash_integrity_verified");
  await page.locator("[data-copy-release-next-action]").click();
  const copiedNextAction = await page.evaluate(() =>
    JSON.parse((window as any).__copiedText || "{}")
  );
  expect(copiedNextAction.schema).toBe(
    "musu.private_mesh_release_next_action_clipboard.v1"
  );
  expect(copiedNextAction.release_readiness_ready).toBe(false);
  expect(copiedNextAction.release_readiness_missing).toContain("Evidence hashes verified");
  expect(copiedNextAction.release_readiness_summary.first_blocker.label).toBe(
    "Evidence hashes verified"
  );
  expect(copiedNextAction.next_action.area).toBe("hash_integrity_verified");
  expect(copiedNextAction.result).toBeUndefined();
});

test("compact shell keeps fleet and proof cards usable without horizontal overflow", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 420, height: 760 });
  await installMockTauri(page);
  await renderProofScenario(page);
  await expectNoHorizontalOverflow(page);

  const screenshot = await page.screenshot({ fullPage: false });
  await testInfo.attach("tauri-shell-proof-summary-compact.png", {
    body: screenshot,
    contentType: "image/png",
  });
  await expect(page).toHaveScreenshot("tauri-shell-proof-summary-compact.png", {
    fullPage: false,
    mask: [page.locator(".task-log-time")],
    maxDiffPixelRatio: 0.01,
  });
});
