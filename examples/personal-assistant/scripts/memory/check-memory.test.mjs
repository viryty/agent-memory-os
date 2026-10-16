// The memory checker's rules, run as the CLI it is against small throwaway stores.
//
//   node --test scripts/memory/check-memory.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-memory.mjs');
const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A memory entry; `extra` front matter lines are appended verbatim. */
function entry(name, { extra = [], body = 'A fact.' } = {}) {
  return [
    '---',
    `name: ${name}`,
    'type: user',
    'status: current',
    'created: 2026-01-01',
    'review_after: 2999-01-01',
    ...extra,
    '---',
    '',
    body,
    '',
  ].join('\n');
}

/** A store holding `entries` (slug → content), each listed in the index unless `index` is given. */
function store(entries = {}, { index } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-memory-test-'));
  roots.push(root);
  const files = {
    'memory/MEMORY.md':
      index ??
      ['# Memory index', '', ...Object.keys(entries).map((slug) => `- [${slug}](${slug}.md) — hook`), ''].join('\n'),
    ...Object.fromEntries(Object.entries(entries).map(([slug, content]) => [`memory/${slug}.md`, content])),
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function check(root, args = []) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('entries', () => {
  test('a clean store passes', () => {
    const { status, output } = check(store({ 'a-fact': entry('a-fact') }));
    assert.equal(status, 0, output);
    assert.match(output, /check-memory passed \(1 memories, 0 warnings\)/);
  });

  test('name, type, status and dates are validated', () => {
    const bad = entry('other', { extra: [] }).replace('type: user', 'type: nope').replace('status: current', 'status: done');
    const { status, output } = check(store({ 'a-fact': bad.replace('created: 2026-01-01', 'created: 2026-02-30') }));
    assert.equal(status, 1);
    for (const message of [/name 'other' must match file slug 'a-fact'/, /invalid or missing type/, /invalid or missing status/, /created must use YYYY-MM-DD/]) {
      assert.match(output, message);
    }
  });

  test('an entry missing from the index fails', () => {
    const { status, output } = check(store({ 'a-fact': entry('a-fact') }, { index: '# Memory index\n' }));
    assert.equal(status, 1);
    assert.match(output, /memory\/a-fact\.md: not listed in MEMORY\.md/);
  });

  test('a due review_after is a warning', () => {
    const due = entry('a-fact').replace('review_after: 2999-01-01', 'review_after: 2000-01-01');
    const { status, output } = check(store({ 'a-fact': due }));
    assert.equal(status, 0, output);
    assert.match(output, /review_after 2000-01-01 is due/);
  });
});

describe('front matter is strict', () => {
  test('a line that is not `key: value` fails instead of being skipped', () => {
    const { status, output } = check(store({ 'a-fact': entry('a-fact', { extra: ['just text'] }) }));
    assert.equal(status, 1);
    assert.match(output, /front matter line 7 is not `key: value`/);
  });

  test('a repeated key fails instead of the last one winning', () => {
    const { status, output } = check(store({ 'a-fact': entry('a-fact', { extra: ['status: archived'] }) }));
    assert.equal(status, 1);
    assert.match(output, /front matter line 7 repeats key status/);
  });

  test('a block scalar collects its continuation lines', () => {
    const folded = entry('a-fact', { extra: ['source: >', '  a conversation', '  on 2026-01-01'] });
    const { status, output } = check(store({ 'a-fact': folded }));
    assert.equal(status, 0, output);
  });
});

describe('conflict markers', () => {
  const conflicted = ['<<<<<<< HEAD', '- one side', '=======', '- other side', '>>>>>>> branch', ''].join('\n');

  test('fail in an entry body and in the index', () => {
    const root = store(
      { 'a-fact': entry('a-fact', { body: conflicted }) },
      { index: `# Memory index\n\n- [a-fact](a-fact.md) — hook\n${conflicted}` },
    );
    const { status, output } = check(root);
    assert.equal(status, 1);
    assert.match(output, /memory\/a-fact\.md:\d+: unresolved git conflict marker "<<<<<<< HEAD"/);
    assert.match(output, /memory\/a-fact\.md:\d+: unresolved git conflict marker "======="/);
    assert.match(output, /memory\/MEMORY\.md:\d+: unresolved git conflict marker ">>>>>>> branch"/);
  });

  test('a setext heading underline outside a conflict is not one', () => {
    const { status, output } = check(store({ 'a-fact': entry('a-fact', { body: 'Title\n=======\n\nText.' }) }));
    assert.equal(status, 0, output);
  });
});
