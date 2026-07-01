# Brain Sidecar Doctor and Status Self-Heal (2026-07-01)

## Summary

This change turns the hidden `musu-brain` sidecar from an invisible dependency
into an explicit product health surface.

The trigger was the current package evidence refresh: the packaged bridge and
desktop were still alive, but no `musu-brain` process or `127.0.0.1:8080`
listener existed until the packaged brain binary was restarted with the product
root/env. The brain proof then passed, so the package contract was sound, but
operator visibility and self-heal were too weak.

## Code Changes

- `musu-rs/src/install/cli_commands.rs`
  - Adds a `knowledge` section to `musu doctor --json`.
  - Probes `http://127.0.0.1:8080/health`.
  - Reports product root `~/.musu/brain`, token path, token presence, health
    status/body, and a restart hint without exposing token values.
  - Adds a next-step when `knowledge.status` is not `ok`, so doctor no longer
    reports a ready-looking state while the hidden brain sidecar is down.
- `musu-bee/src-tauri/src/lib.rs`
  - Adds `knowledge_status`, `knowledge_detail`, `knowledge_health_url`, and
    `knowledge_token_present` to `desktop_status`.
  - Parses the new doctor JSON into Cockpit-facing status.
  - Calls `spawn_knowledge_sidecar_autostart()` on manual `desktop_status`
    refresh, making status refresh a safe self-heal trigger for a dead hidden
    sidecar.

## Verification

- `rustfmt --edition 2021 --check` passed for the two touched Rust files.
- `cargo test --manifest-path musu-rs\Cargo.toml doctor_next_steps --lib -j 1 -- --nocapture`
  passed: `3 passed`.
- `cargo test --manifest-path musu-bee\src-tauri\Cargo.toml doctor_status_summary --lib -j 1 -- --nocapture`
  passed: `3 passed`.
- `cargo run --manifest-path musu-rs\Cargo.toml --bin musu --quiet -- doctor --json`
  produced a `knowledge` object with:
  - `status=ok`
  - `root=C:\Users\empty\.musu\brain`
  - `token_present=true`
  - `health_url=http://127.0.0.1:8080/health`
  - `health_http_status=200`
  - `health_body.ok=true`

The same runtime source execution reported unrelated direct-download context
warnings/failures for the local debug binary path and bridge port `8070`. Those
are not failures of the new knowledge sidecar diagnostic; the installed package
bridge remains on `1863`.

## Indexing

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3603 files` and `3920 symbols`.
- Index search for `wiki/1203` returns `docs/WIKI.md`.
- Index search for `BRAIN_SIDECAR_DOCTOR_SELF_HEAL` returns this report and the
  wiki entry.
- Index search for `knowledge_status knowledge_health_url` returns this report
  and the wiki entry.
- Product brain source ingest under `tenant_id=local`, `workspace_id=musu`
  created 3 sources for this report, the wiki entry, and the roadmap snippet.
- `/v1/process` reported `processed=3`, `recovered=0`.
- `/v1/query` for
  `wiki/1203 BRAIN_SIDECAR_DOCTOR_SELF_HEAL knowledge_status` returned 5
  results with top title `wiki/1203 brain sidecar doctor/status self-heal`.

## Product Spec Impact

This does not close the remaining full-product NO-GO blockers. It does close
the MED follow-up found during the current package refresh: a user or agent can
now see whether the hidden brain sidecar is healthy, and a desktop status
refresh can re-trigger the product-owned autostart path.

Remaining product blockers are still the physical/external gates:
two-machine evidence, runtime CPU required machine count, public metadata
DNS/TLS, Store release, Private Mesh packaged proof, release-grade P2P/relay
transport, design approval, and V34 stale self-heal proof.

## Next Steps

1. Rebuild/reinstall a package that includes this source change before treating
   the installed desktop status surface as current package evidence.
2. Add a visible Cockpit affordance only if the new `desktop_status` fields show
   that users need an explicit button beyond automatic status-refresh self-heal.
3. Continue the roadmap blockers that require external or second-machine proof.
