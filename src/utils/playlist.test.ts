import { describe, it, expect } from 'vitest';
import { buildPlaylist, buildShareUrl, parseSharedPlaylist, DEFAULT_PLAYLIST_FILTERS } from './playlist';
import { buildYoutubePlaylistUrl, YT_PLAYLIST_MAX } from './youtube';
import type { Musician } from '../types';

const m = (id: string, activeFrom: string, bluesStyle: string, youtubeLink = `https://youtube.com/watch?v=${id}`) =>
  ({ id, name: id, activeFrom, bluesStyle, youtubeLink, influences: [], influencedBy: [], playedWith: [] } as unknown as Musician);

const pool = [
  m('a', '1930', 'Delta Blues'),
  m('b', '1950', 'Chicago Blues'),
  m('c', '1940', 'Delta Blues'),
  m('d', '1960', 'Delta Blues', ''), // no video → never eligible
];

/** 100 musicians, one per year from 1900 to 1999 */
const century = Array.from({ length: 100 }, (_, i) => m(`y${1900 + i}`, String(1900 + i), 'Delta Blues'));

const lowest = () => 0;
const highest = () => 0.999999;

describe('buildPlaylist', () => {
  it('orders chronologically, skips musicians without a video, and caps at size', () => {
    const list = buildPlaylist(pool, { ...DEFAULT_PLAYLIST_FILTERS, size: 2 }, { random: lowest });
    expect(list.map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('reverses order', () => {
    const list = buildPlaylist(pool, { ...DEFAULT_PLAYLIST_FILTERS, order: 'reverse' }, { random: lowest });
    expect(list.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('spreads picks across the whole span instead of taking one end', () => {
    const years = buildPlaylist(century, { ...DEFAULT_PLAYLIST_FILTERS, size: 10 }, { random: lowest })
      .map((x) => parseInt(x.activeFrom));
    // One pick per 10-year band, covering 1900 through the 1990s
    expect(years).toEqual([1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990]);
  });

  it('stays inside its band whichever end of the random range comes up', () => {
    const top = buildPlaylist(century, { ...DEFAULT_PLAYLIST_FILTERS, size: 10 }, { random: highest })
      .map((x) => parseInt(x.activeFrom));
    expect(top).toEqual([1909, 1919, 1929, 1939, 1949, 1959, 1969, 1979, 1989, 1999]);
  });

  it('varies between builds but always covers the range', () => {
    const runs = Array.from({ length: 8 }, () =>
      buildPlaylist(century, { ...DEFAULT_PLAYLIST_FILTERS, size: 10 }).map((x) => x.id).join(','));
    expect(new Set(runs).size).toBeGreaterThan(1);
    for (const run of runs) {
      const years = run.split(',').map((id) => parseInt(id.slice(1)));
      expect(years[0]).toBeLessThan(1910);
      expect(years[years.length - 1]).toBeGreaterThanOrEqual(1990);
      expect(new Set(years).size).toBe(10); // no repeated musicians
    }
  });

  it('returns everything when the pool is smaller than the requested size', () => {
    const list = buildPlaylist(pool, { ...DEFAULT_PLAYLIST_FILTERS, size: 50 });
    expect(list.map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });

  it('filters by style, year range, favorites and related network', () => {
    expect(buildPlaylist(pool, { ...DEFAULT_PLAYLIST_FILTERS, style: 'Delta Blues' }).map((x) => x.id))
      .toEqual(['a', 'c']);
    expect(buildPlaylist(pool, { ...DEFAULT_PLAYLIST_FILTERS, yearRange: [1935, 1955] }).map((x) => x.id))
      .toEqual(['c', 'b']);
    expect(buildPlaylist(pool, { ...DEFAULT_PLAYLIST_FILTERS, favoritesOnly: true }, { isFavorite: (id) => id === 'b' }).map((x) => x.id))
      .toEqual(['b']);
    expect(buildPlaylist(pool, DEFAULT_PLAYLIST_FILTERS, { relatedIds: new Set(['c']) }).map((x) => x.id))
      .toEqual(['c']);
  });
});

describe('share links', () => {
  it('round-trips a queue through a URL, keeping order', () => {
    const ids = ['muddy-waters', 'howlin-wolf', 'b-b-king'];
    const url = buildShareUrl(ids, 'https://blues.example')!;
    expect(url).toBe('https://blues.example/timeline?playlist=muddy-waters,howlin-wolf,b-b-king');
    expect(parseSharedPlaylist(new URL(url).search)).toEqual(ids);
  });

  it('has no link for an empty queue, and reads nothing from an unrelated URL', () => {
    expect(buildShareUrl([], 'https://blues.example')).toBeNull();
    expect(parseSharedPlaylist('?view=map')).toEqual([]);
    expect(parseSharedPlaylist('')).toEqual([]);
  });
});

describe('buildYoutubePlaylistUrl', () => {
  it('joins ids and caps at the YouTube limit', () => {
    expect(buildYoutubePlaylistUrl(['x', null, 'y'])).toBe('https://www.youtube.com/watch_videos?video_ids=x,y');
    const many = buildYoutubePlaylistUrl(Array.from({ length: 80 }, (_, i) => `v${i}`))!;
    expect(many.split('video_ids=')[1].split(',')).toHaveLength(YT_PLAYLIST_MAX);
  });

  it('returns null when there is nothing to play', () => {
    expect(buildYoutubePlaylistUrl([null])).toBeNull();
  });
});
