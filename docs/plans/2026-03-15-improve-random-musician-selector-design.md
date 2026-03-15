# Improve Random Musician Selector with Cryptographic Randomness

**Date:** 2026-03-15

## Problem

The current random musician selector (`src/App.tsx:83-86`) uses `Math.random()`, which is a pseudorandom number generator. This can lead to predictable patterns and repeated sequences when selecting random musicians.

## Solution

Replace `Math.random()` with the Web Crypto API's `crypto.getRandomValues()` for cryptographically secure random number generation.

## Architecture

### Changes Required

1. Update `handleRandom` callback in `src/App.tsx` (lines 83-86)
2. Use `crypto.getRandomValues()` to generate random index
3. Add early return for empty musicians array

### Implementation

**Current code:**
```typescript
const handleRandom = useCallback(() => {
  const pick = musicians[Math.floor(Math.random() * musicians.length)];
  handleSelect(pick);
}, [musicians, handleSelect]);
```

**New implementation:**
```typescript
const handleRandom = useCallback(() => {
  if (musicians.length === 0) return;
  
  // Generate cryptographically secure random index
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const randomValue = array[0] / (0xFFFFFFFF + 1);
  const index = Math.floor(randomValue * musicians.length);
  
  const pick = musicians[index];
  handleSelect(pick);
}, [musicians, handleSelect]);
```

## Benefits

- **Better randomness distribution** - Avoids patterns in pseudorandom sequences
- **Cryptographically secure** - Unpredictable random selection
- **Standard browser API** - Widely supported in modern browsers

## Error Handling

- Empty musicians array → Early return
- Browser compatibility → Web Crypto API supported in Chrome 11+, Firefox 21+, Safari 5.1+, Edge (all versions)
- No fallback needed for modern browsers

## Testing

Manual testing:
1. Click random button multiple times
2. Verify different musicians are selected
3. Verify no repeated patterns in selections

## Browser Support

- Chrome 11+
- Firefox 21+
- Safari 5.1+
- Edge (all versions)
- No IE support needed
