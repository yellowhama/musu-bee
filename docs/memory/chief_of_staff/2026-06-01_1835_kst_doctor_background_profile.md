# CoS Memory - Doctor Background Profile

Date: 2026-06-01 18:35 KST

`musu doctor --json` now exposes the runtime background feature profile so idle
CPU evidence can state what background work was enabled.

New JSON section: `background`

- `mdns`
- `mdns_ipv6`
- `mdns_tailscale`
- `mdns_virtual_interfaces`
- `clipboard_sync`
- `cloud_registration`
- `cloud_heartbeat_interval_sec`
- `cloud_heartbeat_floor_sec`
- `file_sync`
- `file_serve_root_count`
- `file_serve_writable`
- `planner`

Behavior:

- `background.status=ok` when optional hot-loop-prone features are off.
- `background.status=warn` when mDNS, clipboard sync, file sync, planner, or
  related mDNS interface opt-ins are enabled.
- Cloud registration is allowed as a low-duty path when logged in; effective
  heartbeat is floored to 60s and defaults to 300s.

Validation:

- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib
  cli_commands::tests::doctor_background -- --nocapture` passed 3/3 tests.
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed.
- Live `musu doctor --json` on `HUGH_SECOND` reported `background.status=ok`,
  mDNS off, clipboard off, file sync off, planner off, cloud registration on,
  heartbeat `300s`, and heartbeat floor `60s`.
- Text `musu doctor` prints:
  `mDNS=off clipboard=off cloud_heartbeat=300s file_roots=0 planner=off`.

Release interpretation:

This does not prove idle CPU by itself. It makes the evidence profile explicit
before the next clean 60s primary/second-PC samples.
