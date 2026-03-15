# Improve Random Musician Selector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Math.random() with cryptographic randomness for better random musician selection

**Architecture:** Update handleRandom callback in App.tsx to use crypto.getRandomValues() instead of Math.random()

**Tech Stack:** TypeScript, React, Web Crypto API

---

### Task 1: Update handleRandom callback to use cryptographic randomness

**Files:**
- Modify: `src/App.tsx:83-86`

**Step 1: Read current implementation**

Run: `cat src/App.tsx` to view the current handleRandom implementation

**Step 2: Replace Math.random() with crypto.getRandomValues()**

Replace lines 83-86 with:
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

**Step 3: Verify the change**

Run: `cat src/App.tsx | grep -A 10 "const handleRandom"`
Expected: Should show the new implementation using crypto.getRandomValues()

**Step 4: Type check**

Run: `npm run typecheck` (or `npx tsc --noEmit` if no typecheck script)
Expected: No type errors

**Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: Use cryptographic randomness for random musician selector

Replace Math.random() with crypto.getRandomValues() for better
randomness distribution and cryptographically secure selection."
```

### Task 2: Test the implementation

**Files:**
- Test: Manual testing in browser

**Step 1: Start development server**

Run: `npm run dev`
Expected: Server starts successfully

**Step 2: Open application in browser**

Open: `http://localhost:5173` (or whatever port is shown)

**Step 3: Test random selector**

Click the random button multiple times (10+ clicks)
Expected: Different musicians are selected each time, no obvious patterns

**Step 4: Verify empty array handling**

(Edge case - this is already handled by the early return)
The app should not crash if musicians array is empty (unlikely in normal use)

**Step 5: Stop development server**

Run: `Ctrl+C` in the terminal

### Task 3: Verify no regressions

**Files:**
- Test: Full application testing

**Step 1: Check for TypeScript errors**

Run: `npm run typecheck`
Expected: No type errors

**Step 2: Check for linting errors**

Run: `npm run lint` (if available) or `npx eslint src/App.tsx`
Expected: No linting errors

**Step 3: Build the application**

Run: `npm run build`
Expected: Build completes successfully

**Step 4: Commit verification**

```bash
# No commit needed - just verification
echo "✓ All checks passed"
```

---

## Summary

This implementation:
- Replaces pseudorandom Math.random() with cryptographically secure crypto.getRandomValues()
- Adds safety check for empty musicians array
- Maintains same interface and behavior (just better randomness)
- Requires no changes to tests (if any exist for this function)
- Has no breaking changes

**Browser Compatibility:**
- Chrome 11+, Firefox 21+, Safari 5.1+, Edge (all versions)
- No fallback needed for modern browsers
