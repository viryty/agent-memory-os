# agent-memory-os

A reusable, **tool-agnostic** memory layer for AI coding agents. Give any agent (Claude Code, Cursor,
Codex, Copilot, ...) a persistent, file-based memory it can recall before acting and write to when it
learns something durable — plain markdown, no database, no editor lock-in.

It is the memory counterpart to a docs-governance scaffold: same idea (a metadata contract + one
standard-library Node sentinel), but the domain is **agent memory**, not source code. No dev logic.

## What you get

```
template/                       # the payload laid into a repo or agent home
  AGENTS.md                     # entry contract: recall before acting, save durable facts
  memory/
    MEMORY.md                   # the index loaded each session (one line per memory)
    .memorycheckrc.json         # checker config (types, index strictness, placeholders)
  templates/                    # entry templates: user / feedback / project / reference
  scripts/memory/check-memory.mjs   # the sentinel
bin/agent-memory-init.mjs       # scaffolder (plain Node, stdlib only; --help)
prompts/                        # canonical procedures: bootstrap / recall / save
integrations/                   # per-tool adapters + an MCP server
examples/personal-assistant/    # worked example: a populated, green memory base
```

## The memory model

- **One fact per file**: `memory/<slug>.md`, with front matter
  (`name / type / status / created / review_after / ...`).
- **An index**: `memory/MEMORY.md`, one pointer line per memory, loaded each session.
- **Four types**: `user` (who they are), `feedback` (how to work), `project` (ongoing work),
  `reference` (external pointers).
- **Links**: relate memories with `[[slug]]`.

The sentinel `check-memory.mjs` enforces: valid type/status, `name` matches the file slug, well-formed
dates, **stale `review_after`** (so memories get re-verified), resolvable `[[wiki-links]]`, and that
**every memory is listed in the index**. It is pure memory-governance — no code-to-docs coupling.

## Usage

### Option A — scaffold into a repo or agent home

```bash
node /path/to/agent-memory-os/bin/agent-memory-init.mjs ~/my-agent-memory --owner "Maksim"
node scripts/memory/check-memory.mjs   # passes with zero memories
```

Idempotent: skips existing files (`--force` to overwrite, `--dry-run` to preview, `--help` for flags).

### Option B — degit / clone as a starting point

```bash
npx degit viryty/agent-memory-os/template my-agent-memory
```

### Option C — invoke from your agent (universal)

Per-tool adapters + a native **MCP server** (`memory_recall`, `memory_save`, `memory_list`,
`memory_check`) let any agent use memory natively. See
[`integrations/README.md`](integrations/README.md) and [`integrations/mcp/README.md`](integrations/mcp/README.md).

## Worked example

[`examples/personal-assistant/`](examples/personal-assistant/) is a populated store (4 memories across
all four types, fully indexed and linked). The checker is green:

```text
$ cd examples/personal-assistant && node scripts/memory/check-memory.mjs
check-memory passed (4 memories, 0 warnings)
```

## Configuration

`memory/.memorycheckrc.json`:

| Key | Meaning |
| --- | --- |
| `memoryDir` / `indexFile` | Where the store and index live |
| `types` / `statuses` | Allowed `type` and `status` values |
| `requireIndex` | Orphan entries not in the index: `off` / `warn` / `error` |
| `wikilinks` | Missing `[[links]]`: `off` / `warn` / `error` |
| `placeholders` | Leftover-marker gate `{ mode, patterns }` |

## License

MIT (see LICENSE).
