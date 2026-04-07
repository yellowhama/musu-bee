use std::io::{self, Read, Write};
use std::sync::{Arc, Mutex};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use vte::{Parser, Perform};
use serde::{Serialize, Deserialize};

/// [VTE Handler]
/// 터미널에서 쏟아지는 바이트를 해석하여 순수 텍스트로 변환하고 메모리에 저장합니다.
struct TerminalState {
    buffer: String,
    max_history: usize,
}

impl TerminalState {
    fn new(max_history: usize) -> Self {
        Self {
            buffer: String::new(),
            max_history,
        }
    }

    fn push_str(&mut self, s: &str) {
        self.buffer.push_str(s);
        if self.buffer.len() > self.max_history {
            let overflow = self.buffer.len() - self.max_history;
            self.buffer.drain(..overflow);
        }
    }
}

// VTE 파서가 문자를 처리할 때 호출할 콜백 구현
struct LogHandler {
    state: Arc<Mutex<TerminalState>>,
}

impl Perform for LogHandler {
    fn print(&mut self, c: char) {
        if let Ok(mut state) = self.state.lock() {
            state.push_str(&c.to_string());
        }
    }

    fn execute(&mut self, byte: u8) {
        if byte == b'\n' || byte == b'\r' {
            if let Ok(mut state) = self.state.lock() {
                state.push_str("\n");
            }
        }
    }
    // 다른 제어 문자들(색상 등)은 무시하거나 필요시 확장 가능
}

#[derive(Serialize, Deserialize)]
struct Snapshot {
    content: String,
    timestamp: u64,
    rows: u16,
    cols: u16,
}

/// Read the current terminal size from stdin (fd 0) via TIOCGWINSZ.
/// Returns None if not a tty or ioctl fails.
#[cfg(unix)]
fn get_tty_size() -> Option<(u16, u16)> {
    #[repr(C)]
    struct Winsize {
        ws_row: libc::c_ushort,
        ws_col: libc::c_ushort,
        ws_xpixel: libc::c_ushort,
        ws_ypixel: libc::c_ushort,
    }
    let mut ws = Winsize { ws_row: 0, ws_col: 0, ws_xpixel: 0, ws_ypixel: 0 };
    let ret = unsafe { libc::ioctl(libc::STDIN_FILENO, libc::TIOCGWINSZ, &mut ws) };
    if ret == 0 && ws.ws_row > 0 && ws.ws_col > 0 {
        Some((ws.ws_row, ws.ws_col))
    } else {
        None
    }
}

#[cfg(not(unix))]
fn get_tty_size() -> Option<(u16, u16)> {
    None
}

fn parse_args() -> Result<(String, u16, u16), String> {
    let args: Vec<String> = std::env::args().collect();
    let mut rows = 24u16;
    let mut cols = 80u16;
    let mut cmd: Option<String> = None;
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--rows" => {
                i += 1;
                if i >= args.len() {
                    return Err("--rows requires a value".to_string());
                }
                rows = args[i].parse().map_err(|_| format!("invalid --rows value: {}", args[i]))?;
            }
            "--cols" => {
                i += 1;
                if i >= args.len() {
                    return Err("--cols requires a value".to_string());
                }
                cols = args[i].parse().map_err(|_| format!("invalid --cols value: {}", args[i]))?;
            }
            arg => {
                if cmd.is_none() {
                    cmd = Some(arg.to_string());
                }
            }
        }
        i += 1;
    }
    let cmd = cmd.ok_or_else(|| {
        "Usage: musu-terminal-engine [--rows N] [--cols N] <command>".to_string()
    })?;
    Ok((cmd, rows, cols))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let (cmd_to_run, init_rows, init_cols) = match parse_args() {
        Ok(v) => v,
        Err(e) => {
            eprintln!("{}", e);
            return Ok(());
        }
    };

    let state = Arc::new(Mutex::new(TerminalState::new(20000))); // 2만 자 유지
    let state_for_vte = Arc::clone(&state);

    // Current PTY dimensions — updated on SIGWINCH
    let current_size = Arc::new(Mutex::new((init_rows, init_cols)));

    // 1. PTY 설정
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: init_rows,
        cols: init_cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    // 2. 쉘 실행
    let cmd = CommandBuilder::new(&cmd_to_run);
    let _child = pair.slave.spawn_command(cmd)?;

    // Extract reader/writer before wrapping master — then wrap in Mutex for Sync
    let mut writer = pair.master.take_writer()?;
    let mut reader = pair.master.try_clone_reader()?;

    // Arc<Mutex<...>> makes it Send + Sync so the SIGWINCH task can use it
    let master = Arc::new(Mutex::new(pair.master));
    let master_for_sigwinch = Arc::clone(&master);

    // 3a. PTY 쓰기 핸들 확보 (stdin → PTY master 포워딩)
    std::thread::spawn(move || {
        let stdin = io::stdin();
        let mut stdin_lock = stdin.lock();
        let mut buf = [0u8; 256];
        loop {
            match stdin_lock.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if writer.write_all(&buf[..n]).is_err() {
                        break;
                    }
                }
            }
        }
    });

    // 3b. PTY 출력 읽기 루프
    let mut parser = Parser::new();
    let mut handler = LogHandler { state: state_for_vte };

    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 { break; }
            for byte in &buf[..n] {
                parser.advance(&mut handler, *byte);
            }
        }
    });

    // 3c. SIGWINCH handler — resize PTY when the controlling terminal changes size
    #[cfg(unix)]
    {
        let current_size_for_sig = Arc::clone(&current_size);
        tokio::spawn(async move {
            use tokio::signal::unix::{signal, SignalKind};
            let mut sigwinch = match signal(SignalKind::window_change()) {
                Ok(s) => s,
                Err(_) => return,
            };
            loop {
                sigwinch.recv().await;
                // Read actual tty size; fall back to stored size if unavailable
                let (new_rows, new_cols) = get_tty_size().unwrap_or_else(|| {
                    *current_size_for_sig.lock().unwrap()
                });
                if let Ok(mut sz) = current_size_for_sig.lock() {
                    *sz = (new_rows, new_cols);
                }
                if let Ok(m) = master_for_sigwinch.lock() {
                    let _ = m.resize(PtySize {
                        rows: new_rows,
                        cols: new_cols,
                        pixel_width: 0,
                        pixel_height: 0,
                    });
                }
            }
        });
    }

    // 4. 메인 루프: 실시간 스냅샷을 표준 출력으로 뱉음 (JSON)
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        if let Ok(s) = state.lock() {
            let (rows, cols) = *current_size.lock().unwrap();
            let snap = Snapshot {
                content: s.buffer.clone(),
                timestamp: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)?
                    .as_secs(),
                rows,
                cols,
            };
            println!("{}", serde_json::to_string(&snap)?);
        }
    }
}
