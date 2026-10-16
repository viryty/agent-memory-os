// memory_save through the MCP server's stdio protocol, against throwaway stores.
//
//   node --test integrations/mcp/server.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SERVER = join(dirname(fileURLToPath(import.meta.url)), 'server.mjs');
const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A store directory holding an index. */
function storeDir() {
  const dir = mkdtempSync(join(tmpdir(), 'memory-mcp-test-'));
  roots.push(dir);
  writeFileSync(join(dir, 'MEMORY.md'), '# Memory index\n');
  return dir;
}

/** Calls memory_save; returns the tool result's text and error flag. */
function save(dir, args) {
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'memory_save', arguments: { storeDir: dir, ...args } },
  };
  const result = spawnSync(process.execPath, [SERVER], {
    input: `${JSON.stringify(request)}\n`,
    encoding: 'utf8',
  });
  const reply = JSON.parse(result.stdout.trim().split('\n')[0]);
  return { text: reply.result.content[0].text, isError: reply.result.isError };
}

const fact = { type: 'user', body: 'A fact.' };

describe('memory_save', () => {
  test('saves an entry and indexes it', () => {
    const dir = storeDir();
    const { isError } = save(dir, { name: 'a-fact', ...fact });
    assert.equal(isError, false);
    assert.match(readFileSync(join(dir, 'a-fact.md'), 'utf8'), /^name: a-fact$/m);
    assert.match(readFileSync(join(dir, 'MEMORY.md'), 'utf8'), /\(a-fact\.md\)/);
  });

  test('refuses the names of the store\'s own files, which would overwrite them', () => {
    for (const name of ['memory', 'readme', 'MEMORY']) {
      const dir = storeDir();
      const { isError } = save(dir, { name, ...fact });
      assert.equal(isError, true, name);
      assert.equal(readFileSync(join(dir, 'MEMORY.md'), 'utf8'), '# Memory index\n', name);
      assert.deepEqual(readdirSync(dir), ['MEMORY.md'], name);
    }
  });

  test('refuses a name that is not a kebab-slug', () => {
    for (const name of ['A-Fact', 'a fact', 'a/fact', '..', 'a--fact', '-a']) {
      assert.equal(save(storeDir(), { name, ...fact }).isError, true, name);
    }
  });

  test('refuses a status or confidence the checker would reject', () => {
    assert.equal(save(storeDir(), { name: 'a-fact', ...fact, status: 'done' }).isError, true);
    assert.equal(save(storeDir(), { name: 'a-fact', ...fact, confidence: 'sure' }).isError, true);
  });

  test('refuses a line break that would forge a front matter key or an index line', () => {
    for (const field of ['title', 'hook', 'source']) {
      const dir = storeDir();
      const { isError } = save(dir, { name: 'a-fact', ...fact, [field]: 'one\nstatus: archived' });
      assert.equal(isError, true, field);
      assert.deepEqual(readdirSync(dir), ['MEMORY.md'], field);
    }
  });

  test('an update keeps the created date', () => {
    const dir = storeDir();
    save(dir, { name: 'a-fact', ...fact });
    const path = join(dir, 'a-fact.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/^created: .*$/m, 'created: 2026-01-01'));
    const { text } = save(dir, { name: 'a-fact', ...fact, body: 'A newer fact.' });
    assert.match(text, /^updated/);
    const content = readFileSync(path, 'utf8');
    assert.match(content, /^created: 2026-01-01$/m);
    assert.match(content, /A newer fact\./);
  });
});
