# MUS-1688 TOKEN_ONLY Evidence

SCOPE_MODE: TOKEN_ONLY

Included files:
- musu-bee/src/app/faq/page.tsx
- musu-bee/src/app/install/page.tsx
- musu-bee/src/app/landing/page.tsx
- musu-bee/src/app/pricing/page.tsx
- musu-bee/src/app/pro/page.tsx
- musu-bee/src/components/PublicSiteShell.tsx
- musu-bee/src/app/brand-tokens.test.ts (new)

Verification:
- test_brand_tokens.log
- typecheck.log
- brand_hex_scan_tuple.log (contains CMD + EXIT_CODE + stdout/stderr)
- build_replay_status.tsv (cold build x5)
- token_only.patch
- review_notes.txt
