# v21.D Windows Isolation — Real Implementation Closure

**Date**: 2026-05-15
**Branch**: `v21/d-windows-isolation` (stacks on main, post-v21.F)
**Status**: WINDOWS IMPL COMPLETE — cmd.exe smoke test green in AppContainer + Job Object sandbox.

Supersedes the "scaffold" status for the Windows crate documented in
`docs/V21D_CLOSURE_2026_05_15.md`. Linux/macOS crates remain scaffold
pending real-host iterations.

## What shipped

### `musu-supervisor-isolation-windows` — full pipeline

Six modules, ~1100 lines of Rust, 27 unit + integration tests pass.

| Module | Purpose |
|--------|---------|
| `os_version` | RtlGetVersion-based `available()` check; gates on Win10 build ≥ 17134 (1803) |
| `profile` | `AppContainerProfile` RAII wrapper — `CreateAppContainerProfile` + `DeriveAppContainerSidFromAppContainerName` ALREADY_EXISTS fallback + `DeleteAppContainerProfile` on drop |
| `acl` | `grant_path_to_sid` / `revoke_path_from_sid` — `GetNamedSecurityInfoW` → `SetEntriesInAclW` → `SetNamedSecurityInfoW`; `AclGrant` RAII revokes on drop |
| `job_object` | `JobObject::from_profile` — `CreateJobObjectW` + `SetInformationJobObject(ExtendedLimitInformation)`; KILL_ON_JOB_CLOSE + ACTIVE_PROCESS=1 + optional cpu/mem limits |
| `attr_list` | `StartupInfoEx::with_app_container` — `InitializeProcThreadAttributeList` + `UpdateProcThreadAttribute(PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES)` with zero capabilities |
| `process` | `spawn_sandboxed(cmd, profile)` — full pipeline integration; returns `SandboxedProcess` (wait / try_wait / kill / id) |

### Pipeline (per spawn)

```
1. AppContainerProfile::create_unique("musud")        — profile.rs
2. AclGrant::new(profile.sid())                       — acl.rs
   ├─ grant each profile.allow_read   (GENERIC_READ)
   └─ grant each profile.allow_write  (RW + DELETE)
3. JobObject::from_profile(profile)                   — job_object.rs
   ├─ ACTIVE_PROCESS = 1   (fork-bomb defense)
   ├─ KILL_ON_JOB_CLOSE
   ├─ ProcessMemoryLimit   (if mem_mb set)
   └─ PerProcessUserTimeLimit (if cpu_secs set)
4. StartupInfoEx::with_app_container(sid)             — attr_list.rs
   └─ SECURITY_CAPABILITIES { sid, caps=NULL, count=0 }
5. CreateProcessW(                                    — process.rs
       lpAppName=NULL,
       lpCommandLine=<built from cmd>,
       bInheritHandles=FALSE,
       dwCreationFlags=CREATE_SUSPENDED
                     | EXTENDED_STARTUPINFO_PRESENT
                     | CREATE_UNICODE_ENVIRONMENT,
       lpEnvironment=<built from cmd + strip_env>,
       lpCurrentDirectory=<cmd.cwd or NULL>,
       lpStartupInfo=&startup_ex.StartupInfo
   )
6. AssignProcessToJobObject(job, hProcess)
7. ResumeThread(hThread)
8. Return SandboxedProcess (owns: handles + job + acls + profile)
```

Drop order on `SandboxedProcess`:

1. `thread_handle` → CloseHandle (refcount drop only — does not kill)
2. `process_handle` → CloseHandle (refcount drop only)
3. `_job` → CloseHandle on the job → **KILL_ON_JOB_CLOSE fires** → agent killed if still running
4. `_acls` → revoke ACEs from every granted path (paths now back to pre-spawn ACL state)
5. `_profile` → DeleteAppContainerProfile (registry mapping removed)

The profile is **the last to drop** because the SID embedded in ACL revocations must still be valid during step 4.

### Sandbox properties (verified by smoke tests)

- `cmd.exe /c echo musu-sandbox-ok` runs inside the sandbox and exits 0 (stdout reaches the parent because cmd.exe inherits the parent's console; we don't redirect handles in the smoke test)
- A long-running `timeout /t 60 /nobreak` child can be killed via `SandboxedProcess::kill()` and `wait()` returns exit code 1
- The AppContainer SID is in the `S-1-15-2-*` namespace (verified via `ConvertSidToStringSidW`)
- Re-creating a profile with the same name after a previous Drop succeeds (so DeleteAppContainerProfile is not a no-op)
- ACL grant + revoke round-trips on both files and directories
- Revoke on a missing path is a no-op (idempotent cleanup)
- 16x build/drop stress on STARTUPINFOEXW shows no leak

### Tests (27 pass — full suite, all real Win32 calls)

```
acl::tests::access_mask_bits_are_what_we_expect              ok
acl::tests::acl_grant_raii_revokes_on_drop                   ok  (real ACE plumbing)
acl::tests::grant_then_revoke_directory_roundtrip            ok
acl::tests::grant_then_revoke_file_roundtrip                 ok
acl::tests::revoke_missing_path_is_ok                        ok
attr_list::tests::build_with_real_appcontainer_sid_succeeds  ok
attr_list::tests::many_builds_and_drops_dont_leak            ok  (16x stress)
attr_list::tests::startup_info_mut_lets_caller_configure_flags ok
job_object::tests::create_default_profile_yields_valid_handle ok
job_object::tests::create_with_both_limits                   ok
job_object::tests::create_with_cpu_time_limit                ok
job_object::tests::create_with_memory_limit                  ok
job_object::tests::cpu_secs_saturates_at_extreme_values      ok
job_object::tests::terminate_on_empty_job_is_ok              ok
process::tests::build_cmd_line_escapes_internal_quote        ok
process::tests::build_cmd_line_handles_arg_with_spaces       ok
process::tests::build_cmd_line_quotes_program_path           ok
process::tests::smoke_test_cmd_echo_in_appcontainer          ok  (acceptance)
process::tests::smoke_test_kill_interrupts_long_running      ok  (kill path)
profile::tests::create_unique_and_drop_roundtrip             ok
profile::tests::drop_actually_deletes_so_recreate_succeeds   ok
profile::tests::rejects_empty_prefix                         ok
profile::tests::rejects_forbidden_chars_in_prefix            ok
profile::tests::rejects_prefix_too_long                      ok
tests::available_on_modern_windows_returns_ok                ok  (real RtlGetVersion)
tests::name_is_stable                                        ok
tests::spawn_returns_unsupported_until_pipeline_wired        ok
```

## Design decisions

### `Isolation::spawn` trait return type vs reality

`std::process::Child::from_raw_handle` is unstable. Building a real
`Child` from a Win32 HANDLE on stable Rust without going through
`Command::spawn` (which can't attach a proc-thread attribute list) is
infeasible.

**Resolution**: the `Isolation::spawn(...) -> Child` trait method on
`WindowsIsolation` still returns `Unsupported`. Supervisor code calls
the inherent method `spawn_sandboxed(cmd, profile) -> SandboxedProcess`
directly. `SandboxedProcess` provides the same surface (`id`, `wait`,
`try_wait`, `kill`) but wraps owned Win32 handles and the sandbox
resources.

Future option: replace the trait API with a richer `IsolatedHandle`
type that works across platforms. Deferred — Linux and macOS impls
will likely face similar constraints.

### Zero capabilities

`SECURITY_CAPABILITIES.CapabilityCount = 0` and `Capabilities = NULL`.
This is the strongest AppContainer: no `internetClient`, no
`documentsLibrary`, no `picturesLibrary`. The agent can only touch:

- Files/dirs explicitly ACL-granted to its container SID (step 2)
- System DLLs (granted to "ALL APPLICATION PACKAGES" by default)
- Its own `%LOCALAPPDATA%\Packages\<container-name>\` directory

Outbound TCP via this AppContainer is **denied** because no
`internetClient` capability. If `IsolationProfile.allow_net` is
non-empty, a future iteration will need to either:

- (a) grant `internetClient` capability (loosens FS guarantees too)
- (b) route net through a parent broker via a Named Pipe

Option (b) is preferred per `docs/V21D_DETAIL_PLAN_2026_05_15.md`.

### Command-line escaping

`build_command_line` follows the MSVCRT parse rules (CommandLineToArgvW
inverse). Program path is always quoted. Args are quoted only when
they contain space/tab/quote. Internal `"` becomes `\"`. Trailing
backslashes before a closing quote are doubled.

Three unit tests pin the cases that historically break naive
implementations: quoted program path, arg with spaces, arg with
internal quote.

## What's NOT in this iteration

- Network allowlisting (`profile.allow_net`) — needs broker/named-pipe
  infrastructure
- stdin/stdout/stderr redirection — caller can configure
  `cmd.stdin()/stdout()/stderr()` but our `CreateProcessW` doesn't yet
  attach those handles. Inheritance is via `bInheritHandles=FALSE`,
  so output goes to wherever cmd.exe defaults (console for tty, void
  for hidden). Capturing requires `STARTF_USESTDHANDLES` + child handle
  inheritance — straightforward but not yet wired
- `IsolationProfile.strip_env` is handled (env block construction)
- Linux/macOS — still scaffold

## How to use from supervisor code

```rust
use musu_supervisor_isolation::IsolationProfile;
use musu_supervisor_isolation_windows::{spawn_sandboxed, SandboxedProcess};
use std::process::Command;

let mut cmd = Command::new(r"C:\path\to\agent.exe");
cmd.args(["--mode", "claude_local"]);
cmd.current_dir(r"C:\Users\me\proj");

let profile = IsolationProfile {
    allow_read:  vec![r"C:\Users\me\proj".into()],
    allow_write: vec![r"C:\Users\me\proj\.musu".into()],
    cpu_secs:    Some(600),
    mem_mb:      Some(2048),
    strip_env:   vec!["AWS_SECRET".into(), "GITHUB_TOKEN".into()],
    ..Default::default()
};

let child: SandboxedProcess = spawn_sandboxed(&cmd, &profile)?;
println!("agent pid={}", child.id());

match child.try_wait()? {
    Some(code) => println!("exited code={code}"),
    None       => { /* still running */ }
}

// Drop kills the agent and cleans up profile + ACLs.
```

## Files added/changed (vs main)

```
musu-supervisor/Cargo.lock                            (uuid + getrandom deps)
musu-supervisor/crates/musu-supervisor-isolation-windows/
  Cargo.toml                                          (windows features + uuid)
  src/lib.rs                                          (module wiring, Isolation trait impl)
  src/profile.rs                                      (new — AppContainerProfile RAII)
  src/acl.rs                                          (new — grant/revoke + AclGrant RAII)
  src/job_object.rs                                   (new — JobObject RAII)
  src/attr_list.rs                                    (new — STARTUPINFOEXW builder)
  src/process.rs                                      (new — spawn_sandboxed + SandboxedProcess)
docs/V21D_WINDOWS_IMPL_2026_05_15.md                  (this doc)
```

## Next phases (deferred)

- **#296 Linux** — `clone(CLONE_NEWUSER | CLONE_NEWNS | …)` pipeline.
  Needs Linux/WSL2 host. Trait reshape (`spawn_sandboxed` per platform)
  decision applies here too.
- **#298 macOS** — `sandbox-exec` profile renderer. Needs macOS host.
- **#302 / #303** — cross-platform isolation test matrix + 3-distro
  unprivileged user-ns bench. Depend on #296.
- Network allowlist broker (named pipe) — separate phase.
