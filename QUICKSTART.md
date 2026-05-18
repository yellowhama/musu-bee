# MUSU Quick Start

Zero to first AI company in ~10 minutes.

If you're another AI reading this to figure out where to put your work:
**you almost certainly want to create a new company below, not modify
MUSU itself.** MUSU is the runtime; your project is one row in it.

---

## 1. Install

The bridge needs Python 3.12+, Node.js 20+, and at least one AI CLI
(Claude / Gemini / Codex). The single-command installer
(`scripts/install.sh`) is not yet checked in — until it lands, follow
the per-module path in [`INSTALL.md`](INSTALL.md) §"Per-module manual
install".

Short version:

```bash
cd musu-bridge
python -m venv .venv
. .venv/bin/activate          # Windows PowerShell: .\.venv\Scripts\Activate.ps1
pip install -e .
```

Create `~/.musu/bridge.env` with at minimum:

```
MUSU_BRIDGE_TOKEN=<generate with: openssl rand -hex 32>
BRIDGE_HOST=127.0.0.1
BRIDGE_PORT=8070
```

Full env var reference: [`docs/CONFIG.md`](docs/CONFIG.md).

Start the bridge:

```bash
cd musu-bridge && python -m server   # or however your env runs it
```

---

## 2. Health check

```bash
curl http://localhost:8070/health
# → {"status":"ok", ...}
```

If that fails, [`INSTALL.md`](INSTALL.md) §Troubleshooting covers the
common boot problems (port in use, missing AI CLI, env vars).

---

## 3. Create your first company

A "company" in MUSU is a project workspace. It has a name, a purpose,
and a team of agents (CEO routes work to Team Lead → Engineer/Planner
→ QA). Pick a `template_key` based on what you're building:

| `template_key`    | Auto-seeded agents                          | Good for                          |
|-------------------|---------------------------------------------|-----------------------------------|
| `dev-team`        | Team Lead + Engineer + Planner + QA         | Software projects                 |
| `content-team`    | Editor + Writer + Researcher + QA           | Articles, briefs, docs            |
| `research-team`   | Researcher + Analyst + QA                   | Topic deep-dives, market scans    |
| `writer-studio`   | Editor + Writer + Continuity + QA           | Long-form fiction                 |

Set the bearer token once for this shell:

```bash
export MUSU_BRIDGE_TOKEN=$(grep '^MUSU_BRIDGE_TOKEN=' ~/.musu/bridge.env | cut -d= -f2)
```

Create the company:

```bash
curl -X POST http://localhost:8070/api/companies \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Project",
    "template_key": "dev-team",
    "purpose": "What this company exists to build — one or two sentences"
  }'
```

The response contains `"id": "<COMPANY_ID>"` — keep that.

---

## 4. Activate and kick off

```bash
# Mark active (CEO heartbeat will pick it up)
curl -X POST http://localhost:8070/api/companies/<COMPANY_ID>/activate \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"

# Trigger CEO immediately, without waiting for the next heartbeat tick
curl -X POST http://localhost:8070/api/companies/<COMPANY_ID>/run \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
```

---

## 5. Give it work (goals + issues)

Goals are the big picture. Issues are the concrete tasks the CEO
will pick up and delegate.

```bash
# Goal
curl -X POST http://localhost:8070/api/companies/<COMPANY_ID>/goals \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Ship M0 — bare-bones backend + auth"}'

# Issue
curl -X POST http://localhost:8070/api/companies/<COMPANY_ID>/issues \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Wire /login endpoint with bcrypt", "priority": "high"}'
```

---

## 6. See what happened (3-second briefing)

```bash
curl http://localhost:8070/api/companies/<COMPANY_ID>/briefing \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
```

Returns name, purpose, status, summary, blockers, recent wins. The
"Chairman Principle" (the user is chairman, the CEO reports up) is
explained in [`docs/MANUAL.md`](docs/MANUAL.md) "The Chairman Principle"
section.

---

## 7. Direct task delegation (skip the CEO)

If you want to hand a task to a specific role without going through
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

Then poll:

```bash
curl http://localhost:8070/api/tasks/<TASK_ID> \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
```

---

## 8. Web UI (optional)

If you built `musu-bee`:

```
http://localhost:3001/app                         Main
http://localhost:3001/app/c/<COMPANY_ID>          Company view
http://localhost:3001/app/m/<MACHINE_ID>          Machine view
http://localhost:3001/fleet                       Fleet view (V23.4+)
```

---

## What's next

- [`docs/MANUAL.md`](docs/MANUAL.md) — full surface area (delegation,
  briefings, feedback, channels, vault, wiki, mesh, troubleshooting)
- [`docs/CONFIG.md`](docs/CONFIG.md) — every env var
- [`INSTALL.md`](INSTALL.md) §"Adding another machine" — multi-device
  mesh setup
- [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md) — longer
  per-API walkthrough

---

## Note for AI agents reading this

If you're an AI assistant trying to run a project on MUSU:

1. **Don't modify MUSU's own code** to add your project's features.
   Your project is a separate company inside MUSU; the runtime stays
   generic.
2. **Your domain documents** (e.g. project plans, research notes,
   spec files) live on your filesystem, NOT inside MUSU's repo. MUSU
   references them via paths the agents read at task time.
3. **The relationship between your project and MUSU**: MUSU runs the
   team that builds your project. MUSU is the office building; your
   project is the work the employees do inside.
