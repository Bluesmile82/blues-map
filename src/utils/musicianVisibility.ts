import type { Musician } from '../types';

export interface IncompleteFilterState {
  showIncomplete: boolean;
  onlyIncomplete: boolean;
}

export const DEFAULT_INCOMPLETE_FILTER: IncompleteFilterState = {
  showIncomplete: false,
  onlyIncomplete: false,
};

/**
 * Incomplete musicians are hidden by default. `showIncomplete` mixes them
 * back in; `onlyIncomplete` narrows to just them, regardless of `showIncomplete`.
 */
export function passesIncompleteFilter(
  m: Musician,
  { showIncomplete, onlyIncomplete }: IncompleteFilterState,
): boolean {
  if (onlyIncomplete) return !!m.incomplete;
  if (showIncomplete) return true;
  return !m.incomplete;
}
