# Style Clustering for Influence View

**Date:** 2025-03-15
**Status:** Design Approved

## Overview

Add a clustering system to the Influence View that aggregates musician circles into style-based clusters at low zoom levels, which smoothly expand to show individual musicians when zooming in.

## Requirements

- At low zoom levels (≤ 1.0): Display musician circles clustered by blues style, creating merged blob-like formations
- Clusters should have labels showing style name + musician count (e.g., "Delta Blues (47)")
- At zoom > 1.0: Clusters smoothly expand to show individual musicians at their actual positions
- Transition should be smooth with 300ms ease-in-out animation
- Cluster appearance should emerge naturally from overlapping individual circles (like a detailed heatmap)

## Architecture

### Dual-Layer System

**Zoom ≤ 1.0 (Clustered Mode):**
- All musician circles visible but positions interpolated toward style cluster centers
- Creates natural overlapping/merging effect from densely packed semi-transparent circles
- Style labels positioned above the densest cluster areas

**Zoom > 1.0 (Expanded Mode):**
- Musician circles at their actual computed positions
- Full visibility of individual musicians and their relationships
- Same circles throughout - just interpolated positions

**Transition Zone (Zoom 0.8 - 1.2):**
- Each musician circle smoothly expands from cluster-center position to actual position
- No crossfade needed - same circles with interpolated positions
- Visual effect is cluster "exploding" outward into individual musicians

## Visual Design

### Cluster Appearance (Zoom ≤ 1.0)
- All musician circles rendered (not simplified)
- Positions compressed toward cluster center: `clusterCenter + (actualPos - clusterCenter) × 0.15`
- Each circle retains normal size but tightly packed
- Merged blob effect emerges organically from overlapping circles
- Style label: "Style Name (count)" centered above cluster, 14px bold white text with dark outline

### Transition Animation
- Duration: 300ms
- Easing: Ease-in-out
- Interpolation formula:
  - At zoom ≤ 0.8: compression = 1.0 (fully clustered)
  - At zoom ≥ 1.2: compression = 0.0 (fully expanded)
  - At zoom 0.8-1.2: linear interpolation
- Each musician: `position = clusterCenter + (actualPosition - clusterCenter) × (0.15 + 0.85 × (1 - compression))`

### Cluster Sizing
- Base cluster radius: 80px (minimum for small clusters)
- Cluster center: weighted average of all musician positions in that style
- Cluster compression creates visual density without needing explicit cluster rendering

## Implementation Details

### New Utility Function

```typescript
// src/utils/layout.ts
export interface StyleCluster {
  center: Position2D;
  musicianIds: string[];
  count: number;
}

export function computeStyleClusters(
  musicians: Musician[],
  positions: InfluenceLayout,
  styleZones: StyleZone[]
): Record<string, StyleCluster> {
  // Compute cluster centers as weighted average of musician positions
  // Returns map of style -> cluster data
}
```

### InfluenceView Modifications

**State:**
- Add `clusterCompression` state (0-1) based on current zoom level
- Computed from `deckVS.zoom` with thresholds at 0.8 and 1.2

**Layer Updates:**
- Modify `ScatterplotLayer.getPosition` to interpolate positions based on `clusterCompression`
- Modify `IconLayer.getPosition` for photos (same interpolation)
- Modify `TextLayer` data and positions for musician labels

**New Layer:**
- Add `TextLayer` for cluster labels (only visible when compression > 0.5)
- Positioned at cluster centers with offset

**Performance:**
- Cluster computation memoized with `useMemo`
- Recompute only when `displayMusicians` or `groupBy` changes
- Position interpolation is O(n) but simple math - fast for 1000+ musicians

### Layer Ordering (Bottom → Top)

1. Zone borders (existing)
2. Decade lines (existing)
3. Style cluster labels (new, zoom ≤ 1.0)
4. Lifespan/influence/played-with edges (existing, more visible at higher zoom)
5. Musician circles (existing, position interpolated)
6. Musician photos (existing, position interpolated)
7. Musician labels (existing, position interpolated)

## Edge Cases

### Small Clusters (1-2 musicians)
- Minimum 80px radius ensures visibility
- Still apply compression but maintain spacing

### Empty Styles
- Don't render clusters for styles with 0 visible musicians
- Gracefully handle missing cluster data

### Style Filter Active
- Filtered style cluster remains centered
- Other styles don't render (no musicians)

### Performance Optimization
- If needed at very low zoom: reduce circle count with LOD
- Current approach should handle 1000+ musicians efficiently
- Deck.gl ScatterplotLayer is optimized for this use case

### Zoom Initialization
- Handle `deckVS` being null during component mount
- Clamp compression factor to 0-1 range
- Default to expanded mode during initialization

## Testing

- Test with various musician counts: 1, 10, 100, 1000+
- Verify smooth zoom in/out transitions
- Check clusters reform correctly when filters change
- Confirm musician positions accurate when fully expanded
- Test with different groupBy modes (style, instrument)
- Verify style labels display correct counts
- Performance testing with pan/zoom at different speeds

## Success Criteria

- Clusters visually merge like a detailed heatmap at low zoom
- Smooth expansion animation feels natural and responsive
- Style labels clearly visible and accurate
- No performance degradation during transitions
- Individual musicians precisely positioned at high zoom
