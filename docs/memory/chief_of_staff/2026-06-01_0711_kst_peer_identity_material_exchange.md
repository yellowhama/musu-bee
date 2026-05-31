# 2026-06-01 07:11 KST - Peer Identity Material Exchange

Durable memory:

- MUSU now carries advertised peer identity material through the current
  `musu.pro` P2P control-plane path, but it still does not verify peer identity.
- `musu-rs/src/install/tls.rs` computes the SHA-256 fingerprint of the first
  PEM certificate as `sha256:<hex>`.
- Logged-in bridge startup ensures local TLS certs and sends the fingerprint to
  the registry as `cert_fingerprint` and mirrored `peer_public_key` metadata.
- Rendezvous candidate publish sets candidate `public_key` to the local TLS
  certificate fingerprint when `~/.musu/tls/cert.pem` or `MUSU_TLS_CERT` exists.
- Refreshed target candidates carry the advertised fingerprint into
  `ResolvedPeer.meta`, and `bridge::route_evidence` records
  `peer_identity_method=advertised_tls_cert_fingerprint_unverified` plus
  `peer_public_key` when available.
- `musu.pro` route-evidence validation now blocks release-grade claims that set
  `peer_identity_verified=true` without `peer_identity_method` and
  `peer_public_key`.
- Release status remains No-Go: current runtime evidence is still
  `peer_identity_verified=false` and `encryption=none_http_bearer`; real
  release-grade proof requires transport-level remote key ownership plus
  QUIC/TLS encryption on a second-PC route.
- Operator-supplied mDNS logs with Tailscale IPv6 `os error 10065` remain
  explained by disabled-default mDNS behavior: `MUSU_ENABLE_MDNS=1` is required,
  with separate opt-ins for `MUSU_MDNS_ENABLE_IPV6=1` and
  `MUSU_MDNS_ENABLE_TAILSCALE=1`.
