# MUSU 1.15.0-rc.1 Final Operator Gates - 2026-05-29

## Current Verdict

`1.15.0-rc.1` is **not public desktop release ready yet**.

This is not because the local runtime, desktop shell, CI, or public metadata are failing. Current `write-release-go-no-go.ps1` reports:

- `local_artifacts_ready=true`
- `public_metadata_ok=true`
- `ready_for_public_desktop_release=false`

Remaining blockers:

1. clean/current Windows MSIX install evidence has not been recorded
2. real second-PC multi-device evidence has not been recorded
3. `musu@musu.pro` delivery has not been operator-verified
4. Store release approval evidence has not been recorded:
   - Partner Center product name reservation / app submission
   - Microsoft app certification
   - Microsoft restricted startup capability approval

## Final Operator Gate Packet

The remaining manual gates can now be packaged into a single handoff zip:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\prepare-final-operator-gate-packet.ps1 `
  -IncludeDesktopShell
```

Latest generated packet alias:

```text
.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip
```

The packet includes:

- a fresh multi-device test kit under `kits\`
- support mailbox recording instructions and a prefilled verification id
- release gate docs
- evidence recorder/verifier scripts
- MSIX install evidence capture/recorder/verifier scripts
- Store release approval recorder/verifier scripts
- final release handoff status script
- final packet verifier script
- final evidence completion script
- `SHA256SUMS.txt`

Only the zip under `kits\` should be copied to the second Windows PC. Evidence recording and final go/no-go commands must be run from the real release repo root; the script copies inside the packet are reference copies, not a standalone repo.

The latest packet was verified with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-final-operator-gate-packet.ps1 `
  -PacketPath .local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip `
  -Json
```

Result: `ok=true`, `fail_count=0`, `kit_count=1`.

The packet generator refuses to run from a dirty git worktree and writes `packet-build-metadata.json` with the source branch, commit, and clean git state. The packet verifier now explicitly checks that metadata, that the README names MSIX install and Store release approval as blockers, includes `record-msix-install-evidence.ps1`, `record-store-release-verification.ps1`, and `show-final-release-handoff-status.ps1`, and bundles the fail-closed dirty-git go/no-go rule plus MSIX install capture-check verification and multi-device evidence schema/version/timestamp/operator verification.

This packet does not close the manual gates by itself. It exists so the operator can execute the remaining external checks and return evidence without hunting across the repo.

For the shortest MUSU-specific operator sequence, use:

- `docs/MICROSOFT_STORE_RELEASE_RUN_CARD_2026_05_29.md`

## Handoff Status Command

Use this evidence-non-recording command before handoff and after each returned evidence file:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-final-release-handoff-status.ps1
```

It summarizes the current go/no-go flags, verifies the latest final operator packet, shows the evidence roots being searched, and prints the remaining operator commands. It may refresh local manifest/status artifacts, but it does not create or satisfy release evidence.

## Fresh Single-Machine Evidence

Fresh smoke run on 2026-05-29 18:59 KST:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\smoke-single-machine-beta.ps1 `
  -DashboardBaseUrl http://127.0.0.1:3000 `
  -ExpectedDashboardOutput MUSU_RELEASE_SMOKE_OK_20260529_185935 `
  -ExpectedCliOutput MUSU_CLI_ROUTE_OK_20260529_185935 `
  -CommandTimeoutSec 180 `
  -TaskTimeoutSec 180
```

Observed result:

- `musu up --json`: passed
- `musu doctor --json`: passed
- dashboard APIs: passed
- dashboard task id: `3cab5be8-1abf-40c0-91ad-3f5d2da33bcb`
- bridge URL: `http://127.0.0.1:9218`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260529_185935`
- CLI route: passed with `MUSU_CLI_ROUTE_OK_20260529_185935`

This closes the assistant-side single-computer test for the current code commit, with later documentation/evidence-only commits allowed by the verifier.

Current machine-readable evidence was added on 2026-05-29 18:59 KST after second-PC return-card changes and smoke harness process-capture hardening:

- evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260529-185958-HUGH_SECOND.evidence.json`
- verification: `docs\evidence\single-machine\1.15.0-rc.1\20260529-185958-HUGH_SECOND.verification.json`
- commit: `242d75f74e98d9cabac6152149de4021433d7a09`
- dashboard task id: `3cab5be8-1abf-40c0-91ad-3f5d2da33bcb`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260529_185935`
- CLI route output: `MUSU_CLI_ROUTE_OK_20260529_185935`
- release audit now reports `single_machine_verified=true`

## Gate 1 - Support Mailbox Evidence

Send a real email to `musu@musu.pro` from an external mailbox.

Recommended subject:

```text
MUSU Store support verification 1.15.0-rc.1 musu-store-support-1.15.0-rc.1-20260529
```

Keep the `musu-...` verification token in the message subject or body. The
recorder now requires an explicit token and the verifier checks the release
version, token shape, sender address shape, sender/support-mailbox distinction,
timestamp order, and evidence age.

After confirming the message is visible in the actual support inbox, record evidence from the release repo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-support-mailbox-verification.ps1 `
  -FromAddress "<sender@example.com>" `
  -ReceivedBy "<operator-name>" `
  -VerificationId "musu-store-support-1.15.0-rc.1-20260529" `
  -Notes "Verified delivery in musu@musu.pro inbox"
```

Then verify release status:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json
```

Expected change:

- `support_mailbox_verified=true`
- support-mailbox blocker removed

## Gate 2 - Second-PC MSIX Install Evidence

Use the multi-device kit inside the latest final operator packet, or the newest standalone test kit matching:

```text
.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.1-*.zip
```

On the second Windows machine:

1. unzip the kit
2. run the included MSIX install/verify script
3. capture install evidence:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\capture-msix-install-evidence.ps1
```

Return the generated `.local-build\msix-install\*.evidence.json` file to the release repo and record it:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-msix-install-evidence.ps1 `
  -EvidencePath .local-build\msix-install\<INSTALL_EVIDENCE_JSON>
```

Expected change:

- `msix_install_verified=true`
- msix-install blocker removed

The MSIX install verifier now requires current-version evidence, operator
machine/user metadata, non-future `recorded_at`, installed/artifact version
match, and the expected capture checks from `capture-msix-install-evidence.ps1`.
Evidence with only top-level booleans and no capture check log is rejected.

## Gate 3 - Second-PC Multi-Device Evidence

On the second Windows machine, after MSIX install evidence is captured, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\collect-second-pc-handoff.ps1
```

Record:

- second PC handoff JSON from `.local-build\second-pc-handoff\*.handoff.json`
- one `suggested_remote_addrs` value from the handoff JSON
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

The multi-device verifier now defaults to the repo `VERSION`, requires
operator machine/user metadata, and requires `remote_addr` to include a port
(`host:port`) so stale or underspecified peer evidence is rejected.

## Gate 4 - Store Release Approval Evidence

After Partner Center product name reservation, app submission, Microsoft package
certification, and restricted startup capability approval complete, record the
approval result:

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

Expected change:

- `store_release_verified=true`
- store-release blocker removed

The Store evidence JSON records `product_name_reserved=true` and
`product_name_reserved_at`, and the final completion runner now requires the
reservation timestamp. The direct Store recorder also rejects an omitted
reservation timestamp instead of silently substituting the later submission
timestamp. This keeps the Partner Center identity step auditable and not only
implied by a submission id.

## Final Release Command

After Gate 1, Gate 2, Gate 3, and Gate 4 evidence exists, the preferred final command is the single completion runner:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\complete-final-operator-gates.ps1 `
  -MsixInstallEvidencePath .local-build\msix-install\<INSTALL_EVIDENCE_JSON> `
  -MultiDeviceEvidencePath .local-build\multi-device\<EVIDENCE_JSON> `
  -SupportFromAddress "<sender@example.com>" `
  -SupportReceivedBy "<operator-name>" `
  -SupportVerificationId "<support-verification-id>" `
  -SupportNotes "Verified delivery in musu@musu.pro inbox" `
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

The runner records MSIX install, multi-device, support mailbox, and Store release evidence,
regenerates the release candidate manifest, and then runs the final go/no-go
check. `-FailOnNotReady` makes this command exit non-zero if any release blocker
remains. If evidence has already been recorded separately, it is also valid to
run `write-release-candidate-manifest.ps1` and
`write-release-go-no-go.ps1 -FailOnNotReady -Json` directly.

The release is ready for public desktop release only when:

- `ready_for_public_desktop_release=true`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `multi_device_verified=true`
- `public_metadata_ok=true`
- `support_mailbox_verified=true`
- `store_release_verified=true`
- `manifest_git.dirty=false`
