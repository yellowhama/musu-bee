# 2026-06-03 Post Relay Store Status Live P2P Evidence

Recorded live `musu.pro` P2P control-plane evidence after relay lease store
status hardening was deployed.

Current-source CLI was built and used explicitly:

```powershell
cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-p2p-control-plane-evidence.ps1 -MusuExe .\musu-rs\target\debug\musu.exe -AllowUnverified -Json
```

Evidence:

- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-061246-musu.pro.evidence.json`
- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-061246-musu.pro.verification.json`
- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-061246-musu.pro.summary.md`

Verification remains failed:

- `ok=false`
- `fail_count=6`
- `relay_status_logged_in=true`
- `relay_leases_ok=false`
- `owner_scope_verified=false`
- `owner_scoped=false`
- `relay_lease_store_configured=false`
- `relay_lease_store_backend=unconfigured`
- `relay_lease_store_release_grade=false`

The live error body is preserved by the current-source CLI:
`p2p_relay_lease_kv_not_configured`, `relay_control_plane_wired=true`,
`relay_transport_wired=false`, `relay_default_data_path=false`,
`relay_lease_store_backend=unconfigured`.

Interpretation: the store-status contract is wired through live API -> CLI ->
evidence -> verifier, but the public P2P gate is still blocked by production
KV/Upstash provisioning and by the still-unwired relay payload transport.
