# Store / MSIX Qualitative Critique — 2026-05-27

## Verdict

The pivot is directionally correct and the product story is finally honest. The important improvement is not “Windows Store magically works”; it is that the repo now distinguishes **three** Windows truths instead of lying with one:

1. direct-download bootstrap
2. local sideload / manual bridge
3. Store-reviewed restricted-capability auto-start

The weak point is no longer internal confusion. The weak point is now the external Microsoft lane.

## 1. Trust Story

What improved:

- The repo no longer pretends Store/MSIX can share the same `install.ps1` / self-update / Task Scheduler contract as the direct-download build.
- Packaged startup has a real artifact path, verifier, smoke test, sideload readiness check, and post-install verifier.

What is still weak:

- A packaged Windows app that declares `runFullTrust` and a startup task will attract more scrutiny than a normal Store utility.
- The trust story for Store auto-start still depends on Partner Center verification plus Microsoft review of the restricted capability.
- Until that review lands, the trust story is “submission-ready” rather than “approved and published”.

## 2. User Mental Model

What improved:

- The product docs now separate direct-download and Store/MSIX contracts instead of mixing them.
- The runtime now avoids lying about self-update and raw Scheduled Task ownership in packaged mode.

Remaining confusion:

- `musu` is still conceptually a CLI-first, background bridge, multi-machine control tool. That is already an unusual fit for Store expectations.
- Users may still ask “did I install an app, a CLI, or a background agent?” because the product exposes all three shapes.
- The current model is closest to “packaged desktop agent with a CLI alias”, and public docs should keep saying that explicitly.

## 3. Windows-Native Fit

Strengths:

- `appExecutionAlias` + packaged `startupTask` is the right architectural direction for a Windows-native packaged CLI/runtime hybrid.
- Runtime state no longer depends on raw self-copy or scheduled-task registration in Store mode.

Weaknesses:

- `~/.musu` remains the runtime-state root, which is pragmatic but not fully package-native.
- `runFullTrust` means the packaged build is not a lightweight WinUI/Store-native utility; it is still effectively a packaged desktop agent.
- mDNS advertising, PTY shell, file write/delete, WebDAV, and remote exec remain policy-sensitive capabilities for a Store review.

## 4. Supportability

What is now better:

- There is a real local workflow for packaging, artifact verification, smoke testing, sideload preflight, and post-install verification.
- Failure messages around cert trust are much more actionable than before.

What still blocks supportability:

- Store publication still depends on company/employment verification and restricted-capability review outside the repo.
- The repo now has enough installed-runtime evidence to support the **local sideload / manual bridge** contract, but not enough external evidence to claim the Store auto-start path is approved.

## 5. Product Recommendation

Short version:

- Keep the pivot.
- Keep the split.
- Claim only what is proven:
  - local sideload/manual: yes
  - Store auto-start approval: not yet

## 6. Required Remaining Work

1. Finish Partner Center company and employment verification.
2. Submit the Store-reviewed artifact with the prepared justification packet.
3. Track Microsoft review outcome for the restricted startup capability.
4. Decide whether `~/.musu` remains the intentional runtime home for Store builds or whether package-aware app data becomes a product requirement.
5. Review Store-policy acceptability of the machine-control surface:
   - PTY shell
   - RPC exec
   - WebDAV
   - file write/delete APIs
   - mDNS advertising
   - clipboard monitor
   - cloud registration and peer discovery
