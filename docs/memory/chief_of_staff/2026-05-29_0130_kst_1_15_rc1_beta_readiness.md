# CoS Memory Note - 1.15.0-rc.1 Beta Readiness (2026-05-29 01:30 KST)

Facts:

- `1.15.0-rc.1` is beta-ready for the single-machine Windows local operator path.
- First-run command is now `musu up`; readiness command is `musu doctor`.
- Dashboard routes must read the bridge token from env or `~/.musu/bridge.env`.
- Dashboard routes must resolve the bridge URL per request from `~/.musu/services/bridge.json`; do not cache dynamic bridge URLs at module import time.
- Dashboard and bridge task hot paths default to `adapter_type="claude"` until runner adapter dispatch is unified.
- Legacy Rust `/api/ai/chat` was found still defaulting to `openai_compat_local`; it was corrected to `claude`.
- Live smoke on 2026-05-29 passed through dashboard `3001` to bridge `11041` with task output `MUSU_SMOKE_OK`.

Canonical docs:

- `docs/RELEASE_1_15_0_RC1_QUAL_AUDIT_ROADMAP_2026_05_29.md` (wiki/518)
- `docs/BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`
- `docs/PRODUCT_CHARTER/SSOT_1PAGE_2026-04-09.md`

Do not forget:

- Store/MSIX auto-start is still external-review gated.
- `openai_compat_local` can stay in adapter registry, but must not be a dashboard/task default until runner dispatch supports it.
- WindowsApps alias shadowing is a `doctor` warning, not a beta blocker.
