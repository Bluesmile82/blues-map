import type { Musician } from '../types';
import {
  forceSimulation,
  forceCollide,
  forceLink,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from 'd3';

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

export interface StyleCluster {
  center: Position2D;
  musicianIds: string[];
  count: number;
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
  naturalPositions?: boolean; // If true, disable style zone constraints in force layout
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

  // --- D3 force simulation ---
  // Spreads nodes apart within each style zone, using same-style influence/playedWith
  // links to cluster related musicians together. Y is anchored strongly to year.
  interface ForceNode extends SimulationNodeDatum {
    id: string;
    targetY: number;
    zoneStart: number;
    zoneEnd: number;
    zoneMargin: number;
  }

  const musicianById: Record<string, Musician> = {};
  musicians.forEach((m) => { musicianById[m.id] = m; });

  const simNodes: ForceNode[] = musicians.map((m) => {
    const key = groupBy === 'style' ? m.bluesStyle : primaryInstrument(m.instrument);
    const [zStart = 0, zEnd = 0] = styleZoneMap[key] ?? [0, 0];
    const zw = zEnd - zStart;
    return {
      id: m.id,
      x: xPos[m.id],
      y: yPos[m.id],
      targetY: yPos[m.id],
      zoneStart: zStart,
      zoneEnd: zEnd,
      zoneMargin: zw * 0.06,
    };
  });

  // Same-group links only unless naturalPositions is enabled
  const simLinks: { source: string; target: string }[] = [];
  const seenLinks = new Set<string>();
  musicians.forEach((m) => {
    const keyM = groupBy === 'style' ? m.bluesStyle : primaryInstrument(m.instrument);
    [...m.influences, ...m.playedWith].forEach((peerId) => {
      const peer = musicianById[peerId];
      if (!peer) return;
      // Skip cross-group links unless naturalPositions is enabled
      if (!options.naturalPositions) {
        const keyP = groupBy === 'style' ? peer.bluesStyle : primaryInstrument(peer.instrument);
        if (keyP !== keyM) return;
      }
      const edgeKey = peerId < m.id ? `${peerId}\0${m.id}` : `${m.id}\0${peerId}`;
      if (seenLinks.has(edgeKey)) return;
      seenLinks.add(edgeKey);
      simLinks.push({ source: m.id, target: peerId });
    });
  });

  const COLLIDE_R = 60;

  // In naturalPositions mode, only use link force (relationships), no scattering
  const useCollision = !options.naturalPositions;
  const useSoftCenterX = !options.naturalPositions;

  const simulation = forceSimulation<ForceNode>(simNodes)
    // Push overlapping nodes apart (disabled in naturalPositions)
    .force('collide', useCollision ? forceCollide<ForceNode>(COLLIDE_R).strength(1).iterations(5) : null)
    // Pull connected musicians toward each other (only force in naturalPositions)
    .force(
      'link',
      forceLink<ForceNode, { source: string; target: string }>(simLinks)
        .id((d) => d.id)
        .distance(options.naturalPositions ? COLLIDE_R * 3 : COLLIDE_R * 2.5)
        .strength(options.naturalPositions ? 0.5 : 0.05),
    )
    // Y anchor — keeps each musician pinned to their year on the timeline
    .force('anchorY', forceY<ForceNode>((d) => d.targetY).strength(options.naturalPositions ? 0.95 : 0.8))
    // Soft pull toward zone center to prevent drifting to edges (disabled when naturalPositions)
    .force('softCenterX', useSoftCenterX ? forceX<ForceNode>((d) => (d.zoneStart + d.zoneEnd) / 2).strength(0.02) : null)
    .alphaDecay(0.02)
    .stop();

  // Run synchronously, clamping X to zone boundaries after every tick (unless naturalPositions)
  for (let t = 0; t < 300; t++) {
    simulation.tick();
    if (!options.naturalPositions) {
      simNodes.forEach((node) => {
        node.x = Math.max(
          node.zoneStart + node.zoneMargin,
          Math.min(node.zoneEnd - node.zoneMargin, node.x ?? 0),
        );
      });
    }
  }

  // Write simulation X results back; keep original year-based Y exact
  simNodes.forEach((node) => {
    xPos[node.id] = node.x ?? xPos[node.id];
  });

  const positions: InfluenceLayout = {};
  musicians.forEach((m) => {
    positions[m.id] = [xPos[m.id] ?? 0, yPos[m.id] ?? 0];
  });

  return { positions, styleZones };
}

/**
 * Compute style clusters from musicians and their positions.
 * @precondition musicians must be an array of Musician objects
 * @precondition positions must be an InfluenceLayout object mapping musician IDs to positions
 */
export function computeStyleClusters(
  musicians: Musician[],
  positions: InfluenceLayout,
  // styleZones: reserved for future zone-based clustering
  _styleZones: StyleZone[]
): Record<string, StyleCluster> {
  const clusters: Record<string, StyleCluster> = {};

  // Group musicians by style
  const byStyle: Record<string, Musician[]> = {};
  musicians.forEach((m) => {
    if (!m.bluesStyle) return;
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

/**
 * Compute instrument clusters from musicians and their positions.
 * @precondition musicians must be an array of Musician objects
 * @precondition positions must be an InfluenceLayout object mapping musician IDs to positions
 */
export function computeInstrumentClusters(
  musicians: Musician[],
  positions: InfluenceLayout
): Record<string, StyleCluster> {
  const clusters: Record<string, StyleCluster> = {};

  // Group musicians by instrument
  const byInstrument: Record<string, Musician[]> = {};
  musicians.forEach((m) => {
    if (!m.instrument) return;
    if (!byInstrument[m.instrument]) byInstrument[m.instrument] = [];
    byInstrument[m.instrument].push(m);
  });

  // Compute cluster center as weighted average of positions
  Object.entries(byInstrument).forEach(([instrument, instrumentMusicians]) => {
    const validPositions = instrumentMusicians
      .map((m) => positions[m.id])
      .filter((p): p is Position2D => p !== undefined);

    if (validPositions.length === 0) return;

    // Average X and Y
    const avgX = validPositions.reduce((sum, p) => sum + p[0], 0) / validPositions.length;
    const avgY = validPositions.reduce((sum, p) => sum + p[1], 0) / validPositions.length;

    clusters[instrument] = {
      center: [avgX, avgY],
      musicianIds: instrumentMusicians.map((m) => m.id),
      count: instrumentMusicians.length,
    };
  });

  return clusters;
}


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
