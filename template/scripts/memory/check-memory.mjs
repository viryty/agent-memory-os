#!/usr/bin/env node
// agent-memory-os sentinel — validates a memory store: entry metadata, types, index consistency,
// wiki-links, stale review dates and leftover placeholders. Standard library only.
//
// Config is read from <memoryDir>/.memorycheckrc.json or ./.memorycheckrc.json (both optional);
// any missing key falls back to the defaults below.
//
// Usage:
//   node scripts/memory/check-memory.mjs              # full check; exit 1 on any error
//   node scripts/memory/check-memory.mjs --stale-only # list memories whose review_after is due

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const rawArgs = process.argv.slice(2);
const staleOnly = rawArgs.includes('--stale-only');

const DEFAULT_CONFIG = {
  memoryDir: 'memory',
  indexFile: 'MEMORY.md',
  // Non-entry files inside the memory dir that are skipped by entry validation and index checks.
  ignoreFiles: ['MEMORY.md', 'README.md'],
  types: ['user', 'feedback', 'project', 'reference'],
  statuses: ['current', 'archived'],
  // Orphan entries (a memory file not listed in the index): off | warn | error.
  requireIndex: 'error',
  // Wiki-links [[slug]] that point to a missing memory: off | warn | error.
  wikilinks: 'warn',
  // Leftover scaffold markers in entries: { mode, patterns }.
  placeholders: { mode: 'warn', patterns: ['{{', 'TODO:'] },
};

function loadConfig() {
  for (const candidate of [
    path.join(rootDir, DEFAULT_CONFIG.memoryDir, '.memorycheckrc.json'),
    path.join(rootDir, '.memorycheckrc.json'),
  ]) {
    if (fs.existsSync(candidate)) {
      try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(candidate, 'utf8')) };
      } catch (error) {
        console.error(`error: cannot parse ${path.relative(rootDir, candidate)}: ${error.message}`);
        process.exit(1);
      }
    }
  }
  return { ...DEFAULT_CONFIG };
}

const config = loadConfig();
const memoryDir = path.join(rootDir, config.memoryDir);
const indexPath = path.join(memoryDir, config.indexFile);
const VALID_TYPES = new Set(config.types);
const VALID_STATUSES = new Set(config.statuses);
const IGNORE = new Set(config.ignoreFiles);
const PLACEHOLDER = { mode: 'warn', patterns: ['{{', 'TODO:'], ...(config.placeholders || {}) };
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const errors = [];
const warnings = [];

// --- Helpers -------------------------------------------------------------------------------------

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function bucketFor(mode) {
  return mode === 'error' ? errors : mode === 'warn' ? warnings : null;
}

// Parses the small YAML-like front matter subset memories use. Only `key: value` lines, indented
// `- item` lines under a key with an empty value, indented continuations of a block scalar
// (`source: >`) and blank lines are accepted; anything else, or a repeated key, is a problem rather
// than a line to skip — skipping is how a merge's conflict markers or a duplicated key would pass.
function parseFrontMatter(content) {
  const normalized = content.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines[0] !== '---') return { metadata: null, problems: [], body: normalized };
  const endIndex = lines.findIndex((line, index) => index > 0 && line === '---');
  if (endIndex === -1) return { metadata: null, problems: [], body: normalized };

  const metadata = {};
  const problems = [];
  let currentArrayKey = null;
  let blockScalar = null;
  for (let index = 1; index < endIndex; index += 1) {
    const rawLine = lines[index];
    if (blockScalar && (rawLine === '' || /^\s/.test(rawLine))) {
      blockScalar.lines.push(rawLine);
      metadata[blockScalar.key] = blockScalarValue(blockScalar);
      continue;
    }
    if (!rawLine.trim()) continue;
    const arrayItem = rawLine.match(/^\s+-\s*(.*)$/);
    if (arrayItem && currentArrayKey) {
      metadata[currentArrayKey].push(parseScalar(arrayItem[1]));
      continue;
    }
    const kv = rawLine.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!kv) {
      problems.push(
        `front matter line ${index + 1} is not \`key: value\`, a list item, or a block continuation: ${JSON.stringify(rawLine)}`,
      );
      continue;
    }
    const [, key, value = ''] = kv;
    if (Object.hasOwn(metadata, key)) {
      problems.push(`front matter line ${index + 1} repeats key ${key}`);
    }
    const blockIndicator = value.trim().match(/^([|>])[+-]?$/);
    blockScalar = blockIndicator ? { key, style: blockIndicator[1], lines: [] } : null;
    if (value === '') {
      metadata[key] = [];
      currentArrayKey = key;
    } else {
      // A block scalar with no continuation lines is an empty string, not its indicator.
      metadata[key] = blockScalar ? '' : parseScalar(value);
      currentArrayKey = null;
    }
  }
  return { metadata, problems, body: lines.slice(endIndex + 1).join('\n') };
}

function parseScalar(value) {
  const t = value.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

// A block scalar's text: folded `>` joins lines with spaces (a blank line becomes a line break);
// literal `|` keeps line breaks. Chomping indicators are simplified to trimming the result.
function blockScalarValue({ style, lines }) {
  if (style === '>') {
    return lines
      .map((line) => line.trim())
      .join('\n')
      .replace(/\n(\n*)/g, (_, breaks) => breaks || ' ')
      .trim();
  }
  const indent = Math.min(...lines.filter((line) => line.trim()).map((line) => line.search(/\S/)));
  return lines
    .map((line) => line.slice(indent))
    .join('\n')
    .trim();
}

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Lists every markdown file in the memory dir — entries, the index and the README alike.
function listMarkdownFiles() {
  if (!fs.existsSync(memoryDir)) return [];
  return fs
    .readdirSync(memoryDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort();
}

function listEntryFiles() {
  if (!fs.existsSync(memoryDir)) return [];
  return fs
    .readdirSync(memoryDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md') && !IGNORE.has(e.name))
    .map((e) => e.name)
    .sort();
}

// --- Validators ----------------------------------------------------------------------------------

function validateEntry(fileName, { metadata, problems }, content) {
  const rel = `${config.memoryDir}/${fileName}`;
  if (!metadata) {
    errors.push(`${rel}: missing front matter`);
    return;
  }
  for (const problem of problems) errors.push(`${rel}: ${problem}`);

  const expectedName = fileName.replace(/\.md$/, '');
  if (!metadata.name) {
    errors.push(`${rel}: missing 'name'`);
  } else if (metadata.name !== expectedName) {
    errors.push(`${rel}: name '${metadata.name}' must match file slug '${expectedName}'`);
  }

  if (!VALID_TYPES.has(metadata.type)) {
    errors.push(`${rel}: invalid or missing type (expected one of: ${[...VALID_TYPES].join(', ')})`);
  }
  if (!VALID_STATUSES.has(metadata.status)) {
    errors.push(`${rel}: invalid or missing status (expected one of: ${[...VALID_STATUSES].join(', ')})`);
  }

  for (const field of ['created', 'last_reviewed', 'review_after']) {
    if (metadata[field] && !isValidDate(metadata[field])) {
      errors.push(`${rel}: ${field} must use YYYY-MM-DD`);
    }
  }
  if (!metadata.created) {
    errors.push(`${rel}: missing 'created' date`);
  }

  if (metadata.status === 'current' && metadata.review_after && metadata.review_after <= todayString()) {
    warnings.push(`${rel}: review_after ${metadata.review_after} is due — re-verify this memory`);
  }

  validatePlaceholders(rel, content);
  validateWikiLinks(rel, content);
  validateLocalLinks(rel, fileName, content);
}

// An unresolved git conflict: a line opening (`<<<<<<<`) or closing (`>>>>>>>`) one anywhere, and a
// separator (`=======`, or a diff3 base `|||||||`) inside one. A bare `=======` outside a conflict is
// a markdown setext heading underline and is left alone.
function validateConflictMarkers(rel, content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let inConflict = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const opens = /^<<<<<<<(?: |$)/.test(line);
    const closes = /^>>>>>>>(?: |$)/.test(line);
    const separates = inConflict && (line === '=======' || /^\|{7}(?: |$)/.test(line));
    if (opens || closes || separates) {
      errors.push(`${rel}:${i + 1}: unresolved git conflict marker ${JSON.stringify(line)}`);
    }
    if (opens) inConflict = true;
    if (closes) inConflict = false;
  }
}

function validatePlaceholders(rel, content) {
  const bucket = bucketFor(PLACEHOLDER.mode);
  if (!bucket) return;
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let start = 0;
  if (lines[0] === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l === '---');
    if (end !== -1) start = end + 1;
  }
  let inFence = false;
  for (let i = start; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith('```')) { inFence = !inFence; continue; }
    if (inFence) continue;
    for (const pattern of PLACEHOLDER.patterns) {
      if (lines[i].includes(pattern)) {
        bucket.push(`${rel}:${i + 1}: unfilled placeholder ${JSON.stringify(pattern)}`);
        break;
      }
    }
  }
}

function validateWikiLinks(rel, content) {
  const bucket = bucketFor(config.wikilinks);
  if (!bucket) return;
  const seen = new Set();
  let match;
  const re = /\[\[([^\]]+)\]\]/g;
  while ((match = re.exec(content)) !== null) {
    const slug = match[1].split('|')[0].split('#')[0].trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    if (!fs.existsSync(path.join(memoryDir, `${slug}.md`))) {
      bucket.push(`${rel}: wiki-link [[${slug}]] points to a missing memory (${config.memoryDir}/${slug}.md)`);
    }
  }
}

function validateLocalLinks(rel, fileName, content) {
  const re = /!?\[[^\]]*]\(([^)]+)\)/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    let target = match[1].trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#') || target.startsWith('//')) continue;
    target = target.split('#')[0];
    if (!target) continue;
    const abs = path.resolve(memoryDir, path.dirname(fileName), target);
    if (!fs.existsSync(abs)) {
      errors.push(`${rel}: broken local link ${match[1]}`);
    }
  }
}

function validateIndex(entryFiles) {
  if (!fs.existsSync(indexPath)) {
    errors.push(`${config.memoryDir}/${config.indexFile}: index file is missing`);
    return;
  }
  const indexContent = fs.readFileSync(indexPath, 'utf8');

  // Broken links inside the index itself.
  validateLocalLinks(`${config.memoryDir}/${config.indexFile}`, config.indexFile, indexContent);

  const bucket = bucketFor(config.requireIndex);
  if (!bucket) return;

  const referenced = new Set();
  let match;
  const re = /]\(([^)]+\.md)(?:#[^)]*)?\)/g;
  while ((match = re.exec(indexContent)) !== null) {
    referenced.add(path.basename(match[1]));
  }
  for (const fileName of entryFiles) {
    if (!referenced.has(fileName)) {
      bucket.push(`${config.memoryDir}/${fileName}: not listed in ${config.indexFile} (add a one-line pointer)`);
    }
  }
}

function finish() {
  if (staleOnly) {
    for (const w of warnings) if (w.includes('review_after')) console.log(w);
    process.exit(0);
  }
  for (const w of warnings) console.warn(`warning: ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`error: ${e}`);
    process.exit(1);
  }
  const count = listEntryFiles().length;
  console.log(`check-memory passed (${count} memories, ${warnings.length} warnings)`);
}

// --- Run -----------------------------------------------------------------------------------------

const entryFiles = listEntryFiles();

for (const fileName of entryFiles) {
  const content = fs.readFileSync(path.join(memoryDir, fileName), 'utf8');
  const parsed = parseFrontMatter(content);
  const { metadata } = parsed;
  if (staleOnly) {
    if (metadata?.status === 'current' && metadata.review_after && metadata.review_after <= todayString()) {
      warnings.push(`${config.memoryDir}/${fileName}: review_after ${metadata.review_after} is due`);
    }
    continue;
  }
  validateEntry(fileName, parsed, content);
}

if (!staleOnly) {
  validateIndex(entryFiles);
  for (const fileName of listMarkdownFiles()) {
    validateConflictMarkers(
      `${config.memoryDir}/${fileName}`,
      fs.readFileSync(path.join(memoryDir, fileName), 'utf8'),
    );
  }
}

finish();
