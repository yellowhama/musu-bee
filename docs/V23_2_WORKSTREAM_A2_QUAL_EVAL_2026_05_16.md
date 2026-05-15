# V23.2 Workstream A2 — qualitative evaluation (wiki/359)

**Date**: 2026-05-16
**Status**: Honest self-assessment of the work that closed in wiki/358. Not a status report — a critique.
**Predecessor**: `V23_2_WORKSTREAM_A2_CLOSURE_2026_05_16.md` (wiki/358)
**Wiki ID** (abstract): `wiki/359`

---

## Why this doc exists separately from the closure doc

The closure doc describes **what shipped**. This doc describes **what's still uncertain about what shipped**, in language that a future operator (or future self) can use to decide where to spend the next attention budget. The closure doc cannot be honest in this way without becoming self-undermining; this doc can.

Format: strong/weak/process. No metrics, no celebration, no apologies.

---

## What went well

**1. The independent audit actually did work.** Self-audits drift toward "looks good to me." This one surfaced **HIGH #1 — Fly volume chown EACCES** that all 102 (then 107) tests missed. Code review alone could not have caught it; it required runtime knowledge of how Fly.io overlays freshly-provisioned volumes. The pattern (spawn a subagent with operational context in the prompt, ask for graded findings, fix all HIGHs before closure) is now a reusable template — it should not be optional in future workstreams that touch deploy artifacts.

**2. Audit findings were prioritized, not just enumerated.** Five HIGHs closed in the same commit (`031d627`). Three LOWs: two closed, one deferred to V23.5 with reasoning. INFO items recorded as backlog, not silently dropped. This is the behavior wanted from the prior turn's feedback ("권장사항? 저거 다 하라고 한것들 아니냐?") — recommendations are the instruction, not the start of a discussion.

**3. Test growth was forced by real findings, not vanity.** 102 → 107. Each of the five new tests guards a specific regression class:
   - 3 × boot-config (HIGH #3): production-without-secret refuses to start; dev permits.
   - 2 × gateway header (HIGH #4): configured → header present; unset → header absent.
   If anyone deletes the header line on the gateway side, test fails. If anyone weakens the boot check, test fails. The tests would *fail loudly* on the specific kind of regression they exist to prevent. That's the only quality property worth measuring.

**4. The browser-side decoupling was the right call.** Importing `VisitorClient` from `musu-relay` into the musu-bee Next bundle would have either (a) broken the build via Node-only `http`/`crypto`/`Buffer`, or (b) shipped polyfills inflating bundle size. Inlining the bridge wire format in `SpikeDemoClient.tsx` looks like duplication but is really **two independent implementations of the same protocol** — which is the healthier shape for a product line where Node and browser sides evolve at different rates. Worth re-applying in Workstream B if any installer-side code is tempted to share types with the web app.

**5. Commit granularity held up.** Four commits, each independently revertible:
   - `6830b18` — auth change only
   - `2789c92` — deploy artifacts only
   - `c95e14c` — new musu-bee page only
   - `031d627` — audit fixes only
   Plus a fifth (`abf8c09`) for the closure doc.
   If `031d627` introduces a new bug, revert to `c95e14c` and the deploy-artifact + auth work still stand. This is the property that one-big-commit anti-pattern destroys.

---

## What's still uncertain

**1. `/spike-demo` was never opened in a real browser.** Typecheck is clean; that proves only that the types align. The `CLAUDE.md` rule "for UI changes, start the dev server and use the feature in a browser before reporting the task as complete" was not honored. Excuse: the page only reaches phase `idle → ws-connecting → error` without a real gateway running on the user's PC, and the gateway isn't installable yet. Counter-excuse: at minimum the failure mode (WS connection refused → graceful error log, no React crash) should have been verified. **This counts as untested.** Fix path: Workstream B installer produces a runnable gateway → open the page in Chrome → confirm the green-path screenshot lands in the closure doc.

**2. The Fly entrypoint fix was never executed in Alpine.** `docker-entrypoint.sh` chowns `/data` then `exec su-exec musu:musu "$@"`. This assumes:
   - Alpine's BusyBox `stat -c %u` behaves the same as coreutils' (BusyBox docs say yes; not verified on a running container).
   - `su-exec` properly drops privileges to uid 1001 (the musu user).
   - The build context COPYs the script with the LF line endings the `.gitattributes` enforces (verified at git-index level; not verified after a Docker build).
   - `chmod +x` applied via `git update-index --add --chmod=+x` survives the Windows checkout through the Docker `COPY` (should — git stores the executable bit independent of filesystem POSIX bits — but again unverified).
   Until first `fly deploy` returns `[signaling] listening on 9900` in `fly logs`, this is a **fix candidate**, not a fix.

**3. Shared-secret is interim by design and the gap window is unbounded.** A single secret bakes into every installer. One leaked installer → every user's telemetry endpoint becomes forge-able. T2.AUTH.2-final (per-install HMAC) is the proper fix; it lives in Workstream B; B has no committed schedule. The operational risk window is **B's wall-clock duration**. The `MUSU_TELEMETRY_SHARED_SECRET` rotation procedure is also not documented — rotating it today would 401 every installer simultaneously with no rolling-grace mechanism. Implicit rule: don't rotate before B ships. That rule is not written down anywhere except this paragraph.

**4. `/v1/telemetry/summary` remains unauthenticated.** Carry-over from a prior workstream, technically out of A2's audit scope. The endpoint exposes aggregate install / nat_pierce / agent_spawn counts to anyone on the public internet. "Admin-internal by convention" is not a control — it's a hope. Realistic exposure: competitive intelligence (install growth rate, NAT-pierce success ratio) leaks. Workstream B should not close without addressing it, even if the fix is just "require the same shared secret" since per-install HMAC doesn't fit the GET pattern.

**5. Audit single-pass risk.** The subagent reviewed three commits and a fourth-by-derivation. If the subagent had a blind spot — say, missed a class of issue around the `.gitattributes` / CRLF interaction — there's no second reviewer to catch it. One audit pass per workstream is the baseline; the question is whether B (which touches more security-sensitive code) deserves two passes from different agents. Recommendation: yes, for B's auth-final commit specifically.

**6. Indexer re-sync touched 12 files but no spot-check.** "Sync success" was reported but no FTS query was run to verify that the new files are searchable. If the indexer silently dropped a doc, the search-based context-gathering in the next session won't notice. Cheap fix: one `musu-indexer search` query for "V23.2" after sync to confirm the new docs appear.

---

## Process critique (the loop itself)

**Linear, not dynamic.** The `/loop` ran in dynamic mode but every iteration was sequential — no monitors armed, no events to wait on, just "next task." This isn't a bug; it just means dynamic-mode loops have no inherent advantage over a long-form todo list for this kind of work. Worth knowing: `ScheduleWakeup` adds nothing when the next iteration depends only on the previous tool result, not on external signal.

**Audit was load-bearing, not nice-to-have.** Without the audit, HIGH #1 ships and the first `fly deploy` fails. Without HIGH #2-5, prod misconfig modes ship silently. Treating audit as optional in future workstreams would mean accepting "tests pass, looks fine" as ship criteria — which is exactly what this workstream demonstrated is not enough for deploy-touching work.

**Korean instruction adherence improved.** Prior turn's correction ("권장사항? 다 하라고 한거 아니냐?") was applied this round: no further "should I do X?" questions when the recommended path was already in scope. Reduced user friction. Worth keeping.

---

## One-line conclusion

**Spec-to-code gap closed. Code-to-production gap remains.** The next workstream must not start without one round of real first-deploy validation against Fly.io — otherwise A2's closure is paper.
