# MUS-1296 Evidence Bundle (Redacted)

Generated: 2026-04-10 (KST)
Issue: MUS-1296 — Collect Paddle sandbox credential injection evidence (redacted)

## Bundle contents

- `source_metadata.txt`: source-of-truth file existence + stat
- `source_hash_and_stat.txt`: sha256 + stat (no secret values)
- `redacted_env_matches.txt`: redacted `PADDLE_*` / `NEXT_PUBLIC_PADDLE_*` lines from source-of-truth file
- `required_vars_presence.txt`: required var presence check
- `code_path_evidence.txt`: where env vars are consumed + webhook signature verification path
- `build_placeholder_transcript.txt`: `npm run build` log with placeholder env vars set and redacted
- `build_placeholder_status.txt`: build exit code
- `webhook_replay_transcript.txt`: webhook replay test transcript
- `webhook_replay_status.txt`: webhook test exit code
- `checkout_route_transcript.txt`: checkout route test transcript
- `checkout_route_status.txt`: checkout route test exit code
- `pricing_checkout_playwright_transcript.txt`: user-facing pricing checkout Playwright transcript
- `pricing_checkout_playwright_status.txt`: Playwright exit code

## Acceptance mapping

1. Show where tokens are set/used (without secrets)
- See `code_path_evidence.txt`.
- Key refs include:
  - `musu-bee/src/lib/paddle.ts` (`PADDLE_API_KEY`, `NEXT_PUBLIC_PADDLE_ENV`)
  - `musu-bee/src/app/api/webhooks/paddle/handler.ts` (`PADDLE_WEBHOOK_SECRET`, signature verification)
  - `musu-bee/src/components/CheckoutButton.tsx` (`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`)

2. Build logs confirming placeholder
- See `build_placeholder_transcript.txt` and `build_placeholder_status.txt`.
- Build run was executed with explicit placeholder values and exited `0`.

3. Webhook replay transcript with signature verification enabled
- See `webhook_replay_transcript.txt` and `webhook_replay_status.txt`.
- Replay tests passed and include invalid-signature + dedupe paths.

4. QA integration surface verification (pricing checkout)
- See `pricing_checkout_playwright_transcript.txt` and `pricing_checkout_playwright_status.txt`.
- Playwright run exited `0` (`2 passed`) on `e2e/pricing-checkout.spec.ts`.

## Blocker status (source-of-truth secret file)

From `required_vars_presence.txt` against `/mnt/f/Aisaak/Projects/yellow.txt`:

- `PADDLE_API_KEY=missing`
- `PADDLE_WEBHOOK_SECRET=missing`
- `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=missing`
- `NEXT_PUBLIC_PADDLE_ENV=missing`

This packet cannot claim real credential injection proof until these variables are actually present in the source-of-truth secret file.

Unblock requirement:
- `[TBD: awaiting real data]` owner must inject the 4 required Paddle vars into `/mnt/f/Aisaak/Projects/yellow.txt` (no plaintext in issue comments), then rerun the redacted presence commands in this bundle.
