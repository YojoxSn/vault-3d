import { describe, expect, it } from 'vitest';
import { computeInsights } from '../src/insights';
import type { GraphNode } from '../src/parser/types';

const DAY = 86_400_000;
const n = (id: string, over: Partial<GraphNode> = {}): GraphNode => ({
  id, title: id, path: id, folder: 'F', tags: [], createdAt: 0, updatedAt: 1_700_000_000_000, words: 10, excerpt: '', ghost: false, degree: 0, ...over,
});

describe('insights', () => {
  const nodes: GraphNode[] = [
    n('hub', { degree: 9 }),
    n('mid', { degree: 5, updatedAt: 1_700_000_000_000 - 900 * DAY }),
    n('leaf', { degree: 1 }),
    n('lonely', { degree: 0, words: 300 }),
    n('lonely2', { degree: 0, words: 20 }),
    n('ghost:idea', { ghost: true, path: '', folder: '(ghost)', degree: 3, updatedAt: 0 }),
    n('ghost:rare', { ghost: true, path: '', folder: '(ghost)', degree: 1, updatedAt: 0 }),
  ];
  const inn = [[1, 2], [0], [0], [], [], [0, 1, 2], [0]];
  const r = computeInsights(nodes, inn);
  const group = (id: string) => r.groups.find((g) => g.id === id);

  it('counts notes, orphans, ghosts and folders', () => {
    expect(r.notes).toBe(5);
    expect(r.orphans).toBe(2);
    expect(r.ghosts).toBe(2);
    expect(r.folders).toBe(1);
  });
  it('ranks hubs by connections and skips unconnected notes', () => {
    expect(group('hubs')!.items.map((x) => x.label).slice(0, 2)).toEqual(['hub', 'mid']);
    expect(group('hubs')!.items.some((x) => x.label === 'lonely')).toBe(false);
  });
  it('lists the most wanted missing notes first', () => {
    expect(group('wanted')!.items.map((x) => x.label)).toEqual(['ghost:idea', 'ghost:rare']);
    expect(group('wanted')!.items[0].meta).toBe('3× linked');
  });
  it('lists orphans, the longest first', () => {
    expect(group('orphans')!.items.map((x) => x.label)).toEqual(['lonely', 'lonely2']);
  });
  it('finds well-connected notes that were not edited for long', () => {
    expect(group('forgotten')!.items.map((x) => x.label)).toEqual(['mid', 'hub']);
    expect(r.firstYear).toBeLessThan(r.lastYear!);
  });
  it('skips "forgotten" when every note has the same date (typical after a sync)', () => {
    const same = computeInsights(nodes.map((x) => ({ ...x, updatedAt: x.ghost ? 0 : 1_700_000_000_000 })), inn);
    expect(same.groups.find((g) => g.id === 'forgotten')).toBeUndefined();
    expect(same.firstYear).toBeNull();
  });
  it('handles an empty vault', () => {
    const e = computeInsights([], []);
    expect(e.notes).toBe(0);
    expect(e.groups).toEqual([]);
  });
});
