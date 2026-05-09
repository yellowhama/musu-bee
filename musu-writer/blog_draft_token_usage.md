---
title: "How I Cut AI Agent Token Usage by 70%"
status: DRAFT — awaiting Editor review
date: 2026-05-08
tags: [ai-agents, optimization, cli, musu]
seo_keywords: AI agent token usage, reduce AI API costs, CLI rate limits, agent prompt optimization
audience: devs hitting AI CLI rate limits
---

# How I Cut AI Agent Token Usage by 70%

I was burning through rate limits. Every 30 minutes my AI coding agent would hit a wall — not because it was doing too much work, but because it was doing the work badly.

After 48 hours of measurement across two machines (RTX 4060 and RTX 5070), I found three places responsible for most of the waste. Fixing them cut total token consumption by 70%. None of the fixes required a new model, a new library, or any clever architecture. Just less.

---

## The Silent Token Killers

### 1. The System Prompt Nobody Audited

I hadn't looked at my agent's system prompt in two months. When I finally did, I found 670 words of instructions, half of which were redundant or described behavior the model already does by default.

"Always be helpful and accurate." Cool. Burning tokens to say that.

Trimmed it to 174 words. That's a 75% reduction in one of the most-sent pieces of text in the entire system — sent with *every single request*.

The rule I now apply before shipping any system prompt: if deleting a sentence doesn't change observable behavior, delete it. Specific instructions beat general guidance every time. "Search for TypeScript errors in `src/` only" is shorter and more useful than a paragraph about being thorough.

### 2. The Heartbeat Running on Vanity

My agent was checking in every 5 minutes. Why? I set it up that way months ago and never revisited it.

Most of those heartbeats looked like this:

```
[10:05] heartbeat — no new tasks
[10:10] heartbeat — no new tasks
[10:15] heartbeat — no new tasks
[10:20] heartbeat — 1 task found
```

Three out of four calls were pure overhead. The agent was awake, consuming context, sending status to the control plane — doing nothing productive.

Stretched the interval to 30 minutes. Added an idle-skip condition: if no new work arrived since the last check, skip the full context evaluation and return early. Heartbeat token cost dropped 83%.

### 3. The Retrieval That Read Everything

The most embarrassing one: our retrieval logic had no scope constraints. When the agent needed context about a feature, it would search the codebase and pull back up to 75 files.

75 files. For a question about one function.

The agent wasn't doing anything wrong — it was following instructions that said "get relevant context." Without tighter boundaries, "relevant" means everything adjacent to the query, which compounds fast.

---

## Three Changes, Measured Results

### Change 1: Slim the Instructions

Before:
```
You are a helpful AI assistant. Your job is to assist the development team
with coding tasks. You should always be accurate, helpful, and thorough.
When given a task, think step by step. Always consider edge cases. Make
sure your code is well-commented and follows best practices...
[continues for 496 more words]
```

After:
```
You are an engineer on the MUSU project. Work in TypeScript unless told otherwise.
Search scope: src/ only. Flag blockers immediately. Skip explanation unless asked.
[+170 words of actual project-specific rules]
```

The "after" version is shorter and tells the model things it couldn't infer on its own. The "before" version was instructions *about how to be an AI*, sent to an AI.

### Change 2: Idle Skip in the Heartbeat

```python
async def heartbeat(agent_id: str):
    last_task = await get_last_task_time(agent_id)
    if (datetime.utcnow() - last_task).seconds < HEARTBEAT_INTERVAL:
        # Nothing new since last check — skip full eval
        return {"status": "idle", "skipped": True}

    # Full context load only when there's actual work
    return await run_full_evaluation(agent_id)
```

One condition. The agent stops loading its full context when there's nothing to act on.

### Change 3: FTS5 Index for Retrieval

Replaced the naive vector search fallback (which scanned broadly) with SQLite FTS5 for codebase queries:

```sql
CREATE VIRTUAL TABLE code_index USING fts5(
    filepath,
    content,
    tokenize="unicode61 remove_diacritics 2"
);

-- Query returns top 5 matches, not 75
SELECT filepath FROM code_index
WHERE code_index MATCH ?
ORDER BY rank LIMIT 5;
```

Result: average files retrieved per query went from 75 to 3. Token cost per retrieval operation dropped 96%.

FTS5 is built into SQLite. No new dependency. Took an afternoon.

---

## The Numbers

Measured over 48 hours, two machines running the same agent workload:

| Component | Before | After | Reduction |
|-----------|--------|-------|-----------|
| System prompt (per request) | 670 words | 174 words | -75% |
| Heartbeat calls (per hour) | 12 | 2 | -83% |
| Files retrieved per search | 75 | 3 | -96% |
| **Total token consumption** | baseline | **-70%** | |

The 70% total reduction is a blended number across all agent activity. Your mileage will vary depending on how task-heavy vs. idle your agent is. On the RTX 4060 machine (lighter workload, more idle time), savings were closer to 78% because the idle-skip had more effect. On the 5070 (heavier workload), it was around 62% — still well worth it.

---

## What I Learned

Most AI token waste isn't from the model doing too much — it's from the scaffolding doing the wrong things repeatedly.

System prompts accumulate cruft. Schedules are set once and forgotten. Retrieval logic defaults to "get everything." None of these are hard to fix. They just require actually looking at the numbers.

If you're hitting rate limits, instrument before you optimize. Find where the tokens are actually going. Mine were in three places I hadn't looked at in months.

The three fixes here aren't MUSU-specific. The same patterns apply to any agent running on a schedule with RAG-style retrieval. Slim prompts, idle awareness, and scoped search are useful regardless of what stack you're on.

---

*Running AI agents locally? MUSU is what I use to coordinate multi-agent workflows across my machines. [vibecode.town](https://vibecode.town)*

---

**DRAFT STATUS: Submitted for Editor review — do not publish**
