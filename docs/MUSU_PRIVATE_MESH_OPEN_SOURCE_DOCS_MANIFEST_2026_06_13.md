# MUSU Private Mesh Official Docs Manifest

Date: 2026-06-13

Purpose: keep MUSU's network/product decisions grounded in local snapshots of
official documentation and licenses, not memory or marketing claims.

This is not legal advice. Before release, counsel should review redistribution,
trademark, and SaaS/hosted-service implications.

## Already Downloaded

| Project | Local snapshot | Official scope | Count / commit |
| --- | --- | --- | --- |
| Tailscale docs | `docs/vendor/official-network-docs/tailscale-docs/` | `https://tailscale.com/docs` pages from sitemap | 575 pages, 0 failed |
| Headscale docs/repo | `docs/vendor/official-network-docs/headscale/` | Official GitHub repo docs, README, LICENSE, config examples | `21058d11424d5121dbc1eeb3ba0a39d2f462bfcc`, 41 docs files |

## Alternative Candidate Snapshots

| Project | Local repo snapshot | Official docs snapshot | License signal from official files | Initial MUSU fit |
| --- | --- | --- | --- | --- |
| NetBird | `docs/vendor/official-network-docs/alternatives/netbird/` at `b19467e3afd100cdbaa49b12794318472753dbed` | `alternatives/site-docs/netbird-docs/`, 265 pages, 0 failed | BSD-3-Clause for most repo; `management/`, `signal/`, `relay/`, `combined/` are AGPLv3 per repo license | Strong feature match, but AGPL control-plane/relay pieces are a product constraint for closed distribution/hosted modifications. |
| Netmaker | `docs/vendor/official-network-docs/alternatives/netmaker/` at `5f20416e13c307696605551459b116428b4053d3` | `alternatives/site-docs/netmaker-docs/`, 87 pages, 0 failed | Apache-2.0 outside restricted/pro areas per repo license | Good WireGuard management candidate, but less Tailscale-compatible with current MUSU route proof work. |
| Nebula | `docs/vendor/official-network-docs/alternatives/nebula/` at `2e9117da5bc0fc471303028af2b481ac6ce31ef1` | `alternatives/site-docs/nebula-docs/`, 31 pages, 0 failed | MIT | Excellent permissive overlay candidate, but would require MUSU to build more enrollment/control UX itself. |
| OpenZiti | `docs/vendor/official-network-docs/alternatives/openziti-ziti/` at `27790c8cbc42361615e5892f72cc50910bd2725d` | `alternatives/site-docs/openziti-docs/`, 570 pages, 0 failed | Apache-2.0 | Powerful zero-trust network/application framework; likely heavier than the immediate "my machines as one device" need. |
| innernet | `docs/vendor/official-network-docs/alternatives/innernet/` at `cd105cc7c1ee7a306febd3c47c7fa3b455ed8f0d` | repo docs only | MIT | Simple WireGuard private network manager; promising for small teams, but not as maintained/ecosystem-rich as Headscale path. |
| Yggdrasil | `docs/vendor/official-network-docs/alternatives/yggdrasil-go/` at `763db9a1dc2c6b3359e1073a73e914665a1d6bb8` | `alternatives/site-docs/yggdrasil-docs/`, 43 pages, 0 failed | LGPLv3 with static/dynamic linking exception in repo license | Interesting mesh networking, but not the closest fit for predictable private device fleet UX. |
| ZeroTier One | `docs/vendor/official-network-docs/alternatives/zerotier-one/` at `a3b1a346c40a4fe210b190461b5be57c854b6b00` | `alternatives/site-docs/zerotier-docs/`, 243 pages, 0 failed | MPL-2.0 plus non-free/source-available areas per repo license files | Mature feature set, but source-available/non-free areas and external ecosystem make it less clean for MUSU's no-signup default. |

## Product Decision From The Snapshot

MUSU should not default to Tailscale.com signup. The clean default remains:

1. LAN/direct MUSU bridge discovery first.
2. MUSU Private Mesh using MUSU-managed or operator-managed Headscale.
3. Tailscale-compatible client configured with `--login-server=<headscale-url>`.
4. MUSU-owned bridge health, route proof, task execution, and callback reconciliation.

Headscale is still the best immediate path because MUSU already has
Tailscale-compatible route evidence work, Headscale is permissively licensed, and
the user-facing product story is simple: "add my machine" rather than "join a
third-party service."

The closest fallback candidates are:

1. Nebula, if MUSU wants a permissive, embedded overlay and is willing to build
   more control-plane UX itself.
2. Netmaker, if MUSU wants WireGuard management with an Apache-2.0 core and can
   absorb a different routing/control model.
3. OpenZiti, if MUSU evolves toward app-embedded zero-trust networking rather
   than device-level private fleet connectivity.

NetBird is technically attractive but requires careful AGPL analysis because the
control-plane/relay pieces are not all BSD-licensed. ZeroTier is mature but less
clean for a fully self-contained, no-signup MUSU default because the repo includes
MPL and non-free/source-available areas.

## Required Next Verification

- Read each candidate's official install/self-host docs before committing to a
  second network backend.
- Keep Headscale as the default implementation target until a real blocker is
  found.
- Prove MUSU Private Mesh on two physical machines, not only two bridges on one
  host.
- Add installer UX that hides `tailscale login --login-server=<headscale-url>`
  behind "Add this machine to MUSU Private Mesh."
