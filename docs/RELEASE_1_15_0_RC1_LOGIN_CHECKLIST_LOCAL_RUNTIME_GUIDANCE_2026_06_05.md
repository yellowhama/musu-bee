# Release 1.15.0-rc.1 - Login Checklist Local Runtime Guidance

Date: 2026-06-05

## Summary

The repeated browser error at `localhost:3001` was confirmed to be a user
opening an optional developer/workspace dashboard port with no listener, not a
failure of the installed local MUSU runtime.

Current packaged runtime state on HUGH_SECOND:

- installed bridge process: `C:\Program Files\WindowsApps\Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6\musu.exe`
- local bridge listener: `127.0.0.1:2414`
- bridge health: `status=ok`, `worker_ok=true`, `auth_mode=production`
- no listener on `127.0.0.1:3001`

## Change

`musu login` no longer prints a post-login checklist that tells users to open a
fixed local dashboard URL such as `http://127.0.0.1:3001/app`.

The checklist now says:

- run `musu doctor`
- start `musu bridge` if needed
- open MUSU Desktop or a MUSU.PRO workspace

This keeps the product split explicit:

- MUSU Desktop/local bridge does the work on each device.
- MUSU.PRO is the remote input/control-plane/workspace surface.
- `localhost:3001` is only an optional developer dashboard.

## Validation

Passed:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`
- `cargo test --manifest-path .\musu-rs\Cargo.toml --bin musu login_connection_checklist_does_not_open_fixed_localhost_dashboard -- --nocapture`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu`
- `git diff --check`

Runtime confirmation:

- `Invoke-RestMethod http://127.0.0.1:2414/health` returned `status=ok`
- `Get-NetTCPConnection` showed only the packaged bridge listener on
  `127.0.0.1:2414` among the checked local dashboard/runtime ports

## Release Impact

This is Rust CLI source hardening, so the previous packaged single-machine,
idle CPU, and runtime CPU matrix evidence is stale for current-source release
claims. Fresh MSIX install/repair, single-machine smoke, desktop-open idle CPU,
and runtime CPU matrix evidence are required after this commit.

Public desktop release remains No-Go on:

- fresh current-source primary packaged evidence
- second-PC multi-device route evidence
- second-PC idle CPU evidence
- second-PC runtime CPU matrix evidence
- hosted MUSU.PRO P2P release proof
- support mailbox evidence
- Store/Microsoft evidence
