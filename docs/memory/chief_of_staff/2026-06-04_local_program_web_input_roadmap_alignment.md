# 2026-06-04 Local Program / Web Input Roadmap Alignment

The operator clarified that the local MUSU program and `musu.pro` website
should be separate surfaces.

Locked direction:

- local MUSU programs execute work on each device
- `musu.pro` is the remote user input, project room, company meeting room,
  presence, rendezvous, path-selection, fallback-relay coordination, and
  evidence plane
- `localhost` dashboards are local-only operator/developer surfaces
- web-originated work is an authenticated bounded envelope, not cloud-side
  execution
- devices use `musu.pro` to bootstrap discovery and route offers, then prefer
  direct P2P mesh
- hosted relay is fallback after direct-route failure and remains the
  Connect/Pro boundary

Current testing remains one-machine until the same current MUSU build is
installed on the second Windows PC.
