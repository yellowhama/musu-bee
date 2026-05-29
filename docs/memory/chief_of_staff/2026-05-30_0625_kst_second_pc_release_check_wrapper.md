# CoS Memory - Second-PC Release Check Wrapper

Date: 2026-05-30 06:25 KST

Durable facts:

- Added `scripts\windows\run-second-pc-release-check.ps1`.
- The wrapper is intended to run from the extracted second-PC multi-device kit.
- It runs sideload readiness, `install-and-verify-msix.ps1`, `capture-msix-install-evidence.ps1`, and `collect-second-pc-handoff.ps1`.
- It writes `.local-build\second-pc-release-check\*.release-check.json` and prints return files:
  - `.local-build\msix-install\*.evidence.json`
  - `.local-build\second-pc-handoff\*.handoff.json`
  - `.local-build\second-pc-release-check\*.release-check.json`
- `prepare-multidevice-test-kit.ps1` includes the wrapper in future kits.
- `verify-final-operator-gate-packet.ps1` now requires the wrapper inside the bundled kit and requires the kit README to mention it.
- This reduces second-PC operator sequencing risk but does not close the release gates until real second-PC evidence is returned and recorded.
