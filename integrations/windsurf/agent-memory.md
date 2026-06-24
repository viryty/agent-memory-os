# agent-memory (Windsurf adapter)

Copy into `.windsurf/rules/` (or append to `.windsurfrules`). The procedures are the source of truth
in `$AGENT_MEMORY_DIR/prompts/`:

- Set up: `prompts/bootstrap.md`.
- Before acting: `prompts/recall.md`.
- On learning something durable: `prompts/save.md`.

`$AGENT_MEMORY_DIR` is the `agent-memory-os` checkout (env var `AGENT_MEMORY_DIR`, a sibling path, or
`git clone https://github.com/viryty/agent-memory-os`). Verify with
`node scripts/memory/check-memory.mjs`.
