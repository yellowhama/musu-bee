# CoS Memory Note - Support Mailbox Evidence Gate (2026-05-29 06:35 KST)

Facts:

- `musu@musu.pro` is still an internal No-Go item until delivery is operator-verified.
- `scripts/windows/record-support-mailbox-verification.ps1` now records operator-verified delivery evidence under `docs/evidence/support-mailbox/<version>/`.
- `scripts/windows/verify-support-mailbox-evidence.ps1` validates schema, support email, verification ID, sender, receiver, timestamps, delivery order, and age.
- `scripts/windows/write-release-go-no-go.ps1` now auto-detects valid `*.evidence.json` under `docs/evidence/support-mailbox/<version>/` or `.local-build/support-mailbox/`.
- The old `-AssumeSupportMailboxVerified` override has been removed; the release path is evidence-backed verification only.
- `Resolve-DnsName -Type MX musu.pro` returns `smtp.google.com`, so DNS routing exists but delivery still needs an inbox receipt.

Verification:

- Temporary test evidence recorded under `.local-build/support-mailbox-script-test` verified successfully.
- Temporary auto-scan evidence under `.local-build/support-mailbox` was detected by go/no-go after the scanner was fixed to ignore `*.verification.json` sidecars.
- Temporary support mailbox test evidence was deleted after the scanner test.
- Final go/no-go still reports `support_mailbox_verified=false` because no real operator delivery evidence has been recorded.

Decision:

- Before Partner Center submission, send a real test email to `musu@musu.pro`, confirm it lands in the support inbox, then run `record-support-mailbox-verification.ps1` with the real sender, recipient/operator, and verification ID.
