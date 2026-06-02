# MUSU Troubleshooting Guide

Common issues, symptoms, and fixes for musu-bridge, musu-worker, and mesh networking.

---

## 1. Bridge Won't Start

### Port already in use

**Symptom:** `OSError: [Errno 98] Address already in use` on startup.

**Cause:** Another process (or a previous bridge instance) is occupying port 8070.

**Fix:**
```bash
# Find what is using the port
lsof -i :8070

# Kill it
kill <PID>

# Or change the port
export BRIDGE_PORT=8071
bash scripts/start-bridge.sh
```

### Missing MUSU_BRIDGE_TOKEN in production

**Symptom:** Bridge starts but logs `MUSU_BRIDGE_TOKEN is not set` warning. In production mode (`MUSU_ENV=production`), the bridge may refuse to start or reject all requests.

**Cause:** `MUSU_BRIDGE_TOKEN` is not set in `~/.musu/bridge.env`.

**Fix:**
```bash
# Generate a token
openssl rand -hex 32

# Add it to bridge.env
echo "MUSU_BRIDGE_TOKEN=<paste-token>" >> ~/.musu/bridge.env

# Or re-run install (auto-generates token)
bash scripts/install.sh
```

### Wrong Python version

**Symptom:** `SyntaxError` or `ModuleNotFoundError` on startup (e.g., `from __future__ import annotations` works but `X | Y` union syntax fails).

**Cause:** musu-bridge requires Python 3.12+. Older versions lack required syntax and stdlib features.

**Fix:**
```bash
# Check version
python3 --version

# Install 3.12+ (Ubuntu/Debian)
sudo apt install python3.12 python3.12-venv

# Recreate venv with correct Python
rm -rf musu-bridge/.venv
python3.12 -m venv musu-bridge/.venv
musu-bridge/.venv/bin/pip install -e musu-core/ -e musu-bridge/
```

---

## 2. Agent Unavailable

### Missing command in adapter_config

**Symptom:** Task fails with `AdapterError` (HTTP 502). Logs show `FileNotFoundError: [Errno 2] No such file or directory: 'claude'` or similar.

**Cause:** The agent's `adapter_config.command` points to a CLI binary (`claude`, `codex`, `gemini`) that is not installed or not on `$PATH`.

**Fix:**
```bash
# Check which CLIs are available
which claude codex gemini

# Install the missing CLI (e.g., Claude Code)
npm install -g @anthropic-ai/claude-code

# Or override the command for the agent
# In the agent config, set command to the full path:
#   adapter_config: {"command": "/home/user/.npm-global/bin/claude"}
```

### Circuit breaker open

**Symptom:** Tasks to a remote node fail immediately with `circuit breaker open for node <name>`. No HTTP request is attempted.

**Cause:** The mesh circuit breaker tripped after 3 consecutive failures (default `MUSU_MESH_CB_FAIL_THRESHOLD=3`). The node is blocked for 60 seconds (default `MUSU_MESH_CB_COOLDOWN_SECONDS=60`).

**Fix:**
```bash
# Wait for the cooldown period (default 60s), then retry.

# Or restart the bridge to reset all circuit breakers.
bash scripts/start-bridge.sh

# To increase tolerance before tripping:
export MUSU_MESH_CB_FAIL_THRESHOLD=5
export MUSU_MESH_CB_COOLDOWN_SECONDS=30
```

---

## 3. --mcp-config Error (Old Claude CLI)

**Symptom:** Agent execution fails with stderr: `error: unexpected argument '--mcp-config'` or `Unknown option: --mcp-config`.

**Cause:** The installed Claude CLI version does not support `--mcp-config`. This flag was added in Claude Code v1.x. The `ClaudeLocalAdapter` passes `--mcp-config '{"mcpServers":{}}'` when `disable_mcp=true` in the agent config.

**Fix:**
```bash
# Update Claude Code to latest
npm update -g @anthropic-ai/claude-code

# Check version
claude --version

# Workaround: remove disable_mcp from the agent's adapter_config
# so --mcp-config is never passed.
```

---

## 4. Remote Node Unreachable

**Symptom:** Mesh routing fails with `httpx.ConnectError: Connection refused` or `httpx.ConnectTimeout` when dispatching to a remote node.

**Cause:** One or more of:
- Firewall blocking the bridge port (8070) or worker port (9700).
- The remote node's bridge is bound to `127.0.0.1` instead of `0.0.0.0`.
- Wrong IP in `nodes.toml`.
- musu-worker not running on the remote node.

**Fix:**
```bash
# 1. Verify the remote bridge is reachable
curl -sf http://<remote-ip>:8070/health

# 2. On the remote node, ensure BRIDGE_HOST=0.0.0.0
grep BRIDGE_HOST ~/.musu/bridge.env
# Should be: BRIDGE_HOST=0.0.0.0

# 3. Check firewall (ufw example)
sudo ufw allow 8070/tcp
sudo ufw allow 9700/tcp

# 4. Check nodes.toml has the correct IP
cat ~/.musu/nodes.toml
# Verify url = "http://<correct-tailscale-or-lan-ip>:8070"

# 5. Ensure worker is running on the remote node
curl -sf http://<remote-ip>:9700/health
```

---

## 5. 401 Unauthorized

**Symptom:** API calls return `{"error": "Unauthorized", "code": "unauthorized"}` with HTTP 401.

**Cause:** Token mismatch. The bridge and worker (or peer nodes) are using different tokens.

**Fix:**
```bash
# Check which token the bridge expects
grep MUSU_BRIDGE_TOKEN ~/.musu/bridge.env

# Check which token the worker expects
echo $MUSU_WORKER_TOKEN

# For peer-to-peer sync, MUSU_TOKEN (account-level) must match across all nodes.
# The bridge accepts both MUSU_BRIDGE_TOKEN (local) and MUSU_TOKEN (peer) as valid.

# Fix: copy the same token to all nodes
# On node A:
grep MUSU_BRIDGE_TOKEN ~/.musu/bridge.env
# On node B: set MUSU_TOKEN to node A's MUSU_BRIDGE_TOKEN, or set MUSU_TOKEN
# to the same account-level value on both nodes.

# Note: localhost requests require the bearer token by default.
# Set MUSU_BRIDGE_LOCALHOST_AUTH=0 only for explicit trusted local dev bypass.
```

---

## 6. Task Timeout

**Symptom:** Task completes with `error_code: "timeout"` and message `Timed out after 300s`.

**Cause:** The agent execution exceeded `timeout_sec`. Default is 300s (5 min) for the `claude_local` adapter, configurable per-request up to 3600s.

**Fix:**
```bash
# Increase the global adapter timeout
export MUSU_ADAPTER_TIMEOUT=600  # 10 minutes

# Or set per-agent in adapter_config:
#   adapter_config: {"timeout_sec": 900}

# For worker-side timeouts (CLI execution):
# The CLIRequest timeout_sec caps at 3600s (1 hour).
# The ProcessRequest timeout_sec caps at 7200s (2 hours).

# Check if the task is genuinely slow or stuck:
curl -s http://127.0.0.1:8070/api/tasks/<task-id> | jq .status
```

---

## 7. Rate Limit (429 Too Many Requests)

### Bridge rate limit

**Symptom:** HTTP 429 with `X-RateLimit-Remaining: 0` headers.

**Cause:** Too many requests from the same client (identified by IP or Bearer token). The bridge uses a sliding window rate limiter.

**Fix:**
```bash
# Check current rate limit headers in response
curl -si http://127.0.0.1:8070/api/... | grep RateLimit

# Disable rate limiting entirely (dev only)
export MUSU_DISABLE_RATE_LIMIT=1

# Or wait for the window to reset (check X-RateLimit-Reset header).
```

### Worker concurrency limit

**Symptom:** HTTP 429 from the worker with `Worker is busy (concurrency cap=2, mode=reject)`.

**Cause:** The worker already has `MUSU_WORKER_MAX_CONCURRENT_RUNS` (default: 2) CLI processes running.

**Fix:**
```bash
# Increase concurrent runs (careful: each run consumes significant RAM/GPU)
export MUSU_WORKER_MAX_CONCURRENT_RUNS=4

# Or switch to wait mode (queues instead of rejecting)
export MUSU_WORKER_CONCURRENCY_MODE=wait
export MUSU_WORKER_CONCURRENCY_WAIT_TIMEOUT_SEC=30

# Check current worker stats
curl -s http://127.0.0.1:9700/stats | jq .
```

---

## 8. Empty Response from Agent

**Symptom:** Task succeeds (exit_code=0) but `summary` is empty. Error: `Empty response from Claude`.

**Cause:** One of:
- **Prompt too long**: The prompt exceeds the model's context window. The `ClaudeLocalAdapter` detects keywords like `context`, `too long`, `maximum context`, `context_length` in stderr and classifies this as `CONTEXT_EXCEEDED` (non-retriable -- fallback will not help).
- **Model overloaded**: The API returned a 529 overloaded error. Classified as `RATE_LIMIT` (retriable).
- **Nesting conflict**: Claude Code was launched inside another Claude Code session. The adapter strips `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SESSION`, and `CLAUDE_CODE_PARENT_SESSION` env vars to prevent this, but edge cases can remain.

**Fix:**
```bash
# Check the raw output for clues
curl -s http://127.0.0.1:8070/api/tasks/<task-id> | jq '.execution_log[-1].raw'

# If context exceeded: shorten the prompt or use a model with larger context
# In adapter_config: {"model": "claude-sonnet-4-5"}  (200k context)

# If nesting conflict: ensure musu-worker is NOT started from within
# a Claude Code session. Use systemd or a fresh shell:
bash scripts/start-bridge.sh  # from a plain terminal, not inside claude

# If model overloaded: the adapter retries via the fallback chain.
# Increase fallback depth if needed:
export MUSU_MAX_FALLBACK_DEPTH=5

# Verify the fallback chain is configured on the agent:
# adapter_config: {"fallback_chain": ["claude_local", "gemini_local", "codex_local"]}
```

---

## Error Code Reference

These error codes appear in `AdapterResult.error_code` and determine retry behavior:

| Code | HTTP Hint | Retriable | Description |
|------|-----------|-----------|-------------|
| `rate_limit` | 429, 529 | Yes | API rate limit or model overloaded. |
| `timeout` | *(exit -1)* | Yes | Execution exceeded `timeout_sec`. |
| `model_unavailable` | 500, 502, 503 | Yes | Model server error or model not found. |
| `context_exceeded` | *(varies)* | **No** | Prompt exceeds context window. Fallback will not help. |
| `unknown` | *(other)* | Yes | Unclassified error. Defaults to retriable. |

## MUSU Error Codes (HTTP API)

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `bad_request` | 400 | Malformed request body or parameters. |
| `unauthorized` | 401 | Missing or invalid Bearer token. |
| `forbidden` | 403 | Valid token but insufficient permissions. |
| `not_found` | 404 | Resource (agent, task, process) does not exist. |
| `conflict` | 409 | Resource state conflict (e.g., duplicate creation). |
| `rate_limited` | 429 | Too many requests. Check `X-RateLimit-*` headers. |
| `adapter_error` | 502 | Upstream adapter (Claude CLI, Gemini, Codex) failed. |
| `internal_error` | 500 | Unhandled server error. Check bridge logs. |

---

## Quick Diagnostics

```bash
# Bridge health
curl -s http://127.0.0.1:8070/health | jq .

# Worker health (includes GPU info)
curl -s http://127.0.0.1:9700/health | jq .

# Worker concurrency stats
curl -s http://127.0.0.1:9700/stats | jq .

# Worker capabilities (which CLIs are installed)
curl -s -H "Authorization: Bearer $MUSU_WORKER_TOKEN" http://127.0.0.1:9700/capabilities | jq .

# System health check
musu doctor

# List connected mesh nodes
musu nodes list

# View bridge logs (systemd)
journalctl --user -u musu-bridge -n 50 --no-pager

# View bridge logs (manual start)
tail -50 logs/bridge-install-start.log
```
