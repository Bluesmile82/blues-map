import type { Musician } from '../types';

/**
 * Build an O(1) lookup returning every musician directly connected to an id —
 * influences and playedWith, in both directions, plus the musician itself.
 */
export function buildRelatedIndex(musicians: Musician[]): (id: string) => Set<string> {
  const byId = new Map<string, Musician>();
  const reverse = new Map<string, string[]>();

  const link = (from: string, to: string) => {
    const existing = reverse.get(from);
    if (existing) existing.push(to);
    else reverse.set(from, [to]);
  };

  musicians.forEach((m) => {
    byId.set(m.id, m);
    m.influences.forEach((id) => link(id, m.id));
    (m.influencedBy ?? []).forEach((id) => link(id, m.id));
    (m.playedWith ?? []).forEach((id) => link(id, m.id));
  });

  return (id: string) => {
    const m = byId.get(id);
    if (!m) return new Set([id]);
    return new Set([
      id,
      ...m.influences,
      ...(m.influencedBy ?? []),
      ...(m.playedWith ?? []),
      ...(reverse.get(id) ?? []),
    ]);
  };
}
