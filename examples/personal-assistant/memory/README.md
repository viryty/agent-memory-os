# The memory store

Each `*.md` file here (except `MEMORY.md` and this `README.md`) is one memory — a single durable
fact, with front matter. `MEMORY.md` is the index loaded each session.

- Contract, types and the recall/save workflow: see [`../AGENTS.md`](../AGENTS.md).
- Templates to start a new entry: see [`../templates/`](../templates).
- Validate the store: `node ../scripts/memory/check-memory.mjs` (run from the repo root).

The checker (`memory/.memorycheckrc.json` configures it) enforces: valid type/status, `name` matches
the file slug, well-formed dates, resolvable `[[wiki-links]]`, and that every memory is listed in
`MEMORY.md`.
