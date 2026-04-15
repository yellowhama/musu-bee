# MUS-1688 G1 Re-entry (TOKEN_ONLY)

SCOPE_MODE: TOKEN_ONLY

Scope:
- CSS var token replacements only for brand accent usage (`#facc15` -> `var(--musu-color-brand-accent)`)
- plus token guard regression test (`src/app/brand-tokens.test.ts`)

Deterministic scan tuple:
- command: rg -n --glob '!**/*.test.*' --glob '!src/app/globals.css' '#2D1D19|#FFD166|#FDFCF0' src/app src/components src/pages
- stdout: brand_hex_scan.stdout.log
- stderr: brand_hex_scan.stderr.log
- exit code: brand_hex_scan.exit

G1_READY_MUS1688: YES
