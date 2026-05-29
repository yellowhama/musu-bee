# 2026-05-29 10:01 KST - Remove Support Mailbox Assumption Bypass

## Change

Removed `-AssumeSupportMailboxVerified` from
`scripts\windows\write-release-go-no-go.ps1`.

## Reason

The release gate is now evidence-backed. Allowing a CLI flag to mark
`support_mailbox_verified=true` without an evidence file made the final
go/no-go result weaker than the operator runbook and documentation.

## Current Rule

Support mailbox readiness is true only when a valid support mailbox evidence
JSON is found and verified by `verify-support-mailbox-evidence.ps1`.

Public desktop release remains No-Go until MSIX install, multi-device, support
mailbox, and Store release evidence are all recorded.
