/** Generates the fictional demo vault (public/demo/graph.json + content.json). Deterministic. */
import { mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildGraph } from '../src/parser/core';
import type { RawFile } from '../src/parser/types';
import { BOOKS, GHOSTS, IDEAS, JOURNAL_LINES, ML, NEURO, PEOPLE, PROJECTS, TOPICS_FOR_JOURNAL, type Concept } from './demo-data';

// tiny seeded RNG (mulberry32) so the output is stable between runs
let seed = 20260101;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const DAY = 86400000;
const T0 = Date.UTC(2024, 0, 8);
const T1 = Date.UTC(2026, 9, 28);

const files: RawFile[] = [];
const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-');

function addSet(folder: string, set: Concept[], mocTitle: string) {
  for (const [title, blurb, related, tags = []] of set) {
    const mtime = T0 + rnd() * (T1 - T0);
    const body = [
      `---`,
      `tags: [${tags.join(', ')}]`,
      `---`,
      `# ${title}`,
      ``,
      blurb,
      ``,
      `## Connections`,
      ...related.map((r) => `- [[${r}]]`),
      ``,
      `Part of [[${mocTitle}]]. ${tags[0] ? `#${tags[0]}` : ''}`,
    ].join('\n');
    files.push({ path: `${folder}/${safe(title)}.md`, content: body, mtime, ctime: mtime - rnd() * 200 * DAY });
  }
}

addSet('Neuroscience', NEURO, 'MOC Neuroscience');
addSet('Machine Learning', ML, 'MOC Machine Learning');
addSet('Ideas', IDEAS, 'MOC Ideas');
addSet('People', PEOPLE, 'MOC People');
addSet('Reading', BOOKS, 'MOC Reading');
addSet('Projects', PROJECTS, 'MOC Projects');

const moc = (title: string, set: Concept[], extra = '') =>
  files.push({
    path: `MOC/${title}.md`,
    content: `---\ntags: [moc]\n---\n# ${title}\n\nMap of content.\n\n${set.map(([t]) => `- [[${t}]]`).join('\n')}\n${extra}\n\nBack to [[Home]].`,
    mtime: T1 - rnd() * 20 * DAY,
  });
moc('MOC Neuroscience', NEURO);
moc('MOC Machine Learning', ML, '\nSee also [[Predictive Coding]] and [[Spiking Neural Networks]] (not written yet).');
moc('MOC Ideas', IDEAS);
moc('MOC People', PEOPLE);
moc('MOC Reading', BOOKS, '\nNext: [[Reading List 2027]].');
moc('MOC Projects', PROJECTS);

files.push({
  path: 'Home.md',
  content: `---\ntags: [moc]\n---\n# Home\n\nWelcome to the demo vault: a fictional second brain.\n\n- [[MOC Neuroscience]]\n- [[MOC Machine Learning]]\n- [[MOC Ideas]]\n- [[MOC People]]\n- [[MOC Reading]]\n- [[MOC Projects]]\n\nCurrently exploring [[Free Energy Principle]] and [[Active Inference]].\nBuilt with [[Vault 3D]].`,
  mtime: T1,
});

// A few notes that mention the ghosts so they appear as wireframes
files.push({
  path: 'Ideas/Open Questions.md',
  content: `---\ntags: [questions]\n---\n# Open Questions\n\n${GHOSTS.map((g) => `- Should I write about [[${g}]]?`).join('\n')}\n- How does [[Hippocampus]] relate to [[Transformers]]?\n\n[[Home]]`,
  mtime: T1 - 3 * DAY,
});

// Journal: dense, chronological, links to everything
for (let i = 0; i < 70; i++) {
  const d = new Date(T0 + ((T1 - T0) * i) / 70 + rnd() * 3 * DAY);
  const iso = d.toISOString().slice(0, 10);
  const a = pick(TOPICS_FOR_JOURNAL);
  let b = pick(TOPICS_FOR_JOURNAL);
  if (b === a) b = pick(TOPICS_FOR_JOURNAL);
  const line = pick(JOURNAL_LINES).replace('{a}', a).replace('{b}', b);
  files.push({
    path: `Journal/${iso}.md`,
    content: `---\ntags: [journal]\n---\n# ${iso}\n\n${line}\n\nMood: ${pick(['focused', 'scattered', 'curious', 'tired', 'energised'])}. #journal${rnd() < 0.2 ? ` #${pick(['idea', 'todo', 'insight'])}` : ''}\n`,
    mtime: d.getTime(),
  });
}

// A few orphans (no links in or out), like real vaults have
for (const [i, t] of ['Shower thought about attention', 'Idea: haptic feedback for notes', 'Recipe: overnight oats', 'Gift ideas'].entries()) {
  files.push({ path: `Ideas/${t}.md`, content: `Quick capture #inbox\n\n${t}.`, mtime: T1 - (i + 1) * 9 * DAY });
}

const { graph, content } = buildGraph(files, 'Demo Vault', { openable: false });
mkdirSync('public/demo', { recursive: true });
writeFileSync('public/demo/graph.json', JSON.stringify(graph));
writeFileSync('public/demo/content.json', JSON.stringify(content));
const ghosts = graph.nodes.filter((n) => n.ghost).length;
console.log(`[demo] ${graph.nodes.length - ghosts} notes, ${ghosts} ghosts, ${graph.links.length} links`);

// Also export the fictional vault as plain .md files, so `npm run build:graph` works out of the box.
for (const f of files) {
  const full = join('example-vault', f.path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, f.content);
  utimesSync(full, Math.floor(f.mtime / 1000), Math.floor(f.mtime / 1000));
}
console.log(`[demo] wrote ${files.length} files to example-vault/`);
