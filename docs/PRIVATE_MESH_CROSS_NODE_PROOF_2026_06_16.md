# Private Mesh cross-node proof — 2026-06-16

Evidence that the self-hosted MUSU Private Mesh (Headscale + embedded DERP,
no Tailscale.com account) actually coordinates nodes and routes encrypted
traffic between them.

## What was proven

- **Self-hosted control plane up**: `musu-headscale` + `musu-headscale-caddy`
  containers `healthy`; `http://127.0.0.1:8080/health` and (from the mirrored
  WSL node) `http://192.168.1.154:8080/health` both return `200`.
- **Two distinct nodes joined the same self-hosted tailnet**:
  - `wsl-musu-node2` → tailnet IP `100.64.0.9`, OS-tun iface `ts-wslmesh` (`inet 100.64.0.9/32`)
  - `wsl-musu-node3` → tailnet IP `100.64.0.11`, OS-tun iface `ts-wslmesh2`
  - Both shown `online` in `headscale nodes list` simultaneously.
- **Bidirectional WireGuard ping between the two nodes** (direct P2P, DERP not needed):
  ```
  node2(100.64.0.9)  -> node3(100.64.0.11): pong via 10.5.0.2:41651   in 1ms
  node3(100.64.0.11) -> node2(100.64.0.9) : pong via 172.17.0.1:41649 in 1ms
  ```
- **Zero Tailscale.com**: join used a Headscale-issued one-time preauth key
  against the local control server; no external account.

## Honest scope / what this is NOT

- The two nodes are **two isolated tailscaled instances on the SAME WSL host**
  (separate daemons, separate OS-tun interfaces, separate Headscale node records,
  separate WireGuard keys). This proves the mesh's **coordination + routing**
  end-to-end, but it is **not** a two-PHYSICAL-machine proof.
- A true two-physical-machine release proof (a second real PC installing from
  musu.pro and cross-host pinging this host) remains pending. On a single Windows
  host it is blocked by: the system Tailscale service contends for the single
  WinTun kernel driver, so a second isolated Windows engine fails
  (`tstun.New context deadline exceeded`); WSL mirrored networking shares the
  host LAN (192.168.1.154) which is why the WSL nodes reach the control server,
  but it does not give a second independent Windows tun.
- Install artifacts are published (musu.pro → `Install-MUSU.ps1` /
  `musu.appinstaller` / `musu-desktop-x64.msix`), so the remaining step is a
  human installing on a real second machine and joining.

## Reproduce

1. Start Docker Desktop; `docker compose up -d` in
   `~/.musu/private-mesh-control-plane` (Headscale + Caddy).
2. `headscale preauthkeys create --user 1 --reusable` for each node.
3. Per node: `tailscaled --tun=<iface> --socket=<sock> --statedir=<dir> --port=<p>`,
   then `tailscale --socket=<sock> up --login-server http://192.168.1.154:8080 --auth-key <key> --hostname <name>`.
4. `tailscale --socket=<sockA> ping <nodeB-ip>` → expect `pong … in ~1ms`.
