# MSIX and multi-device evidence hardening

Date: 2026-05-29 11:25 KST

## Decision

Second-PC install and route evidence must prove the captured workflow, not only
top-level booleans in a JSON file.

## Changes

- `verify-msix-install-evidence.ps1` now defaults `-ExpectedVersion` to the repo
  `VERSION`.
- MSIX install evidence now requires operator machine/user metadata,
  non-future `recorded_at`, installed/artifact version match, and required
  passing capture checks from `capture-msix-install-evidence.ps1`.
- MSIX evidence with missing `checks` is rejected even if top-level fields are
  filled with passing values.
- `verify-multidevice-evidence.ps1` now defaults `-ExpectedVersion` to the repo
  `VERSION`.
- Multi-device evidence now requires operator user metadata and a `remote_addr`
  shaped as `host:port`.
- Final packet verification now rejects stale packets whose bundled MSIX or
  multi-device verifiers lack these guards.

## Verification

- PowerShell parser checks passed for the edited verifier scripts.
- Synthetic MSIX evidence with the required capture checks passed.
- Synthetic MSIX evidence without capture checks failed.
- Synthetic multi-device evidence with `host:port` passed.
- Synthetic multi-device evidence without a port failed.
- `record-msix-install-evidence.ps1` and `record-multidevice-evidence.ps1`
  also accepted the positive synthetic evidence only under `.local-build`
  hardening smoke roots.
- The previously generated final operator packet now fails verification as
  stale, as expected, until regenerated from a clean commit.

## Release state

The public desktop release remains No-Go until real second-PC MSIX install
evidence, real second-PC multi-device evidence, real support mailbox evidence,
and real Partner Center/Microsoft Store approval evidence are recorded.
