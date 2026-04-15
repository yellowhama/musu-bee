# Paddle Sandbox Credential Injection — Runbook (No Secrets)
Date: 2026-04-10 (KST)
Owner: CEO
Linked issues: MUS-1140 (board-input evidence), MUS-1307 (API key registration), MUS-1353 (webhook/env alignment), MUS-1689 (client token evidence)

## Goal
Provide admissible, non-secret proof that Paddle sandbox credentials are present and correctly injected to the integration/runtime environment.

## Variables (canonical proof rows)
- PADDLE_API_KEY
- PADDLE_WEBHOOK_SECRET
- NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
- NEXT_PUBLIC_PADDLE_ENV=sandbox

## Storage Locations (no plain text in repo)
- Primary: /mnt/f/Aisaak/Projects/yellow.txt (local secured file; redacted presence only)
- Optional: Vercel project env (musu.pro) — Preview/Production
- Optional: Supabase secret store (project: poyclapxmvulvboiebxq) — if used server-side

## Procedure
1) Acquire sandbox credentials from Paddle dashboard (manual, browser).
2) Store to primary location (no repo check-in):
   - Edit /mnt/f/Aisaak/Projects/yellow.txt and add the four variables above.
   - Save; do not commit to Git.
3) Redacted presence proof (post to MUS-1140):
   - Command: `grep -E "^(PADDLE_API_KEY|PADDLE_WEBHOOK_SECRET|NEXT_PUBLIC_PADDLE_CLIENT_TOKEN|NEXT_PUBLIC_PADDLE_ENV)" -n /mnt/f/Aisaak/Projects/yellow.txt | sed 's/=.*$/=[redacted]/'`
   - Command: `sha256sum /mnt/f/Aisaak/Projects/yellow.txt`
   - Include file stat (size, mtime) only.
4) Injection to integration runtime (choose one):
   - Vercel: set env vars for `musu.pro` project → Redeploy preview; post deployment URL.
   - Supabase Edge/Function: configure secret store/environment and redeploy function; post function logs.
   - Local dev (musu-portd): export vars in service manager or `.env` for the service (never commit values).
5) Verification (post to MUS-1140):
   - Local: `env | grep -E "^(PADDLE_API_KEY|PADDLE_WEBHOOK_SECRET|NEXT_PUBLIC_PADDLE_CLIENT_TOKEN|NEXT_PUBLIC_PADDLE_ENV)" | sed 's/=.*$/=[redacted]/'`
   - Service: start process with `printenv` capture; redact values before posting.
   - Optional: Signed test call to Paddle sandbox with redacted request/response headers (no secret material).

## Acceptance Criteria (MUS-1140)
- A1: Redacted presence proof posted for all four canonical rows (file stat + sha256 included).
- A2: Target environment shows all four variables present (redacted) with proof commands.
- A3: Webhook target + `NEXT_PUBLIC_PADDLE_ENV=sandbox` alignment evidence is attached.

## Follow-on
- MUS-1307 owns secure API key registration evidence.
- MUS-1353 owns webhook target/environment alignment.
- MUS-1689 owns client token evidence row.
- CoS closes MUS-1640 then MUS-1641 for final HANDOFF GO|NO-GO.
