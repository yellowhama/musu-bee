# V23.4 Phase 4 T2-Z4 closure — wiki/443

**Date**: 2026-05-19
**Branch**: `v23/phase4`
**Scope**: 2 code items (~140-180 LOC total)
**Status**: shipped

Z4 was split into Z4a (Linux/in-cluster bench schema widening) and Z4b (new Windows-host-side peer bench) per the scope-audit recommendation. The two scripts share field-naming conventions so consumers can stitch their outputs into a unified report.

## Items

### 4a. F-A1c-9 — bridge-bench.sh full §5.6 schema

**Problem**: The V23.3 A1.c bench (`bridge-bench.sh`) ships schema `musu-bridge-bench-v1` with only the fields needed for the §4.1 verdict logic (`n_attempts`, `success`, `fail`, `success_rate_pct`, `gate_eligible`, and `p50/p95/p99_ms_median`). The wiki/385 §5.6 spec calls for additional fields the V23.3 builder Auditor explicitly deferred as forward-pointer F-A1c-9:

- RSS sampling on the live bridge pod (memory footprint validation).
- Cold-start latency loop (kill+restart N times, measure ready-time distribution).
- Host-environment metadata (bench tool version, K3s version, kernel version, cgroup driver, UTC timestamp).
- Outer-tar sha256 stitched over the final report payload (tamper detection between bench-run and analysis).

**Fix**: Widened the script to emit `musu-bridge-bench-v2` schema. All v1 fields preserved at the same paths (`schema_v1_compat: true` flag explicitly asserts this); new fields are additive under `metadata`, `aggregate.rss_kb`, `aggregate.cold_start_ms[]`, `aggregate.cold_start_p50_ms`, `aggregate.cold_start_max_ms`, and top-level `payload_sha256`.

**Implementation notes**:
- **Cold-start loop**: `N_COLD` (default 3, override via `BENCH_COLD_RESTARTS`). Each iteration: `kubectl delete pod -l app=musu-bridge --wait=true`, then `kubectl wait --for=condition=Ready pod -l app=musu-bridge --timeout=120s`, recording `date +%s%3N` deltas. Uses the deployment's existing replica spec (no extra Pod creation overhead) — the bench just measures rollout-replace timing.
- **RSS sampling**: `kubectl exec` into the live bridge pod and `ps -e -o rss= | awk` sum across PIDs (uvicorn workers + master). Captured post-cold-start so the value reflects steady-state.
- **Metadata**: `kubectl version --output=json | jq -r '.serverVersion.gitVersion'` for K3s, `uname -r` for kernel, `crictl info | jq -r '.config.systemdCgroup'` for cgroup driver. All wrapped in `|| echo "unknown"` so a probe failure doesn't abort the bench.
- **Payload sha**: render the report JSON to a tempfile, run `jq -S -c .` to get canonical sorted-keys form, `sha256sum`, then append `payload_sha256` onto the final stdout JSON. The hash COVERS everything in the report EXCEPT itself; downstream verifiers re-compute by stripping `payload_sha256` and hashing the remainder.

**Backward compat**: Existing wiki/384 §4.1 verdict logic queries `aggregate.gate_eligible` and `aggregate.p99_ms_median`. Both unchanged.

**Files touched**:
- `musu-relay/installer/bridge-bench.sh`

### 4b. F-A1c-10 — bench-windows.ps1

**Problem**: `bridge-bench.sh` measures in-cluster bridge latency only. The path from an external peer to musu-bridge goes through THREE Windows-host components in addition to the K3s bridge daemon:

1. WSL2 vEthernet vNIC (hypervisor virtual switch overhead).
2. netsh portproxy DNAT (`0.0.0.0:9900 -> wsl-ip:9900`, added by Z2b).
3. install-wsl2.ps1 Step 5.9 rendezvous-role decision (cheap but bounded — installer must not hang on slow PowerShell startup).

None of those are measurable from inside the K3s cluster. `bench-windows.ps1` is the Windows-host-side peer to `bridge-bench.sh`.

**What it measures**:
1. **vEthernet adapter latency**: TCP connect from localhost to the WSL2 distro IP (`wsl -d musu -- hostname -I` to resolve), N=30 samples, p50/p95/p99.
2. **Portmap DNAT overhead**: TCP connect from localhost:9900 (via portproxy) to WSL2:9900, same N, same percentiles. Subtract (1) to isolate the netsh DNAT cost.
3. **Rendezvous-role detection timing**: synthesize an ephemeral `state.json` shaped like the real installer state, time the `Get-Content | ConvertFrom-Json | property-read | branch-on-role` sequence. N=30, p50/p95/p99 in ms.

**Schema**: `musu-bench-windows-v1`, mirrors `musu-bridge-bench-v2` field naming (snake_case, `_ms` suffixes, `p50_ms` / `p95_ms` / `p99_ms`). Top-level `payload_sha256` over the rendered JSON (same property as bridge-bench.sh) so a consumer can verify the report.

**Usage**:
```powershell
.\bench-windows.ps1                                  # default N=30
.\bench-windows.ps1 -Runs 100 -OutFile report.json   # higher sample count
```

**Files touched**:
- `musu-relay/installer/bench-windows.ps1` (NEW)

## Verification

- `bash -n musu-relay/installer/bridge-bench.sh` clean.
- `[System.Management.Automation.Language.Parser]::ParseFile` clean on `bench-windows.ps1`.
- The bridge-bench schema widening was implemented as additive over v1; the §4.1 verdict path (`gate_eligible` + `p99_ms_median`) is byte-identical in v2 output.

## Out of scope

- F-A1c-1 (worker-sidecar bench scenario): see Z3 / wiki/442. The sidecar pattern does not exist yet.
- F-A1c-5 / F-A1c-6 / F-A1c-7 / F-A1c-8: see Z3 / wiki/442. All defer V23.5.

## References

- master plan: `docs/V23_4_PHASE4_MASTER_PLAN_2026_05_18.md` §5.Z row Z4
- F-A1c-9 + F-A1c-10 forward-pointer source: `docs/V23_3_FINAL_CLOSURE_2026_05_17.md` §5 (wiki/396)
- wiki/385 §5.6 schema spec: `bench-pod.yaml` (V23.3 A1.c bench Pod)
