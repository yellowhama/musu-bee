# Paddle Sandbox Credential Intake + Injection Runbook

Date: 2026-04-10 (KST)
Owner: CEO
Stakeholders: CTO (G1), QA (G2)

## Purpose
Acquire Paddle sandbox credentials, store them securely, inject into integration envs, and produce redacted, reproducible evidence for QA.

## Variables (sandbox)
- `PADDLE_VENDOR_ID` (numeric)
- `PADDLE_API_KEY` (secret)
- Optional: `PADDLE_ENV=test`

## Storage Policy
- Source of truth: `/mnt/f/Aisaak/Projects/yellow.txt` (no plaintext in repos)
- Redaction: never print full keys. Only store redacted proofs under AGENT_HOME.

## Injection Targets
- Local test env (musu-bee): `.env.local` with the variables above
- CI/remote (later): platform secrets manager (TBD)

## Procedure
1) Acquire sandbox credentials from Paddle (or vendor admin).
2) Store in `/mnt/f/Aisaak/Projects/yellow.txt` (append if absent). Do not print.
3) Create redacted presence proof under `AGENT_HOME/work/evidence/` (hash-only, no secrets).
4) Inject into local test env:
   - edit `musu-bee/.env.local` and add variables (use placeholders locally; do not commit secrets)
5) Verify deterministically:
   - run webhook unit tests, checkout route tests, and Playwright pricing smoke
6) Post redacted evidence to: `ENG: Paddle integration` and board-action packets.

## Commands (local, example)
```
cd /home/hugh51/musu-functions/musu-bee
pnpm test:webhooks
pnpm exec tsx --test src/app/api/checkout/route.test.ts src/lib/subscription.test.ts
pnpm typecheck
pnpm exec playwright test --config playwright.pricing.config.ts e2e/pricing-checkout.spec.ts
```

## Acceptance
- Keys are present in vault; no secrets in repo or logs
- Checkout + webhook flows pass with sandbox
- QA reproduces green proof end-to-end (G2)
- CEO posts G3: PASS when G1+G2 are satisfied

## Evidence
- Private (AGENT_HOME): `work/evidence/paddle_injection_proof_YYYY-MM-DD.txt`
- Public (board comment): redacted proof summary + links
