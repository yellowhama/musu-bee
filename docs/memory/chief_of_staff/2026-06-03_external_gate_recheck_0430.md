# 2026-06-03 External Gate Recheck 04:30

Current HEAD `c7b0d599` remains No-Go, but local artifacts are clean:

- `local_artifacts_ready=True`
- `single_machine_verified=True`
- `msix_install_verified=True`
- `msix_desktop_entrypoint_verified=True`

Second-PC reachability:

- `Test-NetConnection 192.168.1.192 -Port 8949`
- source `192.168.1.154`
- interface `이더넷 2`
- `PingSucceeded=False`
- `TcpTestSucceeded=False`

Fresh live P2P evidence was recorded using explicit packaged alias:

- evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-043017-musu.pro.evidence.json`
- verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-043017-musu.pro.verification.json`
- summary:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-043017-musu.pro.summary.md`

Result:

- `ok=false`
- `fail_count=4`
- logged in and route/rendezvous/lease wiring pass
- `relay_default_data_path=false`
- relay leases `ok=false`
- owner scope not verified
- live error remains `p2p_relay_lease_kv_not_configured`

Env status still has `MUSU_P2P_CONTROL_TOKEN_SHA256S` only. Missing storage
names:

- `KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL`
- `KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`

Next real unblockers are second-PC reachability/current return evidence,
production KV/Upstash env provisioning and deployment, `musu@musu.pro` mailbox
proof, and Partner Center proof.
