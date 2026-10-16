# MCP server

A zero-dependency [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the
memory store as native MCP tools. Any MCP client (Claude Code, Claude Desktop, Cursor, VS
Code/Copilot, Windsurf, Codex, ...) can recall and save memories as tool-calls — nothing to install.

## Tools

| Tool | What it does | Key args |
| --- | --- | --- |
| `memory_recall` | Return the index, or matching memories' full text | `query`, `storeDir` |
| `memory_save` | Save/update a memory and index it (an update keeps `created`) | `name` (kebab-slug; `memory`/`readme` reserved), `type`, `body` (req), `title`, `hook`, `source` (single line), `status` (`current`/`archived`), `confidence` (`high`/`medium`/`low`), `storeDir` |
| `memory_list` | List memories with type/status | `storeDir` |
| `memory_check` | Validate the store (exit 0 = pass) | `storeDir` |

The store dir (folder holding `MEMORY.md` and the entries) resolves to: a tool's `storeDir` arg, else
the `AGENT_MEMORY_STORE` env var, else `<cwd>/memory`.

## Client configuration

Replace `/ABS/PATH` with the absolute path to this repo. Point `AGENT_MEMORY_STORE` at your store.

**Generic** (Claude Desktop, Cursor, Windsurf, ...):

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/ABS/PATH/agent-memory-os/integrations/mcp/server.mjs"],
      "env": { "AGENT_MEMORY_STORE": "/ABS/PATH/to/your/memory" }
    }
  }
}
```

**Claude Code** (CLI):

```bash
claude mcp add agent-memory -e AGENT_MEMORY_STORE=/ABS/PATH/to/your/memory \
  -- node /ABS/PATH/agent-memory-os/integrations/mcp/server.mjs
```

**VS Code** (`.vscode/mcp.json`) uses a `servers` key with `"type": "stdio"`. **Codex**
(`~/.codex/config.toml`) uses `[mcp_servers.agent-memory]` with `command`/`args`/`env`.

> Client config locations/keys change over time — if a server doesn't appear, check your tool's
> current MCP docs. The command (`node .../server.mjs`) stays the same.

## Smoke test (no client needed)

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node integrations/mcp/server.mjs
```
