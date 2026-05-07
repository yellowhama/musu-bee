# MUSU Monitoring Guide

## Quick Health Check

```bash
# One command
musu status

# Or individual checks
curl localhost:8070/health          # Bridge liveness
curl localhost:8070/health/ready    # Bridge + DB readiness
curl localhost:9700/health          # Worker liveness
```

## Prometheus Metrics

Available at `http://localhost:8070/metrics`.

### Custom Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `agent_tasks_total` | counter | channel, status | Tasks delegated by channel and outcome |
| `agent_task_duration_seconds` | histogram | channel | Wall-clock time per task |
| `active_tasks_count` | gauge | — | Currently running async tasks |
| `task_stuck_total` | counter | channel, reason | Stuck task detections |

### HTTP Metrics (auto-instrumented)

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_requests_total` | counter | method, status, handler | Total requests |
| `http_request_duration_seconds` | histogram | handler | Latency per endpoint |
| `http_request_duration_highr_seconds` | histogram | — | High-resolution latency (percentiles) |
| `http_request_size_bytes` | summary | handler | Request body size |
| `http_response_size_bytes` | summary | handler | Response body size |

### Process Metrics (auto)

| Metric | Description |
|--------|-------------|
| `process_resident_memory_bytes` | RAM usage |
| `process_cpu_seconds_total` | CPU time |
| `process_open_fds` | Open file descriptors |

## Alert Rules (Recommended)

### Critical

```yaml
# Error rate > 20%
- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.20
  for: 2m

# All tasks failing
- alert: AllTasksFailing
  expr: rate(agent_tasks_total{status="failed"}[10m]) > 0 and rate(agent_tasks_total{status="done"}[10m]) == 0
  for: 5m

# Bridge down
- alert: BridgeDown
  expr: up{job="musu-bridge"} == 0
  for: 30s
```

### Warning

```yaml
# Error rate > 5%
- alert: ElevatedErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
  for: 5m

# Task latency > 30s p99
- alert: HighTaskLatency
  expr: histogram_quantile(0.99, rate(agent_task_duration_seconds_bucket[5m])) > 30
  for: 5m

# Stuck tasks
- alert: StuckTasks
  expr: increase(task_stuck_total[10m]) > 0
  for: 1m

# Too many concurrent tasks
- alert: HighConcurrency
  expr: active_tasks_count > 15
  for: 5m
```

## Logging

### Log Location

```bash
# systemd journal (recommended)
journalctl --user -u musu-bridge -f
journalctl --user -u musu-bridge --since "1 hour ago"

# File logs (if configured)
tail -f ~/musu-functions/logs/bridge-$(date +%Y%m%d).log
```

### Log Format

Logs are JSON-structured:
```json
{"time": "2026-05-07T06:42:10", "level": "INFO", "logger": "handlers", "msg": "route_chat: start channel='worker'"}
```

### Key Log Patterns to Watch

| Pattern | Meaning | Action |
|---------|---------|--------|
| `adapter failure` | Agent CLI returned error | Check `musu doctor` |
| `circuit open` | Channel circuit breaker tripped | Wait 60s or restart bridge |
| `remote_unreachable` | Peer node down | Check peer with `musu status` |
| `token_audit` | Token usage logged | Normal — cost tracking |
| `sync_engine: cannot reach` | Peer sync failed | Check peer network |

## Dashboard: musu status

```
$ musu status
  ✓ Bridge       http://localhost:8070
  ✓ Relay        connected
  ✓ Worker       http://localhost:9700
  ✓ Agents       44/44 active
  ✓ Nodes        2/2 healthy

  Recent tasks:
    ✓ [done] worker What is 3*7?
    ✗ [failed] team_lead ...
    ✓ [done] 4060-CEO ...

  Docs: http://localhost:8070/docs
```

## Circuit Breaker Status

```bash
curl localhost:8070/api/system/circuit-breakers
```

Returns per-channel state: CLOSED (normal), OPEN (failing), HALF_OPEN (testing).
