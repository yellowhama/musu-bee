# Agent Manual — Deploy the musu.pro Site (Vercel CLI)

You are a deploy agent. This manual lets any agent ship the **musu.pro** website
(the Next.js web UI) via the **Vercel CLI** — the same `vercel pull / build / deploy`
sequence the CI workflow runs. It is the site-deploy counterpart to
`scripts/codex-deploy.md` (which deploys the *bridge*, not the site).

> **What this deploys:** the public **musu.pro** site — `F:\workspace\musu-bee\musu-bee\`
> (Next.js 16, App Router). NOT the desktop cockpit, NOT the bridge.
>
> **Deploy engine = the Vercel CLI.** A `git push` does not magically deploy — it
> triggers `.github/workflows/deploy-musu-bee.yml`, which runs the *exact same*
> `vercel pull/build/deploy` CLI commands shown below. Pushing = letting CI run the
> CLI for you. Running the CLI yourself (Path B) does the identical thing by hand.

---

## Facts (verified 2026-06-26, from code/config — not memory)

| Thing | Value / location |
|-------|------------------|
| Site code root | `F:\workspace\musu-bee\musu-bee\` (the nested inner `musu-bee/`) |
| GitHub repo | `https://github.com/yellowhama/musu-bee` |
| Vercel project | `musu-pro` — `projectId prj_nJ9kjrT9K6WD6WisteXZDHmHZ6uS`, `orgId team_rx99FahtX6JIGNevvntRJthS` (already linked in `musu-bee/.vercel/project.json`) |
| Region | `icn1` (Seoul) — `musu-bee/vercel.json` |
| Public URL | `https://musu.pro` |
| Vercel CLI version | **pin `54.7.1`** (CI pins it; a too-old CLI is rejected by Vercel's deploy endpoint) |
| Build command | `npm run build` (= `next build --webpack`; plain `next build` / Turbopack fails with a WorkerError — tooling issue, not a code bug) |
| CI workflow | `.github/workflows/deploy-musu-bee.yml` — runs the CLI on push (main→production, PR→preview) |
| Health check | `GET https://musu.pro/api/health` → `{"ok": true}` |
| Vercel token | `F:\Aisaak\Projects\yellow.txt`, the `vercel` section — first `vcp_...` line. **Read at deploy time; never paste the value into any file, commit, or log.** |

---

## Path A — Vercel CLI directly (the canonical deploy). USE THIS.

`.vercel/project.json` is already linked, so **no `vercel link` is needed.**

### Step 1 — Get the token into a shell variable (never into a tracked file)
```bash
VERCEL_TOKEN="$(awk '/^vercel$/{f=1;next} f&&/^vcp_/{print;exit}' /f/Aisaak/Projects/yellow.txt)"
```

### Step 2 — Build locally first (catch errors before deploying)
```bash
cd F:/workspace/musu-bee/musu-bee
npm ci
npm run build   # MUST be `npm run build` (webpack). Node SQLite ExperimentalWarning is harmless.
```
Do not deploy a red build. Fix locally and re-run.

### Step 3 — Production desktop-latest gate before deploy
Site deploy and desktop artifact publish are separate. Vercel deploy updates
`musu.pro`; it does **not** upload GitHub release assets under `desktop-latest`.
Before any production deploy that changes `/download`, `/install`, `/install.ps1`,
`publicRelease.ts`, `VERSION`, or MSIX/AppInstaller output, run:

```powershell
cd F:\workspace\musu-bee
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\publish-desktop-latest-assets.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\canary-desktop-release.ps1 -Json
```

Expected: `publish-desktop-latest-assets.ps1 -DryRun` passes local preflight
without uploading, and `canary-desktop-release.ps1` returns
`schema=musu.desktop_release_canary.v5` and `ok=true`. If `desktop-latest` is
stale and the operator approves publishing, use the guarded publisher instead of
handwritten upload commands:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\publish-desktop-latest-assets.ps1 -ConfirmUpload
```

Then rerun the desktop canary. Do **not** run the production deploy block below
while desktop canary reports an older appinstaller or installer script.

### Step 4 — The deploy: `pull → build → deploy` (exactly what CI runs)
```bash
cd F:/workspace/musu-bee/musu-bee
npx -y vercel@54.7.1 pull   --yes --environment=production --token="$VERCEL_TOKEN"
npx -y vercel@54.7.1 build  --prod                          --token="$VERCEL_TOKEN"
url=$(npx -y vercel@54.7.1 deploy --prebuilt --yes --prod   --token="$VERCEL_TOKEN")
echo "deployed: $url"
```
`--prod` promotes to the production alias `musu.pro` automatically. For a **preview**
(no production promotion), drop `--prod` from `build` and `deploy` and use
`--environment=preview` in `pull`.

### Step 5 — Verify live + inspect on failure
```bash
curl -s https://musu.pro/api/health          # expect {"ok":true}
# on failure:
npx -y vercel@54.7.1 inspect "$url" --logs --token="$VERCEL_TOKEN"
npx -y vercel@54.7.1 logs    "$url"        --token="$VERCEL_TOKEN"
```
Before telling anyone to install from another PC, verify the live one-line
installer endpoint too:
```powershell
cd F:\workspace\musu-bee
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-musu-pro-install-channel.ps1 -Json
```
If you deployed a preview and need to promote it manually:
```bash
npx -y vercel@54.7.1 alias set "$url" musu.pro --token="$VERCEL_TOKEN"
```

### Step 6 — CI gates and desktop-latest publish details
Production CI also runs:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\canary-desktop-release.ps1 -Json -SkipLocalArtifactLengthChecks
```

That CI mode skips local MSIX/setup-exe length comparisons because the web deploy
runner does not build desktop artifacts, but it still blocks production deploys
when live `desktop-latest` has an older appinstaller version, mismatched hosted
`Install-MUSU.ps1`, mismatched uninstaller, or wrong certificate thumbprint.
After a production deploy, CI also runs `curl -fsS https://musu.pro/api/health`
and `scripts\windows\verify-musu-pro-install-channel.ps1 -Json` so a green deploy
means both the site and the live one-line installer channel were verified. The
install-channel verifier also checks the `/api/health` `musu.site_health.v1`
schema/version, so an old production site cannot pass just because the
installer URLs return HTTP 200.

The guarded publisher validates the local appinstaller/MSIX contract, versioned MSIX copy,
installer pinned cert thumbprint, setup exe name, and uploads the current
`musu-desktop-x64.msix`, `musu.appinstaller`, `blossompark.musu.cer`,
`Install-MUSU.ps1`, `Uninstall-MUSU.ps1`, and setup exe to GitHub release
`desktop-latest` with `--clobber`; it then runs the desktop canary. The canary
checks hosted appinstaller versions, hosted installer `ExpectedReleaseVersion`,
hosted installer cert pin, hosted installer/uninstaller SHA256 vs local canonical
scripts, hosted cert thumbprint, hosted MSIX length, and hosted setup exe length.
Do not let a user run `irm https://musu.pro/install.ps1 | iex` while either
canary reports an older appinstaller/site release.

### Step 7 — Report
Report: the deployment `url` / `dpl_` id, the `/api/health` result, and (if used)
the commit hash. If install/download/version changed, also report both installer
canary results and `verify-musu-pro-install-channel.ps1 -Json`. On failure,
attach the `inspect --logs` output.

---

## Path B — Push and let CI run the CLI (same engine, hands-off)

Identical result to Path A — CI just runs the Path A commands for you.

```bash
cd F:/workspace/musu-bee
git add <changed site files under musu-bee/src/...>
git status --short        # confirm NO secrets/data staged (no .env, no token)
git commit -m "feat(site): <what changed>"
git push origin <branch>  # push to main → production deploy; PR → preview + a comment with the URL
```
Then watch the **GitHub Actions → deploy-musu-bee** run, and verify
`https://musu.pro/api/health`.

If the run fails at **Verify production desktop-latest release assets**, publish
the current `desktop-latest` assets with the guarded publisher in Step 3, rerun
the desktop canary, then rerun the deploy.
If the run fails at **Verify production install channel**, inspect its JSON. It
usually means production `public-config`, live `/install.ps1`, or `desktop-latest`
is still serving an older release.

After a successful production run, run
`scripts\windows\verify-musu-pro-install-channel.ps1 -Json` before handing the
`irm https://musu.pro/install.ps1 | iex` command to a second PC.

> **Const VII:** a push to `main` is a production deploy and is **user-gated**. Default
> to a feature branch + PR (which gets a preview URL) unless the user approved a `main` push.

---

## Environment variables (set in Vercel, never in the repo)

Required for the site to work — set via the Vercel dashboard or the CI
`sync_vercel_env` step (`deploy-musu-bee.yml`), **never committed**:
- `MUSU_BRIDGE_URL` — bridge backend URL (browser→bridge calls 502 if missing/unreachable)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — auth
- `NEXT_PUBLIC_AUTH_ENABLED` — `false` to bypass login while debugging

Optional: Paddle (payments), `KV_REST_API_*` (subscription cache), worker URL — full
table in `musu-bee/DEPLOY.md`.

> ⚠️ `vercel env add` via a shell **pipe** has a known empty-value bug — set env through
> the dashboard or the CI `sync_vercel_env` helper, not by piping a value in.

---

## Hard rules (do not violate)

1. **Never commit or log a token.** The Vercel token lives only in `yellow.txt`
   (untracked, outside the repo) and in the `$VERCEL_TOKEN` shell variable at runtime.
2. **Never commit user data or `.env*`.** Only product code/config under `musu-bee/src/`,
   `musu-bee/public/`, and config files.
3. **Build with `npm run build` (webpack).** Plain `next build` (Turbopack) fails with a
   WorkerError — expected, not a code defect.
4. **Pin Vercel CLI `54.7.1`.** Older CLIs are rejected by the deploy endpoint.
5. **`main` push / `--prod` deploy is user-gated (Const VII).** Default to a preview/PR.
6. **Always verify `https://musu.pro/api/health` after deploy** and report the result.

---

## Troubleshooting (from `musu-bee/DEPLOY.md` + prior deploy evidence)
- **Bridge requests 502** → `MUSU_BRIDGE_URL` unset/unreachable, or bridge token
  mismatch (`Authorization: Bearer <MUSU_BRIDGE_TOKEN>` must match on both sides).
- **Auth redirect loop** → set `NEXT_PUBLIC_AUTH_ENABLED=false`; check Supabase vars.
- **Build TypeScript errors** → run `npm run build` locally first.
- **`/api/*` returns 404** → historically a `.vercelignore` excluding `api/`; ensure
  API routes under `src/app/api/` are not ignored.
- **Deploy rejected as "CLI too old"** → you used an unpinned/old `vercel`; use `@54.7.1`.
