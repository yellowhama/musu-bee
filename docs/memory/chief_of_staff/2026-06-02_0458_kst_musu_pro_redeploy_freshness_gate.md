# 2026-06-02 04:58 KST - musu.pro redeploy and freshness-gate correction

Operator asked whether the current site work should be deployed to `musu.pro`.
Manual `Deploy musu-bee to Vercel` workflow_dispatch run `26777905910` was
started for `main` and succeeded for commit
`00694a2e766da8e0a79dd6dd7bb82fdadb6c39d1`.

Live browser QA against `https://musu.pro` passed on `/`, `/landing`,
`/pricing`, and `/install` across desktop `1280x720` and mobile `390x844`.
Verified signals: actual scroll movement, no horizontal overflow, visible logo
source contains `favicon-header.png`, `--musu-color-brand-emerald=#24C8DB`,
and emerald accent color includes `36, 200, 219`.

The go/no-go script initially showed `single_machine_verified=false`, runtime
idle CPU `0/2`, and runtime CPU matrix `0/2` after the hosted P2P status script
commit. Audit showed the latest primary evidence was being invalidated by
non-runtime deltas: `.github/workflows/deploy-musu-bee.yml` and
`scripts/windows/show-musu-pro-p2p-env-status.ps1`.

Corrective change: `write-release-go-no-go.ps1`,
`verify-single-machine-evidence.ps1`, and
`verify-runtime-cpu-scenario-matrix.ps1` now treat only `docs/*`, the deploy
workflow file, the P2P env status preflight script, and exact release-gate
verifier script paths as allowed documentation/status/tooling-only evidence
freshness deltas.

Validation after the correction:

- single-machine verifier passes for `20260602-033029-HUGH_SECOND`
- CPU matrix verifier passes for `20260602-033636-HUGH_SECOND`
- full go/no-go reports `single_machine_verified=true`
- runtime idle CPU is `1/2 [HUGH_SECOND]`
- runtime CPU scenario matrix is `1/2 [HUGH_SECOND]`
- public desktop release is still No-Go

Remaining blockers are unchanged: second-PC evidence, release-grade
multi-device route proof, KV-backed `musu.pro` P2P control-plane proof,
operator-verified `musu@musu.pro` mailbox evidence, and Microsoft Store
submission/certification evidence.
