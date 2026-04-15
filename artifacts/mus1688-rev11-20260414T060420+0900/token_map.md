# MUS-1688 Token Map (Rev11)

- Brand palette source of truth: `src/app/globals.css`
- Public route surfaces moved to CSS variable consumption:
  - `src/app/landing/page.tsx`
  - `src/app/pricing/page.tsx`
  - `src/app/pro/page.tsx`
  - `src/app/faq/page.tsx`
  - `src/app/install/page.tsx`
  - `src/components/PublicSiteShell.tsx`
- Landing-exp contract remains enforced by tests:
  - `src/app/landing-exp/page.module.test.ts`
  - `src/app/landing-exp/page.contract.test.ts`
