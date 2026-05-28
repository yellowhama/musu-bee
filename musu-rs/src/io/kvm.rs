//! Remote KVM Input handling via `enigo`

use serde::Deserialize;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Deserialize)]
pub struct KvmMessage {
    pub r#type: String,

    // For mousemove
    pub rx: Option<f64>,
    pub ry: Option<f64>,

    // For mousedown/up
    pub button: Option<String>,

    // For keydown/up
    pub key: Option<String>,
}

static ENIGO: OnceLock<Mutex<enigo::Enigo>> = OnceLock::new();

fn get_enigo() -> std::sync::MutexGuard<'static, enigo::Enigo> {
    ENIGO
        .get_or_init(|| Mutex::new(enigo::Enigo::new(&enigo::Settings::default()).unwrap()))
        .lock()
        .unwrap()
}

pub fn execute_kvm_command(cmd: &KvmMessage) {
    use enigo::{Button, Coordinate, Direction, Keyboard, Mouse};
    let mut enigo = get_enigo();

    match cmd.r#type.as_str() {
        "mousemove" => {
            if let (Some(rx), Some(ry)) = (cmd.rx, cmd.ry) {
                let (w, h) = enigo.main_display().unwrap_or((1920, 1080));
                let x = (rx * w as f64) as i32;
                let y = (ry * h as f64) as i32;
                let _ = enigo.move_mouse(x, y, Coordinate::Abs);
            }
        }
        "mousedown" => {
            if let Some(btn) = &cmd.button {
                let b = match btn.as_str() {
                    "right" => Button::Right,
                    "middle" => Button::Middle,
                    _ => Button::Left,
                };
                let _ = enigo.button(b, Direction::Press);
            }
        }
        "mouseup" => {
            if let Some(btn) = &cmd.button {
                let b = match btn.as_str() {
                    "right" => Button::Right,
                    "middle" => Button::Middle,
                    _ => Button::Left,
                };
                let _ = enigo.button(b, Direction::Release);
            }
        }
        "keydown" => {
            if let Some(k) = &cmd.key {
                let key = parse_key(k);
                let _ = enigo.key(key, Direction::Press);
            }
        }
        "keyup" => {
            if let Some(k) = &cmd.key {
                let key = parse_key(k);
                let _ = enigo.key(key, Direction::Release);
            }
        }
        _ => {}
    }
}

pub fn handle_kvm_message(msg: &[u8]) {
    let payload: Result<KvmMessage, _> = serde_json::from_slice(msg);
    match payload {
        Ok(cmd) => execute_kvm_command(&cmd),
        Err(e) => tracing::warn!("Invalid KVM message: {}", e),
    }
}

fn parse_key(k: &str) -> enigo::Key {
    use enigo::Key;
    match k.to_lowercase().as_str() {
        "enter" => Key::Return,
        "tab" => Key::Tab,
        "space" => Key::Space,
        "backspace" => Key::Backspace,
        "escape" => Key::Escape,
        "super" | "meta" | "windows" | "command" => Key::Meta,
        "shift" => Key::Shift,
        "capslock" => Key::CapsLock,
        "alt" => Key::Alt,
        "control" | "ctrl" => Key::Control,
        "arrowup" | "up" => Key::UpArrow,
        "arrowdown" | "down" => Key::DownArrow,
        "arrowleft" | "left" => Key::LeftArrow,
        "arrowright" | "right" => Key::RightArrow,
        s if s.chars().count() == 1 => Key::Unicode(s.chars().next().unwrap()),
        _ => Key::Space, // fallback
    }
}
