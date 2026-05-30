# MUSU Release Operator Handoff Card - 2026-05-29

This is the shortest current handoff for the remaining external release gates.

Do not hand-copy packet timestamps or support verification ids from older notes.
Generate the current values from the latest packet:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-operator-handoff-card.ps1
```

Machine-readable form:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-operator-handoff-card.ps1 -Json
```

## Current Proven State

- Local artifacts ready.
- Desktop shell ready.
- Single-machine smoke verified for current release line.
- Public `/privacy` and `/support` metadata verifies with `musu@musu.pro`.
- Final operator packet verifies with `ok=true`, `fail_count=0`, `kit_count=1`.

Public desktop release is still No-Go until these external evidence gates are recorded:

1. second-PC clean/current MSIX install evidence
2. real second-PC multi-device evidence
3. real `musu@musu.pro` inbox delivery evidence
4. Partner Center product-name reservation, app submission, Microsoft certification, and restricted capability approval evidence

## Second PC

Use the latest packet alias:

```text
.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip
```

Extract it, then copy only the zip under `kits\` to the second Windows PC.
On the second PC, unzip the kit and run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1
```

Manual fallback:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\install-and-verify-msix.ps1 -StartupContract local-sideload-manual -ReplaceExisting
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\capture-msix-install-evidence.ps1 -StartupContract local-sideload-manual
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\collect-second-pc-handoff.ps1
```

Return the generated return archive to the primary release repo:

- `.local-build\second-pc-return\*.zip`

The wrapper also writes these raw files, which can be returned directly if the
archive is unavailable:

- `.local-build\msix-install\*.evidence.json`
- `.local-build\second-pc-handoff\*.handoff.json`
- `.local-build\second-pc-release-check\*.release-check.json`

After returning the files, generate the exact primary-side commands from the
return archive:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-second-pc-return-card.ps1 -ReturnZipPath .local-build\second-pc-return\<RETURN_ZIP>
```

On the primary release machine, record the install evidence:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-msix-install-evidence.ps1 -EvidencePath .local-build\msix-install\<INSTALL_EVIDENCE_JSON> -Json
```

Use one `suggested_remote_addrs` value from the returned handoff JSON, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\smoke-multidevice-beta.ps1 -RemoteAddr <SECOND_PC_IP_OR_TAILSCALE_IP>:<BRIDGE_PORT> -RemoteName <SECOND_PC_NODE_NAME> -RouteTarget <SECOND_PC_NODE_NAME>
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-multidevice-evidence.ps1 -EvidencePath .local-build\multi-device\<EVIDENCE_JSON> -Json
```

## Support Inbox

Use the subject and verification id printed by `show-operator-handoff-card.ps1`.
Send a real external email to `musu@musu.pro`, confirm that it appears in the actual inbox, then run the printed `record_support` command.

DNS/MX existence is not enough for this gate. The evidence must represent observed inbox delivery.

## Store Evidence

After Partner Center product-name reservation, app submission, Microsoft certification, and restricted capability approval complete, run the printed `record_store_release` command with the real timestamps and submission id.

Final readiness is true only when:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -FailOnNotReady -Json
```

exits successfully and reports `ready_for_public_desktop_release=true`.
