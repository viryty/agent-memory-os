#!/usr/bin/env node
// agent-memory-init — scaffolds the agent-memory-os store into a target repository or agent home.
//
// Tool-agnostic: plain Node.js (standard library only). Run it by hand or let any coding agent call
// it. After it lays down the skeleton, the agent maintains memories per AGENTS.md.
//
// Usage:
//   node bin/agent-memory-init.mjs [targetDir] [options]
//
// Options:
//   --owner "Maksim"         Who the memory is about / for (default: "the user")
//   --review-months 6        Months until review_after on seeded files (default: 6)
//   --force                  Overwrite existing files (default: skip existing)
//   --dry-run                Print what would happen without writing
//   -h, --help               Show this help

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.join(scriptDir, '..', 'template');

const argv = process.argv.slice(2);
const positionals = [];
const flags = {};
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    if (key === 'force' || key === 'dry-run' || key === 'help') flags[key] = true;
    else { flags[key] = argv[i + 1]; i += 1; }
  } else {
    positionals.push(arg);
  }
}

if (flags.help || argv.includes('-h')) {
  console.log(`agent-memory-init — scaffold the agent-memory-os store into a repo or agent home.

Usage:
  node bin/agent-memory-init.mjs [targetDir] [options]

Options:
  --owner "Maksim"         Who the memory is about / for (default: "the user")
  --review-months 6        Months until review_after on seeded files (default: 6)
  --force                  Overwrite existing files (default: skip existing)
  --dry-run                Print what would happen without writing
  -h, --help               Show this help

After scaffolding, follow AGENTS.md (recall before acting, save durable facts),
then run: node scripts/memory/check-memory.mjs`);
  process.exit(0);
}

const targetDir = path.resolve(positionals[0] || '.');
const force = Boolean(flags.force);
const dryRun = Boolean(flags['dry-run']);
const owner = flags.owner || 'the user';
const reviewMonths = Number.parseInt(flags['review-months'] || '6', 10);

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const reviewAfter = new Date(now);
reviewAfter.setMonth(reviewAfter.getMonth() + (Number.isFinite(reviewMonths) ? reviewMonths : 6));

const tokens = {
  '{{OWNER}}': owner,
  '{{DATE}}': isoDate(now),
  '{{REVIEW_AFTER}}': isoDate(reviewAfter),
  '{{YEAR}}': String(now.getFullYear()),
};
const applyTokens = (text) => {
  let out = text;
  for (const [token, value] of Object.entries(tokens)) out = out.split(token).join(value);
  return out;
};

function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else if (entry.isFile()) result.push(full);
  }
  return result;
}

if (!fs.existsSync(templateDir)) {
  console.error(`error: template directory not found at ${templateDir}`);
  process.exit(1);
}

const created = [];
const skipped = [];
for (const sourceFile of walk(templateDir)) {
  const relative = path.relative(templateDir, sourceFile);
  const destFile = path.join(targetDir, relative);
  if (fs.existsSync(destFile) && !force) { skipped.push(relative); continue; }
  let content = fs.readFileSync(sourceFile, 'utf8');
  if (!relative.endsWith('.json')) content = applyTokens(content);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    fs.writeFileSync(destFile, content);
  }
  created.push(relative);
}

const prefix = dryRun ? '[dry-run] ' : '';
console.log(`${prefix}agent-memory-init → ${targetDir}`);
console.log(`${prefix}owner: ${owner}`);
console.log(`${prefix}review window: ${reviewMonths} months (review_after ${tokens['{{REVIEW_AFTER}}']})`);
console.log(`${prefix}created ${created.length} file(s)${force ? ' (force)' : ''}, skipped ${skipped.length} existing`);
if (skipped.length && !force) console.log(`${prefix}skipped (already exist): ${skipped.join(', ')}`);
console.log('');
console.log('Next steps:');
console.log('  1. Read AGENTS.md — how to recall, save and update memories.');
console.log('  2. Add memories under memory/ and index them in memory/MEMORY.md.');
console.log('  3. Run: node scripts/memory/check-memory.mjs');
