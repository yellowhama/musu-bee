# CoS Memory Note - Partner Center Approved / Store Launch Active (2026-05-29 02:10 KST)

Facts:

- Operator reported that Microsoft Partner Center enrollment approval cleared.
- This clears the previous account-verification blocker.
- It does not mean the MUSU app package or restricted startup capability has been approved.
- The existing 2026-05-27 submission bundle is now a template, not a ready final submission, because it contains a `1.13.0.0` artifact while current beta target is `1.15.0-rc.1`.

New next-step order:

1. Reserve product name in Partner Center.
2. Regenerate Store-reviewed MSIX package for `1.15.0-rc.1`.
3. Re-run MSIX audit and store-reviewed artifact verification.
4. Submit the Store-reviewed package and restricted capability justification.
5. Record Microsoft certification result back into repo docs before changing packaging code.

Marketing carry-over from the external note:

- Use Microsoft Store as trusted Windows install channel.
- Promote MUSU itself, not unrelated product names.
- Measure Store page views -> install attempts -> installs -> first launch -> doctor ok -> first task done.
- Do not overclaim autonomous AI control in the Store listing.

Canonical doc:

- `docs/STORE_LAUNCH_AND_PROMOTION_PLAN_2026_05_29.md`
