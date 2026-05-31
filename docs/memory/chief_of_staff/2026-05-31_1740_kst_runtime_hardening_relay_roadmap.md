# Runtime hardening and relay roadmap

On 2026-05-31, the second-PC return ZIP
`F:\Aisaak\Projects\localsend\second-pc-return\20260531-165240-HUGH-MAIN.second-pc-return.zip`
was imported and its MSIX install evidence was recorded under
`docs/evidence/msix-install/1.15.0-rc.1/20260531-165211-HUGH-MAIN.evidence.json`.

That closes only the MSIX install proof. It does not close multi-device route
proof.

The release decision changed after operator feedback that MUSU shows idle
busy-loop CPU behavior of roughly 20% of one core on more than one Windows PC.
Public desktop release is now internally blocked too, not only externally
blocked.

New locks:

- Runtime idle CPU evidence is required before public launch.
- New measurement script: `scripts/windows/measure-musu-idle-cpu.ps1`; final evidence must run while MUSU is open and idle, include Node.js/WebView2, and fail if no MUSU runtime process is sampled.
- `write-release-go-no-go.ps1` now reports `runtime_idle_cpu_verified` and
  blocks public readiness until runtime idle CPU evidence passes on at least
  two machines.
- Public target: no MUSU/Node.js/WebView2 process above 5% of one logical CPU
  over a 60s idle sample on primary and second PC.
- Universal clipboard polling is opt-in via `MUSU_ENABLE_CLIPBOARD_SYNC=1`.
- mDNS remains opt-in via `MUSU_ENABLE_MDNS=1`.
- `musu.pro` must become registry + rendezvous + relay/tunnel control for the
  public multi-device setup story; manual LAN `host:port` cannot be the only
  product path.

Canonical document: `docs/RELEASE_1_15_0_RC1_RUNTIME_HARDENING_RELAY_ROADMAP_2026_05_31.md`
(wiki/523).
