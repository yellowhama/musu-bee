# Musu Indexer Integration & Usage Guide

## 📌 Context
This document outlines how to utilize the `musu-indexer` ecosystem within the `musu-functions` workspace. It provides a standardized approach for AI agents and human developers to retrieve codebase context instantly.

## 🚀 3-Tier Usage Strategy

### 1. For Humans: The Everything CLI
Use the CLI for manual exploration. It supports smart query expansion, allowing you to search with natural language.
- **Command**: `musu-indexer search "<query>"`
- **Example**: `musu-indexer search "VRAM configuration"`
- **Tip**: Use `musu-indexer recent` to see what files were modified in your latest work session.

### 2. For AI Assistants: The MCP Server
The primary bridge for AI (Claude, Gemini) to gain "eyes" on the project.
- **Activation**: Ensure `musu-indexer mcp` is added to your AI client configuration.
- **Benefit**: AI can autonomously call `search_codebase` to find relevant logic without asking the user to provide file paths.

### 3. For Automations: The Auto-Ingest Watcher
Keep the index perpetually fresh without manual intervention.
- **Command**: `musu-indexer watch`
- **Workflow**: Keep this daemon running in a terminal tab. It will detect file changes and update the index in the background within 2 seconds.

## 🏛️ Standard Operating Procedure (SOP)
1. **New Session**: Run `musu-indexer sync-map` to ensure the base index is perfect.
2. **Development**: Launch `musu-indexer watch`.
3. **Collaboration**: If a new AI agent joins, point it to the `SKILL.md` file in the root directory.

---
*Created on 2026-03-31 for yellowhama by Stella.*
