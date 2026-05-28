# MUSU 1.15.0-rc.1 Final Operator Gates - 2026-05-29

## Current Verdict

`1.15.0-rc.1` is **not public desktop release ready yet**.

This is not because the local runtime, desktop shell, CI, or public metadata are failing. Current `write-release-go-no-go.ps1` reports:

- `local_artifacts_ready=true`
- `public_metadata_ok=true`
- `ready_for_public_desktop_release=false`

Remaining blockers:

1. real second-PC multi-device evidence has not been recorded
2. `support@musu.pro` delivery has not been operator-verified

External manual gates still remain after those:

- Partner Center product name reservation
- Partner Center app submission
- Microsoft app certification
- Microsoft restricted capability review

## Final Operator Gate Packet

The remaining manual gates can now be packaged into a single handoff zip:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\prepare-final-operator-gate-packet.ps1 `
  -IncludeDesktopShell
```

Latest generated packet:

```text
.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260529-073523.zip
```

The packet includes:

- a fresh multi-device test kit under `kits\`
- support mailbox recording instructions and a prefilled verification id
- release gate docs
- evidence recorder/verifier scripts
- final packet verifier script
- `SHA256SUMS.txt`

Only the zip under `kits\` should be copied to the second Windows PC. Evidence recording and final go/no-go commands must be run from the real release repo root; the script copies inside the packet are reference copies, not a standalone repo.

The latest packet was verified with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-final-operator-gate-packet.ps1 `
  -PacketPath .local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260529-073523.zip `
  -Json
```

Result: `ok=true`, `fail_count=0`, `kit_count=1`.

This packet does not close the manual gates by itself. It exists so the operator can execute the two remaining external checks and return evidence without hunting across the repo.

## Fresh Single-Machine Evidence

Fresh smoke run on 2026-05-29 06:52 KST:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\smoke-single-machine-beta.ps1 `
  -DashboardBaseUrl http://127.0.0.1:3000 `
  -ExpectedDashboardOutput MUSU_RELEASE_SMOKE_OK_20260529_0652 `
  -ExpectedCliOutput MUSU_CLI_ROUTE_OK_20260529_0652
```

Observed result:

- `musu up --json`: passed
- `musu doctor --json`: passed
- dashboard APIs: passed
- dashboard task id: `b4b05b93-34d2-4946-b4cd-fdd5c5c6632d`
- bridge URL: `http://127.0.0.1:11041`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260529_0652`
- CLI route: passed with `MUSU_CLI_ROUTE_OK_20260529_0652`

This closes the assistant-side single-computer test for the current commit.

Machine-readable evidence was added on 2026-05-29 07:04 KST:

- evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260529-070403-HUGH_SECOND.evidence.json`
- verification: `docs\evidence\single-machine\1.15.0-rc.1\20260529-070403-HUGH_SECOND.verification.json`
- dashboard task id: `b772a958-ded9-4cb1-a180-98ca75c9b91f`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260529_0705`
- CLI route output: `MUSU_CLI_ROUTE_OK_20260529_0705`
- release audit now reports `single_machine_verified=true`

## Gate 1 - Support Mailbox Evidence

Send a real email to `support@musu.pro` from an external mailbox.

Recommended subject:

```text
MUSU Store support verification 1.15.0-rc.1
```

After confirming the message is visible in the actual support inbox, record evidence from the release repo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-support-mailbox-verification.ps1 `
  -FromAddress "<sender@example.com>" `
  -ReceivedBy "<operator-name>" `
  -VerificationId "musu-store-support-1.15.0-rc.1-20260529" `
  -Notes "Verified delivery in support@musu.pro inbox"
```

Then verify release status:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json
```

Expected change:

- `support_mailbox_verified=true`
- support-mailbox blocker removed

## Gate 2 - Second-PC Multi-Device Evidence

Use the current test kit:

```text
.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.1-20260529-063527.zip
```

On the second Windows machine:

1. unzip the kit
2. run the included MSIX install/verify script
3. run:

```powershell
musu up --json
musu doctor --json
musu status
```

Record:

- second PC bridge address and port
- second PC node name
- any firewall or WindowsApps alias warnings

On the primary release machine, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\smoke-multidevice-beta.ps1 `
  -RemoteAddr <SECOND_PC_IP_OR_TAILSCALE_IP>:<BRIDGE_PORT> `
  -RemoteName <SECOND_PC_NODE_NAME> `
  -RouteTarget <SECOND_PC_NODE_NAME>
```

If routing is not ready but status/peer registration must be checked first:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\smoke-multidevice-beta.ps1 `
  -RemoteAddr <SECOND_PC_IP_OR_TAILSCALE_IP>:<BRIDGE_PORT> `
  -RemoteName <SECOND_PC_NODE_NAME> `
  -SkipRoute
```

After the smoke writes evidence under `.local-build\multi-device\`, record it:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-multidevice-evidence.ps1 `
  -EvidencePath .local-build\multi-device\<EVIDENCE_JSON>
```

Expected change:

- `multi_device_verified=true`
- multi-device blocker removed

## Final Pre-Submission Command

After Gate 1 and Gate 2:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-candidate-manifest.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json
```

The release is ready to submit only when:

- `ready_for_public_desktop_release=true`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `multi_device_verified=true`
- `public_metadata_ok=true`
- `support_mailbox_verified=true`
- `manifest_git.dirty=false`
