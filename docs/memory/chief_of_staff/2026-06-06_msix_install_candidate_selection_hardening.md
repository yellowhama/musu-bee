# 2026-06-06 MSIX install candidate selection hardening

Code audit after the current HEAD packaged local evidence refresh found a
release-gate selection issue: `write-release-go-no-go.ps1` selected only the
newest MSIX install evidence candidate. A developer warning-mode evidence file
with `AliasShadowingMode=warn-explicit-windowsapps` could mask older clean
strict install evidence and create a false `msix-install` blocker.

Resolution:

- go/no-go now gathers recent MSIX install evidence candidates from docs and
  local build roots
- selection is latest-per-machine up to six candidates per machine
- the gate accepts the first candidate that passes default strict
  `verify-msix-install-evidence.ps1`
- warning-mode evidence remains diagnostic unless the verifier is explicitly
  run with `-AliasShadowingMode warn-explicit-windowsapps`

Validation:

- `git diff --check`: pass
- `test-release-evidence-verifiers.ps1 -Json`: `ok=true`, `case_count=66`,
  `failed_case_count=0`
- dirty-tree go/no-go after patch: `msix_install_verified=true`,
  `single_machine_verified=true`, runtime idle CPU `1/2 [HUGH_SECOND]`,
  runtime matrix `1/2 [HUGH_SECOND]`, targeted second-PC route CPU `1/1`

Qualitative evaluation: no high/medium issue found. This is release-gate
hardening, not runtime behavior change. MUSU Desktop remains the local
executor; MUSU.PRO remains remote input, project/company room, rendezvous,
path-selection, relay fallback policy, and evidence/control plane.
