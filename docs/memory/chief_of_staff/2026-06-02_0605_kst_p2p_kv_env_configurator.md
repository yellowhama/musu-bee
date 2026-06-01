# CoS Memory: hosted P2P KV env configurator

Date: 2026-06-02 06:05 KST

Goal movement: `musu.pro` P2P control-plane is no longer blocked only by an
English runbook. Added an operator-safe script:

- `scripts\windows\configure-musu-pro-p2p-env.ps1`
- schema: `musu.configure_musu_pro_p2p_env.v1`
- sets `KV_REST_API_URL` as a GitHub variable by default
- sets `KV_REST_API_TOKEN` as a GitHub secret
- accepts optional relay policy env names
- can trigger `deploy-musu-bee.yml`
- sends values to `gh` over stdin and does not print secret values

Validation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\configure-musu-pro-p2p-env.ps1 `
  -KvRestApiUrl 'https://kv.example.invalid' `
  -KvRestApiToken 'redacted-test-token' `
  -DryRun `
  -Json
```

Dry-run returned `ok=true`, `dry_run=true`, requested `KV_REST_API_URL` as a
variable and `KV_REST_API_TOKEN` as a secret, with no missing required values
and no errors.

External state still needed: real Vercel KV / Upstash values. Until those are
provided and deployed, live `musu.pro` P2P evidence still fails
`p2p_relay_lease_kv_not_configured`.

Indexer refresh: `musu indexer sync --work-dir F:\workspace\musu-bee --name
musu-bee` indexed 1263 files and 2214 symbols after this wiring and docs
update.
