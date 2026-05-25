# MUSU Quick Start

Zero to first AI company in ~10 minutes. Self-host. 한국어로 진행해도 됩니다.

> AI agents picking up this repo: read [`README.md`](README.md) §"What
> MUSU is (and is not)" first. Your project is a *company* inside MUSU,
> not a modification to MUSU itself.

---

## 1. Install

One command. Pick your OS.

```bash
# Linux / WSL / macOS
bash scripts/install.sh --service --start
```

```powershell
# Windows (native, no WSL)
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Service -Start
```

The installer creates `~/.musu/`, generates `MUSU_BRIDGE_TOKEN`,
sets up the venv, seeds the system-level agent team, builds the
web UI (if Node.js is present), and registers the bridge as a
systemd / launchd / Task Scheduler service.

Full reference + troubleshooting: [`INSTALL.md`](INSTALL.md).

---

## 2. Health check

```bash
curl http://localhost:8070/health
# → {"status":"ok", ...}
```

Localhost requests bypass auth by default. For LAN/Tailscale access
you'll need the bearer token — grab it once:

```bash
export MUSU_BRIDGE_TOKEN=$(grep '^MUSU_BRIDGE_TOKEN=' ~/.musu/bridge.env | cut -d= -f2)
```

---

## 3. Create your first company

A "company" in MUSU is a project workspace. Pick a template based on
what you're building. Each template auto-seeds a fixed set of agents
defined in [`musu-bridge/company_templates.py`](musu-bridge/company_templates.py)
— here's the actual roster per template:

| `template_key`    | Auto-seeded agents (from `company_templates.py`)    | Good for                       |
|-------------------|------------------------------------------------------|--------------------------------|
| `dev-team`        | Team Lead + Planner + Engineer + QA (4)              | Software projects              |
| `content-team`    | Team Lead + Researcher + Writer + Editor (4)         | Articles, briefs, docs         |
| `research-team`   | Team Lead + Analyst + Researcher + Summarizer (4)    | Topic deep-dives, market scans |
| `writer-studio`   | Lead + PM + Researcher + Writer + Editor (5)         | Long-form fiction              |

System-level agents (CEO / CTO / Engineer / CoS / QA / Worker — 6
seeded by `seed_agents.py` at install) are separate from per-company
teams. The CEO delegates *across* companies; each company's Team Lead
delegates *within* it.

Create the company. The response wraps `id` under `company`, so we
extract with `jq`:

```bash
COMPANY_ID=$(curl -s -X POST http://localhost:8070/api/companies \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Project",
    "template_key": "dev-team",
    "purpose": "What this company exists to build — one or two sentences"
  }' | jq -r '.company.id')

echo "COMPANY_ID=$COMPANY_ID"
```

(No `jq`? Pipe to `python3 -c "import sys,json; print(json.load(sys.stdin)['company']['id'])"`
instead.)

The response shape is `{"company": {...}, "agents": [...], "governance": {...}}`
— the company row, the auto-created agents, and the harness governance
config from the template.

---

## 4. Activate and kick off

```bash
# Mark active so the CEO heartbeat picks it up
curl -X POST http://localhost:8070/api/companies/$COMPANY_ID/activate \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"

# Run CEO immediately without waiting for the next heartbeat tick
curl -X POST http://localhost:8070/api/companies/$COMPANY_ID/run \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
```

---

## 5. Give the company work — goals and issues

Goals are the big picture. Issues are concrete tasks the CEO picks up
and delegates.

```bash
# Goal (long-term direction)
curl -X POST http://localhost:8070/api/companies/$COMPANY_ID/goals \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Ship M0 — bare-bones backend + auth"}'

# Issue (one task)
curl -X POST http://localhost:8070/api/companies/$COMPANY_ID/issues \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Wire /login endpoint with bcrypt", "priority": "high"}'
```

---

## 6. 3-second briefing

```bash
curl http://localhost:8070/api/companies/$COMPANY_ID/briefing \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
```

Returns name, purpose, status, summary, blockers, recent wins. This is
the Chairman Principle in action — the CEO reports up to you, you don't
read raw logs. See [`docs/MANUAL.md`](docs/MANUAL.md) "The Chairman
Principle" section.

---

## 7. Direct task delegation (skip the CEO)

If you want to hand a task straight to a role without going through
goals/issues:

```bash
curl -X POST http://localhost:8070/api/tasks/delegate \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "engineer",
    "text": "Fix the login bug at auth.py:45. pytest tests/test_auth.py must pass."
  }'
# → {"task_id": "..."}
```

Poll:

```bash
curl http://localhost:8070/api/tasks/<TASK_ID> \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
```

Note: `channel` is the role selector here (the bridge routes by channel
name — `engineer`, `cto`, `ceo`, etc.).

---

## 8. Web UI (optional)

If `musu-bee` built successfully during install:

```
http://localhost:3001/app                       Main
http://localhost:3001/app/c/<COMPANY_ID>        Company view
http://localhost:3001/app/m/<MACHINE_ID>        Machine view
http://localhost:3001/fleet                     Fleet view (V23.4+)
```

---

## 9. Multi-Machine Binding (V27+)

MUSU naturally binds all your devices together into one seamless work environment.

- **Mesh File Proxy**: Stream or download files from remote machines directly using the bridge API: `GET /api/v1/fs/proxy/:node_id/*path`.
- **WebRTC Remote View**: Open the Machine view (`/m/<MACHINE_ID>`) in `musu-bee` to view a low-latency, real-time screen feed of any remote node in your fleet.
- **Universal Clipboard**: Copy text on one machine, and the clipboard is seamlessly broadcasted and synced to all other connected MUSU machines in real-time.

---

## Where to go next

- [`docs/MANUAL.md`](docs/MANUAL.md) — full API surface: delegation,
  briefings, feedback, channels, vault, wiki, mesh, troubleshooting
- [`docs/CONFIG.md`](docs/CONFIG.md) — every env var
- [`docs/ONBOARDING.md`](docs/ONBOARDING.md) — adding another machine
  to an existing mesh (Tailscale + peer pairing)
- [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md) — longer
  per-API walkthrough with multi-node examples

---

---

For the "MUSU is the runtime, your project is a company *inside* it"
framing — see [`README.md`](README.md) §"What MUSU is (and is not)".
