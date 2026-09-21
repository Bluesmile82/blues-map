import { describe, it, expect } from 'vitest';
import musicians from '../data/musicians.json';
import type { Musician } from '../types';
import { computeBluesTree, computeScores, activeYear, GROUND_Y } from './treeLayout';

const data = musicians as unknown as Musician[];
const tree = computeBluesTree(data);

describe('computeBluesTree', () => {
  it('places every musician exactly once', () => {
    expect(tree.nodes).toHaveLength(data.length);
    expect(tree.byId.size).toBe(data.length);
  });

  it('orders musicians vertically by the year they became active', () => {
    const older = tree.nodes.filter((n) => n.year <= 1920);
    const newer = tree.nodes.filter((n) => n.year >= 1980);
    // y grows downwards, so the older generation must sit below the newer one
    expect(Math.min(...older.map((n) => n.y))).toBeGreaterThan(Math.max(...newer.map((n) => n.y)));
  });

  it('keeps the influential on the wood and pushes the quiet ones out to the twigs', () => {
    const reach = (tier: number) => {
      const of = tree.nodes.filter((n) => n.tier === tier).map((n) => Math.abs(n.x - n.ax));
      return of.reduce((a, b) => a + b, 0) / of.length;
    };
    expect(reach(0)).toBeLessThan(reach(1));
    expect(reach(1)).toBeLessThan(reach(2));
  });

  it('keeps every leaf far enough apart to tell apart and click', () => {
    const byY = [...tree.nodes].sort((a, b) => a.y - b.y);
    let closest = Infinity;
    for (let i = 0; i < byY.length; i++) {
      for (let j = i + 1; j < byY.length && byY[j].y - byY[i].y < 40; j++) {
        closest = Math.min(closest, Math.hypot(byY[j].x - byY[i].x, byY[j].y - byY[i].y));
      }
    }
    // a leaf is ~13 world units across, so 20 leaves clear air between two of them
    expect(closest).toBeGreaterThanOrEqual(20);
  });

  it('never grows a twig for fewer than three leaves', () => {
    const perTwig = new Map<string, number>();
    tree.nodes.forEach((n) => {
      if (n.twig) perTwig.set(n.twig, (perTwig.get(n.twig) ?? 0) + 1);
    });
    expect(perTwig.size).toBeGreaterThan(0);
    const thin = [...perTwig.entries()].filter(([, count]) => count < 3);
    expect(thin).toEqual([]);
    // every twig the layout drew is one the nodes actually reference
    expect(new Set(tree.twigs.map((t) => t.key))).toEqual(new Set(perTwig.keys()));
  });

  it('never forks a branch below the ground', () => {
    tree.limbs.forEach((l) => expect(l.bottomY).toBeLessThan(GROUND_Y));
  });

  it('scores a musician by how many people they influenced', () => {
    const scores = computeScores(data);
    const muddy = data.find((m) => m.id === 'muddy-waters')!;
    const median = [...scores.values()].sort((a, b) => a - b)[Math.floor(scores.size / 2)];
    expect(scores.get(muddy.id)!).toBeGreaterThan(median);
  });

  it('gives every style a limb with musicians attached', () => {
    const styles = new Set(data.map((m) => m.bluesStyle));
    expect(new Set(tree.limbs.map((l) => l.style))).toEqual(styles);
  });

  it('reads activeFrom as a year', () => {
    expect(activeYear({ activeFrom: '1931' } as Musician)).toBe(1931);
  });
});
