# MUSU 1.15.0-rc.1 Current mDNS Regression and P2P KV Blocker Audit

Date: 2026-06-02 12:38 KST
Clean source commit: `6f3f598271ec0b6225524c7d63bbd8da068e7ae5`

## Scope

This audit continues the idle busy-loop and `musu.pro` P2P control-plane work.
It checks two current risks:

- whether the operator-reported Windows/Tailscale mDNS error pattern is still
  reproducible on the current source
- whether `musu.pro` owner-scoped P2P control-plane evidence can be closed with
  currently available environment/configuration

## mDNS Regression Result

Targeted mDNS tests passed:

```powershell
cargo test --manifest-path .\musu-rs\Cargo.toml --lib -j 1 peer::mdns::tests::
```

Result:

- `virtual_mdns_interface_filter_matches_vpn_and_vm_adapters`: pass
- `virtual_mdns_interface_filter_allows_normal_lan_names`: pass
- `mdns_receive_error_classification_breaks_on_disconnected_channel`: pass
- total: `3/3`

The current debug binary was rebuilt:

```powershell
cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1
```

Result:

- passed
- build time: `8m 38s`

Current-source mDNS discovery regression:

```powershell
$env:RUST_LOG = 'debug'
Remove-Item Env:\MUSU_ENABLE_MDNS -ErrorAction SilentlyContinue
Remove-Item Env:\MUSU_MDNS_ENABLE_IPV6 -ErrorAction SilentlyContinue
Remove-Item Env:\MUSU_MDNS_ENABLE_TAILSCALE -ErrorAction SilentlyContinue
Remove-Item Env:\MUSU_MDNS_ENABLE_VIRTUAL_INTERFACES -ErrorAction SilentlyContinue
.\musu-rs\target\debug\musu.exe discover --timeout 2
```

Result:

- exit code: `0`
- `mDNS IPv6 interfaces disabled by default`
- `mDNS Tailscale interfaces disabled by default`
- `mDNS virtual/VPN interfaces disabled by default`, disabled `9`
- outbound multicast sent only on physical LAN interface `이더넷 2`
- no `Failed to send`
- no `ff02::fb`
- no Windows `os error 10065`
- no `closed channel`

The only line containing `Tailscale` was the expected debug line stating that
Tailscale mDNS interfaces are disabled by default.

Interpretation: the supplied Tailscale IPv6 mDNS error remains a real failure
class for stale builds or explicit mDNS/IPv6/Tailscale/virtual-interface
opt-ins, but it is not reproduced on the current source with default env.

## P2P Control-Plane KV Status

`show-musu-pro-p2p-env-status.ps1 -Json` reports:

- `ok=false`
- `base_url=https://musu.pro`
- GitHub secret present: `MUSU_P2P_CONTROL_TOKEN_SHA256S`
- missing required names:
  - `KV_REST_API_TOKEN`
  - `KV_REST_API_URL`
- latest live evidence remains failed:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-041225-musu.pro.evidence.json`
- error class: `p2p_relay_lease_kv_not_configured`
- `owner_scope_verified=false`
- `owner_scoped=false`
- `relay_default_data_path=false`

Local environment also does not provide the required KV values:

- `KV_REST_API_URL`: not present
- `KV_REST_API_TOKEN`: not present
- `MUSU_P2P_CONTROL_TOKEN_SHA256S`: not present locally

Repository file scan found only examples/config references:

- `.env.example`
- `musu-bee\.env.local.example`
- `musu-bee\vercel.json`

No usable KV secret material is available in the current workspace/session.

## Decision

No code change is needed for the current mDNS/Tailscale default path.

The `musu.pro` P2P control-plane gate cannot be closed from this session until
production KV/Upstash credentials are provisioned and set as GitHub/Vercel
environment values. This is not a code blocker; it is a production
configuration/evidence blocker.

## Required Next Actions

1. Provision Vercel KV or Upstash Redis for the `musu.pro` project.
2. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` without printing secret values.
3. Keep or rotate `MUSU_P2P_CONTROL_TOKEN_SHA256S`.
4. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\configure-musu-pro-p2p-env.ps1 `
  -FromEnvironment `
  -Deploy `
  -WatchDeploy `
  -Json
```

5. Rerun:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\record-p2p-control-plane-evidence.ps1 -Json
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\write-release-go-no-go.ps1 -Json
```

Public release remains No-Go until this P2P control-plane evidence, second-PC
runtime/route evidence, `musu@musu.pro` mailbox evidence, and Store evidence
all pass.

