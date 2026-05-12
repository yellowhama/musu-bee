# Install

MUSU runs on Linux / macOS / WSL. Each module installs independently.

## Prerequisites

- Python 3.12+
- Node.js 20+ (for `musu-bee`, `musu-relay`)
- Go 1.22+ (only if building `musu-indexer/musu-scanner` from source)
- Optional: Claude / Codex / Gemini CLI binaries for adapter use

## Repo layout assumption

Throughout this document, `$MUSU_FUNCTIONS_ROOT` refers to the directory
where this repo is checked out. Scripts default to
`$(cd "$(dirname "$0")/.." && pwd)`, so explicit env var only needed
in cron / systemd / detached contexts.

## Module install

### musu-bridge (Python)

```bash
cd musu-bridge
python -m venv .venv
. .venv/bin/activate
pip install -e .
```

Bridge config: `~/.musu/bridge.env` (token, optional `MUSU_COMPANY_YAML`).

### musu-core / musu-control / musu-writer / musu-indexer

Same pattern. Each has a local `pyproject.toml`.

### musu-bee (Next.js)

```bash
cd musu-bee
pnpm install
pnpm build
pnpm start
```

### musu-relay (Node.js)

```bash
cd musu-relay
pnpm install
node server.js
```

## Operator data

Create your operator state directory:

```bash
mkdir -p ~/.musu/companies
```

Bind an active company by setting `MUSU_COMPANY_YAML` (or
`MUSU_COMPANY_ID`) in `~/.musu/bridge.env`. See
[`docs/CONFIG.md`](docs/CONFIG.md) and the operator-only
`agents.json.example` for the schema.

## Running

```bash
# Bridge
cd musu-bridge && . .venv/bin/activate && python -m server &

# Web
cd musu-bee && pnpm start &
```

For systemd unit files and cron snippets, see
`scripts/systemd/` and `scripts/auto-update.sh`.
