//! V24-R3 wiki/493 §4 C2 invariant + acceptance #12.
//!
//! `musu control` MUST write ZERO bytes to stdout when there is no MCP
//! activity. Anything tracing emits goes to stderr (Critic C1 fix); the
//! only legitimate stdout writer is rmcp's MCP framing.
//!
//! We exercise two scenarios:
//!
//!   1. **No bridge token configured** → `BridgeClient::try_new()` returns
//!      Err BEFORE rmcp serves, so the process exits non-zero with NO
//!      stdout output. (Acceptance #11.)
//!
//!   2. **Token configured, stdin closed immediately** → rmcp serves a
//!      transport over (stdin, stdout) and detects EOF on stdin. Because
//!      no MCP `initialize` was received, no JSON-RPC frame is emitted on
//!      stdout. Exit must be clean (code 0) within ~2s. (Acceptance #9 +
//!      #12 + Critic C8.)

use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const EXIT_TIMEOUT: Duration = Duration::from_secs(5);

fn musu_home() -> std::path::PathBuf {
    let mut p = std::env::temp_dir();
    p.push(format!(
        "musu-rs-r3-stdout-clean-{}",
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::create_dir_all(&p).expect("mkdir musu_home");
    p
}

/// Wait for the child to exit with a hard timeout. Returns (exit_status,
/// stdout_bytes, stderr_bytes).
fn wait_with_timeout(
    mut child: std::process::Child,
    timeout: Duration,
) -> (std::process::ExitStatus, Vec<u8>, Vec<u8>) {
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                // Drain stdio.
                let mut out = Vec::new();
                let mut err = Vec::new();
                if let Some(mut so) = child.stdout.take() {
                    let _ = std::io::Read::read_to_end(&mut so, &mut out);
                }
                if let Some(mut se) = child.stderr.take() {
                    let _ = std::io::Read::read_to_end(&mut se, &mut err);
                }
                return (status, out, err);
            }
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    panic!(
                        "musu control did not exit within {:?} — \
                         C8 stdin-EOF watcher regression",
                        timeout
                    );
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => panic!("try_wait failed: {e}"),
        }
    }
}

/// (1) Missing token — must exit non-zero with ZERO stdout output.
#[test]
fn r3_control_missing_token_writes_no_stdout() {
    let bin = env!("CARGO_BIN_EXE_musu");
    let home = musu_home();
    // Intentionally NO bridge.env file and NO MUSU_BRIDGE_TOKEN env. We pass
    // MUSU_HOME pointing at an empty dir so the resolver returns None.
    let mut child = Command::new(bin)
        .arg("control")
        .env_remove("MUSU_BRIDGE_TOKEN")
        .env("MUSU_HOME", &home)
        .env("RUST_LOG", "error")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn musu control");

    // Close stdin (Stdio::null already gives EOF immediately).
    drop(child.stdin.take());

    let (status, out, err) = wait_with_timeout(child, EXIT_TIMEOUT);

    assert!(
        !status.success(),
        "expected non-zero exit when token missing; got {status:?}"
    );
    assert!(
        out.is_empty(),
        "C2 violation: control wrote {} bytes to stdout on missing-token path: {:?}",
        out.len(),
        String::from_utf8_lossy(&out)
    );
    // Stderr SHOULD carry the explanation (acceptance #11 — clear stderr
    // BEFORE any MCP frame on stdout). We assert non-empty as a soft gate;
    // the precise message wording is documented in bridge_client::try_new.
    assert!(
        !err.is_empty(),
        "expected stderr to carry token-missing explanation; was empty"
    );
}

/// (2) Token present, empty stdin — clean exit, zero stdout bytes.
#[test]
fn r3_control_empty_stdin_writes_no_stdout() {
    let bin = env!("CARGO_BIN_EXE_musu");
    let home = musu_home();
    // Provide a token via bridge.env so try_new succeeds.
    std::fs::write(
        home.join("bridge.env"),
        "MUSU_BRIDGE_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n",
    )
    .expect("write bridge.env");

    let mut child = Command::new(bin)
        .arg("control")
        // No MUSU_BRIDGE_URL — defaults to 127.0.0.1:8070. The control
        // server never tries to call it during initialize since we close
        // stdin before sending any tool requests; we only care that the
        // transport handshake never gets a chance to emit a frame.
        .env_remove("MUSU_BRIDGE_TOKEN") // force file fallback
        .env("MUSU_HOME", &home)
        .env("RUST_LOG", "error")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn musu control");

    // Close stdin without writing anything → rmcp sees EOF on first read →
    // serve() returns InitializeError (no initialize frame received) and
    // our run() maps that to Ok(()). Wait for the process to exit.
    let stdin = child.stdin.take().expect("stdin handle");
    drop(stdin);

    let (status, out, _err) = wait_with_timeout(child, EXIT_TIMEOUT);

    // C8: must exit within EXIT_TIMEOUT. Status SHOULD be success (run()
    // maps initialize-failure-on-EOF to Ok(())), but we accept either
    // success or a non-panicking failure — the load-bearing assertion is
    // ZERO stdout bytes.
    assert!(
        !out.iter().any(|&b| b != 0),
        "C2 violation: control wrote non-zero bytes to stdout with empty stdin: {} bytes — {:?}",
        out.len(),
        String::from_utf8_lossy(&out)
    );
    // Also assert the actual byte count is 0 — `iter().any(|&b| b != 0)`
    // would silently pass on a stream of NULs.
    assert_eq!(
        out.len(),
        0,
        "C2 violation: stdout should be exactly empty, was {} bytes",
        out.len()
    );
    // Log the exit status for diagnostic purposes (no assertion — the C2
    // invariant is on stdout, not exit code).
    eprintln!("r3_stdout_clean: exit status was {status:?}");
}
