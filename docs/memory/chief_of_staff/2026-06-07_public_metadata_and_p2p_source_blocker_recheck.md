# 2026-06-07 Public Metadata and P2P Source Blocker Recheck

Current-head public metadata verification passed and the latest go/no-go was
rerun without `-SkipPublicMetadata`.

Evidence:

- `scripts\windows\verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json`
- `scripts\windows\write-release-go-no-go.ps1 -Json`
- `scripts\windows\show-musu-pro-p2p-env-status.ps1 -SkipGithub -Json`

Results:

- public metadata `ok=true`, `fail_count=0`
- `https://musu.pro/privacy` HTTP `200`
- `https://musu.pro/support` HTTP `200`
- current go/no-go commit `f158336ac3fec3481ea4160bb1351485c6e10a63`
- `public_metadata_checked=true`
- `public_metadata_ok=true`
- blocker count `6`

Remaining blockers:

- multi-device
- runtime idle CPU second machine
- runtime CPU scenario matrix second machine
- support mailbox
- Store release
- live MUSU.PRO P2P control-plane proof

P2P source status:

- release payload preflight is wired but still preflight-only
- preview store-forward queue fallback is wired but non-release-grade
- release relay payload endpoint remains false
- release relay tunnel runtime remains false
- release tunnel source contract is ready, but the not-implemented runtime
  branch is still active

Do not flip `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED` or
`RELAY_TUNNEL_RUNTIME_IMPLEMENTED` until a real `quic_relay_tunnel` byte path
and bound relay transport/delivery proofs exist.
