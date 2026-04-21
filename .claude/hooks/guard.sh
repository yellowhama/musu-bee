#!/usr/bin/env bash
# musu-functions Bash guard hook
# Blocks dangerous commands before execution.
# Input: STDIN = JSON {"tool_input": {"command": "..."}}

set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")

# ── 1. Destructive filesystem ops ─────────────────────────────────────────────
# Match any flag ordering: rm -rf, rm -fr, rm -f -r, rm -r -f, etc.
if echo "$CMD" | grep -qE 'rm\s+(-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*|-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*)\s+/'; then
    echo '{"decision":"block","reason":"rm -rf on absolute path blocked. Use targeted deletion only."}' >&2
    exit 2
fi
if echo "$CMD" | grep -qE 'rm\s+--recursive.*force|rm\s+--force.*recursive'; then
    echo '{"decision":"block","reason":"rm --recursive --force blocked. Use targeted deletion only."}' >&2
    exit 2
fi

# ── 2. Force push ─────────────────────────────────────────────────────────────
if echo "$CMD" | grep -qE 'git\s+push\s+(--force|-f)\b'; then
    echo '{"decision":"block","reason":"Force push blocked. Use --force-with-lease or open a PR."}' >&2
    exit 2
fi

# ── 3. Hard reset ─────────────────────────────────────────────────────────────
if echo "$CMD" | grep -qE 'git\s+reset\s+--hard'; then
    echo '{"decision":"block","reason":"git reset --hard blocked. Use git stash or create a backup branch first."}' >&2
    exit 2
fi

# ── 4. Direct push to main/master ─────────────────────────────────────────────
if echo "$CMD" | grep -qE 'git\s+push\s+.*\s+(main|master)\b'; then
    echo '{"decision":"block","reason":"Direct push to main/master blocked. Create a branch and PR."}' >&2
    exit 2
fi

# ── 5. Schema file write guard ────────────────────────────────────────────────
if echo "$CMD" | grep -qE 'migrations\.py'; then
    # Allow reads; block writes: sed -i, redirect (> or >>), tee, mv/cp overwrites
    if echo "$CMD" | grep -qE 'sed\s+-i|>{1,2}\s*migrations\.py|tee\s+migrations\.py|mv\s+.*migrations\.py|cp\s+.*migrations\.py'; then
        echo '{"decision":"block","reason":"Direct migration file rewrite blocked. Add a new migration function instead."}' >&2
        exit 2
    fi
fi

# ── 6. .env / secret file leakage ─────────────────────────────────────────────
# Block direct cat of .env files or echo of secret variable values
if echo "$CMD" | grep -qE 'cat\s+.*\.env(\s|$)|echo\s+.*\$MUSU_BRIDGE_TOKEN|echo\s+.*\$MUSU_TOKEN'; then
    echo '{"decision":"block","reason":"Potential secret exposure blocked."}' >&2
    exit 2
fi

# All clear
exit 0
