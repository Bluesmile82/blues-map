# Zoom to Musician on Click Design

**Date:** 2026-03-15

## Problem

When clicking on a musician node in the influence view, the node is only selected but the view doesn't zoom in. Users must manually zoom to see musician names and images, which requires zooming to at least `CLUSTER_DETAILS_ZOOM` (0.2).

## Solution

Modify the `onClick` callback to automatically zoom to clicked musicians when the current zoom level is below the detail visibility threshold.

## Architecture

### Current Behavior
- Clicking a musician node calls `onSelect(musician)` to open the info panel
- No automatic zoom adjustment occurs

### New Behavior
- If `currentZoom < CLUSTER_DETAILS_ZOOM` (0.2): Zoom to 0.2 and center on musician
- If `currentZoom >= CLUSTER_DETAILS_ZOOM`: Just select (no zoom change)
- Target zoom level: `CLUSTER_DETAILS_ZOOM` (0.2) - minimum level where names and images appear

### Changes Required

**File:** `src/components/InfluenceView.tsx:364-367`

**Current code:**
```typescript
const onClick = useCallback((info: PickingInfo) => {
  const m = info.object as { musician: Musician } | undefined;
  if (m?.musician) onSelect(m.musician);
}, [onSelect]);
```

**New code:**
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

## Dependencies

- `deckVS` state - needed to set new view state
- `currentZoom` - needed to check if zoom is needed
- `positions` - needed to get musician's world position
- `CLUSTER_DETAILS_ZOOM` constant (0.2) - target zoom level
- `EXPAND_ZOOM_THRESHOLD` constant - used for xExpand calculation

## Benefits

- Improved UX: One click both selects and zooms to show details
- Smart behavior: Only zooms when needed (doesn't over-zoom if already close)
- Consistent with search results: Search uses `goToMusician` which zooms to 0.5

## Edge Cases

- Musician with no position data: Should still select, just skip zoom
- deckVS not initialized: Should still select, just skip zoom
- Already zoomed in: No zoom change, just select

## Testing

1. Start app at default zoom (should be < 0.2)
2. Click on a musician node
3. Expected: View zooms to 0.2 and centers on musician, panel opens
4. Click on another musician while zoomed in
5. Expected: No zoom change, just selection changes
6. Click on musician with no position data
7. Expected: Panel opens, no zoom change
