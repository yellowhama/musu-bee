# Chief of Staff Memory: Packaged Local Runtime / Web Split Alignment

Date: 2026-06-05

- Root cause: packaged local runtime health was still coupled to workspace
  dashboard ports. `musu up --json` reported bridge OK but dashboard warn with
  `127.0.0.1:3000/3001` and `npm run dev` guidance, which contradicted the
  current product split.
- Decision: installed MUSU is the local executor. A workspace dashboard is
  optional. `musu.pro` supplies remote input, rooms, rendezvous, path selection,
  fallback relay policy, and evidence; execution stays local and P2P mesh is
  preferred after web-assisted rendezvous.
- Code: `musu-rs/src/install/cli_commands.rs` now reports
  `dashboard.required=false` for store/MSIX packages without a reachable
  workspace dashboard and no longer suggests starting `npm run dev`.
- Evidence scripts: `smoke-single-machine-beta.ps1` defaults to WindowsApps
  `musu.exe`, rejects debug runtime unless `-AllowDeveloperRuntime`, and records
  `single_machine_surface=local-bridge-only` when packaged dashboard is not
  required. The verifier accepts this bridge-only packaged evidence and rejects
  non-packaged release smoke.
- Validation: parser checks passed, targeted Rust tests passed 28/28, release
  verifier regression passed 32/32, MSIX rebuild/install passed, and actual
  packaged `musu up --json` returned bridge `http://127.0.0.1:3591` with
  `dashboard.required=false`.
- Follow-up: commit this contract first, then rerun current-commit
  single-machine/CPU/matrix evidence. Public release remains blocked by
  second-PC, hosted P2P release proof, support mailbox, and Store evidence.
