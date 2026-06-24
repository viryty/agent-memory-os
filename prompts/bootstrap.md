# Procedure: set up agent-memory-os

Canonical, tool-agnostic procedure to add the memory store to a repo or agent home. Adapters under
`integrations/` point here. Works in any agent that can run a shell command and read/edit files.

## 0. Locate agent-memory-os

Find the `agent-memory-os` checkout: check the `AGENT_MEMORY_DIR` env var, common sibling paths, or
clone `https://github.com/viryty/agent-memory-os`. Call it `$AGENT_MEMORY_DIR`.

## 1. Scaffold

```bash
node "$AGENT_MEMORY_DIR/bin/agent-memory-init.mjs" <targetDir> --owner "<name>"
```

Idempotent: it skips files that already exist (`--force` to overwrite, `--dry-run` to preview,
`--help` for all flags).

## 2. Wire it up

- If the target already has an `AGENTS.md`, merge the memory section in (or keep the scaffolded one).
- Point your tool's instructions file at it (e.g. `CLAUDE.md` → `@AGENTS.md`).

## 3. Verify

```bash
node scripts/memory/check-memory.mjs
```

Fix any errors. A fresh store passes with zero memories.

## 4. Use it

From then on, follow `prompts/recall.md` before acting and `prompts/save.md` when you learn something
durable. For a fully populated reference, see `$AGENT_MEMORY_DIR/examples/personal-assistant/`.
