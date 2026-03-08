import type { Musician } from '../types';

export type Position2D = [number, number];

const MIN_YEAR = 1886;
const MAX_YEAR = 2026;

export type GroupBy = 'style' | 'instrument';

// Chronological/geographic style ordering — related styles are adjacent
export const STYLE_ORDER = [
  'Delta Blues',
  'Mississippi Blues',
  'Boogie Woogie',
  'Country Blues',
  'Classic Blues',
  'Vaudeville Blues',
  'Texas Blues',
  'Memphis Blues',
  'Chicago Blues',
  'Rythm and Blues',
  'Detroit Blues',
  'Electric Blues',
  'Soul Blues',
  'West Coast Blues',
  'Jump Blues',
  'Piedmont Blues',
  'Jazz',
  'British Blues',
  'Gospel'
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

/**
 * Genealogy tree layout:
 *  - Y axis = activeFrom year (older at BOTTOM, newer at TOP)
 *  - X axis = grouped by blues style OR primary instrument, with genealogy tree within each zone
 */
export function computeTreeLayout(
  musicians: Musician[],
  width: number,
  height: number,
  groupBy: GroupBy = 'style',
): TreeLayoutResult {
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

  presentStyles.forEach((style) => {
    const group = byStyle[style];
    if (!group) return;
    const [zoneStart, zoneEnd] = styleZoneMap[style];
    const inStyle = new Set(group.map((m) => m.id));
    const n = group.length;

    if (n === 1) {
      xPos[group[0].id] = (zoneStart + zoneEnd) / 2;
      return;
    }

    // Build intra-style "children" map: who does each musician influence within same style?
    // m.influences = IDs that influenced m, so childrenOf[inf] includes m
    const childrenOf: Record<string, string[]> = {};
    group.forEach((m) => { childrenOf[m.id] = []; });
    group.forEach((m) => {
      m.influences.forEach((infId) => {
        if (inStyle.has(infId) && childrenOf[infId]) {
          childrenOf[infId].push(m.id);
        }
      });
    });

    // Sort group by activeFrom year (oldest first)
    const sortedByYear = [...group].sort((a, b) => parseInt(a.activeFrom) - parseInt(b.activeFrom));

    // Assign evenly-spaced initial X positions within the zone
    const initialX: Record<string, number> = {};
    sortedByYear.forEach((m, i) => {
      initialX[m.id] = zoneStart + (i + 0.5) * (zoneEnd - zoneStart) / n;
    });

    // Genealogy tree pass: pull parent nodes toward the center of their children.
    // Process in reverse chronological order (newest/children first) so that by the
    // time we reach a parent, all its children already have their final X.
    const finalX: Record<string, number> = { ...initialX };
    const reverseChronological = [...sortedByYear].reverse();

    reverseChronological.forEach((m) => {
      const ch = childrenOf[m.id] ?? [];
      if (ch.length === 0) return; // leaf — keep initial X

      // Parent X = weighted average: 70% children center, 30% initial position
      // The blend prevents extreme displacement while still creating tree structure
      const avgChildX = ch.reduce((s, c) => s + finalX[c], 0) / ch.length;
      finalX[m.id] = avgChildX * 0.7 + initialX[m.id] * 0.3;
    });

    // Clamp to zone bounds (blending may push slightly outside)
    const margin = (zoneEnd - zoneStart) * 0.05;
    Object.keys(finalX).forEach((id) => {
      if (group.find((m) => m.id === id)) {
        finalX[id] = Math.max(zoneStart + margin, Math.min(zoneEnd - margin, finalX[id]));
      }
    });

    Object.assign(xPos, finalX);
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
