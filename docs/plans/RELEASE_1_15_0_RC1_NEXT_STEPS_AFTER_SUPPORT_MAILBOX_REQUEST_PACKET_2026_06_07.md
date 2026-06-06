# MUSU 1.15.0-rc.1 Next Steps After Support Mailbox Request Packet

**Generated**: 2026-06-07 04:06 KST
**Related report**:
`docs\RELEASE_1_15_0_RC1_SUPPORT_MAILBOX_REQUEST_PACKET_2026_06_07.md`

## Current Position

Support mailbox verification is now actionable without generating a full final
operator packet. The request packet is not release evidence.

## Execution Order

1. Generate a fresh request packet:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\prepare-support-mailbox-verification-request.ps1 -Json
```

If an operator handoff zip is used instead of the standalone support request
packet, regenerate the final operator packet first so it includes the current
support request script and placeholder-sender safeguards.

2. Send `SUPPORT_MAILBOX_VERIFICATION_EMAIL.txt` to `musu@musu.pro` from an
   external sender.
3. Confirm the message is visible in the actual support inbox.
4. Run the generated `record-support-mailbox-verification.ps1` command from
   the real release repo root.
5. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json
```

6. Confirm `support_mailbox_verified=true`.
7. Continue the remaining release gates: second-PC route/CPU/matrix, hosted
   MUSU.PRO P2P/relay proof, and Store/Partner Center evidence.

## Acceptance Criteria

- Support evidence exists under
  `docs\evidence\support-mailbox\1.15.0-rc.1\`.
- The support evidence schema verifies through
  `verify-support-mailbox-evidence.ps1`.
- The evidence uses the same explicit `musu-...` verification token from the
  delivered message.
- Go/no-go no longer includes the `support-mailbox` blocker.

## Non-Goals

- Do not treat request packets in `.local-build` as release evidence.
- Do not generate fake support delivery evidence.
- Do not close P2P, second-PC, or Store gates with support mailbox evidence.
