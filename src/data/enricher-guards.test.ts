import { describe, it, expect } from 'vitest';
// @ts-expect-error - plain JS ETL script, no type declarations
import { findMusicianByName, plausibleInfluence, isJunkVideo, videoMentionsArtist } from '../../enrich-musicians-v3.js';

// Real entries that produced bad enrichments in earlier PRs.
const DB = [
  { id: 'jimmy-rogers', name: 'Jimmy Rogers', birthDate: '1924-06-03' },
  { id: 'roy-rogers', name: 'Roy Rogers', birthDate: '1911-11-05' },
  { id: 'leonard-baby-doo-caston', name: 'Leonard "Baby Doo" Caston', birthDate: '1917-06-02' },
  { id: 'bill-gaither', name: 'Bill Gaither', birthDate: '1910-04-21' },
];
const byId = (id: string) => DB.find(m => m.id === id)!;

describe('findMusicianByName', () => {
  it('matches a full name', () => {
    expect(findMusicianByName('Jimmy Rogers', DB)?.id).toBe('jimmy-rogers');
  });

  it('ignores nicknames and disambiguators', () => {
    expect(findMusicianByName('Leonard Caston', DB)?.id).toBe('leonard-baby-doo-caston');
    expect(findMusicianByName('Jimmy Rogers (musician)', DB)?.id).toBe('jimmy-rogers');
  });

  it('never matches on a surname alone', () => {
    // This is the bug: "Rogers" previously matched both Rogers entries.
    expect(findMusicianByName('Rogers', DB)).toBeNull();
  });

  it('does not confuse different people sharing a surname', () => {
    expect(findMusicianByName('Roy Rogers', DB)?.id).toBe('roy-rogers');
    expect(findMusicianByName('Jimmie Rodgers', DB)).toBeNull();
  });
});

describe('plausibleInfluence', () => {
  it('rejects an influence born after the subject', () => {
    // Jimmy Rogers (1924) cannot have influenced Leonard Caston (1917).
    expect(plausibleInfluence(byId('jimmy-rogers'), byId('leonard-baby-doo-caston'))).toBe(false);
  });

  it('accepts an influence born clearly earlier', () => {
    expect(plausibleInfluence(byId('bill-gaither'), byId('jimmy-rogers'))).toBe(true);
  });

  it('allows unknown dates through', () => {
    expect(plausibleInfluence({ birthDate: '' }, byId('jimmy-rogers'))).toBe(true);
  });
});

describe('isJunkVideo', () => {
  it('rejects placeholder titles', () => {
    expect(isJunkVideo({ title: 'Untitled' })).toBe(true);
    expect(isJunkVideo({ title: '   ' })).toBe(true);
    expect(isJunkVideo({ title: 'Track 03' })).toBe(true);
  });

  it('rejects AI-generated uploads', () => {
    expect(isJunkVideo({ title: 'AI Generated Blues - Delta Style' })).toBe(true);
    expect(isJunkVideo({ title: 'Muddy Waters - Rollin Stone (AI Remastered)' })).toBe(true);
    expect(isJunkVideo({ title: 'Made with Suno' })).toBe(true);
    expect(isJunkVideo({ title: 'Blues song', author_name: 'AI Music Channel' })).toBe(true);
  });

  it('keeps genuine recordings', () => {
    expect(isJunkVideo({ title: 'Barrelhouse Buck McFarland - Alton Blues (1934)' })).toBe(false);
    expect(isJunkVideo({ title: 'Bill Gaither - Champ Joe Louis' })).toBe(false);
  });
});

describe('videoMentionsArtist', () => {
  it('requires every significant name word', () => {
    const meta = { title: 'Barrelhouse Buck McFarland - Alton Blues' };
    expect(videoMentionsArtist(meta, 'Barrelhouse Buck McFarland')).toBe(true);
    // A generic barrelhouse piano compilation must not pass.
    expect(videoMentionsArtist({ title: 'Barrelhouse Piano Classics' }, 'Barrelhouse Buck McFarland')).toBe(false);
  });

  it('accepts a match found on the channel name', () => {
    expect(videoMentionsArtist({ title: 'Champ Joe Louis', author_name: 'Bill Gaither Archive' }, 'Bill Gaither')).toBe(true);
  });
});
