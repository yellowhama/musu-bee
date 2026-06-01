# CoS Memory: process attribution and Node count audit

Date: 2026-06-02 05:40 KST

The operator observed many `node.exe` processes while MUSU was running. The
current release decision is to treat raw Task Manager Node count as diagnostic,
not as a blocker by itself. The release accountability boundary is MUSU-owned
descendants and repo-related orphan helpers.

Implemented:

- added `scripts\windows\show-musu-process-attribution.ps1`
- schema: `musu.process_attribution_summary.v1`
- wired the summary into `run-second-pc-release-check.ps1`
- included process attribution in the second-PC return zip
- taught `import-second-pc-return.ps1` to import the summary
- bundled the scripts into the multi-device kit and final operator packet
- updated operator action-pack verification and desktop readiness script checks
- documented the decision in
  `docs\PROCESS_ATTRIBUTION_NODE_COUNT_AUDIT_2026_06_02.md`

Current HUGH_SECOND diagnostic output:

- machine-wide `node.exe`: `16`
- MUSU-owned Node: `0`
- unowned Node: `16`
- machine-wide WebView2: `12`
- MUSU-owned WebView2: `6`
- repo-related orphan helpers: `0`
- process ownership checks: pass

Remaining release blockers are unchanged: second-PC runtime idle CPU evidence,
second-PC CPU matrix evidence, real multi-device route evidence, KV-backed
`musu.pro` relay lease storage, `musu@musu.pro` inbox proof, and Store evidence.

Indexer refresh: `musu indexer sync --work-dir F:\workspace\musu-bee --name
musu-bee` indexed 1261 files and 2214 symbols after this wiring and docs
update.
