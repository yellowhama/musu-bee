# MUS-1688 G2 Re-entry Evidence Bundle

Scope token:
- `REENTRY_SCOPE_MUS1688: EVIDENCE_ONLY`

## EVIDENCE_VISUAL_MATRIX_MUS1688
| ts | viewport | route | artifact |
|---|---|---|---|
| 2026-04-13T20:18:33.034Z | desktop | /landing | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/visual_desktop_landing.png` |
| 2026-04-13T20:18:46.977Z | desktop | /pricing | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/visual_desktop_pricing.png` |
| 2026-04-13T20:18:49.802Z | desktop | /pro | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/visual_desktop_pro.png` |
| 2026-04-13T20:18:52.871Z | desktop | /faq | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/visual_desktop_faq.png` |
| 2026-04-13T20:18:57.777Z | desktop | /install | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/visual_desktop_install.png` |
| 2026-04-13T20:19:00.977Z | mobile | /landing | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/visual_mobile_landing.png` |
| 2026-04-13T20:19:02.970Z | mobile | /pricing | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/visual_mobile_pricing.png` |
| 2026-04-13T20:19:04.583Z | mobile | /pro | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/visual_mobile_pro.png` |
| 2026-04-13T20:19:06.257Z | mobile | /faq | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/visual_mobile_faq.png` |
| 2026-04-13T20:19:07.979Z | mobile | /install | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/visual_mobile_install.png` |

## EVIDENCE_INTERACTION_REPLAY_MUS1688
| ts | route | kind | action | status | observedUrl | artifact |
|---|---|---|---|---|---|---|
| 2026-04-13T20:18:33.034Z | /landing | interaction_nav | Pricing | clicked | http://127.0.0.1:3001/landing | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/interaction_nav_landing.png` |
| 2026-04-13T20:18:33.034Z | /landing | interaction_cta | Join Waitlist | clicked | http://127.0.0.1:3001/landing | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/interaction_cta_landing.png` |
| 2026-04-13T20:18:46.977Z | /pricing | interaction_nav | Pricing | clicked | http://127.0.0.1:3001/pricing | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/interaction_nav_pricing.png` |
| 2026-04-13T20:18:46.977Z | /pricing | interaction_cta | Pro access | clicked | http://127.0.0.1:3001/pricing | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/interaction_cta_pricing.png` |
| 2026-04-13T20:18:49.802Z | /pro | interaction_nav | [none] | no_target | http://127.0.0.1:3001/pro | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/interaction_nav_pro.png` |
| 2026-04-13T20:18:49.802Z | /pro | interaction_cta | Pro 시작하기 | clicked | http://127.0.0.1:3001/pro | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/interaction_cta_pro.png` |
| 2026-04-13T20:18:52.871Z | /faq | interaction_nav | Pricing | clicked | http://127.0.0.1:3001/pricing | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/interaction_nav_faq.png` |
| 2026-04-13T20:18:52.871Z | /faq | interaction_cta | Install | clicked | http://127.0.0.1:3001/install | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/interaction_cta_faq.png` |
| 2026-04-13T20:18:57.777Z | /install | interaction_nav | Pricing | clicked | http://127.0.0.1:3001/pricing | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/interaction_nav_install.png` |
| 2026-04-13T20:18:57.777Z | /install | interaction_cta | Install | clicked | http://127.0.0.1:3001/install | `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/interaction_cta_install.png` |

## EVIDENCE_TOKEN_COMPLIANCE_REPLAY_MUS1688
- Tuple file: `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/token_compliance_tuple.log`
- Command: `rg -n --glob '!**/*.test.*' --glob '!src/app/globals.css' '#2D1D19|#FFD166|#FDFCF0' src/app src/components src/pages`
- Exit code: 1 (expected for no-match)
- stdout: empty
- stderr: empty

## EVIDENCE_BUILD_CONTEXT_MUS1688
- Production build tuple: `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/build_context_tuple.log`
  - Exit code: 1
  - Error observed: ENOENT for `.next/server/app/_not-found/page.js.nft.json`.
- Dev short-cycle tuple: `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/dev_cycle_tuple.log`
  - `MANIFEST_OR_MODULE_ERROR_OBSERVED: NO`
  - 5-route probe returned HTTP 200 in that cycle.
- Additional probe matrix (same artifact cycle): `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/http_probe_matrix.tsv`
  - 5-route probe returned HTTP 500 in an earlier cycle (non-deterministic runtime drift observed).

## Proof Commands (this cycle)
- Tuple file: `/home/hugh51/musu-functions/artifacts/mus1688-g2-reentry-20260414T051130+0900/proof_tuple.log`
- tests: exit 0, pass 4 / fail 0
- typecheck: exit 0
