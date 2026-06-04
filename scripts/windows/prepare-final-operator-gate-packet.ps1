[CmdletBinding()]
param(
    [string]$OutputRoot,
    [string]$Version,
    [string]$SupportEmail,
    [string]$MultiDeviceKitZip,
    [switch]$IncludeDesktopShell,
    [switch]$SkipMultiDeviceKit,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
. (Join-Path $scriptDir "release-config.ps1")

if ([string]::IsNullOrWhiteSpace($SupportEmail)) {
    $SupportEmail = Get-MusuReleaseSupportEmail -RepoRoot $repoRoot
}

$gitBranch = (& git -C $repoRoot rev-parse --abbrev-ref HEAD 2>$null | Out-String).Trim()
$gitCommit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()
$gitStatus = (& git -C $repoRoot status --short 2>$null | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($gitCommit)) {
    throw "Unable to resolve git commit for final operator packet."
}
if (-not [string]::IsNullOrWhiteSpace($gitStatus)) {
    throw "Refusing to prepare final operator packet from a dirty worktree. Commit changes and regenerate the packet before handoff.`n$gitStatus"
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ".local-build\final-operator-gates"
}

$safeVersion = $Version -replace "[^A-Za-z0-9._-]", "_"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$packetRoot = Join-Path $OutputRoot "musu-final-operator-gates-$safeVersion-$stamp"
$packetDocs = Join-Path $packetRoot "docs"
$packetScripts = Join-Path $packetRoot "scripts\windows"
$packetKits = Join-Path $packetRoot "kits"

if (Test-Path -LiteralPath $packetRoot) {
    throw "Final operator gate packet already exists: $packetRoot"
}

New-Item -ItemType Directory -Force -Path $packetDocs, $packetScripts, $packetKits | Out-Null

Copy-Item -LiteralPath (Join-Path $repoRoot "SUPPORT_EMAIL") -Destination (Join-Path $packetRoot "SUPPORT_EMAIL")

$copiedMultiDeviceKit = $null
if (-not $SkipMultiDeviceKit) {
    if ([string]::IsNullOrWhiteSpace($MultiDeviceKitZip)) {
        $prepareSplat = @{}
        if ($IncludeDesktopShell) {
            $prepareSplat["IncludeDesktopShell"] = $true
        }
        $kitResult = & (Join-Path $scriptDir "prepare-multidevice-test-kit.ps1") @prepareSplat
        if (-not $kitResult -or -not $kitResult.ok) {
            throw "Failed to prepare multi-device test kit."
        }
        $MultiDeviceKitZip = [string]$kitResult.zip_path
    }
    if (-not (Test-Path -LiteralPath $MultiDeviceKitZip)) {
        throw "Multi-device kit zip not found: $MultiDeviceKitZip"
    }
    $copiedMultiDeviceKit = Join-Path $packetKits (Split-Path -Leaf $MultiDeviceKitZip)
    Copy-Item -LiteralPath $MultiDeviceKitZip -Destination $copiedMultiDeviceKit
}

$docsToCopy = @(
    "docs\RELEASE_FINAL_OPERATOR_GATES_2026_05_29.md",
    "docs\MULTI_DEVICE_RELEASE_TEST_PLAN_1_15_0_RC1_2026_05_29.md",
    "docs\BETA_RELEASE_CHECKLIST_1_15_0_RC1.md",
    "docs\DESKTOP_RELEASE_READINESS_AUDIT_2026_05_29.md",
    "docs\RELEASE_1_15_0_RC1_FINAL_QUAL_AUDIT_NEXT_STEPS_2026_05_29.md",
    "docs\RELEASE_1_15_0_RC1_CURRENT_STATUS_AUDIT_2026_05_31.md",
    "docs\RELEASE_1_15_0_RC1_RUNTIME_HARDENING_RELAY_ROADMAP_2026_05_31.md",
    "docs\P2P_CONTROL_PLANE.md",
    "docs\RUNTIME_RELAY_FALLBACK_NEXT_STEPS_2026_06_01.md",
    "docs\MUSU_PRO_P2P_CONTROL_PLANE_SPEC_2026_05_31.md",
    "docs\MUSU_RUNTIME_STABILIZATION_EXECUTION_PLAN_2026_05_31.md",
    "docs\MSIX_DESKTOP_ENTRYPOINT_AUDIT_2026_05_31.md",
    "docs\DESKTOP_SINGLE_INSTANCE_RELEASE_GATE_2026_06_02.md",
    "docs\RUNTIME_CPU_SCENARIO_MATRIX_AND_MDNS_LOG_AUDIT_2026_06_01.md",
    "docs\LOCAL_API_AUTH_CONTRACT_AUDIT_2026_06_02.md",
    "docs\RELEASE_1_15_0_RC1_EXTERNAL_RECHECK_RECORDER_2026_06_03.md",
    "docs\MICROSOFT_STORE_RELEASE_RUN_CARD_2026_05_29.md",
    "docs\RELEASE_OPERATOR_HANDOFF_CARD_2026_05_29.md",
    "docs\STORE_SUBMISSION_METADATA_2026_05_29.md"
)
foreach ($relative in $docsToCopy) {
    $source = Join-Path $repoRoot $relative
    if (Test-Path -LiteralPath $source) {
        Copy-Item -LiteralPath $source -Destination (Join-Path $packetDocs (Split-Path -Leaf $source))
    }
}

$scriptsToCopy = @(
    "release-config.ps1",
    "record-support-mailbox-verification.ps1",
    "verify-support-mailbox-evidence.ps1",
    "record-multidevice-evidence.ps1",
    "verify-multidevice-evidence.ps1",
    "capture-msix-install-evidence.ps1",
    "collect-second-pc-handoff.ps1",
    "record-msix-install-evidence.ps1",
    "verify-msix-install-evidence.ps1",
    "record-store-release-verification.ps1",
    "verify-store-release-evidence.ps1",
    "record-p2p-control-plane-evidence.ps1",
    "verify-p2p-control-plane-evidence.ps1",
    "configure-musu-pro-p2p-env.ps1",
    "show-musu-pro-p2p-env-status.ps1",
    "record-external-release-gate-recheck.ps1",
    "verify-store-submission-bundle.ps1",
    "audit-msix-desktop-entrypoint.ps1",
    "audit-frontend-polling-contract.ps1",
    "audit-rust-background-loop-contract.ps1",
    "audit-local-api-auth-contract.ps1",
    "audit-operator-api-security-contract.ps1",
    "audit-secret-storage-contract.ps1",
    "measure-musu-idle-cpu.ps1",
    "measure-musu-runtime-cpu-scenarios.ps1",
    "verify-runtime-cpu-scenario-matrix.ps1",
    "audit-musu-process-ownership.ps1",
    "show-musu-process-attribution.ps1",
    "audit-musu-startup-single-instance.ps1",
    "audit-musu-desktop-single-instance.ps1",
    "prepare-operator-action-pack.ps1",
    "verify-operator-action-pack.ps1",
    "show-final-release-handoff-status.ps1",
    "show-operator-handoff-card.ps1",
    "show-second-pc-return-card.ps1",
    "import-second-pc-return.ps1",
    "verify-final-operator-gate-packet.ps1",
    "complete-final-operator-gates.ps1",
    "write-release-candidate-manifest.ps1",
    "write-release-go-no-go.ps1"
)
foreach ($name in $scriptsToCopy) {
    Copy-Item -LiteralPath (Join-Path $scriptDir $name) -Destination (Join-Path $packetScripts $name)
}

$supportVerificationId = "musu-store-support-$safeVersion-$stamp"
$supportCommand = 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-support-mailbox-verification.ps1 -SupportEmail "{0}" -FromAddress "<sender@example.com>" -ReceivedBy "<operator-name>" -VerificationId "{1}" -Notes "Verified delivery in {0} inbox"' -f $SupportEmail, $supportVerificationId

$readme = @'
# MUSU __VERSION__ Final Operator Gate Packet

This packet contains the remaining manual release gates for MUSU __VERSION__.

Important execution boundary:

- Copy only the zip under `kits\` to the second Windows PC.
- Run all evidence recording and final go/no-go commands from the real MUSU release repo root, not from inside this packet directory.
- The `scripts\windows\` files in this packet are reference copies for review/checksums. They are not a standalone release repo.

Current machine-verifiable state before these gates:

- local artifacts: gated by the MSIX desktop entrypoint audit
- desktop shell build audit: ready, but Store/MSIX activation must launch the desktop shell
- single-machine smoke evidence: recorded
- public Store metadata: live and passing

For the shortest Store/submission sequence, review:

- `docs\RELEASE_1_15_0_RC1_CURRENT_STATUS_AUDIT_2026_05_31.md`
- `docs\RELEASE_1_15_0_RC1_RUNTIME_HARDENING_RELAY_ROADMAP_2026_05_31.md`
- `docs\P2P_CONTROL_PLANE.md`
- `docs\RUNTIME_RELAY_FALLBACK_NEXT_STEPS_2026_06_01.md`
- `docs\MUSU_PRO_P2P_CONTROL_PLANE_SPEC_2026_05_31.md`
- `docs\MUSU_RUNTIME_STABILIZATION_EXECUTION_PLAN_2026_05_31.md`
- `docs\MSIX_DESKTOP_ENTRYPOINT_AUDIT_2026_05_31.md`
- `docs\DESKTOP_SINGLE_INSTANCE_RELEASE_GATE_2026_06_02.md`
- `docs\RUNTIME_CPU_SCENARIO_MATRIX_AND_MDNS_LOG_AUDIT_2026_06_01.md`
- `docs\LOCAL_API_AUTH_CONTRACT_AUDIT_2026_06_02.md`
- `docs\RELEASE_1_15_0_RC1_EXTERNAL_RECHECK_RECORDER_2026_06_03.md`
- `docs\RELEASE_1_15_0_RC1_FINAL_QUAL_AUDIT_NEXT_STEPS_2026_05_29.md`
- `docs\MICROSOFT_STORE_RELEASE_RUN_CARD_2026_05_29.md`
- `docs\RELEASE_OPERATOR_HANDOFF_CARD_2026_05_29.md`

To print the current packet-specific support verification id, second-PC kit
name, and recording commands, run from the real MUSU release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-operator-handoff-card.ps1
```

After the second PC returns `.local-build\second-pc-return\*.zip`, run this
from the real MUSU release repo root to import it, verify the MSIX install
evidence, and print the exact `smoke-multidevice-beta.ps1` command from the
returned `suggested_remote_addrs`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\import-second-pc-return.ps1 -ReturnZipPath .local-build\second-pc-return\<RETURN_ZIP> -RequireReleaseGateEvidence -Json
```

Preview-only fallback if you do not want to import or record yet:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-second-pc-return-card.ps1 -ReturnZipPath .local-build\second-pc-return\<RETURN_ZIP> -Json
```

The fallback prints the returned `suggested_remote_addrs` candidates without
copying evidence into the canonical release roots.

Remaining blockers:

1. Store/MSIX desktop entrypoint proof: Start-menu activation must launch `musu-desktop.exe`, not only the runtime CLI
2. clean/current MSIX install evidence from the second Windows PC
3. real second-PC multi-device evidence
4. runtime idle CPU evidence from the primary and second Windows PC
5. runtime CPU scenario matrix evidence from the primary and second Windows PC
6. process ownership evidence from a live MUSU runtime
7. startup single-instance evidence from repeated `musu up` calls
8. packaged desktop single-instance evidence from repeated Start-menu/AppsFolder activations
9. real __SUPPORT_EMAIL__ inbox delivery evidence
10. Partner Center product name reservation, app submission, Microsoft certification, and restricted startup capability approval evidence

The multi-device kit includes `collect-second-pc-handoff.ps1`; run it on the
second PC after install to generate `.local-build\second-pc-handoff\*.handoff.json`
with candidate `RemoteAddr` values for the primary PC.

Before handoff, or after each returned evidence file, run this status command
from the real MUSU release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-external-release-gate-recheck.ps1 -Json
```

This writes a repeatable `docs\evidence\external-gates\__VERSION__\*.evidence.json`
snapshot covering final go/no-go, second-PC reachability, `musu.pro` P2P env
status, and live P2P control-plane evidence. It records blocker state without
marking the release ready until all external gates actually pass.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-final-release-handoff-status.ps1
```

Before copying files to the operator/second-PC path, generate and verify the
operator action pack from a clean release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\prepare-operator-action-pack.ps1 -Json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-operator-action-pack.ps1 -PackPath .local-build\operator-action-pack\MUSU-__SAFE_VERSION__-operator-action-pack-latest.zip -Json
```

`show-final-release-handoff-status.ps1` reports action-pack existence and
verification status. The action pack is a copy/handoff convenience only; it does
not create or satisfy release evidence.

## Gate A - Support mailbox delivery

Send a real email to:

```text
__SUPPORT_EMAIL__
```

Recommended subject:

```text
MUSU Store support verification __VERSION__ __SUPPORT_VERIFICATION_ID__
```

Keep the verification id in the message subject or body. The recorder requires
an explicit MUSU verification token so post-hoc support evidence cannot be
created with a generated id.

After the message is visible in the actual support inbox, open PowerShell in the real MUSU release repo root and fill the placeholders:

```powershell
__SUPPORT_COMMAND__
```

Then run this from the real MUSU release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json
```

Expected result: `support_mailbox_verified=true`.

## Gate B - Second-PC MSIX install and runtime CPU evidence

Use the multi-device kit in `kits\` if this packet includes one. Copy it to the
second Windows PC, unzip it, and follow its README. Preferred path inside the
unzipped kit:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1
```

If certificate trust fails, rerun from elevated PowerShell with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1 -MachineTrust
```

Manual fallback after `install-and-verify-msix.ps1` succeeds:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\capture-msix-install-evidence.ps1
```

Return the generated `.local-build\second-pc-return\*.zip` to the real MUSU
release repo. Import it from the release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\import-second-pc-return.ps1 `
  -ReturnZipPath .local-build\second-pc-return\<RETURN_ZIP> `
  -RecordMsixInstall `
  -RequireReleaseGateEvidence `
  -Json
```

If you need the raw files, the wrapper also writes
`.local-build\msix-install\*.evidence.json`,
`.local-build\runtime-idle-cpu\*.evidence.json`,
`.local-build\second-pc-handoff\*.handoff.json`, and
`.local-build\second-pc-release-check\*.release-check.json`. Record install
evidence from the release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-msix-install-evidence.ps1 -EvidencePath .local-build\msix-install\<INSTALL_EVIDENCE_JSON>
```

Expected result: `msix_install_verified=true`, and if the primary CPU sample is
already present, `runtime_idle_cpu_verified=true`.

## Gate C - Second-PC multi-device test

Use the multi-device kit in `kits\` if this packet includes one. Copy it to the second Windows PC, unzip it, and follow its README.

When the second-PC smoke creates `.local-build\multi-device\*.evidence.json`, return that file to the real MUSU release repo and record it from the release repo root:

The evidence must include `musu.route_evidence.v1` and prove route kind,
handshake timing, peer identity verification with method/key material,
release-grade `quic_tls_1_3` encryption, and whether payload transited MUSU
infrastructure. It must also include `transport_verified_by=musu_quic_tls_transport`;
an encryption string alone is not proof. Legacy manual HTTP bearer routes and
HTTPS fingerprint-pinned bridge evidence can be useful debugging evidence but do
not satisfy the public release gate.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-multidevice-evidence.ps1 -EvidencePath .local-build\multi-device\<EVIDENCE_JSON>
```

Expected result: `multi_device_verified=true`.

## Gate D - Store release approval evidence

After Partner Center product name reservation, app submission, Microsoft package
certification, and restricted startup capability approval complete, record those
values with the final command below.
Before upload, verify the prepared Store submission bundle from the real MUSU
release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-submission-bundle.ps1
```

That verifier includes the MSIX desktop entrypoint audit. If you need to run the
entrypoint audit directly against the installed Store/MSIX package, use:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-msix-desktop-entrypoint.ps1 -StartupContract store-reviewed-immediate-registration -RequireInstalledPackage -Json
```

If you need to record Store approval separately before the final command, run
this from the real MUSU release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-store-release-verification.ps1 `
  -ProductName "MUSU" `
  -ProductNameReservedAt "<partner-center-name-reserved-at>" `
  -SubmissionId "<partner-center-submission-id>" `
  -CertificationStatus "approved" `
  -RestrictedCapabilityStatus "approved" `
  -RecordedBy "<operator-name>" `
  -Notes "Microsoft Store certification and restricted capability review approved" `
  -Json
```

Expected result: `store_release_verified=true`.

## Gate D1 - Local API auth contract audit

Before final handoff, verify that the Rust bridge source and current operator
docs agree on the local API auth contract. Localhost requests require the same
bearer token by default; `MUSU_BRIDGE_LOCALHOST_AUTH=0` is only an explicit
trusted local development bypass.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-local-api-auth-contract.ps1 -FailOnProblem -Json
```

Expected schema: `musu.local_api_auth_contract.v1`.
Expected result: `local_api_auth_contract_verified=true`.

## Gate D2 - Operator API security contract audit

Before final handoff, verify that web-driven local control routes require an
authenticated operator, command allowlists, explicit process-kill enablement,
remote worker proxy opt-in, and audit logging. This is the security boundary
for using `musu.pro` as a remote input/control plane while execution remains on
the local MUSU program.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-operator-api-security-contract.ps1 -FailOnProblem -Json
```

Expected schema: `musu.operator_api_security_contract.v1`.
Expected result: `operator_api_security_contract_verified=true`.

## Gate D3 - Secret storage contract audit

Before final handoff, verify that bridge/account tokens are written only under
the operator MUSU home, token files are permission-restricted, P2P setup helpers
do not print raw secret values, runtime evidence redacts token-like command
lines, and production docs do not place token-bearing files in ordinary config
backups.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-secret-storage-contract.ps1 -FailOnProblem -Json
```

Expected schema: `musu.secret_storage_contract.v1`.
Expected result: `secret_storage_contract_verified=true`.

## Gate D4 - Frontend polling contract audit

Before final handoff, verify that dashboard, node-panel, onboarding, workflow,
screen, relay, and SSE refresh paths still use the shared cancellable low-duty
polling/backoff contracts instead of direct interval or visibility polling.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-frontend-polling-contract.ps1 -FailOnProblem -Json
```

Expected schema: `musu.frontend_polling_contract.v1`.
Expected result: `frontend_polling_contract_verified=true`.

## Gate D5 - Rust background loop contract audit

Before final handoff, verify that bridge/runtime background loops still keep the
default desktop path low-duty: planner, clipboard, and mDNS are opt-in; cloud
registration, file sync, mDNS browse, and auto-update health polling are
sleep/backoff/timeout bounded.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-rust-background-loop-contract.ps1 -FailOnProblem -Json
```

Expected schema: `musu.rust_background_loop_contract.v1`.
Expected result: `rust_background_loop_contract_verified=true`.

## Gate E - Runtime idle CPU evidence

Run the idle CPU sample on the primary PC and, if the second-PC wrapper was run
with `-SkipRuntimeIdleCpu` or failed before CPU capture, on the second PC with
MUSU installed, the desktop app opened, and the runtime started:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 60 -Scenario desktop-open -RequireOwnedWebView2 -MaxOneCorePercent 5 -MaxOwnedProcessCount 16 -MaxOwnedWebView2ProcessCount 8 -MaxTotalWorkingSetMb 1024 -IncludeNode -IncludeWebView2 -FailOnHot -Json
```

Keep MUSU open and idle during the sample. Close unrelated Node.js and
WebView2-based apps before measuring, because this gate includes Node.js and
the Tauri/WebView2 desktop process family in the CPU budget. The evidence also
records owned process count, owned WebView2 process count, total working set,
private memory total, and memory totals by role.

Bring both generated `.local-build\runtime-idle-cpu\*.json` files back under the
real MUSU release repo's `.local-build\runtime-idle-cpu\` folder or commit them
under `docs\evidence\runtime-idle-cpu\__VERSION__\`.

Expected result: `runtime_idle_cpu_verified=true`.

For hot-state attribution, the second-PC wrapper also returns a diagnostic
runtime CPU scenario matrix. If you need to rerun it manually, use:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route -SampleSeconds 60 -OpenDesktopApp -RunRouteProbe -Json
```

This writes `musu.runtime_cpu_scenario_matrix.v1` under
`.local-build\runtime-cpu-scenarios\`. It still does not replace the
two-machine `desktop-open` release CPU gate, but final go/no-go also requires a
verified 60s matrix on two machines so startup-open, runtime-started,
dashboard-open, desktop-open, and post-route busy-loop regressions are
separately attributed.
Each matrix scenario measurement must include `cpu_attribution` with
`musu.runtime_idle_cpu_attribution.v1` and `top_processes`, so the operator can
tie any hot state to specific MUSU, Node.js, or WebView2 PIDs.

## Gate F - Process ownership evidence

Run this from the real MUSU release repo root while MUSU is open and the runtime
is started:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-musu-process-ownership.ps1 -FailOnProblem -Json
```

This checks that there is one active MUSU runtime, counts Node.js/WebView2 only
when those helpers are descendants of MUSU, rejects repo-owned orphan helpers,
verifies the bridge registry PID plus `/health`, and requires the live runtime
to be the installed packaged WindowsApps runtime rather than a workspace/debug
build. Use `-AllowDeveloperRuntime` only for diagnostic developer runs, never
for public release evidence.

Expected result: `process_ownership_verified=true`.

If Task Manager shows many `node.exe` or WebView2 helpers, run this companion
summary before treating them as MUSU-owned:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-musu-process-attribution.ps1
```

It reports machine-wide helper counts, MUSU-owned helper counts, unowned helper
counts, and top CPU/working-set processes. The release blocker is the
MUSU-owned process set, not unrelated machine-wide Node.js tooling.

## Gate G - Startup single-instance evidence

Run this from the real MUSU release repo root while the installed MUSU package
is available. By default the audit uses the WindowsApps `musu.exe` app execution
alias; pass `-MusuExe` only when intentionally pointing at an installed package
path.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-musu-startup-single-instance.ps1 -RepeatCount 3 -FailOnProblem -Json
```

This calls `musu up --json` repeatedly and verifies that repeated startup
reuses one bridge PID, does not spawn another runtime after the first call, and
still passes the nested process ownership audit. Non-packaged workspace/debug
commands are rejected unless `-AllowDeveloperRuntime` is explicitly supplied
for a non-release diagnostic run.

Expected result: `startup_single_instance_verified=true`.

## Gate H - Packaged desktop single-instance evidence

Run this from the real MUSU release repo root after the current MSIX package is
installed:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-musu-desktop-single-instance.ps1 -RequireInstalledPackage -RepeatCount 3 -FailOnProblem -Json
```

This launches the installed packaged desktop app through
`shell:AppsFolder\<AppUserModelId>` three times and verifies that repeated
Start-menu activation leaves at most one `musu-desktop.exe` Tauri shell.

Expected result: `desktop_single_instance_verified=true`.

## Gate I - Hosted P2P control-plane environment

After provisioning Vercel KV / Upstash Redis for `musu.pro`, set the production
storage env without printing secret values:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\configure-musu-pro-p2p-env.ps1 `
  -KvRestApiUrl "<KV_REST_API_URL>" `
  -KvRestApiToken "<KV_REST_API_TOKEN>" `
  -Deploy
```

This writes `KV_REST_API_URL` as a GitHub variable by default, writes
`KV_REST_API_TOKEN` as a GitHub secret, triggers the deploy workflow when
`-Deploy` is supplied, and then `show-musu-pro-p2p-env-status.ps1` can verify
that the live blocker is no longer `p2p_relay_lease_kv_not_configured`.

## Final command

After Gate A, Gate B, Gate C, Gate D, Gate E, Gate F, Gate G, and Gate H evidence exists, run from the real MUSU release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\complete-final-operator-gates.ps1 `
  -MsixInstallEvidencePath .local-build\msix-install\<INSTALL_EVIDENCE_JSON> `
  -MultiDeviceEvidencePath .local-build\multi-device\<EVIDENCE_JSON> `
  -SupportFromAddress "<sender@example.com>" `
  -SupportReceivedBy "<operator-name>" `
  -SupportVerificationId "__SUPPORT_VERIFICATION_ID__" `
  -SupportNotes "Verified delivery in __SUPPORT_EMAIL__ inbox" `
  -StoreProductName "MUSU" `
  -StoreProductNameReservedAt "<partner-center-name-reserved-at>" `
  -StoreSubmissionId "<partner-center-submission-id>" `
  -StoreCertificationStatus "approved" `
  -StoreRestrictedCapabilityStatus "approved" `
  -StoreRecordedBy "<operator-name>" `
  -StoreNotes "Microsoft Store certification and restricted capability review approved" `
  -FailOnNotReady `
  -Json
```

This records the MSIX install, multi-device, support mailbox, and Store release evidence, regenerates the release candidate manifest, and then runs the final go/no-go check.

The release can proceed only when:

- `ready_for_public_desktop_release=true`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `runtime_idle_cpu_verified=true`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- `multi_device_verified=true`
- `public_metadata_ok=true`
- `support_mailbox_verified=true`
- `store_release_verified=true`
- `manifest_git.dirty=false`
'@
$readme = $readme.Replace("__VERSION__", $Version).Replace("__SAFE_VERSION__", $safeVersion).Replace("__SUPPORT_EMAIL__", $SupportEmail).Replace("__SUPPORT_COMMAND__", $supportCommand).Replace("__SUPPORT_VERIFICATION_ID__", $supportVerificationId)
$readmePath = Join-Path $packetRoot "README_FINAL_OPERATOR_GATES.md"
$readme | Set-Content -LiteralPath $readmePath -Encoding UTF8

$supportTemplate = [pscustomobject]@{
    support_email = $SupportEmail
    subject = "MUSU Store support verification $Version"
    verification_id = $supportVerificationId
    record_command = $supportCommand
}
$supportTemplate | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $packetRoot "support-mailbox-record-template.json") -Encoding UTF8

$packetMetadata = [pscustomobject]@{
    schema = "musu.final_operator_gate_packet.v1"
    generated_at = (Get-Date).ToString("o")
    version = $Version
    support_email = $SupportEmail
    support_verification_id = $supportVerificationId
    git = [pscustomobject]@{
        branch = $gitBranch
        commit = $gitCommit
        dirty = $false
        status_short = ""
    }
}
$packetMetadata | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $packetRoot "packet-build-metadata.json") -Encoding UTF8

$checksumsPath = Join-Path $packetRoot "SHA256SUMS.txt"
Get-ChildItem -LiteralPath $packetRoot -Recurse -File |
    Where-Object { $_.FullName -ne $checksumsPath } |
    Sort-Object FullName |
    ForEach-Object {
        $relative = $_.FullName.Substring($packetRoot.Length + 1)
        $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName
        "{0}  {1}" -f $hash.Hash.ToLowerInvariant(), ($relative -replace "\\", "/")
    } | Set-Content -LiteralPath $checksumsPath -Encoding ASCII

$zipPath = "$packetRoot.zip"
Compress-Archive -Path (Join-Path $packetRoot "*") -DestinationPath $zipPath -Force
$latestZipPath = Join-Path (Resolve-Path -LiteralPath $OutputRoot).Path "musu-final-operator-gates-$safeVersion-latest.zip"
Copy-Item -LiteralPath $zipPath -Destination $latestZipPath -Force

$result = [pscustomobject]@{
    ok = $true
    version = $Version
    packet_root = (Resolve-Path -LiteralPath $packetRoot).Path
    zip_path = (Resolve-Path -LiteralPath $zipPath).Path
    latest_zip_path = (Resolve-Path -LiteralPath $latestZipPath).Path
    multi_device_kit = if ($copiedMultiDeviceKit) { (Resolve-Path -LiteralPath $copiedMultiDeviceKit).Path } else { $null }
    support_email = $SupportEmail
    support_verification_id = $supportVerificationId
    git_commit = $gitCommit
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    $result
}
