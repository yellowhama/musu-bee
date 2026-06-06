# Next Steps After Relay Fallback Candidate Coverage Gate

## Current State

Route evidence now requires relay fallback claims to include candidate coverage
metadata. A release-grade relay record must show the direct route candidates
available from rendezvous and must attempt them in priority order before relay
fallback.

## Next Actions

1. Update the local runtime route recorder to include `candidate_route_kinds`
   from rendezvous/path-selection output in every relay fallback evidence
   record.
2. Keep `candidate_route_kinds` metadata-only. Do not include payload bytes or
   task body data in route evidence.
3. On the second Windows PC, capture route evidence that includes LAN,
   Tailscale, public/direct QUIC, and relay candidate availability where those
   candidates exist.
4. Re-run hosted P2P control-plane evidence and require positive release route
   evidence count only after route transport proof and payload delivery proof
   are also present.
5. Keep relay fallback behind Connect/Pro policy and keep
   `relay_default_data_path=false`.

## Non-Goals

- Do not count relay fallback as release-grade if a direct candidate was
  skipped.
- Do not treat preview store-forward queue delivery as release tunnel payload
  transport.
- Do not move execution or payload processing from MUSU Desktop into MUSU.PRO.
