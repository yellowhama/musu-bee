# MUSU Process Attribution and Node Count Audit

Date: 2026-06-02 KST
Release: `1.15.0-rc.1`

## Decision

Task Manager's raw `node.exe` count is not a release blocker by itself. The
release blocker is MUSU-owned helper activity: a Node.js or WebView2 process
must be a descendant of a live MUSU runtime or desktop shell, or a repo-related
orphan helper, before it is charged to MUSU.

## Product Spec Update

- `scripts\windows\show-musu-process-attribution.ps1` writes
  `musu.process_attribution_summary.v1`.
- The summary separates machine-wide Node.js/WebView2 processes from MUSU-owned
  descendants and unowned local tooling.
- `run-second-pc-release-check.ps1` now captures this summary by default and
  includes `.local-build\process-attribution\*.process-attribution-summary.json`
  in the second-PC return zip.
- `import-second-pc-return.ps1` imports that summary into
  `.local-build\process-attribution\`.
- The multi-device kit, final operator packet, operator action-pack verifier,
  and desktop readiness audit all include the process-attribution tooling.
- Release evidence freshness rules allow these exact operator/packet/import
  tooling paths as non-runtime-affecting; arbitrary `scripts/*` changes still
  stale runtime evidence.

## Current Evidence

Local diagnostic command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\show-musu-process-attribution.ps1 -OutputPath .local-build\process-attribution\manual-check.process-attribution-summary.json -Json
```

Observed on `HUGH_SECOND`:

- MUSU runtime processes: `1`
- MUSU desktop shell processes: `1`
- machine-wide `node.exe`: `16`
- MUSU-owned `node.exe`: `0`
- unowned `node.exe`: `16`
- machine-wide WebView2 helpers: `12`
- MUSU-owned WebView2 helpers: `6`
- unowned WebView2 helpers: `6`
- repo-related orphan Node/WebView2 helpers: `0`
- process ownership release checks: pass

Conclusion: the operator-observed many-Node state is real, but the current
evidence does not attribute those Node.js processes to MUSU.

## Code Audit

No new runtime hot loop was proven by this audit. The current local process
ownership evidence still passes: one live runtime, one desktop shell, no
MUSU-owned Node helpers, six MUSU-owned WebView2 helpers, and no repo-related
orphan helpers.

Remaining risk is not closed:

- second-PC runtime idle CPU evidence is still missing
- second-PC runtime CPU scenario matrix evidence is still missing
- real multi-device route evidence is still missing
- `musu.pro` relay lease storage still needs KV/Upstash
- `musu@musu.pro` inbox delivery proof is still missing
- Partner Center/Microsoft Store release evidence is still missing

## Next Steps

1. Commit this attribution tooling and documentation.
2. From clean HEAD, regenerate the multi-device kit, final operator packet, and
   operator action pack.
3. Send the new nested second-PC transfer zip and run
   `scripts\windows\run-second-pc-release-check.ps1` without skip flags.
4. Import the returned zip and check that it includes runtime CPU evidence,
   runtime CPU matrix evidence, release-check JSON, and process-attribution
   summary JSON.
5. Provision `KV_REST_API_URL` and `KV_REST_API_TOKEN` for `musu.pro` relay
   lease storage, then re-record passing P2P control-plane evidence.
