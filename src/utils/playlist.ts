import type { Musician } from '../types';
import { extractVideoId } from './youtube';

export type PlaylistOrder = 'chronological' | 'reverse';

/** Query param carrying a shared playlist, as a comma-separated list of musician ids. */
export const PLAYLIST_PARAM = 'playlist';

/** Absolute URL that reopens this exact queue — order included. */
export function buildShareUrl(musicianIds: string[], origin: string): string | null {
  if (musicianIds.length === 0) return null;
  return `${origin}/timeline?${PLAYLIST_PARAM}=${musicianIds.join(',')}`;
}

/** Read a shared queue out of a URL query string. Returns ids in their shared order. */
export function parseSharedPlaylist(search: string): string[] {
  const raw = new URLSearchParams(search).get(PLAYLIST_PARAM);
  if (!raw) return [];
  return raw.split(',').map((id) => id.trim()).filter(Boolean);
}

export const PLAYLIST_SIZES = [20, 30, 50] as const;

export interface PlaylistFilters {
  /** Blues style, or null for any */
  style: string | null;
  /** [from, to] on activeFrom, or null for any */
  yearRange: [number, number] | null;
  favoritesOnly: boolean;
  /** Musician id whose network the playlist is restricted to, or null */
  relatedToId: string | null;
  order: PlaylistOrder;
  size: number;
}

export const DEFAULT_PLAYLIST_FILTERS: PlaylistFilters = {
  style: null,
  yearRange: null,
  favoritesOnly: false,
  relatedToId: null,
  order: 'chronological',
  size: 20,
};

interface BuildOptions {
  isFavorite?: (id: string) => boolean;
  /** Resolved network of filters.relatedToId — null means "no restriction" */
  relatedIds?: Set<string> | null;
  /** Injectable for tests; defaults to a crypto-backed float in [0, 1) */
  random?: () => number;
}

/** Matches how the app picks a random musician elsewhere. */
function secureRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / (0xFFFFFFFF + 1);
}

/**
 * Pick the musicians for a playlist: one song each (no musician repeats),
 * ordered along the timeline, capped at `filters.size`.
 *
 * The picks are spread across the whole selected span rather than taken from one
 * end of it: the year-sorted pool is split into `size` equal-population bands and
 * one musician is drawn at random from each. So the playlist is a trip through the
 * years, and a different trip every time it is built.
 */
export function buildPlaylist(
  musicians: Musician[],
  filters: PlaylistFilters,
  { isFavorite, relatedIds, random = secureRandom }: BuildOptions = {},
): Musician[] {
  const eligible = musicians.filter((m) => {
    if (!extractVideoId(m.youtubeLink)) return false;
    if (filters.style && m.bluesStyle !== filters.style) return false;
    if (filters.yearRange) {
      const year = parseInt(m.activeFrom);
      if (!(year >= filters.yearRange[0] && year <= filters.yearRange[1])) return false;
    }
    if (filters.favoritesOnly && !isFavorite?.(m.id)) return false;
    if (relatedIds && !relatedIds.has(m.id)) return false;
    return true;
  });

  eligible.sort((a, b) => parseInt(a.activeFrom) - parseInt(b.activeFrom));

  const total = eligible.length;
  const size = Math.min(filters.size, total);
  const picked: Musician[] = [];
  for (let i = 0; i < size; i++) {
    // Bands are non-empty because size <= total
    const start = Math.floor((i * total) / size);
    const end = Math.floor(((i + 1) * total) / size);
    const offset = Math.min(end - start - 1, Math.floor(random() * (end - start)));
    picked.push(eligible[start + offset]);
  }

  return filters.order === 'reverse' ? picked.reverse() : picked;
}
