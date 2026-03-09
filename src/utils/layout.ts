import type { Musician } from '../types';

export type Position2D = [number, number];

const MIN_YEAR = 1886;
const MAX_YEAR = 2026;

export type GroupBy = 'style' | 'instrument';

// Chronological/geographic style ordering — related styles are adjacent.
// Delta → Hill Country (North Mississippi) → rural South →
// Texas → Louisiana (Swamp → New Orleans) → up the river (Memphis) →
// Midwest (Kansas City) → Chicago → Urban → R&B/Detroit/Soul →
// West Coast/Jump → Piedmont (East Coast) → Jazz → British → Gospel
export const STYLE_ORDER = [
  'Delta Blues',
  'Hill Country Blues',
  'Country Blues',
  'Boogie Woogie',
  'Classic Blues',
  'Vaudeville Blues',
  'Texas Blues',
  'Swamp Blues',
  'New Orleans Blues',
  'Memphis Blues',
  'Kansas City Blues',
  'Chicago Blues',
  'Urban Blues',
  'Rythm and Blues',
  'Detroit Blues',
  'Soul Blues',
  'West Coast Blues',
  'Jump Blues',
  'Piedmont Blues',
  'Jazz',
  'British Blues',
  'Gospel',
];

// Primary instrument ordering (roughly by prevalence/era in blues)
export const INSTRUMENT_ORDER = [
  'Guitar',
  'Slide Guitar',
  'Banjo',
  'Fiddle',
  'Violin',
  'Harmonica',
  'Piano',
  'Organ',
  'Vocals',
  'Voice',
  'Bass',
  'Bass Guitar',
  'Drums',
  'Percussion',
  'Saxophone',
  'Trumpet',
  'Horns',
];

export function getYear(dateStr: string): number {
  return new Date(dateStr).getFullYear();
}

export interface InfluenceLayout {
  [id: string]: Position2D;
}

export interface StyleZone {
  style: string;
  /** World X of the left edge of this style's zone */
  x: number;
  /** World width of this style's zone */
  width: number;
}

export interface TreeLayoutResult {
  positions: InfluenceLayout;
  styleZones: StyleZone[];
}

/**
 * Convert a year to a world Y coordinate.
 * deck.gl OrthographicView: y+ = DOWN, so older year = larger positive y = screen bottom.
 */
export function yearToWorldY(year: number, halfH: number, height: number, padding = 100): number {
  const ny = (year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR);
  return halfH - padding - ny * (height - 2 * padding);
}

/** Extract the primary instrument from a compound string like "Guitar, Vocals" */
function primaryInstrument(instrument: string): string {
  return instrument.split(/[,\/]/)[0].trim() || 'Unknown';
}

export interface LayoutOptions {
  groupBy: GroupBy;
  scatter: boolean; // If true, use hash-based scatter; if false, use simple sorted lines
}

/**
 * Genealogy tree layout:
 *  - Y axis = activeFrom year (older at BOTTOM, newer at TOP)
 *  - X axis = grouped by blues style OR primary instrument, with genealogy tree within each zone
 */
export function computeTreeLayout(
  musicians: Musician[],
  width: number,
  height: number,
  options: LayoutOptions = { groupBy: 'style', scatter: true },
): TreeLayoutResult {
  const { groupBy, scatter } = options;
  const PADDING_X = 80;
  const PADDING_Y = 100;
  const halfW = width / 2;
  const halfH = height / 2;

  const getKey = (m: Musician) =>
    groupBy === 'style' ? m.bluesStyle : primaryInstrument(m.instrument);

  // Y: activeFrom year → world Y (y+ = DOWN: older = more positive = screen bottom)
  const yPos: Record<string, number> = {};
  musicians.forEach((m) => {
    yPos[m.id] = yearToWorldY(parseInt(m.activeFrom), halfH, height, PADDING_Y);
  });

  // Group musicians by the chosen key
  const byGroup: Record<string, Musician[]> = {};
  musicians.forEach((m) => {
    const key = getKey(m);
    if (!byGroup[key]) byGroup[key] = [];
    byGroup[key].push(m);
  });

  const ORDER = groupBy === 'style' ? STYLE_ORDER : INSTRUMENT_ORDER;

  // Ordered list of present groups (defined order first, then any unknowns)
  const presentGroups = [
    ...ORDER.filter((s) => byGroup[s]),
    ...Object.keys(byGroup).filter((s) => !ORDER.includes(s)),
  ];

  // Alias for the old variable names used below
  const byStyle = byGroup;
  const presentStyles = presentGroups;

  // Assign style zones: proportional to musician count, with a minimum fraction
  const totalMusicians = musicians.length;
  const usableWidth = width - 2 * PADDING_X;
  const minFraction = 0.5 / presentStyles.length; // minimum half an "equal share"

  const rawFractions = presentStyles.map((s) =>
    Math.max(minFraction, (byStyle[s]?.length ?? 0) / totalMusicians)
  );
  const totalFraction = rawFractions.reduce((s, f) => s + f, 0);

  let xCursor = -halfW + PADDING_X;
  const styleZoneMap: Record<string, [number, number]> = {}; // [start, end]
  const styleZones: StyleZone[] = [];

  presentStyles.forEach((style, i) => {
    const zoneW = (rawFractions[i] / totalFraction) * usableWidth;
    styleZoneMap[style] = [xCursor, xCursor + zoneW];
    styleZones.push({ style, x: xCursor, width: zoneW });
    xCursor += zoneW;
  });

  // Within each style zone, compute genealogy tree X positions
  const xPos: Record<string, number> = {};

  // Deterministic hash for consistent "random" positioning based on musician ID
  const hash = (str: string) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return (h & 0x7fffffff) / 0x7fffffff; // 0 to 1
  };

  // First pass: initial positions
  // - scatter=true: hash-based scatter for organic distribution
  // - scatter=false: sorted by year, evenly spaced in straight lines
  presentStyles.forEach((style) => {
    const group = byStyle[style];
    if (!group) return;
    const [zoneStart, zoneEnd] = styleZoneMap[style];
    const zoneWidth = zoneEnd - zoneStart;
    const zoneMargin = zoneWidth * 0.08;
    const zoneUsable = zoneWidth - 2 * zoneMargin;

    if (scatter) {
      // Hash-based scatter
      group.forEach((m) => {
        xPos[m.id] = zoneStart + zoneMargin + hash(m.id) * zoneUsable;
      });
    } else {
      // Sorted by year, evenly spaced
      const sorted = [...group].sort((a, b) => parseInt(a.activeFrom) - parseInt(b.activeFrom));
      const step = zoneUsable / Math.max(1, sorted.length - 1);
      sorted.forEach((m, i) => {
        xPos[m.id] = zoneStart + zoneMargin + (sorted.length === 1 ? zoneUsable / 2 : i * step);
      });
    }
  });

  // Second pass: pull musicians toward their cross-style influences
  // This creates clustering where related musicians across styles are closer
  const allInfluenceLinks: { from: string; to: string }[] = [];
  musicians.forEach((m) => {
    m.influences.forEach((infId) => {
      if (xPos[infId] !== undefined) {
        allInfluenceLinks.push({ from: infId, to: m.id });
      }
    });
  });

  // Apply force-directed adjustment (simplified: just average toward connections)
  for (let iter = 0; iter < 3; iter++) {
    const pulls: Record<string, number[]> = {};

    allInfluenceLinks.forEach(({ from, to }) => {
      const fromStyle = musicians.find(m => m.id === from)?.bluesStyle;
      const toStyle = musicians.find(m => m.id === to)?.bluesStyle;

      // Only pull if in different styles (cross-style relationship)
      if (fromStyle && toStyle && fromStyle !== toStyle) {
        if (!pulls[from]) pulls[from] = [];
        if (!pulls[to]) pulls[to] = [];
        pulls[from].push(xPos[to]);
        pulls[to].push(xPos[from]);
      }
    });

    // Apply pulls with damping
    Object.entries(pulls).forEach(([id, targets]) => {
      if (targets.length === 0) return;
      const m = musicians.find(x => x.id === id);
      if (!m) return;

      const style = groupBy === 'style' ? m.bluesStyle : primaryInstrument(m.instrument);
      const [zoneStart, zoneEnd] = styleZoneMap[style] || [0, 0];
      const zoneMargin = (zoneEnd - zoneStart) * 0.08;

      const avgTarget = targets.reduce((a, b) => a + b, 0) / targets.length;
      const current = xPos[id];
      // Pull 20% toward average of connected musicians
      const newX = current * 0.8 + avgTarget * 0.2;
      // Clamp to zone
      xPos[id] = Math.max(zoneStart + zoneMargin, Math.min(zoneEnd - zoneMargin, newX));
    });
  }

  // Third pass: within-style genealogy adjustment
  presentStyles.forEach((style) => {
    const group = byStyle[style];
    if (!group) return;
    const [zoneStart, zoneEnd] = styleZoneMap[style];
    const inStyle = new Set(group.map((m) => m.id));

    // Build intra-style children map
    const childrenOf: Record<string, string[]> = {};
    group.forEach((m) => { childrenOf[m.id] = []; });
    group.forEach((m) => {
      m.influences.forEach((infId) => {
        if (inStyle.has(infId) && childrenOf[infId]) {
          childrenOf[infId].push(m.id);
        }
      });
    });

    // Sort by year and pull parents toward children
    const sortedByYear = [...group].sort((a, b) => parseInt(a.activeFrom) - parseInt(b.activeFrom));
    const reverseChronological = [...sortedByYear].reverse();

    reverseChronological.forEach((m) => {
      const ch = childrenOf[m.id] ?? [];
      if (ch.length === 0) return;

      const avgChildX = ch.reduce((s, c) => s + xPos[c], 0) / ch.length;
      xPos[m.id] = avgChildX * 0.6 + xPos[m.id] * 0.4;
    });

    // Final clamp
    const zoneMargin = (zoneEnd - zoneStart) * 0.05;
    group.forEach((m) => {
      xPos[m.id] = Math.max(zoneStart + zoneMargin, Math.min(zoneEnd - zoneMargin, xPos[m.id]));
    });
  });

  const positions: InfluenceLayout = {};
  musicians.forEach((m) => {
    positions[m.id] = [xPos[m.id] ?? 0, yPos[m.id] ?? 0];
  });

  return { positions, styleZones };
}

export interface DecadeTick {
  year: number;
  y: number;
}

export function computeDecadeTicks(
  halfH: number,
  height: number,
  padding = 100
): DecadeTick[] {
  const ticks: DecadeTick[] = [];
  for (let year = 1890; year <= 2020; year += 10) {
    const ny = (year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR);
    const y = halfH - padding - ny * (height - 2 * padding);
    ticks.push({ year, y });
  }
  return ticks;
}

export function bezierPath(p0: Position2D, p1: Position2D, numPts = 32): Position2D[] {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const cx = (p0[0] + p1[0]) / 2 + dy * 0.22;
  const cy = (p0[1] + p1[1]) / 2 - dx * 0.04;

  const path: Position2D[] = [];
  for (let i = 0; i <= numPts; i++) {
    const t = i / numPts;
    path.push([
      (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * cx + t ** 2 * p1[0],
      (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * cy + t ** 2 * p1[1],
    ]);
  }
  return path;
}
