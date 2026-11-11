// Usage: node scripts/set-owner.mjs <github-user> [repo-name]
// Replaces the YOUR-USER / vault-3d placeholders in the docs once you know your GitHub account.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [user, repo = 'vault-3d'] = process.argv.slice(2);
if (!user) { console.error('Usage: node scripts/set-owner.mjs <github-user> [repo-name]'); process.exit(1); }
for (const f of ['README.md', 'README.fr.md', 'docs/launch-kit.md', 'CONTRIBUTING.md']) {
  if (!existsSync(f)) continue;
  writeFileSync(f, readFileSync(f, 'utf8').replaceAll('YOUR-USER', user).replaceAll('YOUR-REPO', repo));
  console.log('updated', f);
}
