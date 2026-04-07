//! Local Window Capture — OS-native screenshot of AI provider windows.
//!
//! Windows: PrintWindow API via `windows` crate
//! macOS: screencapture CLI (built-in, no extra deps)
//! Linux: scrap crate (X11) or xdotool + import (fallback)

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResult {
    pub session_id: String,
    pub width: u32,
    pub height: u32,
    /// Base64-encoded PNG data URI, or placeholder SVG data URI
    pub image_data_uri: String,
    pub timestamp: i64,
    pub is_placeholder: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    pub title: String,
    pub process_name: String,
    pub pid: u32,
    pub is_visible: bool,
}

// ---------------------------------------------------------------------------
// Capture commands
// ---------------------------------------------------------------------------

/// Capture a screenshot of the window associated with a session's provider.
#[tauri::command]
pub async fn capture_session_window(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<CaptureResult, String> {
    let endpoint = {
        let mgr = state
            .session_manager
            .lock()
            .map_err(|e| format!("lock: {e}"))?;
        let session = mgr
            .sessions
            .iter()
            .find(|s| s.id == session_id)
            .ok_or_else(|| format!("session not found: {session_id}"))?;
        session.endpoint.clone().unwrap_or_default()
    }; // MutexGuard dropped here, before await

    // Platform-specific capture
    capture_window_for_endpoint(&session_id, &endpoint).await
}

/// List visible windows that might be AI providers.
#[tauri::command]
pub async fn list_capturable_windows() -> Result<Vec<WindowInfo>, String> {
    list_capturable_windows_impl().await
}

// ---------------------------------------------------------------------------
// Windows implementation
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
async fn capture_window_for_endpoint(
    session_id: &str,
    endpoint: &str,
) -> Result<CaptureResult, String> {
    let session_id = session_id.to_string();
    let endpoint = endpoint.to_string();

    tokio::task::spawn_blocking(move || capture_window_blocking(&session_id, &endpoint))
        .await
        .map_err(|e| format!("spawn: {e}"))?
}

#[cfg(target_os = "windows")]
fn capture_window_blocking(session_id: &str, endpoint: &str) -> Result<CaptureResult, String> {
    use base64::Engine;
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

    let hwnd = match find_provider_window(endpoint) {
        Some(h) => h,
        None => return Ok(placeholder_capture(session_id)),
    };

    let mut rect = RECT::default();
    unsafe { GetWindowRect(hwnd, &mut rect) }.map_err(|e| format!("GetWindowRect: {e}"))?;

    let width = (rect.right - rect.left) as u32;
    let height = (rect.bottom - rect.top) as u32;

    if width == 0 || height == 0 {
        return Ok(placeholder_capture(session_id));
    }

    unsafe {
        let hdc_screen = GetDC(hwnd);
        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let hbitmap = CreateCompatibleBitmap(hdc_screen, width as i32, height as i32);
        let old_bitmap = SelectObject(hdc_mem, hbitmap);

        // Fallback to BitBlt directly (PrintWindow removed due to crate version incompatibility)
        let _ = BitBlt(
            hdc_mem,
            0,
            0,
            width as i32,
            height as i32,
            hdc_screen,
            0,
            0,
            SRCCOPY,
        );

        // Extract pixel data
        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32), // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0 as u32,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut pixels = vec![0u8; (width * height * 4) as usize];
        GetDIBits(
            hdc_mem,
            hbitmap,
            0,
            height,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bi as *mut _ as *mut _,
            DIB_RGB_COLORS,
        );

        // Cleanup GDI objects
        SelectObject(hdc_mem, old_bitmap);
        let _ = DeleteObject(hbitmap);
        let _ = DeleteDC(hdc_mem);
        ReleaseDC(hwnd, hdc_screen);

        // Convert BGRA → RGBA
        for chunk in pixels.chunks_exact_mut(4) {
            chunk.swap(0, 2);
        }

        // Encode as PNG
        let img = image::RgbaImage::from_raw(width, height, pixels)
            .ok_or("failed to create image buffer")?;
        let mut png_buf = Vec::new();
        img.write_with_encoder(image::codecs::png::PngEncoder::new(&mut png_buf))
            .map_err(|e| format!("PNG encode: {e}"))?;

        let b64 = base64::engine::general_purpose::STANDARD.encode(&png_buf);
        let data_uri = format!("data:image/png;base64,{b64}");

        Ok(CaptureResult {
            session_id: session_id.to_string(),
            width,
            height,
            image_data_uri: data_uri,
            timestamp: chrono::Utc::now().timestamp_millis(),
            is_placeholder: false,
        })
    }
}

#[cfg(target_os = "windows")]
fn find_provider_window(endpoint: &str) -> Option<windows::Win32::Foundation::HWND> {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, IsWindowVisible};

    // Determine search term from endpoint
    let search_term = if endpoint.contains("11434") {
        "ollama"
    } else if endpoint.contains("1234") {
        "lm studio"
    } else if endpoint.contains("8080") {
        "localai"
    } else if endpoint.contains("8081") {
        "llama"
    } else {
        return None; // Can't identify provider from endpoint
    };

    let search = search_term.to_lowercase();

    unsafe extern "system" fn enum_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam.0 as *mut (String, Option<HWND>));
        if IsWindowVisible(hwnd).as_bool() {
            let mut title = [0u16; 256];
            let len = GetWindowTextW(hwnd, &mut title);
            if len > 0 {
                let title_str = String::from_utf16_lossy(&title[..len as usize]).to_lowercase();
                if title_str.contains(&ctx.0) {
                    ctx.1 = Some(hwnd);
                    return BOOL(0); // stop
                }
            }
        }
        BOOL(1) // continue
    }

    let mut ctx = (search, None::<HWND>);
    unsafe {
        let _ = EnumWindows(Some(enum_cb), LPARAM(&mut ctx as *mut _ as isize));
    }
    ctx.1
}

#[cfg(target_os = "windows")]
async fn list_capturable_windows_impl() -> Result<Vec<WindowInfo>, String> {
    tokio::task::spawn_blocking(|| {
        use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
        use windows::Win32::UI::WindowsAndMessaging::{
            EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
        };

        let ai_keywords = [
            "ollama",
            "lm studio",
            "localai",
            "llama",
            "kobold",
            "bitnet",
            "text-generation",
        ];

        unsafe extern "system" fn enum_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let ctx = &mut *(lparam.0 as *mut (Vec<&str>, Vec<WindowInfo>));
            if IsWindowVisible(hwnd).as_bool() {
                let mut title_buf = [0u16; 256];
                let len = GetWindowTextW(hwnd, &mut title_buf);
                if len > 0 {
                    let title = String::from_utf16_lossy(&title_buf[..len as usize]);
                    let title_lower = title.to_lowercase();
                    if ctx.0.iter().any(|kw| title_lower.contains(kw)) {
                        let mut pid: u32 = 0;
                        GetWindowThreadProcessId(hwnd, Some(&mut pid));
                        ctx.1.push(WindowInfo {
                            title,
                            process_name: String::new(), // filled below
                            pid,
                            is_visible: true,
                        });
                    }
                }
            }
            BOOL(1)
        }

        let mut ctx: (Vec<&str>, Vec<WindowInfo>) = (ai_keywords.to_vec(), Vec::new());
        unsafe {
            let _ = EnumWindows(Some(enum_cb), LPARAM(&mut ctx as *mut _ as isize));
        }
        let mut windows = ctx.1;

        // Enrich with process names via sysinfo
        if !windows.is_empty() {
            let mut sys = sysinfo::System::new();
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
            for w in &mut windows {
                if let Some(proc) = sys.process(sysinfo::Pid::from_u32(w.pid)) {
                    w.process_name = proc.name().to_string_lossy().to_string();
                }
            }
        }

        Ok(windows)
    })
    .await
    .map_err(|e| format!("spawn: {e}"))?
}

// ---------------------------------------------------------------------------
// macOS implementation — uses built-in `screencapture` CLI
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
async fn capture_window_for_endpoint(
    session_id: &str,
    endpoint: &str,
) -> Result<CaptureResult, String> {
    let session_id = session_id.to_string();
    let endpoint = endpoint.to_string();

    tokio::task::spawn_blocking(move || capture_macos_blocking(&session_id, &endpoint))
        .await
        .map_err(|e| format!("spawn: {e}"))?
}

#[cfg(target_os = "macos")]
fn capture_macos_blocking(session_id: &str, _endpoint: &str) -> Result<CaptureResult, String> {
    use std::process::Command;

    let tmp = std::env::temp_dir().join(format!("musu_cap_{}.png", session_id));
    let tmp_str = tmp.to_string_lossy().to_string();

    // screencapture -x (no sound) -C (capture cursor) -t png
    // -x suppresses the camera shutter sound
    let output = Command::new("screencapture")
        .args(["-x", "-C", "-t", "png", &tmp_str])
        .output()
        .map_err(|e| format!("screencapture failed: {e}"))?;

    if !output.status.success() {
        return Ok(placeholder_capture(session_id));
    }

    let png_data = std::fs::read(&tmp).map_err(|e| format!("read capture: {e}"))?;
    let _ = std::fs::remove_file(&tmp);

    // Get dimensions from PNG header
    let (width, height) = png_dimensions(&png_data).unwrap_or((1920, 1080));

    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &png_data);
    let data_uri = format!("data:image/png;base64,{b64}");

    Ok(CaptureResult {
        session_id: session_id.to_string(),
        width,
        height,
        image_data_uri: data_uri,
        timestamp: chrono::Utc::now().timestamp_millis(),
        is_placeholder: false,
    })
}

#[cfg(target_os = "macos")]
async fn list_capturable_windows_impl() -> Result<Vec<WindowInfo>, String> {
    tokio::task::spawn_blocking(|| {
        use std::process::Command;

        let mut windows = Vec::new();

        // Use ps to find running AI provider processes
        let output = Command::new("ps")
            .args(["aux"])
            .output()
            .map_err(|e| format!("ps failed: {e}"))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let ai_keywords = ["ollama", "lm-studio", "lmstudio", "localai", "llama"];

        for line in stdout.lines() {
            let lower = line.to_lowercase();
            for keyword in &ai_keywords {
                if lower.contains(keyword) {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() > 1 {
                        if let Ok(pid) = parts[1].parse::<u32>() {
                            windows.push(WindowInfo {
                                title: parts[10..].join(" "),
                                process_name: keyword.to_string(),
                                pid,
                                is_visible: true,
                            });
                        }
                    }
                    break;
                }
            }
        }

        Ok(windows)
    })
    .await
    .map_err(|e| format!("spawn: {e}"))?
}

// ---------------------------------------------------------------------------
// Linux implementation — uses `import` (ImageMagick) or `xdg-screenshooter`
// ---------------------------------------------------------------------------

#[cfg(target_os = "linux")]
async fn capture_window_for_endpoint(
    session_id: &str,
    endpoint: &str,
) -> Result<CaptureResult, String> {
    let session_id = session_id.to_string();
    let endpoint = endpoint.to_string();

    tokio::task::spawn_blocking(move || capture_linux_blocking(&session_id, &endpoint))
        .await
        .map_err(|e| format!("spawn: {e}"))?
}

#[cfg(target_os = "linux")]
fn capture_linux_blocking(session_id: &str, _endpoint: &str) -> Result<CaptureResult, String> {
    use std::process::Command;

    let tmp = std::env::temp_dir().join(format!("musu_cap_{}.png", session_id));
    let tmp_str = tmp.to_string_lossy().to_string();

    // Try scrot first (commonly available)
    let captured = Command::new("scrot")
        .args([&tmp_str])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    // Fallback: try gnome-screenshot
    let captured = if !captured {
        Command::new("gnome-screenshot")
            .args(["-f", &tmp_str])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    } else {
        captured
    };

    // Fallback: try import (ImageMagick)
    let captured = if !captured {
        Command::new("import")
            .args(["-window", "root", &tmp_str])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    } else {
        captured
    };

    if !captured || !tmp.exists() {
        return Ok(placeholder_capture(session_id));
    }

    let png_data = std::fs::read(&tmp).map_err(|e| format!("read capture: {e}"))?;
    let _ = std::fs::remove_file(&tmp);

    let (width, height) = png_dimensions(&png_data).unwrap_or((1920, 1080));

    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &png_data);
    let data_uri = format!("data:image/png;base64,{b64}");

    Ok(CaptureResult {
        session_id: session_id.to_string(),
        width,
        height,
        image_data_uri: data_uri,
        timestamp: chrono::Utc::now().timestamp_millis(),
        is_placeholder: false,
    })
}

#[cfg(target_os = "linux")]
async fn list_capturable_windows_impl() -> Result<Vec<WindowInfo>, String> {
    tokio::task::spawn_blocking(|| {
        let mut windows = Vec::new();

        // Parse /proc for AI provider processes
        let ai_keywords = ["ollama", "lm-studio", "lmstudio", "localai", "llama"];

        if let Ok(entries) = std::fs::read_dir("/proc") {
            for entry in entries.flatten() {
                let pid_str = entry.file_name().to_string_lossy().to_string();
                let Ok(pid) = pid_str.parse::<u32>() else {
                    continue;
                };

                let cmdline_path = entry.path().join("cmdline");
                let Ok(cmdline) = std::fs::read_to_string(&cmdline_path) else {
                    continue;
                };

                let lower = cmdline.to_lowercase();
                for keyword in &ai_keywords {
                    if lower.contains(keyword) {
                        let comm_path = entry.path().join("comm");
                        let process_name = std::fs::read_to_string(&comm_path)
                            .unwrap_or_else(|_| keyword.to_string())
                            .trim()
                            .to_string();

                        windows.push(WindowInfo {
                            title: cmdline.replace('\0', " ").trim().to_string(),
                            process_name,
                            pid,
                            is_visible: true,
                        });
                        break;
                    }
                }
            }
        }

        Ok(windows)
    })
    .await
    .map_err(|e| format!("spawn: {e}"))?
}

// ---------------------------------------------------------------------------
// Unsupported platforms stub
// ---------------------------------------------------------------------------

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
async fn capture_window_for_endpoint(
    session_id: &str,
    _endpoint: &str,
) -> Result<CaptureResult, String> {
    Ok(placeholder_capture(session_id))
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
async fn list_capturable_windows_impl() -> Result<Vec<WindowInfo>, String> {
    Ok(vec![])
}

// ---------------------------------------------------------------------------
// PNG dimension reader (cross-platform helper)
// ---------------------------------------------------------------------------

/// Read width and height from PNG IHDR chunk.
#[cfg(not(target_os = "windows"))]
fn png_dimensions(data: &[u8]) -> Option<(u32, u32)> {
    // PNG header (8 bytes) + IHDR length (4 bytes) + "IHDR" (4 bytes) + width (4 bytes) + height (4 bytes)
    if data.len() < 24 {
        return None;
    }
    // Check PNG magic
    if &data[0..4] != b"\x89PNG" {
        return None;
    }
    let width = u32::from_be_bytes([data[16], data[17], data[18], data[19]]);
    let height = u32::from_be_bytes([data[20], data[21], data[22], data[23]]);
    Some((width, height))
}

// ---------------------------------------------------------------------------
// Placeholder
// ---------------------------------------------------------------------------

fn placeholder_capture(session_id: &str) -> CaptureResult {
    let svg = r#"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMjAiIGhlaWdodD0iMjQwIj48cmVjdCB3aWR0aD0iMzIwIiBoZWlnaHQ9IjI0MCIgZmlsbD0iIzFhMWEyZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSIgZmlsbD0iIzY2NiIgZm9udC1zaXplPSIxNCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiPlNjcmVlbiBDYXB0dXJlPC90ZXh0Pjwvc3ZnPg=="#;

    CaptureResult {
        session_id: session_id.to_string(),
        width: 320,
        height: 240,
        image_data_uri: svg.to_string(),
        timestamp: chrono::Utc::now().timestamp_millis(),
        is_placeholder: true,
    }
}
