---
name: agent-memory
description: Set up and use a portable, file-based agent memory store (agent-memory-os). Use when the user wants persistent cross-session memory, to remember a fact/preference, to recall what is known about a topic, or to bootstrap a memory store into a repo or agent home.
---

# agent-memory (Claude Code adapter)

Thin wrapper. The procedures are the single source of truth in `$AGENT_MEMORY_DIR/prompts/`:

- **Set up**: follow `prompts/bootstrap.md`.
- **Before acting**: follow `prompts/recall.md` (read `memory/MEMORY.md`, load relevant entries).
- **On learning something durable**: follow `prompts/save.md` (write `memory/<slug>.md` + index it).

`$AGENT_MEMORY_DIR` is the `agent-memory-os` checkout — find it via the `AGENT_MEMORY_DIR` env var or
a sibling path; if missing, ask the user or `git clone https://github.com/viryty/agent-memory-os`.

Verify with `node scripts/memory/check-memory.mjs`.
