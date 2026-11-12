import type { GraphNode } from './parser/types';

export interface InsightItem { i: number; label: string; meta: string }
export interface InsightGroup { id: string; title: string; hint: string; items: InsightItem[] }
export interface Insights {
  notes: number; links: number; orphans: number; ghosts: number; folders: number;
  firstYear: number | null; lastYear: number | null;
  groups: InsightGroup[];
}

const TOP = 5;
const ym = (t: number) => new Date(t).toISOString().slice(0, 7);

/**
 * Useful numbers about a vault, computed from the graph only. Pure function.
 *  - hubs: the most connected notes (your "backbone")
 *  - wanted: notes that are linked but do not exist yet, most linked first (what to write next)
 *  - orphans: notes without any link (what to connect), longest first
 *  - forgotten: well-connected notes that have not been edited for the longest time
 */
export function computeInsights(nodes: GraphNode[], inLinks: number[][]): Insights {
  const real: number[] = [], ghosts: number[] = [];
  nodes.forEach((n, i) => (n.ghost ? ghosts : real).push(i));
  const linksTotal = Math.round(nodes.reduce((s, n) => s + n.degree, 0) / 2);

  const hubs = [...real].sort((a, b) => nodes[b].degree - nodes[a].degree).slice(0, TOP)
    .filter((i) => nodes[i].degree > 0)
    .map((i) => ({ i, label: nodes[i].title, meta: `${nodes[i].degree} links` }));

  const wanted = [...ghosts].sort((a, b) => inLinks[b].length - inLinks[a].length).slice(0, TOP)
    .filter((i) => inLinks[i].length > 0)
    .map((i) => ({ i, label: nodes[i].title, meta: `${inLinks[i].length}× linked` }));

  const orphanList = real.filter((i) => nodes[i].degree === 0);
  const orphans = [...orphanList].sort((a, b) => nodes[b].words - nodes[a].words).slice(0, TOP)
    .map((i) => ({ i, label: nodes[i].title, meta: `${nodes[i].words} words` }));

  const dated = real.filter((i) => nodes[i].updatedAt > 0);
  const times = dated.map((i) => nodes[i].updatedAt);
  const min = times.length ? Math.min(...times) : 0, max = times.length ? Math.max(...times) : 0;
  // only meaningful when the vault really spans time (not when every file got the same date after a sync)
  const spread = max - min > 60 * 86_400_000;
  const forgotten = spread
    ? dated.filter((i) => nodes[i].degree >= 4).sort((a, b) => nodes[a].updatedAt - nodes[b].updatedAt).slice(0, TOP)
        .map((i) => ({ i, label: nodes[i].title, meta: `edited ${ym(nodes[i].updatedAt)}` }))
    : [];

  const groups: InsightGroup[] = [
    { id: 'hubs', title: 'Backbone', hint: 'Your most connected notes', items: hubs },
    { id: 'wanted', title: 'Write next', hint: 'Linked often, but the note does not exist yet', items: wanted },
    { id: 'orphans', title: 'To connect', hint: 'Notes with no link at all', items: orphans },
    { id: 'forgotten', title: 'Revisit', hint: 'Well connected, but not edited for a long time', items: forgotten },
  ].filter((g) => g.items.length > 0);

  return {
    notes: real.length, links: linksTotal, orphans: orphanList.length, ghosts: ghosts.length,
    folders: new Set(real.map((i) => nodes[i].folder)).size,
    firstYear: spread ? new Date(min).getUTCFullYear() : null,
    lastYear: spread ? new Date(max).getUTCFullYear() : null,
    groups,
  };
}
