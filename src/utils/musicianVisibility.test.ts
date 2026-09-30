import { describe, it, expect } from 'vitest';
import { passesIncompleteFilter } from './musicianVisibility';
import type { Musician } from '../types';

const complete = { id: 'a', incomplete: false } as unknown as Musician;
const incomplete = { id: 'b', incomplete: true } as unknown as Musician;
const unset = { id: 'c' } as unknown as Musician;

describe('passesIncompleteFilter', () => {
  it('hides incomplete musicians by default', () => {
    expect(passesIncompleteFilter(complete, { showIncomplete: false, onlyIncomplete: false })).toBe(true);
    expect(passesIncompleteFilter(incomplete, { showIncomplete: false, onlyIncomplete: false })).toBe(false);
  });

  it('treats a missing incomplete flag as complete', () => {
    expect(passesIncompleteFilter(unset, { showIncomplete: false, onlyIncomplete: false })).toBe(true);
  });

  it('mixes incomplete back in when showIncomplete is set', () => {
    expect(passesIncompleteFilter(complete, { showIncomplete: true, onlyIncomplete: false })).toBe(true);
    expect(passesIncompleteFilter(incomplete, { showIncomplete: true, onlyIncomplete: false })).toBe(true);
  });

  it('shows only incomplete musicians when onlyIncomplete is set, regardless of showIncomplete', () => {
    expect(passesIncompleteFilter(incomplete, { showIncomplete: false, onlyIncomplete: true })).toBe(true);
    expect(passesIncompleteFilter(complete, { showIncomplete: false, onlyIncomplete: true })).toBe(false);
    expect(passesIncompleteFilter(complete, { showIncomplete: true, onlyIncomplete: true })).toBe(false);
  });
});
