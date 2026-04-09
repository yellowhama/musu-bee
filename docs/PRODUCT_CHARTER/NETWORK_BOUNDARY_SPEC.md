# Network Boundary Spec

## Purpose

Define the technical and product boundary between:
- free local access
- paid remote access

This boundary must be simple enough to explain in one sentence:

**Access inside the user's own trusted network is free.  
Access from outside that network is paid.**

## Free boundary

The following are part of MUSU Core:
- `localhost`
- loopback access (`127.0.0.1`, `::1`)
- private LAN access (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`)
- user-managed internal network access
- user-managed same-site device access

Allowed free interfaces:
- CLI
- MCP
- local web UI
- LAN web UI

## Paid boundary

The following are part of MUSU Connect:
- access over the public internet
- relay-based access
- tunnel-mediated access operated by MUSU
- account-authenticated external browser access
- remote session resume from outside the trusted network
- remote notifications and remote status access tied to MUSU-hosted services

## Technical interpretation

### Core (free)

Core can expose:
- local HTTP server
- LAN-reachable web UI
- local device discovery
- local device orchestration

Core does not require:
- MUSU relay
- MUSU account identity
- MUSU-hosted remote tunnel

### Connect (paid)

Connect adds:
- secure relay / tunnel
- hosted auth and device identity binding
- remote access policy enforcement
- audit trail for external access

## Product copy rule

Do not describe this as "blocking remote access."
Describe it as:
- secure remote access
- remote operating mode
- internet access to your MUSU workspace
- MUSU Connect

## Non-goals

This spec does not define:
- exact relay implementation
- pricing
- pack format

Those belong in separate docs.

