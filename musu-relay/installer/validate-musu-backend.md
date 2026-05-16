# Operator runbook — musu-backend.tar (V23.2 Workstream B4a, wiki/370)

This runbook covers building and validating `musu-backend.tar` — the WSL2
rootfs tarball that B4b's PowerShell installer will `wsl --import` into the
end user's Windows host. B4a is the build pipeline + single-host validation
step. B4c repeats the validation across 5 hosts using the **same tar**.

The tar is **NOT** a Docker image. It is a flat rootfs tar (`/etc/`, `/usr/`,
`/var/`, … at tar root) consumable only by `wsl --import`.

---

## Pre-requisites

### To **build** the tar (one operator host)

- Windows 10 2004+ or Windows 11 with WSL2 enabled.
- An **Alpine WSL2 distro** registered as the build host. Verify with:
  ```powershell
  wsl --list --quiet
  ```
  If `Alpine` is not listed, install from one of:
  - Microsoft Store: search "Alpine WSL" (maintained by the Alpine Linux project).
  - `wsl --install -d Alpine` (Windows 11 22H2+).
- The Alpine distro must have `apk` (default), `curl`, `tar`, `sha256sum`,
  `git`, and `nodejs+npm` available. Run inside the Alpine distro once:
  ```sh
  apk add --no-cache nodejs npm git curl tar
  ```
- (Optional, recommended) Docker Desktop with the WSL2 backend for the
  step-4 musl smoke-import of `@roamhq/wrtc`. If Docker is not present the
  build emits a WARN and continues; the musl behavior of `@roamhq/wrtc`
  remains unverified until first boot.
- ~5 GB free disk at `$env:TEMP` (staging directory + tar payload).

> **Why Alpine?** `build-musu-backend.sh` uses `apk` to bootstrap the rootfs.
> Ubuntu/Debian distros do not ship `apk` and would require an
> `apk-tools-static` extraction step we explicitly refuse to script (Critic
> finding C5). Build host = Alpine WSL2 is the only supported path.

### To **validate** an existing tar (B4a single host + each B4c host)

- Windows 10 2004+ or Windows 11.
- WSL2 enabled (`wsl --status` reports "WSL 2" as the default version).
- ~5 GB free disk at `$env:TEMP` (where the validation distro is imported).
- A build distro is **NOT** required for validation — only for building.
- Network is **NOT** required for the validation tar boot (airgap K3s images
  ship inside the tar). Network IS required if you skipped airgap during a
  custom build or if K3s falls back to runtime image pulls.

---

## Build commands

### From inside the Alpine WSL2 build distro (Linux side, direct)

```sh
# Adjust to wherever the musu-bee checkout lives on the Windows side.
cd /mnt/f/workspace/musu-bee/musu-relay/installer
bash ./build-musu-backend.sh \
  --arch amd64 \
  --k3s-version v1.30.4 \
  --output /mnt/f/workspace/musu-bee/musu-relay/installer/musu-backend.tar
```

Add `--allow-oversize` to skip the 500 MB hard limit (must be documented in
the closure doc).

### From a Windows PowerShell prompt (preferred operator path)

```powershell
cd F:\workspace\musu-bee\musu-relay\installer
.\build-musu-backend.ps1 `
  -Arch amd64 `
  -K3sVersion v1.30.4 `
  -Output .\musu-backend.tar
```

Add `-AllowOversize` to mirror `--allow-oversize`. Add `-BuildDistro <name>`
if your Alpine distro is registered under a non-default name.

### Expected build output (last lines)

```
[10/10] musu-backend.tar size: <NNN> MB
──────────────────────────────────────────────────────────────────────
Build complete:
  tar:      .../musu-backend.tar
  size:     <NNN> MB
  sha256:   <hex>
  manifest: .../manifest.yaml
```

A `musu-backend.tar.sha256` sidecar is written alongside the tar. This hash
is the payload-identity proof used by B4c across hosts.

---

## Validation command

From a Windows PowerShell prompt (any host, NOT necessarily the build host):

```powershell
cd F:\workspace\musu-bee\musu-relay\installer
.\validate-import.ps1 `
  -TarPath .\musu-backend.tar `
  -ExpectedSha256 (Get-Content .\musu-backend.tar.sha256 -Raw).Trim()
```

`-ExpectedSha256` is optional but recommended — it gates pass/fail on payload
identity. Without it the script still computes `tar_sha256` (always) and
records `tar_sha256_status: "unverified"`.

### Useful flags

- `-K3sReadyTimeoutSec 240` — extend the K3s Ready wait (default 180s).
  Corporate-locked-down laptops may need longer for first-boot airgap-image
  import.
- `-KeepOnSuccess` — preserve the `musu-test` distro when validation
  succeeds (skip the cleanup `wsl --unregister`). Used for interactive
  debugging: `wsl -d musu-test` opens a shell inside the validated rootfs.
- `-AcceptDegraded` — record-and-continue on failure instead of exiting.
  B4c uses this to ensure each host produces a `validation-result.json` even
  if the run failed (the failure mode goes into the JSON).
- `-DistroName <name>` — override the default `musu-test` distro name.

---

## Expected outputs

### `validation-result.json` (schema overview)

Written to the current working directory. Full schema in wiki/370 §7.2.

| Field | Meaning |
|---|---|
| `tar_path`, `tar_size_bytes` | Path + size of the input tar |
| `tar_sha256` | Lowercase hex SHA-256 of the tar (always computed) |
| `tar_sha256_status` | `match` / `mismatch` / `unverified` |
| `host_os`, `host_wsl_status` | Windows + WSL identity |
| `started_at_utc`, `finished_at_utc` | ISO-8601 UTC timestamps |
| `import_status` | `ok` / `failed` |
| `import_time_ms` | `wsl --import` wall-clock |
| `musu_init_output` | stdout+stderr of `/usr/local/bin/musu-init` |
| `k3s_pid_seen` | Was a K3s process observed at all? |
| `k3s_ready_status` | `ready` / `timeout` / `never_started` |
| `k3s_ready_ms` | Time to K3s API Ready, or `null` |
| `kubectl_get_nodes` | Raw JSON of `kubectl get nodes -o json`, or `null` |
| `idle_ram_mb_used` | Parsed from `free -m` after 5s settle |
| `idle_ram_output_raw` | Raw `free -m` for re-parsing |
| `musu_version_raw` | Contents of `/etc/musu-version` (git_sha, build_ts, …) |

### Interpretation

- **Pass**: `import_status == "ok"` AND `tar_sha256_status == "match"`
  (or `"unverified"` if you omitted `-ExpectedSha256`) AND
  `k3s_ready_status == "ready"` AND `kubectl_get_nodes` contains at least
  one Ready node.
- **Likely-K3s-issue**: `k3s_ready_status == "never_started"` →
  K3s process never came up. See troubleshooting.
- **Likely-flag-issue**: `k3s_ready_status == "timeout"` AND
  `k3s_pid_seen == true` → K3s started but never reached API Ready inside
  `K3sReadyTimeoutSec`. See troubleshooting.

---

## Troubleshooting

### `tar_sha256_status: "mismatch"`

The tar on disk does not match `-ExpectedSha256`. Either:
- The build was redone (rebuild emits a new sha256 sidecar — re-read it), OR
- The tar was modified in transit. Re-fetch and recompute.

### `k3s_ready_status: "never_started"` (K3s process never came up)

`k3s_pid_seen` is `false`. K3s did not start. Likely causes (in order):

1. **K3s binary did not download cleanly during build.** Inspect the build
   log; the curl in step 2 of `build-musu-backend.sh` should have printed
   GitHub release URLs and the binary should be ~70 MB on disk inside the
   tar (`tar -tvf musu-backend.tar | grep usr/local/bin/k3s`).
2. **Airgap-images archive corrupt.** Similar — verify size ~200–250 MB.
3. **Snapshotter incompatibility.** The OpenRC service uses
   `--snapshotter=native` (the documented WSL2-overlayfs workaround). If
   even native fails on a particular host, run the tar interactively:
   ```powershell
   .\validate-import.ps1 -TarPath .\musu-backend.tar -KeepOnSuccess -AcceptDegraded
   wsl -d musu-test
   /usr/local/bin/k3s server --help        # confirm binary works
   rc-service k3s start                    # try the service directly
   tail -n 200 /var/log/k3s.log            # inspect failure
   ```
4. **OpenRC not initialized.** Should not happen (musu-init does
   `openrc default` first-time), but verify:
   ```sh
   rc-status            # should list runlevels
   ```

### `k3s_ready_status: "timeout"` (K3s started but never Ready)

`k3s_pid_seen` is `true`. Possible causes:

1. **`K3sReadyTimeoutSec` is too short for this host** — typical on
   locked-down corporate laptops. Re-run with `-K3sReadyTimeoutSec 360`.
2. **K3s flags need adjustment.** `--snapshotter=native --disable=traefik`
   is the wiki/370 §6.2 baseline (Critic finding C3). If the operator's
   first run shows persistent timeout, the closure doc records the actual
   failure mode and flag changes:
   - Try `--flannel-backend=host-gw` if pod networking blocks readiness.
   - Try `--disable=metrics-server,traefik,servicelb` to slim K3s further.
   - Run `wsl -d musu-test`, `tail -n 500 /var/log/k3s.log`, look for
     "Failed to start", "etcd", "containerd" lines.
3. **Resource starvation.** `kubectl get nodes` may report `NotReady` if
   the WSL2 VM is RAM-starved. Increase `.wslconfig` `memory=` and retry.

### `idle_ram_mb_used` is `$null` or unexpected

`busybox 1.36+` (Alpine 3.19 ships 1.36.1) matches coreutils `free -m`
column order. If the field is null:
- Inspect `idle_ram_output_raw` for actual format.
- If busybox drifted (post-V23.2 Alpine bump), the regex in
  `validate-import.ps1` may need an update. Documented in wiki/370 §13 C13.

### Validation distro persists after a failed run

`wsl --unregister musu-test` to clean up. Validation cleans up on success
unless `-KeepOnSuccess` is set; on `-AcceptDegraded` failure runs it leaves
the distro for inspection.

---

## Interactive debugging

```powershell
.\validate-import.ps1 -TarPath .\musu-backend.tar -KeepOnSuccess
# … validation passes, distro 'musu-test' preserved …
wsl -d musu-test
# Inside the distro:
cat /etc/musu-version              # confirm provenance
cat /etc/wsl.conf                  # confirm [user] default=root (no [boot] block — OpenRC runlevel is sole entry point, audit-fix M1)
ls -la /etc/musu/                  # 0700 root:root + the dummy account_key
rc-status                          # OpenRC runlevels
ps -ef | grep -E 'k3s|node'        # K3s + gateway processes
kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get nodes
tail -n 100 /var/log/musu-init.log
tail -n 100 /var/log/k3s.log
tail -n 100 /var/log/musu-gateway.log

# When done:
exit
wsl --unregister musu-test
```

---

## What B4a does NOT validate (deferred)

- **arm64 build correctness** — `--arch arm64` is implemented but B4a
  validates amd64 only. arm64 is V23.3+.
- **Cross-host generalization** — that's B4c (5 hosts).
- **B4b PowerShell installer flow** — `validate-import.ps1` pre-seeds a
  dummy account_key so the measurement isolates K3s+gateway boot time
  from B4b's not-yet-written flow.
- **Code-signing of the tar** — V23.5.
- **musu-bridge inside the rootfs** — V23.3 as a K3s Pod.
- **GitHub Actions / CI for the build** — B4a.2.

See wiki/370 §10 for the full out-of-scope list.
