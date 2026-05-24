# Project Handoff: musu-crawl-ai

## 📝 Project Overview
`musu-crawl-ai` is a high-performance Go-based knowledge harvester. It is designed to fetch content from diverse sources (YouTube, GitHub, Arxiv, HF, Web) and automatically organize it into a structured, AI-ready Markdown Wiki with a centralized metadata index.

## 🚀 Current Implementation Status (v0.1.0)

### 🛠️ Core Framework
- **CLI:** Built using `spf13/cobra`. Commands: `fetch`, `index`.
- **Concurrency:** Integrated **Worker Pool** (Goroutines) for batch processing.
- **Wiki Engine:** Standardized Markdown output with YAML Frontmatter.
- **Automatic Indexing:** Generates `wiki/README.md` (Human) and `wiki/index.json` (Machine/RAG).

### 🔍 Harvesters (Fetchers)
- **YouTube (`yt`):** 
    - Full transcript extraction.
    - **Innertube Fallback:** Bypasses PO-Token/403 blocks by simulating Android API requests.
- **GitHub (`gh`):** Fetches repo metadata (Stars, Lang) and `README.md`.
- **Arxiv (`arxiv`):** Fetches paper metadata (Abstract, Authors) and extracts text from PDFs.
- **Web (`web`):** Uses **Readability** algorithms to extract clean main content (removes ads/nav).
- **Hugging Face (`hf`):** Fetches Model Cards and metadata.
- **Twitter/X (`x`):** Implementation exists via Syndication API, but currently facing 404/Access issues from Twitter side (needs further bypass R&D).

## 📂 Directory Structure
```text
musu-crawl-ai/
├── cmd/                # CLI command definitions
├── internal/
│   ├── harvester/      # Modular fetcher implementations
│   ├── processor/      # Wiki & Indexing logic
├── wiki/               # Default Knowledge Base output
│   ├── index.json      # RAG-ready metadata catalog
│   ├── youtube/        # Categorized content
│   └── ...
├── main.go
└── musu-crawl.exe      # Compiled binary
```

## 🛠️ Usage Instructions

### 1. Single Fetch
```powershell
.\musu-crawl.exe fetch yt [VIDEO_ID]
.\musu-crawl.exe fetch gh [OWNER/REPO]
.\musu-crawl.exe fetch web [URL]
```

### 2. Batch Fetch (Concurrent)
Create a text file (e.g., `list.txt`):
```text
yt dQw4w9WgXcQ
gh spf13/cobra
arxiv 1706.03762
```
Run with workers:
```powershell
.\musu-crawl.exe fetch --file list.txt -w 10
```

### 3. Re-indexing
```powershell
.\musu-crawl.exe index
```

## 📋 Next Steps / Roadmap
1.  **X/Twitter Harvester Fix:** Investigate alternative scraping methods or API-key based fallback for the 404 issue.
2.  **Phase 6 (Robustness):** Add retry logic with exponential backoff for all HTTP requests.
3.  **RAG Integration:** The `index.json` is ready. Next step is building a small utility to load this into a Vector DB.
4.  **Auto-Tagging:** Implement simple keyword extraction to populate the `tags` field in Frontmatter.

## ⚙️ Development Environment
- **Language:** Go (tested on 1.26.3)
- **Dependencies:** `cobra`, `go-readability`, `html-to-markdown`, `ledongthuc/pdf`, `yaml.v3`.
- **Build Command:** `go build -o musu-crawl.exe main.go`
