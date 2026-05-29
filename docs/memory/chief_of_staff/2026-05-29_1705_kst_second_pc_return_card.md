# 2026-05-29 17:05 KST: second-PC return card

Context:

- The final packet already ships a second-PC kit and `collect-second-pc-handoff.ps1`, but the primary-side step after receiving `.handoff.json` still required manual selection of `suggested_remote_addrs`.

Change:

- Added `scripts/windows/show-second-pc-return-card.ps1`.
- It reads the returned `.local-build/second-pc-handoff/*.handoff.json`, validates schema/version/ok, chooses a `host:port` `RemoteAddr` candidate, and prints primary-side commands for:
  - recording returned MSIX install evidence
  - running `smoke-multidevice-beta.ps1`
  - recording the resulting multi-device evidence
  - checking final handoff status
- Final operator packet generation and verification now include this helper, and `RELEASE_OPERATOR_HANDOFF_CARD_2026_05_29.md` points to it.

Release truth:

- This does not close the second-PC gate. It reduces operator friction once the user returns second-PC files.
