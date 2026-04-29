# MUSU — AI Agent Team Runtime

> One command. Your AI team starts working.

MUSU runs a team of AI agents on your own machines. CEO distributes tasks, Engineer writes code, QA validates. No cloud dependency. No API key sharing. Your data stays local.

## Quick Start

```bash
curl -fsSL https://musu.pro/install | bash
musu-delegate engineer "Fix the login bug in auth.py"
```

## What Makes MUSU Different

| Feature | Description |
|---------|-------------|
| **Agent Teams** | CEO, Engineer, QA work as a pipeline. Not one agent doing everything. |
| **Ralph Loop** | Drop issues in the board, walk away. Agents process them autonomously. |
| **Wiki Memory** | Agents search wiki before work, record learnings after. Collective memory. |
| **Multi-Node** | Connect multiple machines as one team. Gaming PC + laptop + server. |
| **9 Adapters** | Claude, Gemini, Codex, Hermes, OpenClaw, local LLMs. Swap freely. |
| **OpenAI Proxy** | `/v1/chat/completions` — any OpenAI-compatible tool uses your agents. |
| **A2A Protocol** | Google's Agent-to-Agent standard. External AI systems connect natively. |
| **5-Layer Safety** | Input guard, sandbox bash, tool restriction, budget caps, circuit breakers. |

## How It Works

```
You: "Fix the auth bug"
  |
  v
CEO Agent -----> distributes to Engineer
  |
Engineer -----> writes code, runs tests
  |
QA Agent -----> scores on 4 criteria (functionality, correctness, completeness, quality)
  |
  v
Score < 7/10? --> rework (max 3 attempts)
Score >= 7/10? --> done, issue closed
```

## Architecture

```
musu-bridge (:8070)   Python/FastAPI — orchestration engine
musu-bee    (:3001)   Next.js — web dashboard
musu-control          MCP server — Claude Code integration
musud                 Rust — process supervisor
musu.pro              Vercel — auth, relay, landing
```

## Installation

### One-liner (Linux/macOS/WSL2)
```bash
curl -fsSL https://musu.pro/install | bash
```

### Manual
```bash
git clone https://github.com/yellowhama/musu-bee.git ~/musu-functions
cd ~/musu-functions && bash install.sh
```

### Requirements
- Python 3.10+
- Node.js 16+ (optional, for web UI)
- Git

## Usage

```bash
# Delegate a task to an agent
musu-delegate engineer "Implement user authentication with JWT"

# Start autonomous loop (processes all open issues)
just ralph <company_id>

# Research a topic and save to wiki
musu-delegate cto "Research React Server Components and save findings to wiki"

# Check status
musu status

# View web dashboard
open http://localhost:3001
```

## External Tool Integration

Any OpenAI-compatible tool can use MUSU as its LLM backend:

```yaml
# Hermes Agent (~/.hermes/config.yaml)
model:
  provider: "custom"
  base_url: "http://localhost:8070/v1"

# Or any tool via environment
export OPENAI_BASE_URL=http://localhost:8070/v1
```

## Pricing

| Plan | Price | What You Get |
|------|-------|-------------|
| **Free** | $0 | Local install, unlimited agents, full features |
| **Pro** | $9/mo | Relay (remote access), dashboard, priority support |

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | OpenAI-compatible LLM proxy |
| `/v1/models` | GET | Available agent channels |
| `/.well-known/agent.json` | GET | A2A agent card |
| `/a2a` | POST | A2A JSON-RPC (Send/Get/Cancel/List) |
| `/a2a/stream` | POST | A2A SSE streaming |
| `/api/tasks/delegate` | POST | Delegate task to agent |
| `/api/research` | POST | Research topic, save to wiki |
| `/api/wiki/search` | GET | FTS5 wiki search |
| `/health` | GET | Liveness check |

## License

MIT

## Links

- Website: [musu.pro](https://musu.pro)
- GitHub: [yellowhama/musu-bee](https://github.com/yellowhama/musu-bee)
