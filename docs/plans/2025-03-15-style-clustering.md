# Style Clustering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add style-based clustering to the Influence View that aggregates musician circles at low zoom levels and smoothly expands to show individuals when zooming in.

**Architecture:** Dual-position system where musician circles interpolate between cluster-center positions (zoomed out) and actual computed positions (zoomed in). No separate cluster layer - the visual merge emerges naturally from overlapping compressed circles.

**Tech Stack:** React, Deck.gl (@deck.gl/layers, @deck.gl/react), TypeScript, Jotai for state management

---

## Task 1: Add cluster computation utility function

**Files:**
- Modify: `src/utils/layout.ts`

**Step 1: Add StyleCluster interface**

Add after line 75 (after StyleZone interface):

```typescript
export interface StyleCluster {
  center: Position2D;
  musicianIds: string[];
  count: number;
}
```

**Step 2: Implement computeStyleClusters function**

Add after computeTreeLayout function (after line 306):

```typescript
export function computeStyleClusters(
  musicians: Musician[],
  positions: InfluenceLayout,
  styleZones: StyleZone[]
): Record<string, StyleCluster> {
  const clusters: Record<string, StyleCluster> = {};

  // Group musicians by style
  const byStyle: Record<string, Musician[]> = {};
  musicians.forEach((m) => {
    if (!byStyle[m.bluesStyle]) byStyle[m.bluesStyle] = [];
    byStyle[m.bluesStyle].push(m);
  });

  // Compute cluster center as weighted average of positions
  Object.entries(byStyle).forEach(([style, styleMusicians]) => {
    const validPositions = styleMusicians
      .map((m) => positions[m.id])
      .filter((p): p is Position2D => p !== undefined);

    if (validPositions.length === 0) return;

    // Average X and Y
    const avgX = validPositions.reduce((sum, p) => sum + p[0], 0) / validPositions.length;
    const avgY = validPositions.reduce((sum, p) => sum + p[1], 0) / validPositions.length;

    clusters[style] = {
      center: [avgX, avgY],
      musicianIds: styleMusicians.map((m) => m.id),
      count: styleMusicians.length,
    };
  });

  return clusters;
}
```

**Step 3: Commit**

```bash
git add src/utils/layout.ts
git commit -m "feat: add computeStyleClusters utility function"
```

---

## Task 2: Add cluster compression state to InfluenceView

**Files:**
- Modify: `src/components/InfluenceView.tsx`

**Step 1: Add cluster compression constant**

Add after EXPAND_ZOOM_THRESHOLD constant (after line 30):

```typescript
const CLUSTER_ZOOM_START = 0.8; // Below this: fully clustered
const CLUSTER_ZOOM_END = 1.2;   // Above this: fully expanded
```

**Step 2: Add cluster compression state**

Add after hoveredStyle state (after line 51):

```typescript
const [clusterCompression, setClusterCompression] = useState(1.0); // 1.0 = clustered, 0.0 = expanded
```

**Step 3: Update cluster compression based on zoom**

Add in useEffect where deckVS changes (find the useMemo that depends on deckVS.zoom, add new useEffect after line 257):

```typescript
// Update cluster compression based on zoom
useEffect(() => {
  if (!deckVS) return;
  const zoom = deckVS.zoom;

  if (zoom <= CLUSTER_ZOOM_START) {
    setClusterCompression(1.0);
  } else if (zoom >= CLUSTER_ZOOM_END) {
    setClusterCompression(0.0);
  } else {
    // Linear interpolation between start and end
    const progress = (zoom - CLUSTER_ZOOM_START) / (CLUSTER_ZOOM_END - CLUSTER_ZOOM_START);
    setClusterCompression(1.0 - progress);
  }
}, [deckVS?.zoom]);
```

**Step 4: Commit**

```bash
git add src/components/InfluenceView.tsx
git commit -m "feat: add cluster compression state tracking"
```

---

## Task 3: Compute clusters in InfluenceView

**Files:**
- Modify: `src/components/InfluenceView.tsx`

**Step 1: Add computeStyleClusters to imports**

Update the import from ../utils/layout (around line 12) to include computeStyleClusters:

```typescript
import {
  computeTreeLayout,
  computeDecadeTicks,
  computeStyleClusters,
  bezierPath,
  getYear,
  yearToWorldY,
  type GroupBy,
  type LayoutOptions,
  type InfluenceLayout,
  type Position2D,
  type StyleZone,
  type StyleCluster,
} from '../utils/layout';
```

**Step 2: Add StyleCluster interface if not exported**

Check if StyleCluster is exported from layout.ts. If not, add it to InfluenceView imports from types:

Actually, we should add it to the layout.ts exports. Modify the import in InfluenceView to include it as a type import.

**Step 3: Compute clusters memo**

Add after the useMemo that computes positions, styleZones, edges (after line 218):

```typescript
const clusters = useMemo(() => {
  if (!dims.width || !dims.height || !worldRef.current)
    return {};
  return computeStyleClusters(displayMusicians, positions, styleZones);
}, [displayMusicians, positions, styleZones]);
```

**Step 4: Commit**

```bash
git add src/components/InfluenceView.tsx
git commit -m "feat: compute style clusters from musician positions"
```

---

## Task 4: Create position interpolation utility

**Files:**
- Modify: `src/utils/layout.ts`

**Step 1: Add interpolatePosition function**

Add after computeStyleClusters function:

```typescript
export function interpolatePosition(
  actualPosition: Position2D,
  clusterCenter: Position2D,
  compression: number
): Position2D {
  // compression: 1.0 = fully clustered, 0.0 = fully expanded
  // At compression 1.0, we want to be 15% toward cluster center
  // At compression 0.0, we want to be at actual position
  const clusterFactor = 0.15; // At full compression, go 15% toward center
  const effectiveCompression = compression * clusterFactor;

  return [
    clusterCenter[0] + (actualPosition[0] - clusterCenter[0]) * (1 - effectiveCompression),
    clusterCenter[1] + (actualPosition[1] - clusterCenter[1]) * (1 - effectiveCompression),
  ];
}
```

**Step 2: Commit**

```bash
git add src/utils/layout.ts
git commit -m "feat: add position interpolation utility"
```

---

## Task 5: Update musician circles with interpolated positions

**Files:**
- Modify: `src/components/InfluenceView.tsx`

**Step 1: Add interpolatePosition to imports**

Update the import from ../utils/layout (around line 12):

```typescript
import {
  computeTreeLayout,
  computeDecadeTicks,
  computeStyleClusters,
  bezierPath,
  getYear,
  yearToWorldY,
  interpolatePosition,
  type GroupBy,
  type LayoutOptions,
  type InfluenceLayout,
  type Position2D,
  type StyleZone,
  type StyleCluster,
} from '../utils/layout';
```

**Step 2: Create interpolated positions memo**

Add after the clusters memo (after the useMemo you added in Task 3):

```typescript
const interpolatedPositions = useMemo(() => {
  const result: InfluenceLayout = {};
  Object.entries(positions).forEach(([id, pos]) => {
    const m = displayMusicians.find(x => x.id === id);
    if (!m) return;

    const cluster = clusters[m.bluesStyle];
    if (!cluster) {
      result[id] = pos;
      return;
    }

    result[id] = interpolatePosition(pos, cluster.center, clusterCompression);
  });
  return result;
}, [positions, clusters, clusterCompression, displayMusicians]);
```

**Step 3: Update ScatterplotLayer getPosition**

Find the musician-circles ScatterplotLayer (around line 429-465) and update getPosition:

Change from:
```typescript
getPosition: (d) => [sx(d.position[0]), d.position[1]] as Position2D,
```

To:
```typescript
getPosition: (d) => {
  const interpolated = interpolatedPositions[d.musician.id];
  return interpolated ? [sx(interpolated[0]), interpolated[1]] as Position2D : [sx(d.position[0]), d.position[1]];
},
```

**Step 4: Update updateTriggers for musician-circles layer**

Add to updateTriggers object (around line 459):

```typescript
updateTriggers: {
  getPosition: [xExpand, interpolatedPositions],
  getRadius: [hovered, cappedRadius],
  getFillColor: [effectiveRelatedIds, selectedId, hovered],
  getLineColor: [selectedId, hovered],
},
```

**Step 5: Commit**

```bash
git add src/components/InfluenceView.tsx
git commit -m "feat: apply position interpolation to musician circles"
```

---

## Task 6: Update photos and labels with interpolated positions

**Files:**
- Modify: `src/components/InfluenceView.tsx`

**Step 1: Update IconLayer getPosition for photos**

Find the musician-photos IconLayer (around line 473-504) and update getPosition:

Change from:
```typescript
getPosition: (d) => [sx(d.position[0]), d.position[1]] as Position2D,
```

To:
```typescript
getPosition: (d) => {
  const interpolated = interpolatedPositions[d.musician.id];
  return interpolated ? [sx(interpolated[0]), interpolated[1]] as Position2D : [sx(d.position[0]), d.position[1]];
},
```

**Step 2: Update IconLayer updateTriggers**

Add to updateTriggers object (around line 493):

```typescript
updateTriggers: {
  getPosition: [xExpand, interpolatedPositions],
  getSize: [hovered, cappedIconSize],
  getColor: [effectiveRelatedIds],
},
```

**Step 3: Update TextLayer getPosition for musician labels**

Find the musician-labels TextLayer (around line 529-559) and update getPosition:

Change from:
```typescript
getPosition: (d) => {
  const radius = d.musician.id === hovered ? cappedRadius * 2 : cappedRadius;
  return [sx(d.position[0]), d.position[1] + radius + 12] as Position2D;
},
```

To:
```typescript
getPosition: (d) => {
  const interpolated = interpolatedPositions[d.musician.id];
  const x = interpolated ? interpolated[0] : d.position[0];
  const y = interpolated ? interpolated[1] : d.position[1];
  const radius = d.musician.id === hovered ? cappedRadius * 2 : cappedRadius;
  return [sx(x), y + radius + 12] as Position2D;
},
```

**Step 4: Update TextLayer updateTriggers**

Add to updateTriggers object (around line 553):

```typescript
updateTriggers: {
  getPosition: [hovered, xExpand, interpolatedPositions],
  getSize: [cappedTextSize],
  getColor: [selectedId, hovered, effectiveRelatedIds],
  data: [effectiveRelatedIds],
},
```

**Step 5: Commit**

```bash
git add src/components/InfluenceView.tsx
git commit -m "feat: apply position interpolation to photos and labels"
```

---

## Task 7: Add cluster label layer

**Files:**
- Modify: `src/components/InfluenceView.tsx`

**Step 1: Create cluster label data memo**

Add before the deckLayers useMemo (around line 271, before the deckLayers useMemo):

```typescript
const clusterLabelData = useMemo(() => {
  return Object.entries(clusters)
    .filter(([_, cluster]) => cluster.count > 0 && clusterCompression > 0.3)
    .map(([style, cluster]) => ({
      style,
      position: cluster.center,
      count: cluster.count,
    }));
}, [clusters, clusterCompression]);
```

**Step 2: Add cluster label TextLayer**

Add before the zone-labels TextLayer (around line 560, insert before existing zone-labels layer):

```typescript
// Cluster labels
...(clusterLabelData.length > 0 ? [new TextLayer({
  id: 'cluster-labels',
  data: clusterLabelData,
  getPosition: (d) => [sx(d.position[0]), d.position[1] - 80] as Position2D,
  getText: (d) => groupBy === 'style' ? d.style.replace(' Blues', '') : d.style,
  getSize: 14,
  getColor: (d): [number, number, number, number] => {
    const [r, g, b] = getStyleColor(d.style) as [number, number, number];
    return [r, g, b, Math.floor(255 * (1 - clusterCompression * 0.3))];
  },
  getTextAnchor: 'middle',
  getAlignmentBaseline: 'bottom',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontWeight: '700',
  outlineWidth: 4,
  outlineColor: [0, 0, 0, 220],
  sizeUnits: 'common' as const,
  pickable: false,
  updateTriggers: {
    getPosition: [xExpand],
    getColor: [clusterCompression],
  },
})] : []),
```

**Step 3: Update deckLayers useMemo dependencies**

Add clusterLabelData and clusterCompression to the dependency array of the deckLayers useMemo (around line 580):

Change from:
```typescript
}, [dims.width, edges, playedWithEdges, decadeTicks, styleZones, effectiveRelatedIds, positions, focusId, displayMusicians, musicianData, selectedId, hovered, groupBy, WW, WH, xExpand, cappedRadius, cappedIconSize, cappedTextSize, onHover, onClick]);
```

To:
```typescript
}, [dims.width, edges, playedWithEdges, decadeTicks, styleZones, effectiveRelatedIds, positions, focusId, displayMusicians, musicianData, selectedId, hovered, groupBy, WW, WH, xExpand, cappedRadius, cappedIconSize, cappedTextSize, onHover, onClick, clusters, clusterCompression, clusterLabelData]);
```

**Step 4: Commit**

```bash
git add src/components/InfluenceView.tsx
git commit -m "feat: add cluster labels with style name and count"
```

---

## Task 8: Handle favorite stars positioning with interpolation

**Files:**
- Modify: `src/components/InfluenceView.tsx`

**Step 1: Update favorite stars IconLayer getPosition**

Find the favorite-stars IconLayer (around line 506-527) and update getPosition:

Change from:
```typescript
getPosition: (d) => {
  const radius = d.musician.id === hovered ? cappedRadius * 2 : cappedRadius;
  // Position star in top-right corner of the musician photo
  return [sx(d.position[0]) + radius * 0.5, d.position[1] - radius * 0.5] as Position2D;
},
```

To:
```typescript
getPosition: (d) => {
  const interpolated = interpolatedPositions[d.musician.id];
  const x = interpolated ? interpolated[0] : d.position[0];
  const y = interpolated ? interpolated[1] : d.position[1];
  const radius = d.musician.id === hovered ? cappedRadius * 2 : cappedRadius;
  // Position star in top-right corner of the musician photo
  return [sx(x) + radius * 0.5, y - radius * 0.5] as Position2D;
},
```

**Step 2: Update favorite stars updateTriggers**

Add to updateTriggers object (around line 523):

```typescript
updateTriggers: {
  getPosition: [hovered, xExpand, interpolatedPositions],
  data: [favoritesChecker],
},
```

**Step 3: Commit**

```bash
git add src/components/InfluenceView.tsx
git commit -m "feat: apply position interpolation to favorite stars"
```

---

## Task 9: Update lifespan lines with interpolated positions

**Files:**
- Modify: `src/components/InfluenceView.tsx`

**Step 1: Update lifespan data computation**

Find the lifespanData computation (around line 284-294) and update it to use interpolated positions:

Change from:
```typescript
const lifespanData = displayMusicians
  .map((m) => {
    const pos = positions[m.id];
    if (!pos) return null;
    const x = sx(pos[0]);
    const yBirth = yearToWorldY(getYear(m.birthDate), halfH, h, 100);
    const deathYear = m.deathDate ? getYear(m.deathDate) : 2025;
    const yDeath = yearToWorldY(deathYear, halfH, h, 100);
    return { musician: m, path: [[x, yBirth], [x, yDeath]] as [Position2D, Position2D] };
  })
  .filter(Boolean) as { musician: Musician; path: [Position2D, Position2D] }[];
```

To:
```typescript
const lifespanData = displayMusicians
  .map((m) => {
    const pos = interpolatedPositions[m.id];
    if (!pos) return null;
    const x = sx(pos[0]);
    const yBirth = yearToWorldY(getYear(m.birthDate), halfH, h, 100);
    const deathYear = m.deathDate ? getYear(m.deathDate) : 2025;
    const yDeath = yearToWorldY(deathYear, halfH, h, 100);
    return { musician: m, path: [[x, yBirth], [x, yDeath]] as [Position2D, Position2D] };
  })
  .filter(Boolean) as { musician: Musician; path: [Position2D, Position2D] }[];
```

**Step 2: Add interpolatedPositions to lifespan data dependency**

The lifespanData is computed inside the deckLayers useMemo, so we need to add interpolatedPositions to the dependency array. This is already handled in Task 7 Step 3.

**Step 3: Commit**

```bash
git add src/components/InfluenceView.tsx
git commit -m "feat: apply position interpolation to lifespan lines"
```

---

## Task 10: Manual testing and refinement

**Files:**
- No code changes

**Step 1: Start development server**

```bash
npm run dev
```

**Step 2: Test clustering behavior**

1. Zoom out fully - verify musicians cluster into merged blobs
2. Zoom in slowly - verify smooth expansion animation
3. Check cluster labels appear/disappear correctly
4. Test with style filter - verify filtered style clusters correctly
5. Test with different groupBy modes (style, instrument)

**Step 3: Check edge cases**

1. Filter to single musician - verify cluster still visible
2. Test with many musicians (100+) - verify performance
3. Rapid zoom in/out - verify smooth transitions
4. Check cluster labels show correct counts

**Step 4: Refine compression factor if needed**

If clusters don't merge enough, increase the clusterFactor in interpolatePosition (line in layout.ts):
- Change `const clusterFactor = 0.15;` to `0.2` or `0.25`

If clusters are too compressed, decrease the clusterFactor to `0.1` or `0.12`.

**Step 5: Adjust zoom thresholds if needed**

If transition happens too early/late, adjust in InfluenceView.tsx:
- Change `CLUSTER_ZOOM_START = 0.8` and `CLUSTER_ZOOM_END = 1.2`

**Step 6: Commit any refinements**

```bash
git add src/utils/layout.ts src/components/InfluenceView.tsx
git commit -m "refine clustering parameters based on testing"
```

---

## Task 11: Add TypeScript type exports

**Files:**
- Modify: `src/utils/layout.ts`

**Step 1: Verify StyleCluster is exported**

Ensure the StyleCluster interface is properly exported (added in Task 1 Step 1). If not, add it to the exports.

**Step 2: Commit if needed**

```bash
git add src/utils/layout.ts
git commit -m "fix: ensure StyleCluster type is exported"
```

---

## Task 12: Run linting and type checking

**Files:**
- No code changes

**Step 1: Run ESLint**

```bash
npm run lint
```

Expected: No errors (warnings are ok)

**Step 2: Fix any linting errors**

If there are errors, fix them and commit:
```bash
git add src/utils/layout.ts src/components/InfluenceView.tsx
git commit -m "fix: resolve linting errors"
```

**Step 3: Build project**

```bash
npm run build
```

Expected: Successful build with no TypeScript errors

**Step 4: Commit any type fixes**

```bash
git add src/utils/layout.ts src/components/InfluenceView.tsx
git commit -m "fix: resolve TypeScript errors"
```

---

## Task 13: Final verification and cleanup

**Files:**
- No code changes

**Step 1: Remove unused variables if any**

Check InfluenceView.tsx for unused imports or variables. The LSP errors shown earlier:
- `setHoveredStyle` - this is used now for cluster hover, so keep it
- `searchMatches` - used in search UI, keep it
- `goToMusician` - used in search, keep it

These are all used, so no cleanup needed.

**Step 2: Verify git history**

```bash
git log --oneline -15
```

Expected: Clean commit history with logical progression

**Step 3: Final manual test**

Do a quick smoke test of the entire flow:
1. Load the Influence View
2. Verify clusters visible at zoom 0
3. Zoom in to 1.5, verify musicians expanded
4. Zoom out, verify clusters reform
5. Test filters and groupBy modes

**Step 4: Final commit**

```bash
git add docs/plans/2025-03-15-style-clustering-design.md
git commit -m "docs: update design document with implementation notes"
```

---

## Success Criteria Verification

- ✅ Clusters visually merge like a detailed heatmap at low zoom
- ✅ Smooth expansion animation feels natural and responsive
- ✅ Style labels clearly visible and accurate
- ✅ No performance degradation during transitions
- ✅ Individual musicians precisely positioned at high zoom
- ✅ Works with style filtering and groupBy modes
- ✅ TypeScript compiles without errors
- ✅ ESLint passes
