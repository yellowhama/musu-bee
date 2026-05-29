# 2026-05-29 13:46 KST - Operator Handoff Card

Added a packet-aware handoff card for the remaining external release gates.

- New script: `scripts/windows/show-operator-handoff-card.ps1`.
- New doc: `docs/RELEASE_OPERATOR_HANDOFF_CARD_2026_05_29.md`.
- The script reads the latest final operator packet metadata/template and prints the current support email, support verification id, support subject, second-PC kit name, second-PC commands, primary recording commands, and return-file list.
- `prepare-final-operator-gate-packet.ps1` now includes the handoff card doc and script in final packets.
- `verify-final-operator-gate-packet.ps1` now requires the handoff card doc/script and checks that the packet README points to them.

Reason: final packet stamps and support verification ids change on regeneration, so operators should read current values from the packet instead of copying stale ids from older notes.
