# 2026-06-01 12:48 KST: post QUIC/TLS verifier current evidence

After hardening the multi-device release verifier to require `peer_identity_method`,
`peer_public_key`, and `encryption=quic_tls_1_3`, current local evidence was
refreshed because the verifier change touched release scripts.

- Single-machine smoke was rerun against `musu-rs\target\debug\musu.exe` with
  the dashboard on `http://127.0.0.1:3000`.
- Recorded evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260601-124055-HUGH_SECOND.evidence.json`.
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260601_124032`.
- Dashboard task: `e1c03dce-0d13-4482-ab9d-7988b10a9d2b`.
- Bridge: `http://127.0.0.1:6483`.
- Primary packaged `desktop-open` CPU evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-124454-HUGH_SECOND.desktop-open.evidence.json`.
- CPU sample: `git_dirty=false`, 60.018s, two MUSU processes, six owned WebView2 helpers,
  owned Node `0`, max one-core CPU `musu=0`, `webview2=0.10`, working set `387.75MB`,
  private memory `183.16MB`.

The first CPU sample after smoke was intentionally discarded because it recorded
`git_dirty=true` while the new single-machine evidence files were still
uncommitted. The accepted CPU sample was rerun after committing the
single-machine evidence, so its `git_dirty=false` field is valid.

Public release remains No-Go until the second-PC `desktop-open` CPU sample,
real `quic_tls_1_3` multi-device route proof, `musu@musu.pro` inbox evidence,
and Partner Center/Store evidence are recorded.
