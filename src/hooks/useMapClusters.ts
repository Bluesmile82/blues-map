import { useMemo, useState, useCallback } from 'react';
import Supercluster from 'supercluster';
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
}

export interface SpiderLeg {
  source: [number, number];
  target: [number, number];
  musician: Musician;
}

export type ClusterItem = ClusterPoint | ClusterGroup;

// ── Spider layout ──────────────────────────────────────────────────────────────

/**
 * Arrange N points in a spiral around a center.
 * Uses a Fermat spiral for even spacing that scales well from 2 to 50+ points.
 */
function spiralPositions(
  center: [number, number],
  count: number,
  zoom: number
): [number, number][] {
  if (count === 0) return [];
  if (count === 1) return [center];

  // Base angular separation in degrees, shrinks with zoom so spiders stay
  // visually consistent across zoom levels.
  const baseSep = 1.8 / Math.pow(2, Math.max(zoom - 3, 0));

  const positions: [number, number][] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~137.5°

  for (let i = 0; i < count; i++) {
    const angle = i * goldenAngle;
    // Fermat spiral: r ∝ sqrt(i)
    const r = baseSep * Math.sqrt(i + 1);
    const lng = center[0] + r * Math.cos(angle);
    const lat = center[1] + r * Math.sin(angle);
    positions.push([lng, lat]);
  }
  return positions;
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
  const { clusters, points, spiderLegs } = useMemo(() => {
    if (!bounds) {
      return { clusters: [] as ClusterGroup[], points: [] as ClusterPoint[], spiderLegs: [] as SpiderLeg[] };
    }

    const floorZoom = Math.floor(zoom);
    const raw = index.getClusters(bounds, floorZoom);

    const clusters: ClusterGroup[] = [];
    const points: ClusterPoint[] = [];
    const spiderLegs: SpiderLeg[] = [];

    for (const feature of raw) {
      const coords = feature.geometry.coordinates as [number, number];
      const props = feature.properties as Record<string, unknown>;

      if (props.cluster) {
        const clusterId = props.cluster_id as number;

        // If this cluster is spidered, expand it into individual points
        if (clusterId === spideredClusterId) {
          const leaves = index.getLeaves(clusterId, Infinity);
          const center = coords;
          const spiderPositions = spiralPositions(center, leaves.length, zoom);

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
          // Check if the selected musician is inside this cluster — extract it
          let selectedExtracted = false;
          if (selectedId) {
            const leaves = index.getLeaves(clusterId, Infinity);
            for (const leaf of leaves) {
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

          // Find most common blues style in cluster for coloring
          const sampleLeaves = index.getLeaves(clusterId, 20);
          const styleCounts = new Map<string, number>();
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

          const clusterCount = props.point_count as number;
          clusters.push({
            type: 'cluster',
            clusterId,
            position: coords,
            count: selectedExtracted ? clusterCount - 1 : clusterCount,
            bluesStyle: topStyle,
          });
        }
      } else {
        // Individual point (not clustered)
        const musician = musicianMap.get(props.musicianId as string);
        if (musician) {
          points.push({
            type: 'musician',
            musician,
            position: coords,
            spidered: false,
          });
        }
      }
    }

    return { clusters, points, spiderLegs };
  }, [index, bounds, zoom, spideredClusterId, musicianMap, selectedId]);

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

  /** Always spider on cluster click so individual musicians are selectable */
  const onClusterClick = useCallback(
    (clusterId: number) => {
      setSpideredClusterId(clusterId);
    },
    []
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
    spideredClusterId,
    expandCluster,
    collapseSpider,
    onClusterClick,
    onZoomChange,
  };
}
