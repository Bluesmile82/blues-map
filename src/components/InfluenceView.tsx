import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'framer-motion';
import DeckGL from '@deck.gl/react';
import { OrthographicView } from '@deck.gl/core';
import { PathLayer, ScatterplotLayer, TextLayer, IconLayer } from '@deck.gl/layers';
import { PathStyleExtension } from '@deck.gl/extensions';
import type { PickingInfo } from '@deck.gl/core';
import type { Musician } from '../types';
import { getStyleColor, getStyleHex } from '../utils/colors';
import SearchInput from './SearchInput';
import BluesStyleLegend from './BluesStyleLegend';
import GestureHint from './GestureHint';
import MobileBottomToolbar from './MobileBottomToolbar';
import MusicianPreviewCard from './MusicianPreviewCard';
import { useAtomValue } from 'jotai';
import { listsAtom, favoritesMapAtom, isMusicianFavoritedAtom } from '../atoms/lists';
import { userAtom } from '../atoms/auth';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  computeTreeLayout,
  computeDecadeTicks,
  computeStyleClusters,
  computeInstrumentClusters,
  computeStyleTreeEdges,
  STYLE_ERA_YEAR,
  bezierPath,
  getYear,
  yearToWorldY,
  interpolatePosition,
  DEFAULT_LAYOUT_CONFIG,
  type GroupBy,
  type LayoutOptions,
  type LayoutConfig,
  type InfluenceLayout,
  type Position2D,
  type StyleZone,
  type StyleTreePath,
} from '../utils/layout';

// World-space sizes
const NODE_RADIUS = 32; // Base radius for musician nodes, scaled by zoom level in the view state
const ICON_SIZE = 60; // Size for the photo icons

// When circles exceed this screen size (px), expand X only so nodes don't overlap
const EXPAND_PX_THRESHOLD = 30;
const EXPAND_ZOOM_THRESHOLD = Math.log2(EXPAND_PX_THRESHOLD / NODE_RADIUS); // ≈ 1.322

const CLUSTER_ZOOM_START = -1; // Below this: fully clustered
const CLUSTER_ZOOM_END = 0.3;   // Above this: fully expanded

const SIDEBAR_PX = 250; // Approximate width of filter sidebar + left margin on sm+ screens
const CLUSTER_DETAILS_ZOOM = 0.3; // Above this: show musician names and images

type DeckVS = { target: [number, number, number]; zoom: number; minZoom: number; maxZoom: number; transitionDuration?: number; transitionEasing?: (t: number) => number };

export default function InfluenceView({
  musicians,
  onSelect,
  selectedId,
  styleFilter,
  onStyleFilterChange,
  forceZoomToId,
  onZoomComplete,
  onFilteredMusiciansChange,
  theme,
  isMobile,
}: {
  musicians: Musician[];
  onSelect: (m: Musician) => void;
  selectedId: string | null;
  styleFilter: string | null;
  onStyleFilterChange: (style: string | null) => void;
  forceZoomToId?: string | null;
  onZoomComplete?: () => void;
  onFilteredMusiciansChange?: (musicians: Musician[]) => void;
  theme: 'light' | 'dark';
  isMobile: boolean;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const dimsRef = useRef({ width: 0, height: 0 });
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoveredStyle, setHoveredStyle] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(!isMobile);
  const [clusterCompression, setClusterCompression] = useState(1.0); // 1.0 = clustered, 0.0 = expanded
  const [groupBy, setGroupBy] = useState<GroupBy>('style');
  const [scatter, setScatter] = useState(true);
  const [naturalPositions, setNaturalPositions] = useState(false);
  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig>(DEFAULT_LAYOUT_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [search, setSearch] = useState('');
  const [textFilter, setTextFilter] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [yearRange, setYearRange] = useState<[number, number] | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [filterListId, setFilterListId] = useState<string | null>(null);
  const [filtersCollapsed, setFiltersCollapsed] = useState(isMobile);
  const [gestureHintShown, setGestureHintShown] = useState(false);
  const [previewMusician, setPreviewMusician] = useState<Musician | null>(null);

  const user = useAtomValue(userAtom);
  const lists = useAtomValue(listsAtom);
  const favoritesMap = useAtomValue(favoritesMapAtom);
  const isMusicianFavorited = useAtomValue(isMusicianFavoritedAtom);

  const { minYear, maxYear } = useMemo(() => {
    const years = musicians
      .filter((m) => m.activeFrom)
      .map((m) => parseInt(m.activeFrom));
    if (!years.length) return { minYear: 1880, maxYear: 1990 };
    return { minYear: Math.min(...years), maxYear: Math.max(...years) };
  }, [musicians]);

  const effectiveYearRange: [number, number] = yearRange ?? [minYear, maxYear];

  // Create favorites checker for the selected list or all lists
  const favoritesChecker = useMemo(() => {
    if (!showFavoritesOnly) return null;

    if (filterListId) {
      // Filter by specific list
      const set = favoritesMap.get(filterListId);
      return set ? ((musicianId: string) => set.has(musicianId)) : null;
    } else {
      // Filter by any list (default behavior)
      return (musicianId: string) => {
        for (const set of favoritesMap.values()) {
          if (set.has(musicianId)) return true;
        }
        return false;
      };
    }
  }, [showFavoritesOnly, filterListId, favoritesMap]);

  const completeMusicians = useMemo(() => {
    const valid = musicians.filter((m) =>
      m.name && m.bluesStyle && m.instrument && m.description && m.birthPlace && m.activeFrom
    );
    const styleFiltered = styleFilter ? valid.filter((m) => m.bluesStyle === styleFilter) : valid;

    const yearFiltered = yearRange
      ? styleFiltered.filter((m) => {
        const y = parseInt(m.activeFrom);
        return y >= yearRange[0] && y <= yearRange[1];
      })
      : styleFiltered;

    const favoritesFiltered = showFavoritesOnly && favoritesChecker
      ? yearFiltered.filter((m) => favoritesChecker(m.id))
      : yearFiltered;

    return favoritesFiltered;
  }, [musicians, styleFilter, yearRange, showFavoritesOnly, favoritesChecker]);

  // Report filtered musicians to parent for random selection
  useEffect(() => {
    onFilteredMusiciansChange?.(completeMusicians);
  }, [completeMusicians, onFilteredMusiciansChange]);

  // Gesture hints - show only once on mobile
  useEffect(() => {
    if (!isMobile) return;
    const timer = setTimeout(() => {
      if (localStorage.getItem('gesture-hint-shown-pinch') !== 'true') {
        setGestureHintShown(true);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [isMobile]);

  const displayMusicians = useMemo(() => {
    if (!textFilter.trim()) return completeMusicians;
    const q = textFilter.trim().toLowerCase();
    return completeMusicians.filter((m) =>
      m.description.toLowerCase().includes(q) ||
      m.albums.some((a) => a.name.toLowerCase().includes(q))
    );
  }, [completeMusicians, textFilter]);

  // World dimensions locked on first valid dims
  const worldRef = useRef<{ w: number; h: number } | null>(null);

  // View state
  const [deckVS, setDeckVS] = useState<DeckVS | null>(null);

  // Track cursor X in canvas space (center = 0) for stable cursor-centered zoom
  const cursorScreenXRef = useRef(0);


  // Block browser pinch-to-zoom; also track cursor position
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    const onMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      cursorScreenXRef.current = e.clientX - rect.left - rect.width / 2;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('mousemove', onMouseMove);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      dimsRef.current = { width, height };
      setDims({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Init world size and deck view state
  const WIDTH_MULTIPLIER = 2;

  useEffect(() => {
    if (dims.width <= 0 || dims.height <= 0 || deckVS !== null) return;

    const WW = dims.width * WIDTH_MULTIPLIER;
    const WH = dims.height * 2.5;

    worldRef.current = { w: WW, h: WH };

    const fitZoom = Math.log2(dims.height / WH);

    // Offset initial view so the content is centered in the area right of the filter sidebar
    const scale = Math.pow(2, fitZoom);
    const sidebarOffset = dims.width >= 640 ? SIDEBAR_PX / (2 * scale) : 0;
    const initialTargetX = -sidebarOffset;

    setDeckVS({
      target: [initialTargetX, 0, 0],
      zoom: fitZoom,
      minZoom: fitZoom,
      maxZoom: 2.5,
    });
  }, [dims.width, dims.height, deckVS]);

  const WW = worldRef.current?.w ?? 1400;
  const WH = worldRef.current?.h ?? 2500;

  const { positions, styleZones, decadeTicks } = useMemo(() => {
    if (!dims.width || !dims.height || !worldRef.current)
      return { positions: {} as InfluenceLayout, styleZones: [] as StyleZone[], decadeTicks: [] };

    const { w, h } = worldRef.current;
    const layoutOptions: LayoutOptions = { groupBy, scatter, naturalPositions, config: layoutConfig };
    const { positions, styleZones } = computeTreeLayout(displayMusicians, w, h, layoutOptions);

    const decadeTicks = computeDecadeTicks(h / 2, h);
    return { positions, styleZones, decadeTicks };
  }, [displayMusicians, groupBy, scatter, naturalPositions, layoutConfig, WW, WH]);

  const clusters = useMemo(() => {
    if (!dims.width || !dims.height || !worldRef.current)
      return {};
    if (groupBy === 'instrument') {
      return computeInstrumentClusters(displayMusicians, positions);
    }
    return computeStyleClusters(displayMusicians, positions, styleZones);
  }, [displayMusicians, positions, styleZones, groupBy]);

  // Per-style label Y: era-year-based, clamped to each style's musician Y range
  const styleLabelY = useMemo(() => {
    if (!worldRef.current || groupBy !== 'style') return {} as Record<string, number>;
    const { h } = worldRef.current;
    const halfH = h / 2;
    const result: Record<string, number> = {};
    for (const [style, cluster] of Object.entries(clusters)) {
      const eraYear = STYLE_ERA_YEAR[style];
      const targetY = eraYear ? yearToWorldY(eraYear, halfH, h, 100) : cluster.center[1];
      // Clamp to the actual Y range of this style's musicians
      const ys = cluster.musicianIds
        .map(id => positions[id]?.[1])
        .filter((y): y is number => y !== undefined);
      if (ys.length === 0) { result[style] = targetY; continue; }
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      result[style] = Math.max(minY, Math.min(maxY, targetY));
    }
    return result;
  }, [clusters, positions, groupBy, WH]);

  const styleTreePaths = useMemo(() => {
    if (groupBy !== 'style' || Object.keys(clusters).length === 0) return [] as StyleTreePath[];
    const zoneByStyle = Object.fromEntries(styleZones.map(z => [z.style, z]));
    const nodePositions: Record<string, Position2D> = {};
    for (const [style, cluster] of Object.entries(clusters)) {
      const zone = zoneByStyle[style];
      const x = zone ? zone.x + zone.width / 2 : cluster.center[0];
      nodePositions[style] = [x, styleLabelY[style] ?? cluster.center[1]];
    }
    return computeStyleTreeEdges(nodePositions);
  }, [clusters, styleZones, groupBy, styleLabelY]);

  const musicianMap = useMemo(() => {
    const map = new Map<string, Musician>();
    displayMusicians.forEach(m => map.set(m.id, m));
    return map;
  }, [displayMusicians]);

  const interpolatedPositions = useMemo(() => {
    const result: InfluenceLayout = {};
    Object.entries(positions).forEach(([id, pos]) => {
      const m = musicianMap.get(id);
      if (!m) {
        result[id] = pos;
        return;
      }

      const clusterKey = groupBy === 'instrument' ? m.instrument : m.bluesStyle;
      if (!clusterKey) {
        result[id] = pos;
        return;
      }

      const cluster = clusters[clusterKey];
      if (!cluster) {
        result[id] = pos;
        return;
      }

      result[id] = interpolatePosition(pos, cluster.center, clusterCompression);
    });
    return result;
  }, [positions, clusters, clusterCompression, musicianMap, groupBy]);

  const clusterLabelData = useMemo(() => {
    if (clusterCompression <= 0.1) return [];
    const zoom = deckVS?.zoom ?? 0;
    const xe = Math.max(1, Math.pow(2, Math.max(0, zoom - EXPAND_ZOOM_THRESHOLD)));
    const scale = Math.pow(2, zoom);
    const zoneByStyle = Object.fromEntries(styleZones.map((z) => [z.style, z]));

    // Build candidates with estimated screen bounds
    const FONT_PX = 12; // matches getSize in the layer
    const CHAR_W = FONT_PX * 0.6; // approximate character width
    const PAD_X = 12; // backgroundPadding horizontal
    const PAD_Y = 12; // backgroundPadding vertical

    const candidates = Object.entries(clusters)
      .filter(([_, cluster]) => cluster.count > 0)
      .map(([style, cluster]) => {
        const zone = zoneByStyle[style];
        const zoneX = zone ? zone.x + zone.width / 2 : cluster.center[0];
        const shortName = style.replace(' Blues', '');
        const text = groupBy === 'style' ? shortName : style;
        const worldX = zoneX * xe;
        // Use era-year-based Y for style grouping, cluster center for instruments
        const labelY = groupBy === 'style' ? (styleLabelY[style] ?? cluster.center[1]) : cluster.center[1];
        const worldY = labelY;
        // Screen-space bounds (pixels)
        const textW = text.length * CHAR_W + PAD_X * 2;
        const textH = FONT_PX + PAD_Y * 2;
        // Screen position (relative to viewport center)
        const screenX = worldX * scale;
        const screenY = worldY * scale;
        return {
          style,
          position: [cluster.center[0], labelY] as Position2D,
          zoneX,
          zoneWidth: zone?.width ?? 0,
          count: cluster.count,
          shortName,
          screenX,
          screenY,
          halfW: textW / 2,
          halfH: textH / 2,
        };
      })
      // Sort by priority: wider zones first (more important styles)
      .sort((a, b) => b.zoneWidth - a.zoneWidth);

    // Greedy placement: skip labels that overlap already-placed ones
    const placed: typeof candidates = [];
    for (const c of candidates) {
      let overlaps = false;
      for (const p of placed) {
        if (
          Math.abs(c.screenX - p.screenX) < c.halfW + p.halfW &&
          Math.abs(c.screenY - p.screenY) < c.halfH + p.halfH
        ) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) placed.push(c);
    }
    return placed;
  }, [clusters, clusterCompression, styleZones, deckVS?.zoom, groupBy, styleLabelY]);

  const focusId = hovered ?? selectedId;
  const focusedMusician = focusId ? displayMusicians.find((m) => m.id === focusId) : null;
  const relatedIds: Set<string> | null = focusedMusician
    ? new Set([
      focusedMusician.id,
      ...focusedMusician.influences,
      ...displayMusicians.filter((m) => m.influences.includes(focusId!)).map((m) => m.id),
      ...(focusedMusician.playedWith ?? []),
      ...displayMusicians.filter((m) => (m.playedWith ?? []).includes(focusId!)).map((m) => m.id),
    ])
    : null;

  const effectiveRelatedIds: Set<string> | null = relatedIds
    ? relatedIds
    : hoveredStyle
      ? new Set(displayMusicians.filter((m) => {
        const clusterValue = groupBy === 'instrument' ? m.instrument : m.bluesStyle;
        return clusterValue === hoveredStyle;
      }).map((m) => m.id))
      : null;

  const currentZoom = deckVS?.zoom ?? 0;

  // Horizontal expansion factor: past the zoom where nodes hit EXPAND_PX_THRESHOLD,
  // scale X positions so nodes spread apart instead of overlapping.
  const xExpand = Math.max(1, Math.pow(2, Math.max(0, currentZoom - EXPAND_ZOOM_THRESHOLD)));

  // Shrink world-space radius so circles stay at most EXPAND_PX_THRESHOLD px on screen.
  // Below the threshold zoom they grow naturally; above it they shrink to remain constant.
  const overlapFactor = Math.min(1, EXPAND_PX_THRESHOLD / (NODE_RADIUS * Math.pow(2, currentZoom)));
  const cappedRadius = NODE_RADIUS * overlapFactor;
  const cappedIconSize = ICON_SIZE * overlapFactor;
  const cappedTextSize = 14 * overlapFactor;

  // Build musician data for layers
  const musicianData = useMemo(() => {
    return displayMusicians.map((m) => {
      const pos = positions[m.id];
      if (!pos) return null;

      return { musician: m, position: pos };
    }).filter(Boolean) as { musician: Musician; position: Position2D }[];
  }, [displayMusicians, positions]);

  // CPU-side collision filtering for musician labels
  const visibleMusicianLabels = useMemo(() => {
    if (currentZoom <= CLUSTER_DETAILS_ZOOM) return [];
    const filtered = effectiveRelatedIds
      ? musicianData.filter((d) => effectiveRelatedIds.has(d.musician.id))
      : musicianData;

    const scale = Math.pow(2, currentZoom);
    const xe = Math.max(1, Math.pow(2, Math.max(0, currentZoom - EXPAND_ZOOM_THRESHOLD)));
    // Text is in 'common' (world) units; screen px = worldSize * scale
    const screenFont = cappedTextSize * scale;
    const charW = screenFont * 0.55;

    type LabelCandidate = typeof musicianData[number] & {
      screenX: number; screenY: number; halfW: number; halfH: number; priority: number;
    };

    const candidates: LabelCandidate[] = filtered.map((d) => {
      const iPos = interpolatedPositions[d.musician.id];
      const wx = (iPos ? iPos[0] : d.position[0]) * xe;
      const wy = (iPos ? iPos[1] : d.position[1]) + cappedRadius + 6;
      const textW = d.musician.name.length * charW;
      const isSelected = d.musician.id === selectedId;
      const isHovered = d.musician.id === hovered;
      return {
        ...d,
        screenX: wx * scale,
        screenY: wy * scale,
        halfW: textW / 2 + 4,
        halfH: screenFont / 2 + 4,
        priority: isSelected ? 2 : isHovered ? 1 : 0,
      };
    });

    // Selected/hovered first so they always win placement
    candidates.sort((a, b) => b.priority - a.priority);

    const placed: typeof candidates = [];
    for (const c of candidates) {
      let overlaps = false;
      for (const p of placed) {
        if (
          Math.abs(c.screenX - p.screenX) < c.halfW + p.halfW &&
          Math.abs(c.screenY - p.screenY) < c.halfH + p.halfH
        ) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) placed.push(c);
    }
    return placed;
  }, [currentZoom, musicianData, effectiveRelatedIds, interpolatedPositions, cappedTextSize, cappedRadius, selectedId, hovered]);

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

  // Handle external zoom trigger (e.g., from random selection)
  useEffect(() => {
    if (!forceZoomToId || !deckVS || !positions[forceZoomToId]) return;
    const m = musicians.find(mus => mus.id === forceZoomToId);
    if (m) {
      goToMusician(m);
      onZoomComplete?.();
    }
  }, [forceZoomToId, deckVS, positions, musicians, onZoomComplete]);

  // Handle picking
  const onHover = useCallback((info: PickingInfo) => {
    const m = info.object as { musician: Musician } | undefined;
    const musicianId = m?.musician?.id ?? null;
    setHovered(musicianId);
    if (musicianId) {
      const musician = displayMusicians.find(x => x.id === musicianId);
      if (musician) {
        const hoveredValue = groupBy === 'instrument' ? musician.instrument : musician.bluesStyle;
        setHoveredStyle(hoveredValue);
      }
    } else {
      setHoveredStyle(null);
    }
  }, [displayMusicians, groupBy]);

  const onClick = useCallback((info: PickingInfo) => {
    const m = info.object as { musician: Musician } | undefined;
    if (m?.musician) {
      // On mobile, show preview instead of opening panel directly
      if (isMobile) {
        setPreviewMusician(m.musician);
      } else {
        // Zoom to musician if zoomed out below detail visibility threshold
        if (deckVS && currentZoom < CLUSTER_DETAILS_ZOOM) {
          const pos = positions[m.musician.id];
          if (pos) {
            goToMusician(m.musician);
          }
        }
        onSelect(m.musician);
      }
    } else {
      // Clicked on empty space - close preview
      if (isMobile) {
        setPreviewMusician(null);
      }
    }
  }, [onSelect, deckVS, currentZoom, positions, isMobile]);

  const deckLayers = useMemo(() => {
    if (!dims.width || !worldRef.current) return [];

    const { w, h } = worldRef.current;
    const halfH = h / 2;
    const xe = xExpand;
    const sx = (x: number) => x * xe;

    const tickLines = decadeTicks.map(({ year, y }) => ({
      path: [[-w / 2 * xe, y], [w / 2 * xe, y]] as [Position2D, Position2D],
      year,
    }));

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

    // Compute edges using interpolated positions so they connect to clustered nodes
    const edges = displayMusicians.flatMap((m) =>
      m.influences
        .map((srcId) => {
          const from = interpolatedPositions[srcId] ?? positions[srcId];
          const to = interpolatedPositions[m.id] ?? positions[m.id];
          if (!from || !to) return null;
          return { path: bezierPath(from, to), targetId: m.id, sourceId: srcId };
        })
        .filter(Boolean)
    ) as { path: Position2D[]; targetId: string; sourceId: string }[];

    const seenPlayedWithPairs = new Set<string>();
    const playedWithEdges = displayMusicians.flatMap((m) =>
      (m.playedWith ?? [])
        .map((srcId) => {
          const pairKey = [m.id, srcId].sort().join('|');
          if (seenPlayedWithPairs.has(pairKey)) return null;
          seenPlayedWithPairs.add(pairKey);
          const from = interpolatedPositions[srcId] ?? positions[srcId];
          const to = interpolatedPositions[m.id] ?? positions[m.id];
          if (!from || !to) return null;
          return { path: bezierPath(from, to), targetId: m.id, sourceId: srcId };
        })
        .filter(Boolean)
    ) as { path: Position2D[]; targetId: string; sourceId: string }[];

    // Style tree alpha: fully visible when fully clustered, fades out as nodes expand
    const treeRatio = currentZoom <= CLUSTER_ZOOM_START
      ? 1
      : Math.max(0, 1 - (currentZoom - CLUSTER_ZOOM_START) / (CLUSTER_ZOOM_END - CLUSTER_ZOOM_START));
    const treeAlpha = Math.round(treeRatio * 200);

    return [
      // Style evolution tree — edges between cluster labels (visible at low zoom only)
      ...(treeAlpha > 0 && groupBy === 'style' ? [
        new PathLayer({
          id: 'style-tree-edges',
          data: styleTreePaths,
          getPath: (d: StyleTreePath) => d.path.map((p: Position2D) => [sx(p[0]), p[1]] as Position2D),
          getColor: (d: StyleTreePath): [number, number, number, number] => {
            const [r, g, b] = getStyleColor(d.toStyle) as [number, number, number];
            return [r, g, b, treeAlpha];
          },
          getWidth: 4,
          widthUnits: 'pixels' as const,
          pickable: false,
          updateTriggers: { getColor: [treeAlpha], getPath: [xExpand] },
        }),
      ] : []),
      // Decade grid lines
      new PathLayer({
        id: 'decade-lines',
        data: tickLines,
        getPath: (d) => d.path,
        getColor: (): [number, number, number, number] => theme === 'dark' ? [255, 255, 255, 40] : [74, 143, 166, 40],
        getWidth: 1,
        widthUnits: 'pixels' as const,
        pickable: false,
        updateTriggers: { getColor: [theme], getPath: [xExpand] },
      }),
      // Musician circles (filled background)
      new ScatterplotLayer({
        id: 'musician-circles',
        data: musicianData,
        getPosition: (d) => {
          const interpolated = interpolatedPositions[d.musician.id];
          return interpolated ? [sx(interpolated[0]), interpolated[1]] as Position2D : [sx(d.position[0]), d.position[1]];
        },
        getRadius: (d) => {
          if (currentZoom <= CLUSTER_DETAILS_ZOOM) {
            return cappedRadius + (currentZoom * 13);
          }
          return d.musician.id === hovered ? cappedRadius * 2 : cappedRadius;
        },
        getFillColor: (d): [number, number, number, number] => {
          const [r, g, b] = getStyleColor(d.musician.bluesStyle);
          const styleMatch = !hoveredStyle || d.musician.bluesStyle === hoveredStyle;
          const dimmed = (currentZoom > CLUSTER_DETAILS_ZOOM && effectiveRelatedIds && !effectiveRelatedIds.has(d.musician.id)) || !styleMatch;
          const isSelected = d.musician.id === selectedId;
          if (dimmed) return [r, g, b, 100];
          if (isSelected) return [r, g, b, 255];
          return [r, g, b, 255];
        },
        getLineColor: (): [number, number, number, number] => {
          return [0, 0, 0, 0];
        },
        lineWidthMinPixels: 2,
        lineWidthMaxPixels: 4,
        stroked: true,
        filled: true,
        radiusUnits: 'common' as const,
        pickable: true,
        onHover,
        onClick,
        updateTriggers: {
          getPosition: [xExpand, interpolatedPositions],
          getRadius: [hovered, cappedRadius],
          getFillColor: [effectiveRelatedIds, selectedId, hovered, hoveredStyle],
          getLineColor: [selectedId, hovered],
          data: [currentZoom],
        },
        transitions: {
          getRadius: {
            duration: 150,
            easing: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
          },
        },
      }),
      // Lifespan lines (dim)
      new PathLayer({
        id: 'lifespan-dim',
        data: lifespanData.filter((d) => (!focusId || d.musician.id !== focusId) && clusterCompression < 0.5),
        getPath: (d) => d.path,
        getColor: (d): [number, number, number, number] => {
          const [r, g, b] = getStyleColor(d.musician.bluesStyle);
          return [r, g, b, focusId ? 20 : 50];
        },
        getWidth: 1.5,
        widthUnits: 'pixels' as const,
        pickable: false,
        updateTriggers: {
          getColor: [focusId],
          data: [clusterCompression],
        },
      }),
      // Lifespan lines (focused)
      ...(focusId
        ? [new PathLayer({
          id: 'lifespan-focus',
          data: lifespanData.filter((d) => d.musician.id === focusId),
          getPath: (d) => d.path,
          getColor: (d): [number, number, number, number] => {
            const [r, g, b] = getStyleColor(d.musician.bluesStyle);
            return [r, g, b, 200];
          },
          getWidth: 10,
          widthUnits: 'pixels' as const,
          pickable: false,
        })]
        : []),
      // Influence edges (dim)
      new PathLayer({
        id: 'edges-dim',
        data: effectiveRelatedIds
          ? edges.filter((e) => !effectiveRelatedIds.has(e.sourceId) || !effectiveRelatedIds.has(e.targetId))
          : edges,
        getPath: (d) => d.path.map((p: Position2D) => [sx(p[0]), p[1]] as Position2D),
        getColor: (d): [number, number, number, number] => {
          const m = displayMusicians.find((x) => x.id === d.targetId);
          return [...getStyleColor(m?.bluesStyle ?? ''), effectiveRelatedIds ? 1 : 10] as [number, number, number, number];
        },
        getWidth: 1,
        widthUnits: 'pixels' as const,
        pickable: false,
        updateTriggers: { getPath: [xExpand] },
      }),
      // Influence edges (highlighted)
      ...(effectiveRelatedIds
        ? [new PathLayer({
          id: 'edges-highlight',
          data: edges.filter((e) => effectiveRelatedIds.has(e.sourceId) && effectiveRelatedIds.has(e.targetId)),
          getPath: (d) => d.path.map((p: Position2D) => [sx(p[0]), p[1]] as Position2D),
          getColor: (d): [number, number, number, number] => {
            const m = displayMusicians.find((x) => x.id === d.targetId);
            return [...getStyleColor(m?.bluesStyle ?? ''), 210] as [number, number, number, number];
          },
          getWidth: 2,
          widthUnits: 'pixels' as const,
          pickable: false,
          updateTriggers: { getPath: [xExpand] },
        })]
        : []),
      // Played with edges (highlighted) — dashed
      ...(effectiveRelatedIds
        ? [new PathLayer({
          id: 'played-with-highlight',
          data: playedWithEdges.filter((e) =>
            focusId
              ? e.sourceId === focusId || e.targetId === focusId
              : effectiveRelatedIds.has(e.sourceId) && effectiveRelatedIds.has(e.targetId)
          ),
          getPath: (d) => d.path.map((p: Position2D) => [sx(p[0]), p[1]] as Position2D),
          getColor: (): [number, number, number, number] => theme === 'dark' ? [255, 255, 255, 150] : [0, 0, 0, 90],
          getWidth: 2,
          widthUnits: 'pixels' as const,
          pickable: false,
          getDashArray: [3, 6],
          extensions: [new PathStyleExtension({ dash: true })],
          updateTriggers: { getPath: [xExpand] },
        })]
        : []),
      // Musician photos
      new IconLayer({
        id: 'musician-photos',
        data: currentZoom > CLUSTER_DETAILS_ZOOM ? musicianData : [],
        getPosition: (d) => {
          const interpolated = interpolatedPositions[d.musician.id];
          return interpolated ? [sx(interpolated[0]), interpolated[1]] as Position2D : [sx(d.position[0]), d.position[1]];
        },
        getIcon: (d) => ({
          url: d.musician.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(d.musician.name)}&background=251a0d&color=c8872a&size=80`,
          width: 128,
          height: 128,
          mask: false,
        }),
        getSize: (d) => d.musician.id === hovered ? cappedIconSize * 2 : cappedIconSize,
        sizeUnits: 'common' as const,
        pickable: true,
        onHover,
        onClick,
        getColor: (d): [number, number, number, number] => {
          const isSelected = d.musician.id === selectedId;
          const isHovered = d.musician.id === hovered;
          const styleMatch = !hoveredStyle || d.musician.bluesStyle === hoveredStyle;
          const dimmed = currentZoom < CLUSTER_DETAILS_ZOOM && effectiveRelatedIds && !effectiveRelatedIds.has(d.musician.id) || !(isHovered || isSelected) || !styleMatch;
          if (dimmed) return [255, 255, 255, 100];
          return [255, 255, 255, 255];
        },
        updateTriggers: {
          getPosition: [xExpand, interpolatedPositions],
          getSize: [hovered, cappedIconSize],
          getColor: [effectiveRelatedIds, hoveredStyle],
          data: [currentZoom],
        },
        transitions: {
          getSize: {
            duration: 150,
            easing: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
          },
        },
      }),
      // Favorite star badges
      ...(favoritesChecker && musicianData.some((d) => favoritesChecker(d.musician.id)) ? [new IconLayer({
        id: 'favorite-stars',
        data: clusterCompression < 0.5 ? musicianData.filter((d) => favoritesChecker(d.musician.id)) : [],
        getPosition: (d) => {
          const interpolated = interpolatedPositions[d.musician.id];
          const x = interpolated ? interpolated[0] : d.position[0];
          const y = interpolated ? interpolated[1] : d.position[1];
          const radius = d.musician.id === hovered ? cappedRadius * 2 : cappedRadius;
          // Position star in top-right corner of the musician photo
          return [sx(x) + radius * 0.5, y - radius * 0.5] as Position2D;
        },
        getIcon: () => ({
          url: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#c8872a" stroke="#c8872a" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`),
          width: 24,
          height: 24,
          mask: false,
        }),
        getSize: () => 20,
        sizeUnits: 'pixels' as const,
        pickable: false,
        updateTriggers: {
          getPosition: [hovered, xExpand, interpolatedPositions],
          data: [favoritesChecker, clusterCompression],
        },
      })] : []),
      // Musician labels — CPU-side greedy deoverlap (visibleMusicianLabels already filtered)
      new TextLayer({
        id: 'musician-labels',
        data: visibleMusicianLabels,
        getPosition: (d) => {
          const interpolated = interpolatedPositions[d.musician.id];
          const x = interpolated ? interpolated[0] : d.position[0];
          const y = interpolated ? interpolated[1] : d.position[1];
          const radius = d.musician.id === hovered ? cappedRadius * 2 : cappedRadius;
          return [sx(x), y + radius + 6] as Position2D;
        },
        getText: (d) => d.musician.name,
        getSize: (d): number => {
          const isSelected = d.musician.id === selectedId;
          const isHovered = d.musician.id === hovered;
          return (isSelected || isHovered) ? cappedTextSize + 4 : cappedTextSize;
        },
        getColor: (d): [number, number, number, number] => {
          const isSelected = d.musician.id === selectedId;
          const isHovered = d.musician.id === hovered;
          const styleMatch = !hoveredStyle || d.musician.bluesStyle === hoveredStyle;
          if (theme === 'dark') {
            if (isSelected) return [255, 255, 225, 255];
            if (isHovered) return [255, 255, 225, 255];
            if (!styleMatch) return [255, 255, 255, 200];
            return [255, 255, 255, effectiveRelatedIds ? 255 : 200];
          } else {
            if (isSelected) return [0, 0, 0, 255];
            if (isHovered) return [0, 0, 0, 255];
            if (!styleMatch) return [0, 0, 0, 80];
            return [0, 0, 0, effectiveRelatedIds ? 255 : 140];
          }
        },
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'top',
        fontWeight: '600',
        outlineWidth: 3,
        outlineColor: [0, 0, 0, 200],
        background: true,
        backgroundPadding: [4, 4, 4, 4],
        backgroundColor: theme === 'dark' ? [0, 0, 0, 170] : [255, 255, 255, 170],
        sizeUnits: 'common' as const,
        pickable: false,
        updateTriggers: {
          getPosition: [hovered, xExpand, interpolatedPositions],
          getSize: [cappedTextSize],
          getColor: [selectedId, hovered, effectiveRelatedIds, hoveredStyle],
          data: [visibleMusicianLabels],
        },
      }),
      // Cluster labels — CPU-side greedy deoverlap (clusterLabelData already filtered)
      ...(clusterLabelData.length > 0 ? [new TextLayer({
        id: 'cluster-labels',
        data: clusterLabelData,
        getPosition: (d) => [sx(d.zoneX), d.position[1]] as Position2D,
        getText: (d) => {
          const name = groupBy === 'style' ? d.shortName : d.style;
          const isHovered = hoveredStyle === d.style;
          return isHovered ? `${name} (${d.count})` : name;
        },
        background: true,
        backgroundPadding: [6, 6, 6, 6],
        backgroundBorderRadius: 16,
        getBackgroundColor: (d: { style: string }) => {
          const [r, g, b] = getStyleColor(d.style) as [number, number, number];
          return [r, g, b, 180] as [number, number, number, number];
        },
        getSize: () => 20,
        getColor: () => theme === 'dark' ? [255, 255, 255, 255] : [20, 20, 20, 255],
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        fontWeight: '700',
        outlineWidth: 6,
        outlineColor: [0, 0, 0, 255],
        sizeUnits: 'pixels' as const,
        pickable: false,
        updateTriggers: {
          getPosition: [xExpand],
          getText: [hoveredStyle, groupBy],
        },
      })] : []),
    ];
  }, [dims.width, decadeTicks, styleZones, effectiveRelatedIds, positions, focusId, displayMusicians, musicianData, selectedId, hovered, groupBy, WW, WH, xExpand, cappedRadius, cappedIconSize, cappedTextSize, onHover, onClick, interpolatedPositions, clusters, clusterCompression, clusterLabelData, visibleMusicianLabels, currentZoom, styleTreePaths]);

  // Search
  const searchQuery = search.trim().toLowerCase();
  const searchMatches = searchQuery
    ? displayMusicians.filter((m) => m.name.toLowerCase().includes(searchQuery)).slice(0, 8)
    : [];

  const goToMusician = useCallback((m: Musician, minZoom = CLUSTER_DETAILS_ZOOM) => {
    const pos = positions[m.id];
    if (!pos || !deckVS) return;
    const targetZoom = Math.max(minZoom, deckVS.zoom) + 0.1;
    const startZoom = deckVS.zoom;
    const startTarget = deckVS.target;
    const endTarget: [number, number, number] = [pos[0] * Math.max(1, Math.pow(2, Math.max(0, targetZoom - EXPAND_ZOOM_THRESHOLD))), pos[1], 0];

    const duration = 500;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      const currentZoom = startZoom + (targetZoom - startZoom) * eased;
      const currentTarget: [number, number, number] = [
        startTarget[0] + (endTarget[0] - startTarget[0]) * eased,
        startTarget[1] + (endTarget[1] - startTarget[1]) * eased,
        0,
      ];

      setDeckVS({ ...deckVS!, zoom: currentZoom, target: currentTarget });

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
    onSelect(m);
    setSearch('');
  }, [positions, deckVS, onSelect]);

  const handleZoom = useCallback((delta: number) => {
    if (!deckVS) return;
    const newZoom = Math.max(deckVS.minZoom, Math.min(deckVS.maxZoom, deckVS.zoom + delta));
    setDeckVS({ ...deckVS, zoom: newZoom });
  }, [deckVS]);

  const handleReset = useCallback(() => {
    if (!deckVS) return;
    const { width } = dimsRef.current;
    const scale = Math.pow(2, deckVS.minZoom);
    const sidebarOffset = width >= 640 ? SIDEBAR_PX / (2 * scale) : 0;
    setDeckVS({ ...deckVS, target: [-sidebarOffset, 0, 0], zoom: deckVS.minZoom });
  }, [deckVS]);

  const handleViewStateChange = useCallback(({ viewState }: { viewState: unknown }) => {
    const v = viewState as { target?: [number, number, number]; zoom?: number };
    const z = v.zoom ?? 0;
    const tx = v.target?.[0] ?? 0;
    const ty = v.target?.[1] ?? 0;
    const { width, height } = dimsRef.current;
    const s = 2 ** z;
    const { w, h } = worldRef.current!;

    setDeckVS((prev) => {
      if (!prev) return null;

      const oldS = 2 ** prev.zoom;
      const xExpandOld = Math.max(1, Math.pow(2, Math.max(0, prev.zoom - EXPAND_ZOOM_THRESHOLD)));
      const xExpandNew = Math.max(1, Math.pow(2, Math.max(0, z - EXPAND_ZOOM_THRESHOLD)));

      let compensatedTx: number;
      if (s !== oldS && xExpandNew !== xExpandOld) {
        // xExpand changes at this zoom step: recompute from our own prev state so the
        // world point under the cursor stays fixed despite the coordinate rescaling.
        //   cursorVisualX = visual world X under cursor at prev zoom
        //   newTarget = cursorVisualX * (xExpandNew/xExpandOld) - cursorX / s
        const cursorX = cursorScreenXRef.current;
        const cursorVisualX = prev.target[0] + cursorX / oldS;
        compensatedTx = cursorVisualX * (xExpandNew / xExpandOld) - cursorX / s;
      } else {
        // No xExpand change (low/mid zoom or pure pan): deck.gl already computed a correct
        // cursor-centred target from the actual wheel-event position — use it directly.
        compensatedTx = tx;
      }

      const maxTx = Math.max(0, w / 2 * xExpandNew - width / (2 * s));
      const maxTy = Math.max(0, h / 2 - height / (2 * s));
      // Allow extra leftward panning to accommodate the filter sidebar
      const sidebarWorldOffset = width >= 640 ? SIDEBAR_PX / (2 * s) : 0;
      const ctx = Math.max(-maxTx - sidebarWorldOffset, Math.min(maxTx, compensatedTx));
      const cty = Math.max(-maxTy, Math.min(maxTy, ty));

      return { ...prev, target: [ctx, cty, 0], zoom: z };
    });
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-bg-elevated select-none"
      style={{ touchAction: 'none' }}
    >
      {deckVS !== null && (
        <>
          <DeckGL
            views={[new OrthographicView({ id: 'ortho', controller: true })]}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            viewState={{ zoom: deckVS.zoom, target: deckVS.target, minZoom: deckVS.minZoom, maxZoom: deckVS.maxZoom } as any}
            onViewStateChange={handleViewStateChange}
            layers={deckLayers}
            getCursor={({ isHovering }) => isHovering ? 'pointer' : 'grab'}
            style={{ position: 'absolute', top: '0', left: '0', right: '0', bottom: '0' }}
          />

          {/* Fixed year axis */}
          <div className="hidden sm:block absolute left-0 top-0 bottom-0 pointer-events-none z-30" style={{ width: 52 }}>
            {decadeTicks.map(({ year, y }) => {
              const s = 2 ** deckVS.zoom;
              const screenY = dims.height / 2 + (y - deckVS.target[1]) * s;
              if (screenY < 8 || screenY > dims.height - 8) return null;
              return (
                <div
                  key={year}
                  className='absolute left-1 transform -translate-y-1/2 text-xl text-ink bg-bg/60 backdrop-blur-xl p-1 rounded pointer-events-auto select-none'
                  style={{
                    top: screenY,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {year}
                </div>
              );
            })}
          </div>

          {/* Filter panel - desktop always visible, mobile when not collapsed */}
          <div className={`absolute left-3 sm:left-16 top-3 sm:top-4 z-40 w-50 border border-accent/50 bg-bg/5 backdrop-blur-xs rounded-lg ${isMobile && filtersCollapsed ? 'hidden' : ''}`} style={{ width: 'min(220px, calc(100vw - 1.5rem))' }}>
            {filtersCollapsed ? (
              <button
                onClick={() => setFiltersCollapsed(false)}
                className="flex items-center justify-between w-full text-sm font-bold text-accent tracking-widest uppercase hover:text-accent3 transition-colors mb-1 p-3"
              >
                <span>{t('filters.title')}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex flex-col gap-2 p-3" style={{ width: 'min(218px, calc(100vw - 1.5rem))' }}>
                <button
                  onClick={() => setFiltersCollapsed(true)}
                  className="flex items-center justify-between w-full text-sm font-bold text-accent tracking-widest uppercase hover:text-accent3 transition-colors mb-1"
                >
                  <span>{t('filters.title')}</span>
                  <ChevronUp className="w-4 h-4" />
                </button>
                <div className="relative">
                  <SearchInput
                    ref={searchInputRef}
                    value={search}
                    onChange={setSearch}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchMatches[0]) goToMusician(searchMatches[0]);
                      if (e.key === 'Escape') setSearch('');
                    }}
                    placeholder={t('filters.findByName')}
                  />
                  {searchMatches.length > 0 && (
                    <div className="absolute top-full mt-1 left-0 right-0 bg-bg-subtle border border-border-subtle rounded-lg overflow-hidden shadow-xl z-50 max-h-60 overflow-y-auto">
                      {searchMatches.map((m) => {
                        const hex = getStyleHex(m.bluesStyle);
                        const isFav = isMusicianFavorited(m.id);
                        return (
                          <button
                            key={m.id}
                            onClick={() => goToMusician(m)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-hover transition-colors group"
                          >
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: hex }} />
                            <span className="text-ui text-ink flex-1 truncate">{m.name}</span>
                            <span className="text-2xs shrink-0" style={{ color: hex }}>{t(`styles.${m.bluesStyle}`, m.bluesStyle).replace(' Blues', '')}</span>
                            {import.meta.env.VITE_ENABLE_EDIT_MODE === 'true' && (
                              <svg
                                className="w-4 h-4 shrink-0"
                                viewBox="0 0 24 24"
                                fill={isFav ? "currentColor" : "none"}
                                stroke="currentColor"
                                strokeWidth="2"
                                style={{ color: isFav ? '#c8872a' : '#6b5c4a' }}
                              >
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <SearchInput
                  value={textFilter}
                  onChange={setTextFilter}
                  placeholder={t('filters.filterByDescription')}
                />
                {textFilter && (
                  <p className="text-2xs text-ink3 px-0.5">{displayMusicians.length} {displayMusicians.length !== 1 ? t('filters.musicians') : t('filters.musician')} {t('filters.shown')}</p>
                )}

                {/* Favorites filter - only show when logged in */}
                {user && (
                  <div className="bg-bg/50 border border-border-subtle rounded-lg px-3 py-2 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={showFavoritesOnly}
                        onChange={(e) => setShowFavoritesOnly(e.target.checked)}
                      />
                      <span className="text-label text-ink3">{t('filters.showFavoritesOnly')}</span>
                    </div>

                    {/* List selector dropdown */}
                    {showFavoritesOnly && lists.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <select
                          value={filterListId ?? ''}
                          onChange={(e) => setFilterListId(e.target.value || null)}
                          className="text-label bg-bg-subtle border border-border-subtle rounded px-2 py-1.5 text-ink focus:border-accent focus:outline-none"
                        >
                          <option value="">{t('filters.allLists')}</option>
                          {lists.map((list) => {
                            const count = favoritesMap.get(list.id)?.size ?? 0
                            return (
                              <option key={list.id} value={list.id}>
                                {list.name} ({count})
                              </option>
                            )
                          })}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Year range filter */}
                <div className="bg-bg/50 border border-border-subtle rounded-lg px-3 py-2 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-2xs text-accent tracking-widest uppercase">{t('filters.activeYears')}</span>
                    {yearRange && (
                      <button
                        onClick={() => setYearRange(null)}
                        className="text-3xs text-ink3 hover:text-ink transition-colors"
                      >
                        {t('filters.reset')}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-2xs text-ink3">
                    <span>{effectiveYearRange[0]}</span>
                    <span>{effectiveYearRange[1]}</span>
                  </div>
                  <div className="relative h-4 flex items-center">
                    <input
                      type="range"
                      min={minYear}
                      max={maxYear}
                      value={effectiveYearRange[0]}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        setYearRange([Math.min(v, effectiveYearRange[1] - 1), effectiveYearRange[1]]);
                      }}
                      className="year-range-slider absolute w-full h-1"
                      style={{ zIndex: 3 }}
                    />
                    <input
                      type="range"
                      min={minYear}
                      max={maxYear}
                      value={effectiveYearRange[1]}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        setYearRange([effectiveYearRange[0], Math.max(v, effectiveYearRange[0] + 1)]);
                      }}
                      className="year-range-slider absolute w-full h-1"
                      style={{ zIndex: 3 }}
                    />
                    <div className="absolute w-full h-1 rounded bg-border-subtle" style={{ zIndex: 1 }}>
                      <div
                        className="absolute h-full rounded bg-accent/50"
                        style={{
                          left: `${((effectiveYearRange[0] - minYear) / (maxYear - minYear)) * 100}%`,
                          right: `${((maxYear - effectiveYearRange[1]) / (maxYear - minYear)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Blues Style filter */}
                <div className="bg-bg/50 border border-border-subtle rounded-lg px-3 py-2">
                  <BluesStyleLegend
                    isOpen={legendOpen}
                    onToggle={() => setLegendOpen((o) => !o)}
                    styleFilter={styleFilter}
                    onStyleFilterChange={onStyleFilterChange}
                    onHoverStyle={setHoveredStyle}
                    hoveredStyle={hoveredStyle}
                    availableStyles={Array.from(new Set(completeMusicians.map((m) => m.bluesStyle)))}
                    embedded
                  />
                </div>
              </div>
            )}
          </div>

          {/* Top bar: group-by + scatter - desktop only */}
          <div className="hidden sm:flex absolute top-3 sm:top-4 left-1/2 -translate-x-1/2 z-40 items-center gap-2">
            <div className="flex items-center bg-bg/50 border border-border-subtle rounded-lg p-0.5 gap-0.5">
              {(['style', 'instrument'] as GroupBy[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setGroupBy(mode)}
                  className={`px-2 sm:px-3 py-1 rounded text-2xs sm:text-xs font-semibold tracking-wide uppercase transition-all ${groupBy === mode ? 'bg-accent text-bg' : 'text-ink3 hover:text-ink'}`}
                >
                  {mode === 'style' ? t('filters.style') : t('filters.instrument')}
                </button>
              ))}
            </div>

            {import.meta.env.DEV && !isMobile && (
              <>
                <button
                  onClick={() => setScatter((s) => !s)}
                  title={scatter ? 'Switch to sorted lines' : 'Switch to scattered layout'}
                  className={`px-2 sm:px-3 py-1 rounded-lg text-2xs sm:text-xs font-semibold tracking-wide uppercase transition-all bg-bg/50 border border-border-subtle ${scatter ? 'bg-accent text-bg' : 'text-ink3 hover:text-ink'}`}
                >
                  Scatter
                </button>

                <label
                  title="Let relationships determine positions freely"
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-2xs sm:text-xs font-semibold tracking-wide uppercase bg-bg/50 border border-border-subtle cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={naturalPositions}
                    onChange={(e) => setNaturalPositions(e.target.checked)}
                  />
                  <span className={naturalPositions ? 'text-accent' : 'text-ink3'}>Natural</span>
                </label>

                <button
                  onClick={() => setShowConfig((s) => !s)}
                  title="Layout configuration"
                  className={`px-2 py-1 rounded-lg text-2xs sm:text-xs font-semibold tracking-wide uppercase bg-bg/50 border border-border-subtle ${showConfig ? 'bg-accent text-bg' : 'text-ink3 hover:text-ink'}`}
                >
                  Config
                </button>
              </>
            )}
          </div>

          {/* Layout config sliders - dev only */}
          {import.meta.env.DEV && showConfig && (
            <div className="absolute top-16 right-4 z-50 bg-bg/55 border border-border-subtle rounded-lg p-3 shadow-lg w-64 max-h-[70vh] overflow-y-auto">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink mb-2">Layout Config</div>

              {/* Collision Radius */}
              <div className="mb-2">
                <div className="flex justify-between text-2xs text-ink3" title="How far apart nodes push each other">
                  <span>Collision Radius</span>
                  <span>{layoutConfig.collisionRadius}</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={200}
                  value={layoutConfig.collisionRadius}
                  onChange={(e) => setLayoutConfig((c) => ({ ...c, collisionRadius: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>

              {/* Collision Iterations */}
              <div className="mb-2">
                <div className="flex justify-between text-2xs text-ink3" title="How many times collision is applied">
                  <span>Collision Iterations</span>
                  <span>{layoutConfig.collisionIterations}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={15}
                  value={layoutConfig.collisionIterations}
                  onChange={(e) => setLayoutConfig((c) => ({ ...c, collisionIterations: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>

              {/* Influence Weight */}
              <div className="mb-2">
                <div className="flex justify-between text-2xs text-ink3" title="How strongly influence relationships pull musicians together">
                  <span>Influence Weight</span>
                  <span>{layoutConfig.influenceWeight.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={layoutConfig.influenceWeight}
                  onChange={(e) => setLayoutConfig((c) => ({ ...c, influenceWeight: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>

              {/* Played With Weight */}
              <div className="mb-2">
                <div className="flex justify-between text-2xs text-ink3" title="How strongly played-with relationships pull musicians together">
                  <span>Played With Weight</span>
                  <span>{layoutConfig.playedWithWeight.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={layoutConfig.playedWithWeight}
                  onChange={(e) => setLayoutConfig((c) => ({ ...c, playedWithWeight: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>

              {/* Link Distance */}
              <div className="mb-2">
                <div className="flex justify-between text-2xs text-ink3" title="Target distance between connected musicians">
                  <span>Link Distance</span>
                  <span>{layoutConfig.linkDistance}</span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={400}
                  value={layoutConfig.linkDistance}
                  onChange={(e) => setLayoutConfig((c) => ({ ...c, linkDistance: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>

              {/* Link Strength */}
              <div className="mb-2">
                <div className="flex justify-between text-2xs text-ink3">
                  <span>Link Strength</span>
                  <span>{layoutConfig.linkStrength.toFixed(3)}</span>
                </div>
                <input
                  type="range"
                  min={0.001}
                  max={0.5}
                  step={0.001}
                  value={layoutConfig.linkStrength}
                  onChange={(e) => setLayoutConfig((c) => ({ ...c, linkStrength: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>

              {/* Y Anchor Strength */}
              <div className="mb-2">
                <div className="flex justify-between text-2xs text-ink3">
                  <span>Y Anchor Strength</span>
                  <span>{layoutConfig.yAnchorStrength.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={layoutConfig.yAnchorStrength}
                  onChange={(e) => setLayoutConfig((c) => ({ ...c, yAnchorStrength: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>

              {/* Soft Center Strength */}
              <div className="mb-2">
                <div className="flex justify-between text-2xs text-ink3">
                  <span>Soft Center</span>
                  <span>{layoutConfig.softCenterStrength.toFixed(3)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.1}
                  step={0.001}
                  value={layoutConfig.softCenterStrength}
                  onChange={(e) => setLayoutConfig((c) => ({ ...c, softCenterStrength: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>

              {/* Simulation Iterations */}
              <div className="mb-2">
                <div className="flex justify-between text-2xs text-ink3">
                  <span>Simulation Iterations</span>
                  <span>{layoutConfig.simulationIterations}</span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={500}
                  step={50}
                  value={layoutConfig.simulationIterations}
                  onChange={(e) => setLayoutConfig((c) => ({ ...c, simulationIterations: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>

              {/* Reset button */}
              <button
                onClick={() => setLayoutConfig(DEFAULT_LAYOUT_CONFIG)}
                className="w-full mt-2 px-2 py-1 text-2xs uppercase bg-bg border border-border-subtle rounded hover:text-accent"
              >
                Reset Defaults
              </button>
            </div>
          )}

          {/* Zoom controls - desktop only */}
          <div className="hidden sm:flex absolute top-4 left-3 sm:left-100 z-40 items-center gap-1">
            <button
              onClick={() => handleZoom(0.4)}
              title="Zoom in"
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-bg/50 border border-border-subtle text-ink3 hover:text-ink hover:border-accent/60 text-2xl transition-colors"
            >
              +
            </button>
            <button
              onClick={() => handleZoom(-0.4)}
              title="Zoom out"
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-bg/50 border border-border-subtle text-ink3 hover:text-ink hover:border-accent/60 text-2xl transition-colors"
            >
              −
            </button>
            <button
              onClick={handleReset}
              title="Reset view"
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-bg/50 border border-border-subtle text-ink3 hover:text-ink hover:border-accent/60 text-xl transition-colors"
            >
              ⟳
            </button>
          </div>


          {/* Timeline legend */}
          <div className={`absolute right-3 sm:right-6 bg-bg/50 border border-bg3 rounded-md px-4 py-3 flex flex-col gap-1.5 pointer-events-none transition-all ${isMobile ? 'bottom-16' : 'bottom-6'}`}>
            <p className="text-2xs text-accent tracking-widest uppercase mb-1">{t('timeline.legend.title')}</p>
            {[
              { label: t('timeline.legend.musician'), el: <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" /> },
              {
                label: t('timeline.legend.influence'), el: (
                  <svg width="16" height="10" className="shrink-0">
                    <path d="M0,5 Q8,0 16,5" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" opacity="0.7" />
                  </svg>
                )
              },
              {
                label: t('timeline.legend.playedWith'), el: (
                  <svg width="16" height="10" className="shrink-0">
                    <path d="M0,5 Q8,0 16,5" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
                  </svg>
                )
              },
              { label: t('timeline.legend.lifeSpan'), el: <span className="w-0.5 h-3 bg-accent/60 rounded shrink-0" /> },
              {
                label: t('timeline.legend.bluesStyle'), el: (
                  <span className="flex gap-0.5 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: getStyleHex('Delta Blues') }} />
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: getStyleHex('Chicago Blues') }} />
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: getStyleHex('Texas Blues') }} />
                  </span>
                )
              },
            ].map(({ label, el }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-ink2">
                {el}
                {label}
              </div>
            ))}
          </div>

          {/* Hover tooltip */}
          {hovered && !selectedId && (() => {
            const m = displayMusicians.find((x) => x.id === hovered);
            if (!m) return null;
            return (
              <div className="absolute bottom-4 sm:bottom-5 left-1/2 -translate-x-1/2 max-w-[90vw] bg-bg-subtle/95 border border-accent/60 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 flex items-center gap-2 sm:gap-3 pointer-events-none z-50 shadow-lg overflow-hidden">
                <strong className="text-ink text-xs sm:text-sm truncate">{m.name}</strong>
                <span className="text-ink3 text-xs shrink-0">
                  {getYear(m.birthDate)}{m.deathDate ? ` – ${getYear(m.deathDate)}` : ''}
                </span>
                <span className="hidden sm:inline text-xs px-1.5 py-0.5 rounded shrink-0" style={{ color: getStyleHex(m.bluesStyle), border: `1px solid ${getStyleHex(m.bluesStyle)}40`, background: `${getStyleHex(m.bluesStyle)}15` }}>
                  {t(`styles.${m.bluesStyle}`, m.bluesStyle)}
                </span>
              </div>
             );
           })()}

          {/* Gesture Hints - Mobile Only */}
          {isMobile && gestureHintShown && (
            <AnimatePresence>
              <GestureHint
                icon="pinch"
                text={t('mobile.gestureHintPinch')}
                position="center"
                onDismiss={() => setGestureHintShown(false)}
              />
            </AnimatePresence>
          )}

          {/* Musician Preview Card - Mobile Only */}
          {isMobile && previewMusician && (
            <MusicianPreviewCard
              musician={previewMusician}
              onViewDetails={() => {
                setPreviewMusician(null);
                onSelect(previewMusician);
              }}
              onClose={() => setPreviewMusician(null)}
              isMobile={isMobile}
            />
          )}

          {/* Mobile Bottom Toolbar */}
          {isMobile && (
            <MobileBottomToolbar
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
              onZoomIn={() => handleZoom(0.2)}
              onZoomOut={() => handleZoom(-0.2)}
              onReset={handleReset}
              onFilterToggle={() => setFiltersCollapsed(!filtersCollapsed)}
              filterCount={yearRange ? 1 : 0}
            />
          )}
        </>
       )}
     </div>
  );
}
