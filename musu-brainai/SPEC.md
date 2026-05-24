# Spec: musu-brainai Workspace State & Knowledge Server (STATUS: V0.4.0 Horizon)

## 🎯 Project Goal
A high-performance workspace-centric state and knowledge engine. Placed as a sibling microservice under the `musu-bee` monorepo, `musu-brainai` replaces distributed SQLite synchronization with a file-based task tracking system (Single Source of Truth) and serves as the visual and semantic hub for the entire multi-agent fleet.

## ✅ Completed Milestones

### Phase 1-9: The Harvester Engine (Inherited)
- [x] **Universal Fetchers:** YouTube, GitHub, Arxiv (Layout preserved), Reddit, HF, Web.
- [x] **Robustness:** Exponential backoff, fallback bypasses for gated content.

### Phase 10-14: Intelligence & Distribution (Inherited)
- [x] **Recursive Research:** Autonomous multi-agent loops (Planner -> Searcher -> Analyst).
- [x] **LLM Wiki Pattern:** Local summarization, auto-tagging, and cross-linking (Compiler agent).

### Phase 15-17: AI Brain & Galaxy V1
- [x] **Multi-Project Scoping:** All knowledge is scoped by `--project`. Files are organized in `wiki/projects/{project_name}/`.
- [x] **Interactive Knowledge Galaxy:** D3.js based dashboard visualizing documents as a connected network.
- [x] **Project-Aware Search:** Hybrid search (Bleve + Vectors) filtered by project.

### Phase 18: File-based Task Orchestration & Galaxy V2 (v0.4.0 Current)
- [x] **Go-based Monorepo Integration:** Placed cleanly inside `musu-bee/musu-brainai`.
- [x] **File-based SSOT:** Replaced SQLite split-brain risks by storing tasks and execution states in `.musu/tasks/{id}.json` files.
- [x] **REST API for Task States:** Added `GET /api/tasks`, `POST /api/tasks`, `PUT /api/tasks/:id` to create, read, and merge task updates.
- [x] **Galaxy V2 Map:** Upgraded the D3.js visual map to include Task nodes (colored by status), PC machine nodes, and Company nodes alongside knowledge files.
- [x] **Rust Executor Sync:** Integrated Rust (`musu-rs`) task runners to update these task JSON files in real-time.

---

## 🧐 Qualitative Evaluation (v0.4.0)

### 1. Architectural Simplification
- **Zero Consensus Overhead**: Transitioning from complex SQLite syncing/consensuses to file-based SSOT under `~/.musu/tasks/` avoids database locking, timeout issues, and split-brain states under unstable networks.
- **Single ownership model**: The originator node maintains task ownership, while target nodes report progress via single-direction callbacks and JSON updates.

### 2. High Cohesion Cockpit
- **Stunning Unified Galaxy**: Visualizing tasks, machines, and knowledge files together in a unified network allows operators to monitor the "live" state of the fleet and knowledge development in one view.

---

## 🚀 Next Steps (Future)
1. **KG-RAG (Knowledge Graph RAG)**: Transition from naive linking to structured triplet extraction (`wiki/graph.json`) for multi-hop reasoning.
2. **Auto-Context Adapter**: Query `musu-brainai` automatically before task execution to inject relevant context into the prompt.
3. **Reflection Loops**: Auto-index analyst reflection summaries at task finalization to guide future agent executions.
