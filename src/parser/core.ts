import type { ContentMap, GraphData, GraphLink, GraphNode, RawFile } from './types';

const IGNORED_DIRS = new Set(['.obsidian', '.trash', '.git', 'node_modules']);
const NON_NOTE_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|pdf|mp3|mp4|mov|wav|ogg|webm|zip|csv|xlsx?|docx?|pptx?|canvas|base)$/i;

export function isIgnoredPath(path: string): boolean {
  return path.split('/').some((seg) => IGNORED_DIRS.has(seg) || (seg.startsWith('.') && seg.length > 1));
}

/** Splits YAML frontmatter from the body. Only tags are read from the YAML. */
export function splitFrontmatter(src: string): { body: string; tags: string[] } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { body: src, tags: [] };
  const yaml = m[1];
  const tags: string[] = [];
  const inline = /^tags?:[ \t]*(.*)$/im.exec(yaml);
  if (inline) {
    const v = inline[1].trim();
    if (v.startsWith('[')) {
      v.replace(/^\[|\]$/g, '').split(',').forEach((t) => tags.push(t));
    } else if (v) {
      v.split(/[,\s]+/).forEach((t) => tags.push(t));
    } else {
      // block list:  tags:\n  - a\n  - b
      const after = yaml.slice(inline.index + inline[0].length).replace(/^\r?\n/, '');
      for (const line of after.split(/\r?\n/)) {
        const li = /^\s*-\s*(.+)$/.exec(line);
        if (li) tags.push(li[1]);
        else if (line.trim() && !/^\s/.test(line)) break;
      }
    }
  }
  return { body: src.slice(m[0].length), tags: tags.map(cleanTag).filter(Boolean) };
}

const cleanTag = (t: string) => t.trim().replace(/^#/, '').replace(/^["']|["']$/g, '').trim();

/** Removes fenced code blocks and inline code so links/tags inside them are ignored. */
export function stripCode(md: string): string {
  return md.replace(/```[\s\S]*?```/g, ' ').replace(/~~~[\s\S]*?~~~/g, ' ').replace(/`[^`\n]*`/g, ' ');
}

export interface ExtractedLinks {
  wiki: string[];
  md: string[];
}

export function extractLinks(md: string): ExtractedLinks {
  const text = stripCode(md);
  const wiki: string[] = [];
  const mdl: string[] = [];
  for (const m of text.matchAll(/!?\[\[([^\]\n]+?)\]\]/g)) wiki.push(m[1]);
  for (const m of text.matchAll(/(?<!!)\[[^\]\n]*\]\(([^)\s]+?)(?:\s+"[^"]*")?\)/g)) mdl.push(m[1]);
  return { wiki, md: mdl };
}

export function extractInlineTags(md: string): string[] {
  const text = stripCode(md).replace(/\[\[[^\]]*\]\]/g, ' ').replace(/\(https?:[^)]*\)/g, ' ');
  const out: string[] = [];
  for (const m of text.matchAll(/(?<![\w&/#`])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu)) out.push(m[1]);
  return out;
}

const norm = (s: string) => s.trim().toLowerCase().normalize('NFC');
export const ghostId = (name: string) => 'ghost:' + norm(name);
const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const stripMd = (p: string) => p.replace(/\.md$/i, '');

export interface Resolver {
  /** Resolves a link target found in note `fromPath`. Returns the node id, or null if it is not a note link. */
  resolve(target: string, fromPath?: string): { id: string | null; name: string } | null;
}

/** Builds an Obsidian-like link resolver over a list of note paths (without extension). */
export function makeResolver(paths: string[]): Resolver {
  const byName = new Map<string, string[]>();
  const byPath = new Map<string, string>();
  for (const p of paths) {
    byPath.set(norm(p), p);
    const k = norm(baseName(p));
    const arr = byName.get(k);
    if (arr) arr.push(p);
    else byName.set(k, [p]);
  }
  const pick = (cands: string[], from?: string) => {
    if (cands.length === 1) return cands[0];
    const dir = from ? from.slice(0, from.lastIndexOf('/') + 1) : '';
    return [...cands].sort((a, b) => {
      const sa = a.startsWith(dir) ? 0 : 1;
      const sb = b.startsWith(dir) ? 0 : 1;
      return sa - sb || a.length - b.length || a.localeCompare(b);
    })[0];
  };
  return {
    resolve(rawTarget, fromPath) {
      let t = rawTarget.split('|')[0];
      t = t.split('#')[0].split('^')[0].trim();
      try { t = decodeURIComponent(t); } catch { /* keep as is */ }
      if (!t || /^[a-z][a-z0-9+.-]*:/i.test(t)) return null;
      if (NON_NOTE_EXT.test(t)) return null;
      t = stripMd(t).replace(/^\.?\//, '');
      if (!t) return null;
      const exact = byPath.get(norm(t));
      if (exact) return { id: exact, name: t };
      if (t.includes('/')) {
        const suffix = '/' + norm(t);
        const hits = paths.filter((p) => norm(p).endsWith(suffix));
        if (hits.length) return { id: pick(hits, fromPath), name: baseName(t) };
        // relative path from the current note's folder
        if (fromPath) {
          const dir = fromPath.slice(0, fromPath.lastIndexOf('/') + 1);
          const rel = byPath.get(norm(dir + t));
          if (rel) return { id: rel, name: baseName(t) };
        }
        return { id: null, name: baseName(t) };
      }
      const cands = byName.get(norm(t));
      if (cands) return { id: pick(cands, fromPath), name: t };
      return { id: null, name: t };
    },
  };
}

const wordCount = (s: string) => (s.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;

function makeExcerpt(body: string): string {
  const t = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_m, a, b) => b || a)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.slice(0, 500);
}

/** Pure function: turns a list of markdown files into a graph. Works in the browser and in Node. */
export function buildGraph(
  files: RawFile[],
  vaultName: string,
  opts: { openable?: boolean } = {},
): { graph: GraphData; content: ContentMap } {
  const notes = files
    .filter((f) => /\.md$/i.test(f.path) && !isIgnoredPath(f.path))
    .sort((a, b) => a.path.localeCompare(b.path));
  const paths = notes.map((f) => stripMd(f.path));
  const resolver = makeResolver(paths);

  const nodes: GraphNode[] = [];
  const content: ContentMap = {};
  const nodeById = new Map<string, GraphNode>();
  const ghosts = new Map<string, GraphNode>();
  const linkKeys = new Set<string>();
  const links: GraphLink[] = [];

  for (const f of notes) {
    const id = stripMd(f.path);
    const { body, tags: fmTags } = splitFrontmatter(f.content);
    const tags = [...new Set([...fmTags, ...extractInlineTags(body)])];
    const slash = id.indexOf('/');
    const node: GraphNode = {
      id,
      title: baseName(id),
      path: id,
      folder: slash === -1 ? '(root)' : id.slice(0, slash),
      tags,
      createdAt: f.ctime ?? f.mtime,
      updatedAt: f.mtime,
      words: wordCount(body),
      excerpt: makeExcerpt(body),
      ghost: false,
      degree: 0,
    };
    nodes.push(node);
    nodeById.set(id, node);
    content[id] = body;
  }

  const addLink = (s: string, t: string) => {
    if (s === t) return;
    const k = s + '\u0000' + t;
    if (linkKeys.has(k)) return;
    linkKeys.add(k);
    links.push({ source: s, target: t });
  };

  for (const f of notes) {
    const from = stripMd(f.path);
    const { body } = splitFrontmatter(f.content);
    const { wiki, md } = extractLinks(body);
    for (const raw of [...wiki, ...md]) {
      const r = resolver.resolve(raw, from);
      if (!r) continue;
      if (r.id) {
        addLink(from, r.id);
      } else {
        const gid = ghostId(r.name);
        let g = ghosts.get(gid);
        if (!g) {
          g = {
            id: gid, title: r.name, path: '', folder: '(ghost)', tags: [],
            createdAt: 0, updatedAt: 0, words: 0, excerpt: '', ghost: true, degree: 0,
          };
          ghosts.set(gid, g);
          nodes.push(g);
          nodeById.set(gid, g);
        }
        addLink(from, gid);
      }
    }
  }

  for (const l of links) {
    nodeById.get(l.source)!.degree++;
    nodeById.get(l.target)!.degree++;
  }

  return { graph: { vaultName, openable: opts.openable ?? true, nodes, links }, content };
}
