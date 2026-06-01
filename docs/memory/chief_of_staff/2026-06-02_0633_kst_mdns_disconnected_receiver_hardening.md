# 2026-06-02 06:33 KST - mDNS Disconnected Receiver Hardening

Context:

- The active release goal still treats idle CPU/busy-loop behavior as a public
  release blocker until two machines pass 60s CPU evidence.
- Existing source already keeps bridge mDNS off by default and requires
  explicit opt-ins for IPv6, Tailscale, and virtual/VPN adapters.
- The operator-supplied Windows/Tailscale logs included
  `mdns_sd::service_daemon` plus `sending on a closed channel`, which remained
  a credible failure class for explicit mDNS runs.

Change:

- `musu-rs/src/peer/mdns.rs` now classifies mDNS browse receive errors:
  `Timeout` continues the bounded discovery window, while `Disconnected`
  logs and exits immediately.
- `flume` is declared directly with `default-features=false` because mdns-sd
  exposes flume receivers/errors in the public browse API.
- Added a focused unit test for the receive-error classifier.

Validation:

- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib -j 1 peer::mdns::tests::`
  passed 3/3.
- A broader filtered cargo test also passed the mDNS tests but failed when Cargo
  attempted to execute the unrelated `r6_auto_update` integration harness, which
  requires elevation on this Windows host.

Release impact:

- This does not close the CPU gate by itself. It removes one concrete
  busy-loop candidate for explicit mDNS usage; public release still requires
  fresh primary and second-PC runtime CPU evidence from the final source.
