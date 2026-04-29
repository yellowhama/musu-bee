# MUSU — project commands
# Install: cargo install just || brew install just

# Start all services (one command)
start:
    systemctl --user start musu.target

# Stop all services
stop:
    systemctl --user stop musu.target

# Restart everything
restart:
    systemctl --user restart musu.target

# Show status
status:
    @echo "=== systemd ==="
    @systemctl --user is-active musu-bridge musu-bee musud 2>/dev/null || true
    @echo "=== musud ==="
    @musu status 2>/dev/null || true
    @echo "=== ports ==="
    @for p in 8070 3001 3000 1355; do lsof -ti:$$p >/dev/null 2>&1 && echo "  :$$p ✅" || echo "  :$$p ❌"; done

# View bridge logs
logs:
    tail -f logs/bridge-$(date +%Y%m%d).log

# Run tests
test:
    python -m pytest musu-bridge/tests/ -q

# Build bee production
build-bee:
    cd musu-bee && ./node_modules/.bin/next build

# Install on this machine
install:
    bash install.sh

# Update from git + reinstall
update:
    git pull origin main && bash install.sh

# Ralph Loop — start autonomous iteration
ralph company_id:
    curl -s -X POST http://127.0.0.1:8070/api/ralph/start -H "Content-Type: application/json" -d '{"company_id":"{{company_id}}","max_iterations":20}'

# Ralph Loop — check status
ralph-status company_id:
    curl -s http://127.0.0.1:8070/api/ralph/status/{{company_id}} | python3 -m json.tool

# Delegate task to agent
delegate channel instruction:
    curl -s -X POST http://127.0.0.1:8070/api/tasks/delegate -H "Content-Type: application/json" -d '{"channel":"{{channel}}","text":"{{instruction}}","sender_id":"just","expected_output":"result"}'

# Check 5070 node
check-5070:
    @curl -sf --max-time 5 http://100.121.211.106:8070/health && echo " ← 5070 UP" || echo "5070 DOWN"

# Sync LLM Wiki across machines (git push/pull)
wiki-sync:
    bash scripts/sync-wiki.sh

# Clean stale data (old failed executions)
clean:
    python3 -c "import sqlite3; c=sqlite3.connect('$HOME/.musu/musu.db'); c.execute(\"DELETE FROM route_executions WHERE status='failed' AND created_at < datetime('now', '-7 days')\"); print(f'cleaned {c.total_changes} old failed executions'); c.commit(); c.close()"

# Purge retired agents from DB
purge-retired:
    python3 -c "import sqlite3; c=sqlite3.connect('$HOME/.musu/musu.db'); c.execute(\"DELETE FROM agents WHERE status='retired'\"); print(f'purged {c.total_changes} retired agents'); c.commit(); c.close()"
