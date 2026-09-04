import { describe, it, expect } from 'vitest';
import musicians from './musicians.json';

describe('musicians.json', () => {
  it('every musician has an ISO createdAt date', () => {
    const missing = (musicians as { id: string; createdAt?: string }[])
      .filter((m) => !/^\d{4}-\d{2}-\d{2}$/.test(m.createdAt ?? ''))
      .map((m) => m.id);
    expect(missing).toEqual([]);
  });
});
