# 2026-06-02 21:58 KST - P2P KV and second-PC recheck

Fresh hosted P2P control-plane evidence was recorded at
`docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-215651-musu.pro.evidence.json`
with verification
`docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-215651-musu.pro.verification.json`.

Current interpretation:

- `musu.pro` is reachable and logged in.
- Rendezvous, relay lease control-plane, and runtime relay fallback wiring are
  present.
- `relay_default_data_path=false` is still preserved.
- Release verification fails because relay lease query is not owner-scoped:
  `ok=false`, `owner_scope_verified=false`, `owner_scoped=false`.
- Failure detail is `p2p_relay_lease_kv_not_configured`.
- GitHub has `MUSU_P2P_CONTROL_TOKEN_SHA256S`, but `KV_REST_API_URL` and
  `KV_REST_API_TOKEN` are missing.
- Local process/user/machine env has no KV/Upstash values and no secret-bearing
  `.env` exists.

Second-PC recheck:

- Prior target: `192.168.1.192:8949` / `HUGH-MAIN`.
- `Test-NetConnection 192.168.1.192 -Port 8949` failed with
  `TcpTestSucceeded=false` and ping timeout.
- Fresh two-machine CPU/matrix/route evidence cannot be captured from
  `HUGH_SECOND` until the remote bridge is reachable or a new return archive is
  imported.

Docs updated:

- `docs\RELEASE_1_15_0_RC1_P2P_KV_SECOND_PC_RECHECK_2026_06_02.md`
- `docs\P2P_CONTROL_PLANE_MUSU_PRO_NEXT_ACTIONS_2026_06_02.md`
- `docs\MUSU_PRO_P2P_CONTROL_PLANE_SPEC_2026_05_31.md`
- `docs\BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`
- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_EVIDENCE_QUAL_AUDIT_NEXT_STEPS_2026_06_02.md`
- `docs\WIKI.md`
- `docs\WIKI_INDEX.md`
- `docs\GOAL.md`

Indexer:

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed 1448 files and 2262 symbols.
