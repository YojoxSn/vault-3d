// Runs before `npm run dev`: copies the MediaPipe runtime and, if a vault is configured, regenerates the graph.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

spawnSync('node', ['scripts/copy-wasm.mjs'], { stdio: 'inherit' });

let vault = process.env.VAULT_PATH;
if (!vault && existsSync('.env')) {
  const m = /^\s*VAULT_PATH\s*=\s*(.+?)\s*$/m.exec(readFileSync('.env', 'utf8'));
  if (m) vault = m[1].replace(/^["']|["']$/g, '');
}
if (vault && !vault.startsWith('/path/to')) {
  const r = spawnSync('npx', ['tsx', 'scripts/build-graph.ts'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) console.warn('[predev] graph generation failed, the demo will be used instead');
} else {
  console.log('[predev] no VAULT_PATH set: the app opens on the landing page (demo / drop a folder). See .env.example');
}
