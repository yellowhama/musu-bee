# Next Steps After Current Packaged Local Evidence Refresh

## Current State

`HUGH_SECOND` now has current packaged local evidence for:

- single-machine smoke
- desktop-open idle CPU
- full runtime CPU scenario matrix
- targeted HUGH-MAIN failed-route CPU diagnostic

Clean go/no-go still reports public release `No-Go` because the remaining
gates require another machine, hosted MUSU.PRO proof, support mailbox proof,
and Store proof.

## Product Direction

Keep the split explicit:

- MUSU Desktop is the local executor.
- MUSU.PRO receives remote input, coordinates project/company rooms, helps
  devices rendezvous, records evidence, and provides relay fallback policy.
- MUSU.PRO must not become the default executor or default data path.
- Local programs still perform work on each device and prefer direct P2P after
  web-assisted bootstrap.

## Next Actions

1. Install the same packaged MUSU Desktop runtime on the second Windows PC.
2. Run the second-PC release kit from a clean tree using the explicit packaged
   WindowsApps alias.
3. Record and import:
   - real second-PC multi-device evidence
   - `desktop-open` idle CPU evidence on the second PC
   - full runtime CPU scenario matrix on the second PC
   - successful second-PC route proof, not only an allowed failed diagnostic
4. Work in `F:\Aisaak\Projects\musu-pro` for hosted site/control-plane changes
   when resuming MUSU.PRO work.
5. Configure and deploy hosted P2P control-plane production storage/auth:
   - owner-scoped KV/Upstash storage
   - runtime login/control token acceptance
   - release relay status/transport descriptor wiring
   - release payload endpoint proof
   - relay route transport proof and delivery proof
6. Record `musu@musu.pro` support mailbox delivery evidence.
7. Record Microsoft Partner Center / Store release evidence.

## Non-Goals

- Do not require `localhost:3001` for the packaged local runtime.
- Do not count the HUGH-MAIN timeout diagnostic as successful multi-device
  routing.
- Do not move local execution into MUSU.PRO.
- Do not treat relay queue or lease control-plane evidence as release-grade
  payload transport proof.
