---
mode: agent
description: Portable file-based agent memory (agent-memory-os) — recall, save, and bootstrap.
---

# agent-memory (GitHub Copilot adapter)

Copy into `.github/prompts/`; invoke with `/agent-memory`. The procedures are the source of truth in
`${AGENT_MEMORY_DIR}/prompts/`:

- Set up: `prompts/bootstrap.md`.
- Before acting: `prompts/recall.md`.
- On learning something durable: `prompts/save.md`.

`AGENT_MEMORY_DIR` is the `agent-memory-os` checkout (env var, sibling path, or
`git clone https://github.com/viryty/agent-memory-os`). Verify with
`node scripts/memory/check-memory.mjs`.

> For always-on recall, add a pointer in `.github/copilot-instructions.md`.
