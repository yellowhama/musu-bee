# NAT/Relay Fallback Risk Register

**Status**: Phase 2 complete (local QUIC verified), Phase 3 real-network risks identified
**Last updated**: 2026-04-14
**Owner**: musu-connects team

## Executive Summary

musu-connects implements peer-to-peer QUIC transport with 42 passing unit tests. Current implementation assumes **direct connectivity** with no NAT traversal or relay fallback mechanisms.

**Critical gap**: Real-world deployments will encounter NAT/firewall scenarios where direct P2P fails. Without relay fallback, connectivity success rate in production could drop below 60%.

**Recommendation**: Implement STUN/TURN-based relay fallback before Phase 3 multi-site testing.

---

## 1. NAT Traversal Scenarios

### 1.1 Full Cone NAT (Low Risk)
**Probability**: 15-20% of enterprise networks
**Behavior**: Maps internal `IP:port` → external `IP:port` consistently for all destinations

**Risk Assessment**:
- ✅ Direct P2P: **Works** (STUN hole-punching succeeds)
- ⚠️ Current implementation: **Partial** (requires STUN server for public IP discovery)
- **Mitigation**: Add STUN binding request to discover external address

**Impact if unmitigated**: 0% — P2P works without relay

---

### 1.2 Restricted Cone NAT (Medium Risk)
**Probability**: 30-35% of enterprise/home networks
**Behavior**: Maps internal → external consistently, but only accepts packets from IPs the client has contacted

**Risk Assessment**:
- ⚠️ Direct P2P: **Conditional** (requires simultaneous open / hole-punching)
- ❌ Current implementation: **Fails** (no coordination for simultaneous dial)
- **Mitigation**: Implement rendezvous server for synchronized connection attempts

**Impact if unmitigated**: 30-35% connectivity failure
**Workaround**: Relay fallback required

---

### 1.3 Port-Restricted Cone NAT (High Risk)
**Probability**: 20-25% of corporate networks
**Behavior**: Like Restricted Cone, but also filters by source port

**Risk Assessment**:
- ❌ Direct P2P: **Very difficult** (requires precise port prediction)
- ❌ Current implementation: **Fails** (no port prediction logic)
- **Mitigation**: Use TURN relay server

**Impact if unmitigated**: 20-25% connectivity failure
**Workaround**: TURN relay mandatory

---

### 1.4 Symmetric NAT (Critical Risk)
**Probability**: 25-30% of corporate/mobile networks
**Behavior**: Creates different external `IP:port` mapping per destination

**Risk Assessment**:
- ❌ Direct P2P: **Impossible** without relay
- ❌ Current implementation: **Fails** completely
- **Mitigation**: TURN relay server is the only solution

**Impact if unmitigated**: 25-30% connectivity failure
**Workaround**: TURN relay mandatory

---

### 1.5 Mobile/Carrier-Grade NAT (Critical Risk)
**Probability**: 60-80% of mobile LTE/5G connections
**Behavior**: Double NAT (device → carrier NAT → internet), aggressive timeout (30-60s)

**Risk Assessment**:
- ❌ Direct P2P: **Extremely unreliable**
- ❌ Current implementation: **Fails** (no keepalive, no relay)
- **Mitigation**:
  - TURN relay mandatory
  - Aggressive keepalive (15s interval)
  - Connection migration on IP change

**Impact if unmitigated**: 60-80% mobile connectivity failure
**Workaround**: TURN relay + mobile-aware keepalive

---

## 2. Relay Fallback Architecture

### 2.1 Current Implementation Status

**Implemented**:
- ✅ QUIC endpoint with quinn (confirmed: no simulated transport)
- ✅ Session registry with health tracking
- ✅ Transport state machine (Discovered → Handshaking → Connected → Degraded → Closed)
- ✅ Bi-directional control streams
- ✅ Tailscale/LAN harness for cross-host QUIC (MUS-1482)

**Not Implemented** (relay critical path):
- ❌ STUN client (RFC 5389) for public IP discovery
- ❌ TURN client (RFC 5766) for relay allocation
- ❌ ICE (RFC 8445) candidate gathering and prioritization
- ❌ Relay server infrastructure (self-hosted TURN)
- ❌ Fallback decision logic (direct → STUN hole-punch → TURN relay)
- ❌ Relay cost tracking (bandwidth usage, connection count)

---

### 2.2 Relay Fallback Trigger Conditions

| Condition | Trigger | Fallback Action | Current State |
|-----------|---------|-----------------|---------------|
| Direct dial timeout | No QUIC handshake after 5s | Try STUN hole-punch | ❌ Not implemented |
| STUN hole-punch failure | No connectivity after 10s | Allocate TURN relay | ❌ Not implemented |
| Symmetric NAT detected | STUN response shows different external port per dest | Skip hole-punch, use TURN | ❌ Not implemented |
| Mobile network detected | IP in carrier-grade NAT range (100.64.0.0/10) | Prefer TURN immediately | ❌ Not implemented |
| Connection degraded | `Reachability::Intermittent` + retry_count > 3 | Re-allocate relay | ⚠️ Health tracking exists, no action taken |

**Current behavior**: All connection attempts assume direct P2P. Failure = permanent `Unreachable`.

---

### 2.3 Proposed Relay Architecture

```
┌─────────────────────────────────────────────────────┐
│ musu-connects QUIC Provider                         │
│  ┌──────────────────────────────────────────────┐  │
│  │ 1. Try Direct P2P (5s timeout)                │  │
│  │    ↓ (if timeout)                             │  │
│  │ 2. STUN: Discover public IP + NAT type        │  │
│  │    ↓ (if Symmetric NAT or timeout)            │  │
│  │ 3. TURN: Allocate relay (fallback path)       │  │
│  │    ↓ (if relay allocation fails)              │  │
│  │ 4. Mark peer Unreachable                      │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
         │                      │                  │
         ▼                      ▼                  ▼
    Direct QUIC          STUN Server       TURN Relay Server
   (0ms latency)      (coturn/stund)      (coturn/turnserver)
                      (NAT discovery)      (+50-150ms latency)
```

**Key design decisions**:
- **Timeout progression**: Direct (5s) → STUN (10s total) → TURN (20s total)
- **TURN relay selection**: Prefer geographically closest relay (latency-based)
- **Cost tracking**: Monitor relay bandwidth usage (alert if >10GB/day per peer)
- **Graceful degradation**: If TURN fails, mark peer `Unreachable` but retry every 5 minutes

---

## 3. Phase 3 Blocking Items

### 3.1 Must-Have Before Multi-Site Testing

| Item | Rationale | Estimated Effort | Risk if Skipped |
|------|-----------|------------------|-----------------|
| **STUN client integration** | Public IP discovery needed for 70% of NAT scenarios | 2-3 days | Direct P2P fails for most corporate networks |
| **TURN relay server deployment** | Only solution for Symmetric NAT (30% of networks) | 3-5 days (infra + client) | 30% connectivity failure in production |
| **ICE candidate gathering** | Standard protocol for connection fallback | 5-7 days | Custom fallback logic will be unreliable |
| **Mobile network detection** | Carrier-grade NAT requires immediate relay use | 1-2 days | 80% mobile connectivity failure |
| **Relay cost monitoring** | Prevent runaway bandwidth costs | 1-2 days | Unexpected $1000+/month relay bills |

**Total estimated effort**: 12-19 days (2-3 weeks)

**Recommended approach**: Use existing ICE library (e.g., `str0m`, `webrtc-rs`) instead of custom implementation.

---

### 3.2 Nice-to-Have (Post-Phase 3)

- **Relay server failover**: Multiple TURN servers with health checks
- **Bandwidth optimization**: Adaptive bitrate for relayed connections
- **Connection migration**: Seamless handoff when mobile IP changes
- **NAT type caching**: Remember peer's NAT type to skip STUN on reconnect
- **Custom relay protocol**: Lower latency than TURN (if relay usage >50%)

---

## 4. Implementation Priority

### Phase 3A: Minimum Viable Relay (1 week)
**Goal**: Achieve >90% connectivity in real-world NAT scenarios

1. **Integrate STUN client** (2 days)
   - Use `stun-rs` crate
   - Discover public IP + NAT type
   - Store in `HealthRecord.nat_type` field

2. **Deploy single TURN relay** (2 days)
   - Use coturn (open-source TURN server)
   - Deploy on DigitalOcean/AWS with static IP
   - Configure `turn_relay_url` in QuicEndpointConfig

3. **Implement fallback decision tree** (2 days)
   - Update `QuicProvider::dial()` with timeout + retry logic
   - Add `TransportState::Relaying` enum variant
   - Emit relay usage metrics (Prometheus/statsd)

4. **Add relay monitoring** (1 day)
   - Track bandwidth per peer
   - Alert if relay usage >50% (should prefer direct P2P)

**Acceptance criteria**:
- ✅ Direct P2P works on same LAN
- ✅ STUN hole-punch works through Full Cone NAT
- ✅ TURN relay works through Symmetric NAT
- ✅ Bandwidth monitoring dashboard shows relay usage %

---

### Phase 3B: Production Hardening (1 week)
**Goal**: Reliability + cost control

1. **Multi-region TURN relays** (2 days)
   - Deploy TURN in US-West, US-East, EU, Asia
   - Select relay based on lowest RTT

2. **Connection migration** (2 days)
   - Handle mobile IP changes (LTE → WiFi)
   - Use QUIC connection ID migration

3. **NAT type caching** (1 day)
   - Store `nat_type` in peer discovery metadata
   - Skip STUN probe if cached NAT type = Full Cone

4. **Cost optimization** (2 days)
   - Set relay bandwidth quota per peer (e.g., 1GB/day)
   - Downgrade to `Degraded` state if quota exceeded
   - User-facing message: "Relay bandwidth limit reached, retrying in 1 hour"

**Acceptance criteria**:
- ✅ <10% of connections use relay (most use direct P2P)
- ✅ Mobile IP changes don't drop connection
- ✅ Relay costs <$100/month for 100 active peers

---

### Phase 3C: Advanced Features (Post-MVP)
**Goal**: Performance + scale

1. **Custom relay protocol** (1 week)
   - Replace TURN with WebTransport-based relay
   - Target: <30ms additional latency (vs TURN's 50-150ms)

2. **Peer-assisted relay** (1 week)
   - Use peers with public IPs as relays (BitTorrent-style)
   - Reduces operational relay costs

3. **Selective relay** (3 days)
   - Only relay control channel, send bulk data direct (if possible)

---

## 5. Deployment Checklist

Before declaring Phase 3 "real-network ready":

- [ ] **STUN server deployed** (public IP: `stun.musu.internal:3478`)
- [ ] **TURN server deployed** (public IP: `turn.musu.internal:3478`)
- [ ] **TURN credentials rotation** (30-day expiry)
- [ ] **Bandwidth monitoring dashboard** (Grafana)
- [ ] **Alerting rule**: Relay usage >50% triggers Slack notification
- [ ] **Runbook**: "What to do if TURN relay goes down"
- [ ] **Test plan**: Verify all 5 NAT scenarios (Full Cone, Restricted, Port-Restricted, Symmetric, Carrier-Grade)

---

## 6. Risk Mitigation Summary

| Risk | Probability | Impact | Mitigation Status | Residual Risk |
|------|-------------|--------|-------------------|---------------|
| Direct P2P fails (Symmetric NAT) | 30% | High | ❌ Not mitigated | **30% connectivity failure** |
| Mobile P2P fails (Carrier-Grade NAT) | 80% | Critical | ❌ Not mitigated | **80% mobile failure** |
| TURN relay down | 0.1% | High | ❌ No failover | Single point of failure |
| Relay costs exceed budget | 50% | Medium | ❌ No cost tracking | Potential $1000+/month |
| Connection drops on mobile IP change | 70% | Medium | ❌ No migration | Poor mobile UX |

**Overall connectivity risk**: Without relay fallback, expect **40-50% connection failure rate** in production.

**With Phase 3A mitigation**: Target **>95% connectivity** (5% failure acceptable for rare edge cases).

---

## 7. External Dependencies

| Dependency | Purpose | Risk | Mitigation |
|------------|---------|------|------------|
| **coturn** (TURN server) | Open-source relay server | Maintenance burden | Use managed TURN service (e.g., Twilio STUN/TURN) |
| **str0m** (ICE library) | Rust ICE implementation | Limited production usage | Fallback to webrtc-rs if needed |
| **Cloud provider (AWS/DO)** | TURN server hosting | Downtime / costs | Multi-region deployment |

---

## 8. Success Metrics

**Phase 3 acceptance criteria**:

1. **Connectivity rate**: >95% across all NAT scenarios
2. **Relay usage**: <15% of connections (prefer direct P2P)
3. **Latency overhead**: <50ms p95 for relayed connections
4. **Operational cost**: <$200/month for 500 active peers
5. **Mobile stability**: <5% connection drops on IP change

**How to measure**:
- Emit metrics from `QuicProvider::dial()` → Prometheus
- Dashboard: Connection success rate by NAT type
- Alert: Connectivity rate <90% for 5 minutes

---

## 9. Rollback Plan

If Phase 3 relay implementation introduces instability:

1. **Feature flag**: `MUSU_CONNECTS_ENABLE_RELAY=false` → disable STUN/TURN
2. **Fallback behavior**: Direct P2P only (accept lower connectivity rate)
3. **Monitoring**: Track feature flag usage in production

**Rollback trigger**: Connection success rate <70% after relay deployment

---

## Appendix A: NAT Detection Test Plan

### Test Matrix (All 5 NAT Types × 2 Platforms)

| NAT Type | Test Environment | Expected Behavior | Verification |
|----------|------------------|-------------------|--------------|
| Full Cone | Docker network with iptables rules | Direct P2P succeeds | No relay used |
| Restricted Cone | Simulated with nftables | STUN hole-punch succeeds | `TransportState::Connected` |
| Port-Restricted | Corporate VPN (test account) | TURN relay used | `TransportState::Relaying` |
| Symmetric | AWS NAT Gateway | TURN relay used | `TransportState::Relaying` |
| Carrier-Grade | Mobile hotspot (LTE) | TURN relay used immediately | No STUN attempted |

**Automation**: Use `musu-connectsd tailscale-quic-client` with network namespace isolation.

---

## Appendix B: TURN Server Configuration

### coturn setup (Docker)

```yaml
# docker-compose.yml
services:
  coturn:
    image: coturn/coturn:latest
    ports:
      - "3478:3478/udp"
      - "3478:3478/tcp"
      - "49152-65535:49152-65535/udp"  # Relay port range
    environment:
      - REALM=musu.internal
      - STATIC_SECRET=<generate-with-openssl-rand>
    volumes:
      - ./turnserver.conf:/etc/coturn/turnserver.conf
    restart: unless-stopped
```

### turnserver.conf (minimal)

```
listening-port=3478
relay-ip=<SERVER_PUBLIC_IP>
external-ip=<SERVER_PUBLIC_IP>
realm=musu.internal
use-auth-secret
static-auth-secret=<SAME_AS_DOCKER_ENV>
min-port=49152
max-port=65535
log-file=/var/log/turnserver.log
verbose
```

**Security**: Rotate `static-auth-secret` every 30 days, restrict access to whitelisted IPs.

---

## Appendix C: Estimated Relay Bandwidth

**Assumptions**:
- 500 active peers
- 30% use TURN relay (Symmetric NAT)
- Average 10 KB/s per relayed connection
- 50% duty cycle (active 12h/day)

**Calculation**:
```
500 peers × 30% relay × 10 KB/s × 12h × 3600s/h × 30 days
= 500 × 0.3 × 10 × 12 × 3600 × 30 / 1024^3
≈ 1.7 TB/month
```

**Cost estimate** (AWS EC2 data transfer: $0.09/GB):
```
1700 GB × $0.09 = $153/month
```

**Recommendation**: Start with $200/month budget, set alert at $150.

---

**End of Risk Register**
