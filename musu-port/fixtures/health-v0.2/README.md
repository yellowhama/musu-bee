# /health v0.2 Samples

This directory stores machine-captured `/health` payloads used by `MUS-1828`.

Current files:
- `5070ti.health.json`
- `4060ti.health.json`
- `local-proof.health.json` (local dev capture, schema sanity check only)

The 5070Ti/4060Ti files intentionally contain `[TBD: awaiting real data]` markers.  
Run `scripts/verify-health-v02.sh` to validate schema and detect unresolved placeholders.

## Capture Commands (run on each target machine)

```bash
curl -sS http://127.0.0.1:23880/health > /tmp/health.json
```

Then copy the capture into this folder:

```bash
cp /tmp/health.json fixtures/health-v0.2/5070ti.health.json
# or
cp /tmp/health.json fixtures/health-v0.2/4060ti.health.json
```
