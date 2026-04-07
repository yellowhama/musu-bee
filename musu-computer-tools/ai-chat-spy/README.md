# AI Chat Spy (Window Capture Engine) 🕵️‍♂️

**Project Source**: `release/musu-desktop/src-tauri/src/commands/local_capture.rs`  
**Purpose**: OS-native high-performance capture of AI provider windows (Ollama, LM Studio, etc.) for real-time monitoring and scraping.

## 🌟 Key Features
- **Auto-Discovery**: Automatically identifies the AI provider window based on network endpoint (Port 11434 -> Ollama, Port 1234 -> LM Studio).
- **Surgical Capture**: Uses Win32 GDI (BitBlt) to capture only the relevant window area, bypassing full-screen privacy concerns.
- **Cross-Platform Fallbacks**: Supports Windows (Win32 API), macOS (screencapture CLI), and Linux (scrot/ImageMagick).
- **AI-Native Output**: Converts captures directly into Base64-encoded PNG Data URIs for instant consumption by Vision LLMs or Frontend overlays.

## 🛠️ Architecture (Bilingual Logic)
Following the **Bilingual Runtime Architecture**, this tool separates:
1.  **Shared Logic**: Session & Endpoint mapping.
2.  **Native Adapters**: OS-specific capture implementation (Rust/Win32/macOS CLI).

## 🚀 Future Ingest Plan
To fully "scrape" the text from these captures without API access:
1.  **OCR Pipeline**: Integrate `Tesseract` or `EasyOCR` to convert `imageDataUri` into raw text.
2.  **Smart Diffing**: Compare subsequent captures to detect new chat messages and trigger auto-responses.

---
*Archived for musu-functions by Stella (Gemini CLI) on 2026-03-31.*
