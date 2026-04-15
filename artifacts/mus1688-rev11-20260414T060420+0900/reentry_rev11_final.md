REENTRY_SCOPE_MUS1688: CODE_CHANGED

Rev11 coherent re-entry bundle (Option A scope expansion, same issue).

2) Canonical SHA set (base + ordered commits)
- base_sha: `b12280062bbbdfe4705bcce52043144d2e692209`
- packet_sha: `1cfdfa758826673795bf6931063c057f43260e33`
- baseline_sha: `3bd0c078545d636aaea10718f7b43a6bf10f5d11`
- rev11_head_sha: `e7024c5b05f881b40d16506fb564e217febdf233`

3) BASELINE_BUILD_HEAD: PASS

Checkout row (this cycle)
- `POST /api/issues/cd8e6a49-3d2b-494b-9be1-2537c4f42657/checkout`
- payload: `{"agentId":"7a87bcf2-6b89-498e-b295-d80d53710bd0","expectedStatuses":["blocked"]}`
- result: HTTP 409 (no retry)
- tuple: `status=blocked`, `assigneeAgentId=7a87bcf2-6b89-498e-b295-d80d53710bd0`, `checkoutRunId=null`, `executionRunId=a5dc0c7e-d6ef-464d-bb91-13460eecfaa4`
- evidence: `/home/hugh51/musu-functions/artifacts/mus1688-rev11-20260414T060420+0900/checkout_attempt_with_agent.json`

4) Phase A proof rows (install/typecheck/build)
- `npm install` => exit `0`
  - log: `/home/hugh51/musu-functions/artifacts/mus1688-rev11-20260414T060420+0900/npm_install_r2.log`
- `NODE_ENV=production npm run build` => exit `0`
  - log: `/home/hugh51/musu-functions/artifacts/mus1688-rev11-20260414T060420+0900/build_r8.log`
- `npm run typecheck` => exit `0`
  - log: `/home/hugh51/musu-functions/artifacts/mus1688-rev11-20260414T060420+0900/typecheck_r4.log`

5) Phase B proof rows (tests/token scan/route probe)
- targeted tests
  - command: `npx --yes tsx --test src/app/brand-tokens.test.ts src/app/landing-exp/page.module.test.ts src/app/landing-exp/page.contract.test.ts`
  - exit `0`
  - log: `/home/hugh51/musu-functions/artifacts/mus1688-rev11-20260414T060420+0900/targeted_tests_r3.log`
- token scan
  - command: `rg -n --glob '!**/*.test.*' --glob '!src/app/globals.css' '#facc15|#ffd166|#2d1d19|#fdfcf0|#f8f6f1' src/app src/components src/pages`
  - exit `1` (no-match semantics)
  - log: `/home/hugh51/musu-functions/artifacts/mus1688-rev11-20260414T060420+0900/token_scan_r3.log`
- route probe
  - `/landing 200`, `/pricing 200`, `/pro 200`, `/faq 200`, `/install 200`
  - exit `0`
  - log: `/home/hugh51/musu-functions/artifacts/mus1688-rev11-20260414T060420+0900/route_probe_r3.log`

6) Changed-file list + purpose per file
- Public brand-token rollout (required route surfaces)
  - `musu-bee/src/app/landing/page.tsx`
  - `musu-bee/src/app/pricing/page.tsx`
  - `musu-bee/src/app/pro/page.tsx`
  - `musu-bee/src/app/faq/page.tsx`
  - `musu-bee/src/app/install/page.tsx`
  - `musu-bee/src/components/PublicSiteShell.tsx`
- Determinism/compile-surface baseline fixes (Phase A)
  - Added missing runtime modules/hooks/types:
    - `musu-bee/src/lib/tasks.ts`
    - `musu-bee/src/lib/useAuth.ts`
    - `musu-bee/src/lib/useAgentsSurface.ts`
    - `musu-bee/src/lib/useCompanyState.ts`
    - `musu-bee/src/lib/useServiceHealth.ts`
    - `musu-bee/src/lib/billing-types.ts`
    - `musu-bee/src/lib/subscriptionSync.ts`
    - `musu-bee/src/lib/companySetup.shared.ts`
    - `musu-bee/src/types/node-sqlite.d.ts`
    - `musu-bee/src/components/OAuthButtons.tsx`
  - Updated integration surfaces to use canonical billing/task flow:
    - `musu-bee/src/app/api/checkout/route.ts`
    - `musu-bee/src/app/api/tasks/route.ts`
    - `musu-bee/src/app/api/webhooks/paddle/handler.ts`
    - `musu-bee/src/app/api/webhooks/paddle/route.test.ts`
    - `musu-bee/src/components/AppShell.tsx`
    - `musu-bee/src/components/ChatArea.tsx`
    - `musu-bee/src/lib/useChat.ts`
    - `musu-bee/src/lib/supabase.ts`
    - `musu-bee/src/lib/companyScope.ts`
    - `musu-bee/src/lib/controlPlaneSync.ts`
    - `musu-bee/src/lib/paddle.ts`
    - `musu-bee/src/lib/publicSiteContent.ts`
    - `musu-bee/src/types/index.ts`
  - Removed legacy Stripe lane incompatible with current subscription contract:
    - `musu-bee/src/app/api/webhooks/stripe/handler.ts`
    - `musu-bee/src/app/api/webhooks/stripe/route.ts`
    - `musu-bee/src/app/api/webhooks/stripe/route.test.ts`
    - `musu-bee/src/lib/stripe.ts`
  - Supporting app-shell/auth pages + lock/types refresh:
    - `musu-bee/src/app/app/page.tsx`
    - `musu-bee/src/app/auth/callback/page.tsx`
    - `musu-bee/src/app/auth/login/page.tsx`
    - `musu-bee/src/app/auth/signup/page.tsx`
    - `musu-bee/src/app/layout.tsx`
    - `musu-bee/src/app/not-found.tsx`
    - `musu-bee/next-env.d.ts`
    - `musu-bee/package-lock.json`

Trust-boundary + rollback tuple
- trust-boundary: no user-controlled value is promoted into CSS token identifiers; brand token usage remains static variable reference path only.
- rollback tuple: `rollback_to=3bd0c078545d636aaea10718f7b43a6bf10f5d11`, `rollback_commit=e7024c5b05f881b40d16506fb564e217febdf233`.

Bundle index
- root: `/home/hugh51/musu-functions/artifacts/mus1688-rev11-20260414T060420+0900`
- key files: `commands.txt`, `exit_codes.txt`, `diff_summary.txt`, `token_map.md`, `summary_r2.txt`

@CTO G1 review requested: Rev11 Phase A+B rows complete with reproducible evidence on canonical head `e7024c5b05f881b40d16506fb564e217febdf233`.

G1_READY_MUS1688: YES
