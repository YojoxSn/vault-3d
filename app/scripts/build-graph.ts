/**
 * Reads an Obsidian vault (READ-ONLY) and writes public/graph.json + public/content.json.
 *   npm run build:graph -- "/path/to/vault"
 *   VAULT_PATH=/path/to/vault npm run build:graph
 *   npm run build:graph -- --watch        # regenerate when the vault changes
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { buildGraph, isIgnoredPath } from '../src/parser/core';
import type { RawFile } from '../src/parser/types';

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync('.env')) return out;
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function walk(root: string, rel = '', out: RawFile[] = []): RawFile[] {
  for (const name of readdirSync(join(root, rel))) {
    const r = rel ? rel + '/' + name : name;
    if (isIgnoredPath(r)) continue;
    const full = join(root, r);
    const st = statSync(full);
    if (st.isDirectory()) walk(root, r, out);
    else if (/\.md$/i.test(name)) {
      out.push({ path: r, content: readFileSync(full, 'utf8'), mtime: st.mtimeMs, ctime: st.birthtimeMs || st.ctimeMs });
    }
  }
  return out;
}

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const env = loadEnv();
const vaultArg = args.find((a) => !a.startsWith('--'));
const vaultPath = resolve(vaultArg ?? process.env.VAULT_PATH ?? env.VAULT_PATH ?? 'example-vault');
const vaultName = process.env.VAULT_NAME ?? env.VAULT_NAME ?? basename(vaultPath);

if (!existsSync(vaultPath)) {
  console.error(`[graph] vault not found: ${vaultPath}\n        Set VAULT_PATH in .env or pass the path as an argument (or run \`npm run build:demo\` to create example-vault/).`);
  process.exit(1);
}

function generate() {
  const t0 = Date.now();
  const files = walk(vaultPath);
  const { graph, content } = buildGraph(files, vaultName);
  mkdirSync('public', { recursive: true });
  writeFileSync('public/graph.json', JSON.stringify(graph));
  writeFileSync('public/content.json', JSON.stringify(content));
  const ghosts = graph.nodes.filter((n) => n.ghost).length;
  console.log(
    `[graph] ${graph.nodes.length - ghosts} notes, ${ghosts} ghosts, ${graph.links.length} links in ${Date.now() - t0} ms`,
  );
}

generate();

if (watch) {
  const { watch: chokidarWatch } = await import('chokidar');
  let timer: NodeJS.Timeout | undefined;
  chokidarWatch(vaultPath, { ignoreInitial: true, ignored: (p) => isIgnoredPath(p.slice(vaultPath.length + 1)) })
    .on('all', () => {
      clearTimeout(timer);
      timer = setTimeout(generate, 400);
    });
  console.log(`[graph] watching ${vaultName} …`);
}
