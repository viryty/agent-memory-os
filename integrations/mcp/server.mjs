#!/usr/bin/env node
// agent-memory-os MCP server — exposes the memory store as MCP tools (recall, save, list, check) so
// any MCP-capable agent (Claude, Cursor, VS Code, Windsurf, Codex, ...) can use cross-session memory
// natively. Zero dependencies: implements the stable core of the MCP stdio transport by hand.
//
// Store location resolves to: tool arg `storeDir` | env AGENT_MEMORY_STORE | <cwd>/memory.
// The store dir is the folder holding MEMORY.md and the <slug>.md entries.
//
// Protocol channel is stdout; diagnostics go to stderr.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bundledCheck = path.join(repoRoot, 'template', 'scripts', 'memory', 'check-memory.mjs');

const SERVER_INFO = { name: 'agent-memory-os', version: '0.1.0' };
const DEFAULT_PROTOCOL = '2025-06-18';

// --- Store helpers -------------------------------------------------------------------------------

function resolveStore(args) {
  const raw = (args && args.storeDir) || process.env.AGENT_MEMORY_STORE || path.join(process.cwd(), 'memory');
  return path.resolve(raw);
}

function pad(n) { return String(n).padStart(2, '0'); }
function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function frontMatter(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return {};
  const end = lines.findIndex((l, i) => i > 0 && l === '---');
  if (end === -1) return {};
  const meta = {};
  for (const line of lines.slice(1, end)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return meta;
}

function listEntries(storeDir) {
  if (!fs.existsSync(storeDir)) return [];
  return fs
    .readdirSync(storeDir)
    .filter((f) => f.endsWith('.md') && f !== 'MEMORY.md' && f !== 'README.md')
    .sort()
    .map((f) => {
      const content = fs.readFileSync(path.join(storeDir, f), 'utf8');
      return { file: f, slug: f.replace(/\.md$/, ''), meta: frontMatter(content), content };
    });
}

// --- Tool implementations ------------------------------------------------------------------------

function toolList(args) {
  const storeDir = resolveStore(args);
  const entries = listEntries(storeDir);
  if (!entries.length) return text(`(store at ${storeDir} has no memories yet)`);
  const lines = entries.map((e) => `- ${e.slug} [${e.meta.type || '?'}/${e.meta.status || '?'}]`);
  return text(`${entries.length} memories in ${storeDir}:\n${lines.join('\n')}`);
}

function toolRecall(args = {}) {
  const storeDir = resolveStore(args);
  const entries = listEntries(storeDir);
  const indexPath = path.join(storeDir, 'MEMORY.md');
  const index = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '(no MEMORY.md)';
  const query = (args.query || '').toLowerCase().trim();

  if (!query) {
    return text(`Memory index (${entries.length} entries):\n\n${index}`);
  }
  const hits = entries.filter(
    (e) => e.slug.toLowerCase().includes(query) || e.content.toLowerCase().includes(query),
  );
  if (!hits.length) return text(`No memories match "${query}". Index:\n\n${index}`);
  const body = hits.map((e) => `===== ${e.file} =====\n${e.content}`).join('\n\n');
  return text(`${hits.length} memory match(es) for "${query}":\n\n${body}`);
}

function toolSave(args = {}) {
  const storeDir = resolveStore(args);
  const { name, type, title, hook, body } = args;
  if (!name || !type || !body) return text('error: name, type and body are required', true);
  if (typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    return text('error: name must be a kebab-slug: lowercase letters, digits and single hyphens', true);
  }
  // On a case-insensitive file system (macOS, Windows) memory.md *is* MEMORY.md: saving it would
  // overwrite the index.
  if (['memory', 'readme'].includes(name)) {
    return text(`error: name "${name}" is reserved — ${name}.md would overwrite the store's own file`, true);
  }
  const allowed = ['user', 'feedback', 'project', 'reference'];
  if (!allowed.includes(type)) return text(`error: type must be one of ${allowed.join(', ')}`, true);
  const status = args.status || 'current';
  if (!['current', 'archived'].includes(status)) {
    return text('error: status must be one of current, archived', true);
  }
  if (args.confidence && !['high', 'medium', 'low'].includes(args.confidence)) {
    return text('error: confidence must be one of high, medium, low', true);
  }
  // Each of these lands on one line of the front matter or the index; a line break would forge a key.
  for (const field of ['title', 'hook', 'source']) {
    if (args[field] != null && /[\r\n]/.test(String(args[field]))) {
      return text(`error: ${field} must be a single line`, true);
    }
  }

  fs.mkdirSync(storeDir, { recursive: true });
  const filePath = path.join(storeDir, `${name}.md`);
  const existed = fs.existsSync(filePath);
  const now = new Date();
  const review = new Date(now);
  review.setMonth(review.getMonth() + 6);
  // An update keeps the date the memory was first created.
  const previousCreated = existed ? frontMatter(fs.readFileSync(filePath, 'utf8')).created : '';
  const created = /^\d{4}-\d{2}-\d{2}$/.test(previousCreated || '') ? previousCreated : isoDate(now);
  const fmLines = [
    '---',
    `name: ${name}`,
    `type: ${type}`,
    `status: ${status}`,
    `created: ${created}`,
    `last_reviewed: ${isoDate(now)}`,
    `review_after: ${isoDate(review)}`,
  ];
  if (args.confidence) fmLines.push(`confidence: ${args.confidence}`);
  if (args.source) fmLines.push(`source: "${args.source}"`);
  fmLines.push('---', '', body.trim(), '');
  fs.writeFileSync(filePath, fmLines.join('\n'));

  // Update the index unless already referenced.
  const indexPath = path.join(storeDir, 'MEMORY.md');
  let index = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '# Memory index\n';
  if (!index.includes(`(${name}.md)`)) {
    const line = `- [${title || name}](${name}.md) — ${hook || 'memory'}`;
    index = `${index.replace(/\s*$/, '')}\n${line}\n`;
    fs.writeFileSync(indexPath, index);
  }
  return text(`${existed ? 'updated' : 'saved'} ${name}.md and indexed it in ${storeDir}/MEMORY.md`);
}

function toolCheck(args = {}) {
  const storeDir = resolveStore(args);
  const root = path.dirname(storeDir);
  const own = path.join(root, 'scripts', 'memory', 'check-memory.mjs');
  const script = fs.existsSync(own) ? own : bundledCheck;
  const r = spawnSync('node', [script], { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim() || (r.error ? String(r.error) : '(no output)');
  return text(`check-memory exited with code ${r.status} (0 = pass)\n\n${out}`);
}

function callTool(name, args) {
  switch (name) {
    case 'memory_list': return toolList(args);
    case 'memory_recall': return toolRecall(args);
    case 'memory_save': return toolSave(args);
    case 'memory_check': return toolCheck(args);
    default: return null;
  }
}

const TOOLS = [
  {
    name: 'memory_recall',
    description: 'Recall agent memory: returns the index, or (with query) the full text of matching memories. Call before acting.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional substring to match against slugs and memory bodies.' },
        storeDir: { type: 'string', description: 'Memory store dir (default: env AGENT_MEMORY_STORE or ./memory).' },
      },
    },
  },
  {
    name: 'memory_save',
    description: 'Save (or update) a durable memory and index it. One fact per entry.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Kebab-slug id (lowercase, digits, hyphens); becomes <name>.md. "memory" and "readme" are reserved.' },
        type: { type: 'string', enum: ['user', 'feedback', 'project', 'reference'] },
        title: { type: 'string', description: 'Short title for the index line.' },
        hook: { type: 'string', description: 'One-line hook for the index.' },
        body: { type: 'string', description: 'The fact, stated plainly (markdown).' },
        status: { type: 'string', enum: ['current', 'archived'] },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        source: { type: 'string' },
        storeDir: { type: 'string' },
      },
      required: ['name', 'type', 'body'],
    },
  },
  {
    name: 'memory_list',
    description: 'List all memories in the store with their type and status.',
    inputSchema: { type: 'object', properties: { storeDir: { type: 'string' } } },
  },
  {
    name: 'memory_check',
    description: 'Validate the memory store (types, index consistency, links, stale dates). Exit 0 = pass.',
    inputSchema: { type: 'object', properties: { storeDir: { type: 'string' } } },
  },
];

// --- JSON-RPC plumbing ---------------------------------------------------------------------------

function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }
function reply(id, result) { send({ jsonrpc: '2.0', id, result }); }
function replyError(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }
function text(t, isError = false) { return { content: [{ type: 'text', text: t }], isError }; }

function handle(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;
  switch (method) {
    case 'initialize':
      reply(id, {
        protocolVersion: (params && params.protocolVersion) || DEFAULT_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
      return;
    case 'tools/list':
      reply(id, { tools: TOOLS });
      return;
    case 'tools/call': {
      const result = callTool(params && params.name, (params && params.arguments) || {});
      if (result === null) replyError(id, -32602, `Unknown tool: ${params && params.name}`);
      else reply(id, result);
      return;
    }
    case 'ping':
      reply(id, {});
      return;
    default:
      if (isRequest) replyError(id, -32601, `Method not found: ${method}`);
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { console.error(`agent-memory-mcp: bad JSON: ${line.slice(0, 200)}`); continue; }
    try { handle(msg); } catch (e) {
      console.error(`agent-memory-mcp: handler error: ${e && e.stack ? e.stack : e}`);
      if (msg && msg.id != null) replyError(msg.id, -32603, `Internal error: ${e && e.message ? e.message : String(e)}`);
    }
  }
});
process.stdin.on('end', () => process.exit(0));

console.error(`agent-memory-os MCP server ready (stdio); root=${repoRoot}`);
