# V26-W10 Registry Invariant — 3-State Mesh Guarantee

**Wiki**: wiki/514 | **Date**: 2026-05-22

## Invariant Statement

> **The musu mesh MUST function correctly in all three registry states.**
> No single point of failure can prevent cross-machine task delegation.

## Three States

### State 1: Registry Healthy

```
musu.pro online → heartbeat refresh → nodes.cache.json valid
```

- `~/.musu/nodes.cache.json` refreshed every heartbeat cycle
- TTL: 7 days (configurable via `MUSU_CACHE_TTL_DAYS`)
- Full capability metadata available (models, ports, GPU info)
- Peer resolver returns registry nodes with highest priority

### State 2: Registry Degraded (Cached Snapshot)

```
musu.pro unreachable → cached snapshot still valid (< 7 days)
```

- `nodes.cache.json` exists but registry is unreachable
- Cache remains valid for 7 days from last successful fetch
- Capabilities reflect last-known state (may be stale)
- Peer resolver falls back to cached snapshot automatically
- **No operator action required** — mesh continues transparently

### State 3: Registry Absent

```
musu.pro down > 7 days OR never configured → manual peers + mDNS only
```

- Cache expired or never created
- Peer discovery sources:
  1. `~/.musu/manual_peers.toml` — `musu peer add <addr>` entries
  2. `~/.musu/nodes.toml` — existing node configuration
- **Operator action**: `musu peer add 192.168.1.50:8070` to add peers manually
- Cross-subnet: manual peer add is the only reliable method

## Peer Resolution Priority

```
1. Cached registry snapshot (if valid, < 7-day TTL)
2. Manual peers (musu peer add)
3. nodes.toml (W7 existing infra)
```

Deduplication: first source wins. Address is the dedup key.

## CLI Commands

```bash
# Add a peer manually (works offline, no registry needed)
musu peer add 192.168.1.50:8070 --name gpu-box

# Remove a manually-added peer
musu peer remove 192.168.1.50:8070

# List all known peers from all sources
musu peer list
```

## Test Matrix

| State | Cache | Manual | nodes.toml | Mesh Works? |
|-------|-------|--------|------------|-------------|
| 1 - Healthy | ✅ valid | optional | optional | ✅ YES |
| 2 - Degraded | ✅ stale (<7d) | optional | optional | ✅ YES |
| 3 - Absent | ❌ expired/missing | ✅ required | optional | ✅ YES* |

\* Requires at least one source of peer information.

## Taleb SPOF Mitigation

Per §0 Expert #2 (Taleb): musu.pro is NOT a SPOF because:
1. Cache TTL provides 7-day buffer for registry outages
2. Manual peers work completely offline
3. nodes.toml provides baseline peer knowledge
4. No single failure mode prevents all peer discovery
