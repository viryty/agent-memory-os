# AGENTS.md — Agent Memory

Entry contract for any agent (Claude Code, Cursor, Codex, Copilot, ...) that uses this memory store.
Tool-agnostic by design; tool-specific files (e.g. `CLAUDE.md`) just point here.

This repository **is a persistent, file-based memory** for an AI agent: durable facts that should
survive across sessions, kept as plain markdown so any tool can read and write them.

## Recall — before you act

1. Read `memory/MEMORY.md` — the index. It has one line per memory.
2. Open the entries relevant to the current task and load them as background context.
3. Treat recalled memories as **what was true when written**, not ground truth now. If a memory names
   a file, value, or person, verify it still holds before relying on it.

## The memory model

- One fact per file: `memory/<slug>.md`. Small, single-purpose, easy to update or delete.
- `memory/MEMORY.md` is the index loaded each session — one pointer line per memory, nothing else.
- Link related memories with `[[slug]]`. A `[[slug]]` with no file yet is fine — it marks something
  worth writing later.

## Entry contract (front matter)

```yaml
---
name: prefers-concise-answers     # kebab-slug; MUST equal the file name without .md
type: feedback                    # user | feedback | project | reference
status: current                   # current | archived
created: 2026-01-01
last_reviewed: 2026-01-01         # optional
review_after: 2026-07-01          # optional; a due date prompts re-verification
confidence: high                  # optional: high | medium | low
source: "..."                     # optional: where this came from
---

The fact, stated plainly.
```

## Types

- **user** — who the person is: role, expertise, durable preferences.
- **feedback** — how you should work (corrections and confirmed approaches). Add **Why:** and
  **How to apply:** lines.
- **project** — ongoing work, goals, constraints not derivable from the artifacts themselves. Convert
  relative dates ("next week") to absolute ones.
- **reference** — pointers to external resources (URLs, dashboards, tickets, docs).

## Save — when you learn something durable

- Save only what will matter in a **future** session. Skip what is obvious from the artifacts, or only
  relevant to the current conversation.
- **Update, don't duplicate.** Before adding, check the index for an entry that already covers it and
  edit that file instead.
- **Prune.** Delete memories that turn out to be wrong rather than leaving them to mislead.
- After writing `memory/<slug>.md`, add a one-line pointer to `memory/MEMORY.md`:
  `- [Title](slug.md) — short hook`.
- Convert relative dates to absolute; never store secrets or credentials.

## Checks

- `node scripts/memory/check-memory.mjs` — validate entries, index consistency, links, review dates;
  fail on malformed front matter and unresolved git conflict markers.
- `node --test scripts/memory/check-memory.test.mjs` — the checker's own tests.
- `node scripts/memory/check-memory.mjs --stale-only` — list memories whose `review_after` is due.
- Config: `memory/.memorycheckrc.json` (types, index strictness, placeholders).
