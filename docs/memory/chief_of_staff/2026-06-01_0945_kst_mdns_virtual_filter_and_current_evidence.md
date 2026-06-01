# CoS Memory - mDNS Virtual Filtering and Current Evidence

Date: 2026-06-01 09:45 KST

The operator re-supplied `mdns_sd::service_daemon` logs showing repeated
Windows `Tailscale` IPv6 multicast sends to `ff02::fb%9:5353` failing with
`os error 10065`, followed by `closed channel`. Treat this as a real idle
CPU/log-noise failure class for stale builds or explicit mDNS opt-ins, not as
cosmetic output.

Current source now keeps mDNS conservative by default:

- bridge mDNS requires `MUSU_ENABLE_MDNS=1`
- IPv6 mDNS requires `MUSU_MDNS_ENABLE_IPV6=1`
- Tailscale mDNS requires `MUSU_MDNS_ENABLE_TAILSCALE=1`
- common VPN/virtual adapters require `MUSU_MDNS_ENABLE_VIRTUAL_INTERFACES=1`

The new virtual/VPN filter covers Tailscale, NordLynx, WireGuard/wg,
ZeroTier, vEthernet/WSL/Hyper-V, Docker, VMware, VirtualBox, and
tun/tap/utun/VPN interface names. Validation passed on `HUGH_SECOND`:
`cargo test --lib -j 1 peer::mdns::tests::`, `cargo build --bin musu -j 1`,
and `RUST_LOG=debug musu discover --timeout 2`. The discover run disabled 9
virtual/VPN interfaces and sent only on physical `이더넷 2`, with no
Tailscale/NordLynx/vEthernet/`ff02::fb`/`10065`/`closed channel` output.

Current smoke evidence after this code path:
`docs\evidence\single-machine\1.15.0-rc.1\20260601-093958-HUGH_SECOND.evidence.json`,
commit `4ad4b5591bba3c03fffe7eb2d054a4e191b67bea`, dashboard output
`MUSU_RELEASE_SMOKE_OK_20260601_093933`, CLI route
`MUSU_CLI_ROUTE_OK_20260601_093933`, dashboard task
`61f5d95d-ec59-418d-a583-a47336cdf126`, bridge `http://127.0.0.1:9189`.

Current primary `desktop-open` CPU evidence:
`docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-094127-HUGH_SECOND.desktop-open.evidence.json`,
commit `931e771650cda3026630cf0b2394c83211490dc6`, `git_dirty=false`,
60.029s sample, one `musu-desktop`, six owned WebView2 helpers, owned Node
`0`, max one-core CPU `musu=0` and `webview2=0.08`, total working set
`340.49MB`, private memory `181.8MB`, and no resource-budget violations.

Release remains No-Go until second-PC desktop-open CPU evidence, hardened
second-PC route evidence, `musu@musu.pro` inbox delivery evidence, and
Partner Center/Store evidence are recorded.
