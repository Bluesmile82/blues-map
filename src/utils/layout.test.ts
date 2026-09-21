import { describe, expect, it } from 'vitest';
import { formatLifespan, formatYear, formatYearRange } from './layout';

const LABELS = { born: 'b.', died: 'd.', active: 'active' };

describe('year formatting with missing dates', () => {
  it('renders nothing instead of NaN or 1970', () => {
    expect(formatYear('')).toBe('');
    expect(formatYear(null)).toBe('');
    expect(formatYear(undefined)).toBe('');
    expect(formatYear('not a date')).toBe('');
    expect(formatYear('1911-05-08')).toBe('1911');
  });

  it('drops the "b." prefix when there is no birth date', () => {
    expect(formatLifespan(null, null, LABELS)).toBe('active');
    expect(formatLifespan('', '', LABELS)).toBe('active');
    expect(formatLifespan('1911-05-08', null, LABELS)).toBe('b. 1911 — active');
    expect(formatLifespan('1911-05-08', '1979-10-01', LABELS)).toBe('b. 1911 — d. 1979');
  });

  it('collapses the year range', () => {
    expect(formatYearRange(null, null)).toBe('');
    expect(formatYearRange('1911-05-08', null)).toBe('1911');
    expect(formatYearRange('1911-05-08', '1979-10-01')).toBe('1911–1979');
  });
});
