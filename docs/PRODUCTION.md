# MUSU Production Deployment Guide

## Prerequisites

- Python 3.12+
- One of: `claude`, `gemini`, or `codex` CLI installed and authenticated
- Tailscale installed (for multi-machine)
- systemd (for service management)

## Security Checklist

### 1. Generate Strong Tokens

```bash
# Bridge token (min 32 chars in production)
openssl rand -hex 32 > ~/.musu/bridge_token
export MUSU_BRIDGE_TOKEN=$(cat ~/.musu/bridge_token)
```

### 2. Firewall Rules

Only expose ports within Tailscale network:

```bash
# Allow bridge (8070) and worker (9700) only from Tailscale
sudo ufw allow from 100.64.0.0/10 to any port 8070
sudo ufw allow from 100.64.0.0/10 to any port 9700
sudo ufw deny 8070
sudo ufw deny 9700
```

### 3. TLS with Caddy (Optional)

```Caddyfile
musu.yourdomain.com {
    reverse_proxy localhost:8070
}
```

### 4. Production Environment

Set in `~/.musu/bridge.env`:

```bash
MUSU_ENV=production          # Enforces min 32-char token
MUSU_BRIDGE_TOKEN=<strong-token>
BRIDGE_HOST=0.0.0.0
```

## Backup Strategy

```bash
# Daily backup (add to cron)
cp ~/.musu/db/musu.db ~/.musu/db/musu.db.bak.$(date +%Y%m%d)
find ~/.musu/db/ -name "*.bak.*" -mtime +7 -delete

# Config backup
tar czf ~/.musu/config-backup.tar.gz ~/.musu/nodes.toml ~/.musu/bridge.env
```

## Token Rotation

```bash
NEW_TOKEN=$(openssl rand -hex 32)
sed -i "s/^MUSU_BRIDGE_TOKEN=.*/MUSU_BRIDGE_TOKEN=$NEW_TOKEN/" ~/.musu/bridge.env
systemctl --user restart musu-bridge
# Then re-exchange tokens with peers:
# musu nodes add <peer-ip> --name <peer>
```

## Rollback Procedure

```bash
git log --oneline -5          # Find commit
git revert HEAD               # Safe revert
systemctl --user restart musu-bridge
musu update                   # Sync all nodes
musu doctor                   # Verify
```

## Monitoring

```bash
# Health checks
curl localhost:8070/health
curl localhost:8070/health/ready
musu status

# Prometheus metrics at localhost:8070/metrics
# Key: http_requests_total, musu_tasks_total, http_request_duration_seconds

# Logs
journalctl --user -u musu-bridge -f
```

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Error rate | >5% | >20% |
| p99 latency | >30s | >60s |
| Circuit breakers OPEN | any | >3 |
| DB size | >500MB | >1GB |

## Database Maintenance

```bash
# Check size
ls -lh ~/.musu/db/musu.db

# Clean old data (>30 days) + vacuum
sqlite3 ~/.musu/db/musu.db "
DELETE FROM route_executions WHERE created_at < datetime('now', '-30 days');
VACUUM;"
```

## Scaling

| Component | CPU | RAM | Disk |
|-----------|-----|-----|------|
| Bridge | 1 core | 512MB | 100MB + DB |
| Worker | 0.5 core | 256MB | minimal |
| Per AI task | 0.5 core | 1-2GB | temporary |

Defaults: 20 max concurrent tasks, 5 per channel. Adjust:
```bash
MUSU_MAX_CONCURRENT_TASKS=40
MUSU_CHANNEL_MAX_TASKS=10
```
