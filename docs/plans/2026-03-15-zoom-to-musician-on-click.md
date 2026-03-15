# Zoom to Musician on Click Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically zoom to clicked musicians when zoomed out below detail visibility threshold

**Architecture:** Modify onClick callback in InfluenceView.tsx to check currentZoom and conditionally set deckVS to zoom and center on clicked musician

**Tech Stack:** TypeScript, React, DeckGL

---

### Task 1: Update onClick callback to zoom when needed

**Files:**
- Modify: `src/components/InfluenceView.tsx:364-367`

**Step 1: Read current implementation**

Run: `cat -n src/components/InfluenceView.tsx | sed -n '364,367p'`
Expected: Shows current onClick implementation with just onSelect

**Step 2: Modify onClick to add zoom logic**

Replace lines 364-367 with:
```typescript
const onClick = useCallback((info: PickingInfo) => {
  const m = info.object as { musician: Musician } | undefined;
  if (m?.musician) {
    // Zoom to musician if zoomed out below detail visibility threshold
    if (deckVS && currentZoom < CLUSTER_DETAILS_ZOOM) {
      const pos = positions[m.musician.id];
      if (pos) {
        const xe = Math.max(1, Math.pow(2, Math.max(0, CLUSTER_DETAILS_ZOOM - EXPAND_ZOOM_THRESHOLD)));
        setDeckVS({ ...deckVS, target: [pos[0] * xe, pos[1], 0], zoom: CLUSTER_DETAILS_ZOOM });
      }
    }
    onSelect(m.musician);
  }
}, [onSelect, deckVS, currentZoom, positions]);
```

**Step 3: Verify the change**

Run: `cat -n src/components/InfluenceView.tsx | sed -n '364,378p'`
Expected: Should show the new implementation with zoom logic

**Step 4: Type check**

Run: `npm run typecheck` (or `npx tsc --noEmit` if no typecheck script)
Expected: No type errors in InfluenceView.tsx

**Step 5: Commit**

```bash
git add src/components/InfluenceView.tsx
git commit -m "feat: Zoom to musician on click when zoomed out

When clicking a musician node while zoomed out below
CLUSTER_DETAILS_ZOOM (0.2), automatically zoom to that zoom
level and center on the musician to show names and images.

If already zoomed in, just select without zooming."
```

### Task 2: Test the implementation

**Files:**
- Test: Manual testing in browser

**Step 1: Start development server**

Run: `npm run dev`
Expected: Server starts successfully

**Step 2: Open application in browser**

Open: `http://localhost:5173` (or whatever port is shown)

**Step 3: Test zoom when zoomed out**

- Ensure view is at default zoom (should be < 0.2)
- Click on a musician node in the influence view
- Expected: View zooms in to 0.2 and centers on the clicked musician
- Expected: Musician panel opens

**Step 4: Test no zoom when already zoomed in**

- Manually zoom in past 0.2 (use zoom buttons if available)
- Click on a different musician node
- Expected: No zoom change occurs
- Expected: Selection changes to new musician

**Step 5: Test edge cases**

- Click on a musician with no position data (if any exist)
- Expected: Panel opens, no zoom occurs

**Step 6: Stop development server**

Run: `Ctrl+C` in the terminal

### Task 3: Verify no regressions

**Files:**
- Test: Full application testing

**Step 1: Check for TypeScript errors**

Run: `npm run typecheck`
Expected: No type errors

**Step 2: Check for linting errors**

Run: `npm run lint` (if available) or `npx eslint src/components/InfluenceView.tsx`
Expected: No new linting errors (pre-existing errors in node_modules and root scripts are OK)

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
- Adds automatic zoom when clicking musicians while zoomed out
- Only zooms when needed (currentZoom < CLUSTER_DETAILS_ZOOM)
- Uses existing zoom patterns from goToMusician function
- Maintains backward compatibility (selects always work)
- Has no breaking changes

**Key constants:**
- `CLUSTER_DETAILS_ZOOM` = 0.2 (minimum zoom to show names/images)
- `EXPAND_ZOOM_THRESHOLD` = ~1.322 (used for xExpand calculation)

**Dependencies added to onClick:**
- `deckVS` - to set new view state
- `currentZoom` - to check if zoom is needed
- `positions` - to get musician's world position
