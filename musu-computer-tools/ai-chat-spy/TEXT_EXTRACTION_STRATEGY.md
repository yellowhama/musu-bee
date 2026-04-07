# Direct Text Extraction Architecture (AI Spy) 🕵️‍♂️

**Target**: Extract raw strings from external application windows (ChatGPT Desktop, Claude Web, etc.) without heavy images.
**Philosophy**: "Talk to the OS, not the GPU."

---

## 🏗️ The Core Mechanism: Accessibility Tree Traversal

Unlike PTY hijacking (which owns the process), this method interacts with **already running** external windows by querying the OS **Accessibility (A11y) API**.

### 🔄 Data Flow
1.  **Window Discovery**: Locate the target window handle (HWND) via process name or port (e.g., "Ollama", "LM Studio").
2.  **Tree Traversal**: Use Windows `UI Automation (UIA)` or macOS `Accessibility API` to crawl the UI element tree.
3.  **Attribute Extraction**: Find elements with `Value`, `Name`, or `Text` attributes.
4.  **Semantic Mapping**: Filter out UI noise (buttons, menus) and keep only the chat bubbles/code blocks.

## 🛠️ Implementation References (from Musu-new)

### 1. Automation Commands
- **Source**: `release/musu-desktop/src-tauri/src/commands/automation.rs`
- **Role**: Detects patterns in the UI and suggests actions.

### 2. Native Bridge
- **Source**: `release/musu-desktop/src-tauri/src/commands/local_capture.rs`
- **Discovery Logic**:
    ```rust
    // Identifies the window based on network ports
    if endpoint.contains("11434") { "ollama" }
    else if endpoint.contains("1234") { "lm studio" }
    ```

---

## 🧠 Why "Text-Only" is Superior for AI
1.  **Zero Vision Cost**: No need for expensive Vision LLMs (GPT-4o, Claude 3.5 Sonnet Vision).
2.  **Context Precision**: Strings are 100% accurate; OCR often misinterprets code symbols (`;` vs `:`).
3.  **Instant Ingestion**: Text strings flow directly into `musu-indexer` for immediate RAG (Retrieval-Augmented Generation).

## 🚀 The Hybrid "Spy" Model
MUSU uses both:
- **PTY Hijacking**: For terminals owned by MUSU (Full Control).
- **Accessibility Extraction**: For external apps already running (Spy Mode).

---
*Archived for musu-functions by Stella (Gemini CLI) on 2026-03-31.*
