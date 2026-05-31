# 2026-05-31 15:25 KST - mDNS Health Hardening

## Durable Decision

- A current smoke revalidation exposed a Windows/Tailscale mDNS failure mode: with a logged-in default `~/.musu`, bridge `/health` could time out after the initial `musu up` probe.
- mDNS LAN auto-discovery is now opt-in via `MUSU_ENABLE_MDNS=1`.
- Store-candidate smoke/release paths should keep mDNS disabled unless the mDNS path has separate Windows/Tailscale regression evidence.

## Product Spec Impact

- Cloud/manual peer registration and the second-PC return handoff are the canonical release-test path for `1.15.0-rc.1`.
- mDNS remains a future/local-LAN feature, but it is not required for first Store submission readiness.
