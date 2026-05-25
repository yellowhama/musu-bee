use std::sync::Mutex;
static LAST_CLIPBOARD_TEXT: Mutex<String> = Mutex::new(String::new());

pub fn test() {
    let _ = LAST_CLIPBOARD_TEXT.lock().unwrap();
}
