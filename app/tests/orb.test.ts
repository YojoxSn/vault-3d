import { describe, expect, it } from 'vitest';
import { computeOrbLayout, orbRadius } from '../src/scene/orb';
import type { GraphNode } from '../src/parser/types';

const node = (id: string, folder: string, updatedAt: number, degree = 1, ghost = false): GraphNode => ({
  id, title: id, path: ghost ? '' : id, folder, tags: [], createdAt: updatedAt, updatedAt, words: 10, excerpt: '', ghost, degree,
});

function sample(): GraphNode[] {
  const out: GraphNode[] = [];
  for (let i = 0; i < 120; i++) out.push(node(`A/n${i}`, i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C', 1_600_000_000_000 + i * 86_400_000, 1 + (i % 7)));
  out.push(node('ghost:x', '(ghost)', 0, 2, true));
  return out;
}
const at = (p: Float32Array, i: number) => ({ x: p[i * 3], y: p[i * 3 + 1], z: p[i * 3 + 2], r: Math.hypot(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]) });

describe('orb layout', () => {
  it('keeps every note inside the shell', () => {
    const nodes = sample();
    const { positions, R } = computeOrbLayout(nodes);
    expect(R).toBeCloseTo(orbRadius(nodes.length));
    nodes.forEach((_, i) => expect(at(positions, i).r).toBeLessThanOrEqual(R * 1.04));
    expect(positions.every(Number.isFinite)).toBe(true);
  });

  it('puts the newest notes at the north pole and the oldest at the south pole', () => {
    const nodes = sample();
    const { positions } = computeOrbLayout(nodes);
    const newest = at(positions, 119), oldest = at(positions, 0);
    expect(newest.y).toBeGreaterThan(0);
    expect(oldest.y).toBeLessThan(0);
    expect(newest.y).toBeGreaterThan(at(positions, 60).y);
    expect(at(positions, 60).y).toBeGreaterThan(oldest.y);
  });

  it('gives every folder its own wedge of longitude', () => {
    const nodes = sample();
    const { positions } = computeOrbLayout(nodes);
    const ang = (i: number) => (Math.atan2(at(positions, i).z, at(positions, i).x) + Math.PI * 2) % (Math.PI * 2);
    const range = (f: string) => { const a = nodes.map((n, i) => (n.folder === f ? ang(i) : -1)).filter((v) => v >= 0); return [Math.min(...a), Math.max(...a)]; };
    const [a0, a1] = range('A'), [b0, b1] = range('B'), [c0, c1] = range('C');
    const disjoint = (x0: number, x1: number, y0: number, y1: number) => x1 < y0 || y1 < x0;
    expect(disjoint(a0, a1, b0, b1)).toBe(true);
    expect(disjoint(a0, a1, c0, c1)).toBe(true);
    expect(disjoint(b0, b1, c0, c1)).toBe(true);
  });

  it('sinks hubs toward the core and keeps ghosts on a smaller inner sphere', () => {
    const nodes = sample();
    const { positions, R } = computeOrbLayout(nodes);
    const hub = nodes.findIndex((n) => n.degree === 7), leaf = nodes.findIndex((n) => n.degree === 1);
    expect(at(positions, hub).r).toBeLessThan(at(positions, leaf).r);
    expect(at(positions, 120).r).toBeCloseTo(R * 0.52, 3);
  });

  it('handles notes without dates and tiny vaults', () => {
    const nodes = [node('a', 'x', 0), node('b', 'x', 0)];
    const { positions } = computeOrbLayout(nodes);
    expect(positions.every(Number.isFinite)).toBe(true);
    expect(computeOrbLayout([]).positions.length).toBe(0);
  });
});
