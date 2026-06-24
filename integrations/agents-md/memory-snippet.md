# Generic AGENTS.md adapter

For any agent that reads `AGENTS.md` (OpenAI Codex, Aider, Zed, Gemini CLI, ...). Paste the block
below into the repo's `AGENTS.md`.

```markdown
## Agent memory

This repo carries a file-based memory store under `memory/` (index: `memory/MEMORY.md`).
- Before acting, recall: read `memory/MEMORY.md` and open relevant entries (treat them as "true when
  written" — verify before relying).
- When you learn a durable fact, save it: write `memory/<slug>.md` and add a one-line pointer to
  `memory/MEMORY.md`. Full procedures: `$AGENT_MEMORY_DIR/prompts/recall.md` and `prompts/save.md`,
  where `$AGENT_MEMORY_DIR` is a checkout of https://github.com/viryty/agent-memory-os.
- Validate with `node scripts/memory/check-memory.mjs`.
```
