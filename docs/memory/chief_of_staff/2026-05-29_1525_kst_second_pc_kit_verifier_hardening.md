# CoS Memory Note - Second-PC Kit Verifier Hardening

**Date**: 2026-05-29 15:25 KST
**Scope**: final operator packet verification for the second-PC handoff kit.

Durable memory:

- `verify-final-operator-gate-packet.ps1` now checks that each bundled multi-device kit contains the files needed for the user's second-PC install/test path, not only the handoff collector.
- Required kit entries now include the local-sideload MSIX, public signing cert, `VERSION`, `SHA256SUMS.txt`, `install-and-verify-msix.ps1`, `capture-msix-install-evidence.ps1`, `collect-second-pc-handoff.ps1`, `smoke-multidevice-beta.ps1`, MSIX evidence verifier/recorder, and multi-device evidence verifier/recorder.
- The packet verifier also checks that the kit README explains MSIX install evidence capture and multi-device smoke evidence capture.
- This does not close the second-PC gate; it makes stale or incomplete handoff kits fail before the user copies them to the second PC.

