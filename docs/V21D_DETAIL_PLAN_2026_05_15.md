# v21.D — Rust supervisor isolation (detail plan)

**Date**: 2026-05-15
**Branch**: `v21/d-supervisor-isolation` (stacks on `v21/c-scheduler`)
**Goal**: Run agent processes inside per-platform sandboxes so a
compromised agent can't read `~/.ssh`, `%APPDATA%\Microsoft\Credentials`,
or `~/Library/Keychains`.

## Architecture

```
musu-supervisor/
├── apps/
│   ├── musud/       (existing — daemon that hosts services)
│   └── musu/        (existing — CLI)
└── crates/
    ├── musu-supervisor-core/         (existing — config, IPC, health, supervisor)
    ├── musu-supervisor-isolation/    NEW — trait + IsolationProfile
    │   └── src/lib.rs                Isolation trait + IsolationProfile struct
    ├── musu-supervisor-isolation-linux/    NEW (cfg target_os = "linux")
    │   └── src/lib.rs                user_namespaces(7) + bind mounts + seccomp
    ├── musu-supervisor-isolation-windows/  NEW (cfg target_os = "windows")
    │   └── src/lib.rs                AppContainer + Job Object + restricted token
    └── musu-supervisor-isolation-macos/    NEW (cfg target_os = "macos")
        └── src/lib.rs                sandbox-exec (Seatbelt) profile
```

## Trait

```rust
// musu-supervisor-isolation/src/lib.rs

pub trait Isolation: Send + Sync {
    /// Spawn `cmd` inside the sandbox described by `profile`.
    /// Returns the child handle so the caller can wait / kill.
    fn spawn(
        &self,
        cmd: &mut Command,
        profile: &IsolationProfile,
    ) -> Result<Child, IsolationError>;

    /// Self-test: does this implementation actually work on this host?
    /// (Linux: kernel user-ns support, Windows: AppContainer
    /// availability, macOS: sandbox-exec presence.)
    fn available(&self) -> Result<(), IsolationError>;

    /// Human-readable name for logging.
    fn name(&self) -> &'static str;
}

pub struct IsolationProfile {
    /// Read-only filesystem paths the agent may access.
    /// Everything else under root is hidden (Linux: bind-mounted
    /// over with tmpfs; Windows: ACL strip; macOS: Seatbelt deny).
    pub allow_read: Vec<PathBuf>,

    /// Read-write paths (project root, %TEMP%, agent's own .musu dir).
    pub allow_write: Vec<PathBuf>,

    /// Allow outbound TCP to host:port pairs only. Empty = no net.
    pub allow_net: Vec<NetEndpoint>,

    /// Wall-clock CPU + RSS limits. None = no limit.
    pub cpu_secs: Option<u32>,
    pub mem_mb:   Option<u32>,

    /// Drop these env vars before spawn (secrets the parent had).
    pub strip_env: Vec<String>,
}

pub enum IsolationError {
    Unsupported(String),    // e.g. "user namespaces disabled by sysctl"
    Permission(String),     // e.g. "needs CAP_SYS_ADMIN on this kernel"
    SetupFailed(String, std::io::Error),
}
```

`IsolationProfile` is what gets serialized into the v36
`agents.isolation_profile` column (JSON).

## Linux strategy

**Unprivileged user namespaces** (kernel ≥ 3.8, default-enabled on
Ubuntu 18+, Fedora 32+, Debian 11+). No root, no setuid binary.

Pipeline:
1. `clone(CLONE_NEWUSER | CLONE_NEWNS | CLONE_NEWPID | CLONE_NEWNET)`
2. Write `/proc/self/uid_map` and `/proc/self/setgroups` + `gid_map`
3. `mount("tmpfs", "/", "tmpfs", ...)` then bind-mount the allow_read
   and allow_write paths back in
4. For net: if `allow_net` is empty, never bring up `lo`. Otherwise,
   we use slirp4netns or a userspace TCP proxy on the host that
   forwards only to the allowlisted endpoints. (slirp4netns is the
   cleanest — same approach rootless Podman uses.)
5. seccomp filter: deny `ptrace`, `bpf`, `perf_event_open`, `keyctl`,
   `add_key`, `request_key`, `mount` (after our mounts), `clone3`
   (whitelist `clone` only), `unshare`, `pivot_root`, `setns`,
   `kexec_*`, `init_module`, etc.
6. Drop all capabilities (`prctl(PR_CAPBSET_DROP, …)` then `setresuid`).
7. `chdir` into project root, `execve(cmd)`.

Const VI experiment: spin up on three distros (Ubuntu 22.04, Fedora 39,
Alpine 3.19) and verify the pipeline doesn't ENOSYS on any.

## Windows strategy

**AppContainer** (Win10+, primary path) + **Job Object** + **restricted
token**.

Pipeline:
1. Create an AppContainer with a fresh SID via
   `CreateAppContainerProfile`.
2. Build a capability list — *no* `internetClient`, *no* `documentsLibrary`,
   etc. Pure AppContainer with zero caps = strongest sandbox.
3. Build a `SECURITY_CAPABILITIES` struct.
4. ACL the allow_read / allow_write paths to grant access to the
   AppContainer SID (via `SetEntriesInAclW` + `SetNamedSecurityInfoW`).
   Everything else stays denied by default.
5. Wrap in a Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` +
   `LIMIT_ACTIVE_PROCESS` (= 1, no fork bombs) +
   `LIMIT_JOB_MEMORY` + `LIMIT_PROCESS_TIME`.
6. `CreateProcessW` with `EXTENDED_STARTUPINFO_PRESENT` and the
   security capabilities in the proc-thread attribute list.

Net allowlisting: AppContainer can't open arbitrary outbound by default
(no `internetClient` cap). For musu.pro relay calls we go through a
Named Pipe to a parent broker, the broker proxies; agent never opens
INET sockets itself.

## macOS strategy

**`sandbox-exec` with a profile** (Seatbelt, still supported in
macOS 14 even though Apple deprecates it for App Store apps —
fine for our local use).

Pipeline:
1. Render a sbpl profile string:
   ```scheme
   (version 1)
   (deny default)
   (allow process-fork)
   (allow signal (target self))
   (allow file-read* (subpath "/usr") (subpath "/System"))
   (allow file-read* (subpath "{ALLOW_READ_1}")) ...
   (allow file-read* file-write* (subpath "{ALLOW_WRITE_1}")) ...
   (deny network*)             # default
   (allow network-outbound (remote tcp "{HOST}:{PORT}"))   # per-endpoint
   ```
2. `sandbox-exec -f /tmp/profile.sb cmd…`

Limitations: sandbox-exec doesn't enforce CPU/mem; for those we
layer a separate `rlimit` wrapper before exec. macOS has no Job
Object equivalent for tree-killing — track child PIDs and send
`SIGTERM`/`SIGKILL` on supervisor exit.

## Tasks (matches existing #295–#304 IDs)

| # | Task | Output |
|---|------|--------|
| 295 | Crate layout design (this doc) | `docs/V21D_DETAIL_PLAN_2026_05_15.md` |
| 296 | `musu-supervisor-isolation-linux` | crate w/ user_namespaces + seccomp |
| 297 | `musu-supervisor-isolation-windows` | crate w/ AppContainer + Job Object |
| 298 | `musu-supervisor-isolation-macos` | crate w/ sandbox-exec wrapper |
| 299 | `musu-supervisor-core::isolation` trait + Profile | shared crate `musu-supervisor-isolation` |
| 300 | Schema v36 — `agents.isolation_profile` JSON column | `_v36_up` / `_v36_down` |
| 301 | Constitution III gate on v36 | user "진행해" — batched via "끝까지 다 해" |
| 302 | Per-platform isolation tests | crate-local `tests/` + a Python integration harness |
| 303 | Const VI experiment — Linux unpriv user-ns on 3 distros | bench results in closure |
| 304 | Phase 21.D audit + closure | `docs/V21D_CLOSURE_2026_05_15.md` |

## Risks

- **Seccomp filter mis-tuning** — too-tight filter breaks Python
  runtime / Node.js startup. Mitigation: keep filter on a denylist
  (block known-dangerous syscalls) not allowlist for now; tighten
  in a 22.x phase once we have telemetry on what agents actually call.
- **Windows AppContainer + Node** — Node's V8 wants `JIT` permission;
  may need `WriteCopy` ACE on JIT region. If hits a wall, fall back
  to Job Object only (weaker, no FS isolation).
- **macOS sandbox-exec deprecation** — Apple's marked it deprecated.
  Long-term plan: switch to Endpoint Security framework, but that
  needs a signed system extension. For musu.pro home users, sandbox-exec
  is fine until ~macOS 18.
- **Net allowlisting on Linux** — slirp4netns is an external binary
  dep. Either ship it bundled or warn at runtime. Both annoying.

## Out of scope for 21.D

- Linux LSM hooks (AppArmor / SELinux integration) — distros vary
  too much. Document recommended AppArmor profile for prod deploys,
  but don't enforce.
- Windows WDAC / AppLocker — same reason; enterprise-only.
- GPU isolation (NVIDIA MIG, MPS) — separate phase; 21.D is about
  user-data isolation, not GPU-resource isolation.
