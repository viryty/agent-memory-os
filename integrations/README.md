# Integrations — per-tool adapters

Agent memory works in any agent, because the real logic is a plain CLI plus tool-agnostic procedures
(`../prompts/`). These adapters are thin shims that let each tool recall/save/bootstrap natively.
Every adapter points at the same procedures — one source of truth, no duplicated logic.

| Tool | Adapter file | Where to put it | How to invoke |
| --- | --- | --- | --- |
| Claude Code | [`claude-code/skills/agent-memory/SKILL.md`](claude-code/skills/agent-memory/SKILL.md) | `~/.claude/skills/` | skill auto-triggers; or "remember / recall ..." |
| Cursor | [`cursor/agent-memory.mdc`](cursor/agent-memory.mdc) | `.cursor/rules/` | `@agent-memory` |
| GitHub Copilot | [`github-copilot/agent-memory.prompt.md`](github-copilot/agent-memory.prompt.md) | `.github/prompts/` | `/agent-memory` |
| Windsurf | [`windsurf/agent-memory.md`](windsurf/agent-memory.md) | `.windsurf/rules/` | "recall / remember ..." |
| Codex / Aider / Zed / Gemini CLI (AGENTS.md) | [`agents-md/memory-snippet.md`](agents-md/memory-snippet.md) | paste into `AGENTS.md` | "recall / remember ..." |
| Any MCP client | [`mcp/server.mjs`](mcp/README.md) | client MCP config | native tools `memory_recall` / `memory_save` / `memory_list` / `memory_check` |

The adapters above are **instruction shims** (the agent reads/writes the files for you). The **MCP
server** is different: it exposes recall/save/list/check as real, callable tools — the most universal
and "native" option. See [`mcp/README.md`](mcp/README.md).

## Common prerequisite

Each adapter finds the `agent-memory-os` checkout via `$AGENT_MEMORY_DIR` (env var or sibling path).
If missing, the agent asks you, or clones `https://github.com/viryty/agent-memory-os`.
