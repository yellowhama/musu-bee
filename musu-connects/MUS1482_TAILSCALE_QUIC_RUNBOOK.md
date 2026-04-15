# MUS-1482 Tailscale QUIC Ping/Pong Runbook

This runbook verifies QUIC handshake plus ping/pong latency over Tailscale between:

- 4060Ti client: `100.126.67.88`
- 5070Ti server: `100.121.211.106`

## Preconditions

1. Both hosts are online in the same tailnet.
2. `musu-connects` repository exists on both hosts.
3. Rust toolchain is installed (`cargo`).

## Server host (5070Ti)

Run on `100.121.211.106`:

```bash
cd /home/hugh51/musu-functions/musu-connects
SERVER_TAILNET_IP=100.121.211.106 COUNT=20 scripts/connects_ping.sh server \
  2>&1 | tee artifacts/mus-1482/server.log
```

Server proof artifact:

- `artifacts/mus-1482/server-proof.json`

## Client host (4060Ti)

Run on `100.126.67.88` while server is listening:

```bash
cd /home/hugh51/musu-functions/musu-connects
CLIENT_TAILNET_IP=100.126.67.88 SERVER_TAILNET_IP=100.121.211.106 COUNT=20 scripts/connects_ping.sh client \
  2>&1 | tee artifacts/mus-1482/client.log
```

Client proof artifact:

- `artifacts/mus-1482/client-proof.json`

## Required acceptance evidence

1. `server.log` and `client.log` command transcripts.
2. `server-proof.json` and `client-proof.json`.
3. `client-proof.json` fields:
- `latencyP50Ms`
- `latencyP95Ms`
- `sample_count`
- `p95Le200ms` must be `true`

## Optional quick summary

```bash
jq '{sample_count, latencyP50Ms, latencyP95Ms, p95Le200ms}' artifacts/mus-1482/client-proof.json
```
