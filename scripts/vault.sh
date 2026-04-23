#!/usr/bin/env bash
# Read a secret from ~/.musu/secrets/vault.json
# Usage: source scripts/vault.sh  → sets MUSU_BRIDGE_TOKEN etc.
# Or:    scripts/vault.sh get bridge.token
VAULT="$HOME/.musu/secrets/vault.json"

if [ ! -f "$VAULT" ]; then
    echo "No vault found at $VAULT" >&2
    exit 1
fi

if [ "$1" = "get" ] && [ -n "$2" ]; then
    python3 -c "
import json, sys
d = json.load(open('$VAULT'))
keys = '$2'.split('.')
v = d
for k in keys: v = v[k]
print(v)
" 2>/dev/null
elif [ "$1" = "export" ] || [ -z "$1" ]; then
    export MUSU_BRIDGE_TOKEN=$(python3 -c "import json; print(json.load(open('$VAULT'))['bridge']['token'])" 2>/dev/null)
    export MUSU_TOKEN=$(python3 -c "import json; print(json.load(open('$VAULT'))['cloud']['musu_token'])" 2>/dev/null)
    echo "[vault] exported MUSU_BRIDGE_TOKEN, MUSU_TOKEN"
elif [ "$1" = "list" ]; then
    python3 -c "
import json
d = json.load(open('$VAULT'))
for section, vals in d.items():
    if section.startswith('_'): continue
    if isinstance(vals, dict):
        for k, v in vals.items():
            if k in ('note','_warning'): continue
            val = str(v)
            if len(val) > 20: val = val[:8] + '...' + val[-4:]
            print(f'  {section}.{k:15s} = {val}')
" 2>/dev/null
fi
