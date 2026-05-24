# musu-crawl-ai

> **The High-Bandwidth Data Supply Chain for AI Researcher Agents.**

`musu-crawl-ai` is a professional, high-performance Go-based crawler and LLM Wiki generator. It empowers AI agents (and humans) to discover, fetch, organize, and synthesize knowledge from across the web into a structured, searchable, and interlinked "AI Brain."

---

## 🚀 Key Features

### 📡 Universal Knowledge Harvesters
- **YouTube:** High-fidelity transcript extraction with Innertube fallback.
- **Academic (Arxiv):** Perfect layout preservation using HTML-first parsing.
- **Code (GitHub):** Repository metadata and documentation extraction.
- **Social (Twitter/Reddit):** Thread and post harvesting via resilient bypasses.
- **General Web:** Noise-free content extraction using Readability algorithms.

### 🧠 Autonomous Intelligence (The Brain)
- **Recursive Research:** Multi-agent loop (Planner -> Searcher -> Harvester -> Analyst) that recursively fills information gaps.
- **Wiki Compiler:** Autonomous document cross-linking and relationship explanation.
- **Hybrid Search:** Instant keyword (Bleve) and semantic vector (Ollama) search.
- **Smart Formatting:** Auto-tagging and extractive summarization for every document.

### 🏢 Enterprise-Grade Architecture
- **Multi-Project Scoping:** Isolate research missions into dedicated project silos.
- **Hierarchical Config:** Professional configuration precedence (Flags > Env > Project > Global).
- **Secure Secrets:** Built-in `auth` manager to keep API keys in project-specific encrypted/hidden stores.
- **One-Binary Distribution:** Standalone executable with built-in `init` and `update` commands.

---

## 🛠️ Installation & Setup

### 1. Download
Get the latest binary for your OS from [GitHub Releases](https://github.com/yellowhama/musu-crawl-ai/releases).

### 2. Initialize
```bash
./musu-crawl init
```

### 3. Configure (Optional)
Set your preferred language or Ollama model in `~/.musu/config.toml`.

---

## 📖 User Manual

### 1. Project Management
All work in `musu-crawl` should be scoped to a project to maintain context.
```bash
# Start a new research project
./musu-crawl fetch web https://example.com --project my-new-research
```

### 2. Managing Secrets
Securely add API keys to a specific project:
```bash
./musu-crawl auth set OPENAI_API_KEY "your-key" --project my-new-research
```

### 3. Autonomous Deep Research
Let the agent handle the entire discovery and analysis loop:
```bash
./musu-crawl research "What are the latest breakthroughs in fusion energy?" --project energy-tech --depth 2
```

### 4. Exploring the Knowledge Galaxy
Visualize your "Brain" in the browser:
```bash
./musu-crawl serve --port 8080
# Visit http://localhost:8080/galaxy
```

---

## 📂 Directory Structure
- `/wiki/projects/{name}`: Project-specific knowledge silos.
- `/wiki/index.json`: Master machine-readable knowledge map.
- `/wiki/musu.bleve`: Keyword search database.
- `/wiki/musu.vectors.json`: Semantic vector store.

---

## 🤖 For AI Agents
If you are an AI agent driving this tool, please refer to [**AGENTS.md**](./AGENTS.md) for detailed operational protocols and knowledge primitive combinations.

---

## 📝 Roadmap & Status
- [x] v0.1.0: Core Harvesters
- [x] v0.2.0: Local Intelligence & Batching
- [x] v0.3.0: AI Brain (Multi-Project & Galaxy)
- [x] v0.4.0: Configuration & Secrets Management (Current)
- [ ] v0.5.0: Direct Vector DB Cloud Export & OCR Integration
