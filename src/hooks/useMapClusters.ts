import { useMemo, useState, useCallback } from 'react';
import Supercluster from 'supercluster';
import { forceSimulation, forceCollide, forceRadial } from 'd3';
import type { Musician } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ClusterPoint {
  type: 'musician';
  musician: Musician;
  /** Display position (may be spidered offset from actual coords) */
  position: [number, number];
  /** True if this point is part of an expanded spider */
  spidered: boolean;
}

export interface ClusterGroup {
  type: 'cluster';
  clusterId: number;
  position: [number, number];
  count: number;
  /** Representative blues style (most common in cluster) */
  bluesStyle: string;
  /** Distribution of blues styles in this cluster (style → count) */
  styleDistribution: Record<string, number>;
}

export interface SpiderLeg {
  source: [number, number];
  target: [number, number];
  musician: Musician;
}

export type ClusterItem = ClusterPoint | ClusterGroup;

// ── Spider layout (d3-force) ────────────────────────────────────────────────────

/**
 * Use d3-force to pack N circles tightly around a center with no overlap.
 * forceCollide prevents overlap, forceRadial pulls everything toward center.
 */
function forcePositions(
  center: [number, number],
  count: number,
  zoom: number
): { positions: [number, number][]; radiusPx: number } {
  if (count === 0) return { positions: [], radiusPx: 0 };
  if (count === 1) return { positions: [center], radiusPx: 12 };

  const degPerPx = 360 / (256 * Math.pow(2, zoom));
  const dotRadiusPx = 7; // tight fit — matches 10px dot radius + tiny gap

  // Run simulation in pixel space, then convert to degrees
  interface ForceNode { x: number; y: number; index?: number }
  const nodes: ForceNode[] = Array.from({ length: count }, (_, i) => {
    // Seed on a small circle so the simulation converges fast
    const angle = (2 * Math.PI * i) / count;
    const seedR = dotRadiusPx * 1.2;
    return { x: Math.cos(angle) * seedR, y: Math.sin(angle) * seedR };
  });

  const sim = forceSimulation<ForceNode>(nodes)
    .force('collide', forceCollide<ForceNode>(dotRadiusPx).iterations(6))
    .force('radial', forceRadial<ForceNode>(0, 0, 0).strength(0.25))
    .stop();

  // Run synchronously — 60 ticks is enough for convergence
  for (let i = 0; i < 60; i++) sim.tick();

  // Max pixel distance from center (computed before coordinate conversion)
  let maxDistPx = 0;
  for (const n of nodes) {
    maxDistPx = Math.max(maxDistPx, Math.sqrt(n.x * n.x + n.y * n.y));
  }
  const radiusPx = maxDistPx + dotRadiusPx + 4; // dot radius + padding

  const latCos = Math.cos(center[1] * Math.PI / 180);
  const positions = nodes.map((n) => [
    center[0] + n.x * degPerPx,
    center[1] + n.y * degPerPx / latCos,
  ] as [number, number]);

  return { positions, radiusPx };
}

// ── Coordinate snapping ────────────────────────────────────────────────────────

/** Threshold in degrees (~5 km) — musicians closer than this share a centroid */
const SNAP_THRESHOLD = 0.05;

/**
 * Snap nearby coordinates to a shared centroid so same-city musicians
 * with slightly different coords always cluster together.
 */
function snapCoordinates(musicians: Musician[]): Map<string, [number, number]> {
  const snapped = new Map<string, [number, number]>();
  const groups: { ids: string[]; lngs: number[]; lats: number[] }[] = [];

  for (const m of musicians) {
    const [lng, lat] = m.birthCoords;
    let merged = false;
    for (const g of groups) {
      // Compare against group centroid
      const cLng = g.lngs.reduce((a, b) => a + b, 0) / g.lngs.length;
      const cLat = g.lats.reduce((a, b) => a + b, 0) / g.lats.length;
      if (Math.abs(lng - cLng) < SNAP_THRESHOLD && Math.abs(lat - cLat) < SNAP_THRESHOLD) {
        g.ids.push(m.id);
        g.lngs.push(lng);
        g.lats.push(lat);
        merged = true;
        break;
      }
    }
    if (!merged) {
      groups.push({ ids: [m.id], lngs: [lng], lats: [lat] });
    }
  }

  for (const g of groups) {
    const centroid: [number, number] = [
      g.lngs.reduce((a, b) => a + b, 0) / g.lngs.length,
      g.lats.reduce((a, b) => a + b, 0) / g.lats.length,
    ];
    for (const id of g.ids) {
      snapped.set(id, centroid);
    }
  }
  return snapped;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

interface UseMapClustersOptions {
  musicians: Musician[];
  zoom: number;
  /** Map bounds: [westLng, southLat, eastLng, northLat] */
  bounds: [number, number, number, number] | null;
  /** Currently selected musician ID — always shown even if inside a cluster */
  selectedId: string | null;
  /** When set, only show musicians whose IDs are in this set */
  visibleIds?: Set<string> | null;
  /** Cluster radius in pixels (default 50) */
  clusterRadius?: number;
  /** Max zoom at which clusters are generated (default 14) */
  maxClusterZoom?: number;
}

export function useMapClusters({
  musicians,
  zoom,
  bounds,
  selectedId,
  visibleIds = null,
  clusterRadius = 50,
  maxClusterZoom = 14,
}: UseMapClustersOptions) {
  const [spideredClusterId, setSpideredClusterId] = useState<number | null>(null);

  // Snap nearby coordinates so same-city musicians share a centroid
  const snappedCoords = useMemo(() => snapCoordinates(musicians), [musicians]);

  // Build supercluster index using snapped coordinates
  const index = useMemo(() => {
    const sc = new Supercluster<{ musicianId: string }>({
      radius: clusterRadius,
      maxZoom: maxClusterZoom,
    });
    const features = musicians.map((m) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: snappedCoords.get(m.id) ?? m.birthCoords,
      },
      properties: { musicianId: m.id },
    }));
    sc.load(features);
    return sc;
  }, [musicians, snappedCoords, clusterRadius, maxClusterZoom]);

  // Musician lookup map
  const musicianMap = useMemo(() => {
    const map = new Map<string, Musician>();
    for (const m of musicians) map.set(m.id, m);
    return map;
  }, [musicians]);

  // Get clusters + points for current viewport
  const { clusters, points, spiderLegs, spiderRadiusPx } = useMemo(() => {
    if (!bounds) {
      return { clusters: [] as ClusterGroup[], points: [] as ClusterPoint[], spiderLegs: [] as SpiderLeg[], spiderRadiusPx: 0 };
    }

    const floorZoom = Math.floor(zoom);
    const raw = index.getClusters(bounds, floorZoom);

    const clusters: ClusterGroup[] = [];
    const points: ClusterPoint[] = [];
    const spiderLegs: SpiderLeg[] = [];
    let spiderRadiusPx = 0;

    for (const feature of raw) {
      const coords = feature.geometry.coordinates as [number, number];
      const props = feature.properties as Record<string, unknown>;

      if (props.cluster) {
        const clusterId = props.cluster_id as number;

        // If this cluster is spidered, expand it into individual points
        if (clusterId === spideredClusterId) {
          const allLeaves = index.getLeaves(clusterId, Infinity);
          const leaves = visibleIds ? allLeaves.filter(l => visibleIds.has(l.properties.musicianId)) : allLeaves;
          const center = coords;
          const { positions: spiderPositions, radiusPx: spiderR } = forcePositions(center, leaves.length, zoom);
          spiderRadiusPx = spiderR;

          for (let i = 0; i < leaves.length; i++) {
            const leaf = leaves[i];
            const musician = musicianMap.get(leaf.properties.musicianId);
            if (!musician) continue;
            const spiderPos = spiderPositions[i];
            points.push({
              type: 'musician',
              musician,
              position: spiderPos,
              spidered: true,
            });
            spiderLegs.push({
              source: center,
              target: spiderPos,
              musician,
            });
          }
        } else {
          const allLeaves = index.getLeaves(clusterId, Infinity);
          const visibleLeaves = visibleIds ? allLeaves.filter(l => visibleIds.has(l.properties.musicianId)) : allLeaves;

          // Skip cluster entirely if none of its members are visible
          if (visibleIds && visibleLeaves.length === 0) continue;

          // Check if the selected musician is inside this cluster — extract it
          let selectedExtracted = false;
          if (selectedId) {
            for (const leaf of visibleLeaves) {
              if (leaf.properties.musicianId === selectedId) {
                const musician = musicianMap.get(selectedId);
                if (musician) {
                  points.push({
                    type: 'musician',
                    musician,
                    position: coords,
                    spidered: false,
                  });
                  selectedExtracted = true;
                }
                break;
              }
            }
          }

          // Build style distribution from visible leaves only
          const styleCounts = new Map<string, number>();
          const sampleLeaves = visibleLeaves.slice(0, 20);
          for (const leaf of sampleLeaves) {
            const m = musicianMap.get(leaf.properties.musicianId);
            if (m) {
              styleCounts.set(m.bluesStyle, (styleCounts.get(m.bluesStyle) ?? 0) + 1);
            }
          }
          let topStyle = '';
          let topCount = 0;
          for (const [style, count] of styleCounts) {
            if (count > topCount) {
              topStyle = style;
              topCount = count;
            }
          }

          const visibleCount = visibleLeaves.length - (selectedExtracted ? 1 : 0);
          if (visibleCount <= 0) continue;

          // A cluster of 1 visible musician — extract as individual point instead
          if (visibleCount === 1) {
            const remaining = visibleLeaves.find(l => l.properties.musicianId !== selectedId);
            if (remaining) {
              const musician = musicianMap.get(remaining.properties.musicianId);
              if (musician) {
                points.push({ type: 'musician', musician, position: coords, spidered: false });
              }
            }
            continue;
          }

          clusters.push({
            type: 'cluster',
            clusterId,
            position: coords,
            count: visibleCount,
            bluesStyle: topStyle,
            styleDistribution: Object.fromEntries(styleCounts),
          });
        }
      } else {
        // Individual point (not clustered)
        const musician = musicianMap.get(props.musicianId as string);
        if (musician && (!visibleIds || visibleIds.has(musician.id))) {
          points.push({
            type: 'musician',
            musician,
            position: coords,
            spidered: false,
          });
        }
      }
    }

    return { clusters, points, spiderLegs, spiderRadiusPx };
  }, [index, bounds, zoom, spideredClusterId, musicianMap, selectedId, visibleIds]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const expandCluster = useCallback(
    (clusterId: number) => {
      setSpideredClusterId(clusterId);
    },
    []
  );

  const collapseSpider = useCallback(() => {
    setSpideredClusterId(null);
  }, []);

  /** Spider small clusters; zoom into large ones (>40) to break them apart */
  const onClusterClick = useCallback(
    (clusterId: number, count: number, position: [number, number]): { zoomTo?: { longitude: number; latitude: number; zoom: number } } | void => {
      if (count > 40) {
        const expansionZoom = Math.min(index.getClusterExpansionZoom(clusterId) + 1, maxClusterZoom);
        return { zoomTo: { longitude: position[0], latitude: position[1], zoom: expansionZoom } };
      }
      setSpideredClusterId(clusterId);
    },
    [index, maxClusterZoom]
  );

  // Collapse spider when zoom changes significantly
  const onZoomChange = useCallback(
    (newZoom: number) => {
      if (spideredClusterId !== null && Math.abs(newZoom - zoom) > 0.5) {
        setSpideredClusterId(null);
      }
    },
    [spideredClusterId, zoom]
  );

  return {
    clusters,
    points,
    spiderLegs,
    spiderRadiusPx,
    spideredClusterId,
    expandCluster,
    collapseSpider,
    onClusterClick,
    onZoomChange,
  };
}
