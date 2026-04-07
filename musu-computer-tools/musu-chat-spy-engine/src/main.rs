use std::env;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
struct SpySnapshot {
    timestamp: i64,
    window_title: String,
    content: String,
}

// ---------------------------------------------------------------------------
// Windows Implementation
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
mod win_impl {
    use super::*;
    use windows::core::*;
    use windows::Win32::Foundation::*;
    use windows::Win32::UI::Accessibility::*;
    use windows::Win32::UI::WindowsAndMessaging::*;
    use windows::Win32::System::Com::*;

    pub struct Crawler {
        automation: IUIAutomation,
        extracted_text: Vec<String>,
    }

    impl Crawler {
        pub fn new() -> Result<Self> {
            unsafe {
                let automation: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_ALL)?;
                Ok(Self {
                    automation,
                    extracted_text: Vec::new(),
                })
            }
        }

        pub fn crawl(&mut self, window_hwnd: HWND) -> Result<String> {
            unsafe {
                let element = self.automation.ElementFromHandle(window_hwnd)?;
                self.extracted_text.clear();
                self.recursive_crawl(&element)?;
                Ok(self.extracted_text.join("\n"))
            }
        }

        fn recursive_crawl(&mut self, element: &IUIAutomationElement) -> Result<()> {
            unsafe {
                let name = element.CurrentName()?;
                let name_str = name.to_string();
                if !name_str.trim().is_empty() {
                    self.extracted_text.push(name_str);
                }

                let condition = self.automation.CreateTrueCondition()?;
                let children = element.FindAll(TreeScope_Children, &condition)?;
                let count = children.Length()?;
                
                for i in 0..count {
                    let child = children.GetElement(i)?;
                    let _ = self.recursive_crawl(&child); // Ignore errors for individual nodes
                }
            }
            Ok(())
        }
    }

    unsafe extern "system" fn enum_window_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let (target_title, found_hwnd) = &mut *(lparam.0 as *mut (String, Option<HWND>));
        let mut title_buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut title_buf);
        if len > 0 {
            let title = String::from_utf16_lossy(&title_buf[..len as usize]);
            if title.to_lowercase().contains(&target_title.to_lowercase()) {
                *found_hwnd = Some(hwnd);
                return BOOL(0);
            }
        }
        BOOL(1)
    }

    pub fn find_window_by_title(title: &str) -> Option<HWND> {
        let mut context = (title.to_string(), None::<HWND>);
        unsafe {
            let _ = EnumWindows(Some(enum_window_callback), LPARAM(&mut context as *mut _ as isize));
        }
        context.1
    }

    pub fn init_com() -> Result<()> {
        unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
    }
}

// ---------------------------------------------------------------------------
// Non-Windows Stub (For development on WSL)
// ---------------------------------------------------------------------------

#[cfg(not(target_os = "windows"))]
mod win_impl {
    pub struct Crawler;
    impl Crawler {
        pub fn new() -> anyhow::Result<Self> { Ok(Self) }
        pub fn crawl(&mut self, _h: ()) -> anyhow::Result<String> { Ok("Stub text for non-windows".to_string()) }
    }
    pub fn find_window_by_title(_t: &str) -> Option<()> { None }
    pub fn init_com() -> anyhow::Result<()> { Ok(()) }
}

// ---------------------------------------------------------------------------
// Main Loop
// ---------------------------------------------------------------------------

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        println!("Usage: musu-chat-spy-engine <window_title_keyword>");
        return Ok(());
    }

    let target_keyword = &args[1];

    win_impl::init_com().map_err(|e| anyhow::anyhow!("COM Init Failed: {}", e))?;
    let mut crawler = win_impl::Crawler::new().map_err(|e| anyhow::anyhow!("Init Failed: {}", e))?;

    println!("🕵️‍♂️ AI Chat Spy started (Target: {})", target_keyword);

    loop {
        if let Some(hwnd) = win_impl::find_window_by_title(target_keyword) {
            match crawler.crawl(hwnd) {
                Ok(text) => {
                    let snap = SpySnapshot {
                        timestamp: chrono::Utc::now().timestamp_millis(),
                        window_title: target_keyword.to_string(),
                        content: text,
                    };
                    if let Ok(json) = serde_json::to_string(&snap) {
                        println!("{}", json);
                    }
                }
                Err(e) => eprintln!("Crawl Error: {:?}", e),
            }
        }
        std::thread::sleep(std::time::Duration::from_secs(5));
    }
}
