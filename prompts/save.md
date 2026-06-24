# Procedure: save a memory

Run this when you learn something durable that will matter in a future session.

1. **Decide if it's worth saving.** Save only what survives this conversation and isn't obvious from
   the artifacts. Skip one-off task details and anything derivable from the repo/files.
2. **Check for an existing entry.** Scan `memory/MEMORY.md`. If something already covers it, **edit
   that file** instead of creating a duplicate.
3. **Pick the type.** `user` (who they are), `feedback` (how to work — add Why / How to apply),
   `project` (ongoing work/constraints, absolute dates), `reference` (external pointer).
4. **Write `memory/<slug>.md`.** Use a template from `templates/`. The `name` field must equal the
   file slug. Convert relative dates to absolute. Link related memories with `[[slug]]`. Never store
   secrets.
5. **Update the index.** Add one line to `memory/MEMORY.md`: `- [Title](slug.md) — short hook`.
6. **Prune if needed.** If this supersedes a wrong memory, delete or `status: archived` the old one.
7. **Verify.** Run `node scripts/memory/check-memory.mjs` and fix any errors.
