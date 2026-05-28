//! GET /api/v1/rpc/pty
//! WebSocket endpoint for Remote PTY Execution.

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tracing::{error, info};

use crate::bridge::AppState;

pub async fn ws_pty(ws: WebSocketUpgrade, State(_state): State<AppState>) -> Response {
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(mut socket: WebSocket) {
    info!("New PTY WebSocket connection established");

    let pty_system = NativePtySystem::default();
    let pair = match pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }) {
        Ok(p) => p,
        Err(e) => {
            error!("Failed to open PTY: {}", e);
            return;
        }
    };

    let shell = if cfg!(windows) {
        "powershell.exe"
    } else {
        "bash"
    };
    let mut cmd = CommandBuilder::new(shell);

    // Set some basic environment variables
    if !cfg!(windows) {
        cmd.env("TERM", "xterm-256color");
    }

    let _child = match pair.slave.spawn_command(cmd) {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to spawn command in PTY: {}", e);
            return;
        }
    };

    let reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => {
            error!("Failed to clone PTY reader: {}", e);
            return;
        }
    };

    let writer = match pair.master.take_writer() {
        Ok(w) => Arc::new(Mutex::new(w)),
        Err(e) => {
            error!("Failed to take PTY writer: {}", e);
            return;
        }
    };

    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(32);

    // Thread to read from PTY and send to async channel
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut r = reader;
        loop {
            match r.read(&mut buf) {
                Ok(n) if n > 0 => {
                    if tx.blocking_send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
                _ => break,
            }
        }
    });

    // Async loop to handle WS <-> PTY bridging
    loop {
        tokio::select! {
            // Read from PTY channel and send to WebSocket
            Some(data) = rx.recv() => {
                if socket.send(Message::Binary(data)).await.is_err() {
                    break;
                }
            }
            // Read from WebSocket and write to PTY
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Binary(data))) => {
                        let w = writer.clone();
                        tokio::task::spawn_blocking(move || {
                            if let Ok(mut w) = w.lock() {
                                let _ = std::io::Write::write_all(&mut *w, &data);
                            }
                        });
                    }
                    Some(Ok(Message::Text(data))) => {
                        let w = writer.clone();
                        tokio::task::spawn_blocking(move || {
                            if let Ok(mut w) = w.lock() {
                                let _ = std::io::Write::write_all(&mut *w, data.as_bytes());
                            }
                        });
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }

    info!("PTY WebSocket connection closed");
}
