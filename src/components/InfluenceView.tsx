import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { OrthographicView } from '@deck.gl/core';
import { PathLayer, ScatterplotLayer, TextLayer, IconLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import type { Musician } from '../types';
import { getStyleColor, getStyleHex, STYLE_COLORS, CANONICAL_STYLES } from '../utils/colors';
import SearchInput from './SearchInput';
import {
  computeTreeLayout,
  computeDecadeTicks,
  bezierPath,
  getYear,
  yearToWorldY,
  type GroupBy,
  type LayoutOptions,
  type InfluenceLayout,
  type Position2D,
  type StyleZone,
} from '../utils/layout';

// World-space sizes
const NODE_RADIUS = 32; // Base radius for musician nodes, scaled by zoom level in the view state
const ICON_SIZE = 60; // Size for the photo icons

type DeckVS = { target: [number, number, number]; zoom: number; minZoom: number; maxZoom: number };

export default function InfluenceView({
  musicians,
  onSelect,
  selectedId,
  styleFilter,
  onStyleFilterChange,
}: {
  musicians: Musician[];
  onSelect: (m: Musician) => void;
  selectedId: string | null;
  styleFilter: string | null;
  onStyleFilterChange: (style: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dimsRef = useRef({ width: 0, height: 0 });
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoveredStyle, setHoveredStyle] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupBy>('style');
  const [scatter, setScatter] = useState(true);
  const [search, setSearch] = useState('');
  const [textFilter, setTextFilter] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [yearRange, setYearRange] = useState<[number, number] | null>(null);

  const { minYear, maxYear } = useMemo(() => {
    const years = musicians
      .filter((m) => m.activeFrom)
      .map((m) => parseInt(m.activeFrom));
    if (!years.length) return { minYear: 1880, maxYear: 1990 };
    return { minYear: Math.min(...years), maxYear: Math.max(...years) };
  }, [musicians]);

  const effectiveYearRange: [number, number] = yearRange ?? [minYear, maxYear];

  const completeMusicians = useMemo(() => {
    const valid = musicians.filter((m) =>
      m.name && m.bluesStyle && m.instrument && m.description && m.birthPlace && m.activeFrom
    );
    const styleFiltered = styleFilter ? valid.filter((m) => m.bluesStyle === styleFilter) : valid;
    if (!yearRange) return styleFiltered;
    const [y0, y1] = yearRange;
    return styleFiltered.filter((m) => {
      const y = parseInt(m.activeFrom);
      return y >= y0 && y <= y1;
    });
  }, [musicians, styleFilter, yearRange]);

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

  // Block browser pinch-to-zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
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

    setDeckVS({
      target: [0, 0, 0],
      zoom: fitZoom,
      minZoom: fitZoom,
      maxZoom: 2.5,
    });
  }, [dims.width, dims.height, deckVS]);

  const WW = worldRef.current?.w ?? 1400;
  const WH = worldRef.current?.h ?? 2500;

  const { positions, styleZones, edges, playedWithEdges, decadeTicks } = useMemo(() => {
    if (!dims.width || !dims.height || !worldRef.current)
      return { positions: {} as InfluenceLayout, styleZones: [] as StyleZone[], edges: [] as { path: Position2D[]; targetId: string; sourceId: string }[], playedWithEdges: [] as { path: Position2D[]; targetId: string; sourceId: string }[], decadeTicks: [] };

    const { w, h } = worldRef.current;
    const layoutOptions: LayoutOptions = { groupBy, scatter };
    const { positions, styleZones } = computeTreeLayout(displayMusicians, w, h, layoutOptions);

    const edges = displayMusicians.flatMap((m) =>
      m.influences
        .map((srcId) => {
          const from = positions[srcId];
          const to = positions[m.id];
          if (!from || !to) return null;
          return { path: bezierPath(from, to), targetId: m.id, sourceId: srcId };
        })
        .filter(Boolean)
    ) as { path: Position2D[]; targetId: string; sourceId: string }[];

    const playedWithEdges = displayMusicians.flatMap((m) =>
      m.playedWith
        .map((srcId) => {
          const from = positions[srcId];
          const to = positions[m.id];
          if (!from || !to) return null;
          return { path: bezierPath(from, to), targetId: m.id, sourceId: srcId };
        })
        .filter(Boolean)
    ) as { path: Position2D[]; targetId: string; sourceId: string }[];

    const decadeTicks = computeDecadeTicks(h / 2, h);
    return { positions, styleZones, edges, playedWithEdges, decadeTicks };
  }, [displayMusicians, groupBy, scatter, WW, WH]);

  // Build musician data for layers
  const musicianData = useMemo(() => {
    return displayMusicians.map((m) => {
      const pos = positions[m.id];
      if (!pos) return null;
      return { musician: m, position: pos };
    }).filter(Boolean) as { musician: Musician; position: Position2D }[];
  }, [displayMusicians, positions]);

  const focusId = hovered ?? selectedId;
  const focusedMusician = focusId ? displayMusicians.find((m) => m.id === focusId) : null;
  const relatedIds: Set<string> | null = focusedMusician
    ? new Set([
      focusedMusician.id,
      ...focusedMusician.influences,
      ...displayMusicians.filter((m) => m.influences.includes(focusId!)).map((m) => m.id),
      ...focusedMusician.playedWith,
      ...displayMusicians.filter((m) => m.playedWith.includes(focusId!)).map((m) => m.id),
    ])
    : null;

  const effectiveRelatedIds: Set<string> | null = relatedIds
    ? relatedIds
    : hoveredStyle
      ? new Set(displayMusicians.filter((m) => m.bluesStyle === hoveredStyle).map((m) => m.id))
      : null;

  // Handle picking
  const onHover = useCallback((info: PickingInfo) => {
    const m = info.object as { musician: Musician } | undefined;
    setHovered(m?.musician?.id ?? null);
  }, []);

  const onClick = useCallback((info: PickingInfo) => {
    const m = info.object as { musician: Musician } | undefined;
    if (m?.musician) onSelect(m.musician);
  }, [onSelect]);

  const deckLayers = useMemo(() => {
    if (!dims.width || !worldRef.current) return [];

    const { w, h } = worldRef.current;
    const halfH = h / 2;

    const tickLines = decadeTicks.map(({ year, y }) => ({
      path: [[-w / 2, y], [w / 2, y]] as [Position2D, Position2D],
      year,
    }));

    const lifespanData = displayMusicians
      .map((m) => {
        const pos = positions[m.id];
        if (!pos) return null;
        const x = pos[0];
        const yBirth = yearToWorldY(getYear(m.birthDate), halfH, h, 100);
        const deathYear = m.deathDate ? getYear(m.deathDate) : 2025;
        const yDeath = yearToWorldY(deathYear, halfH, h, 100);
        return { musician: m, path: [[x, yBirth], [x, yDeath]] as [Position2D, Position2D] };
      })
      .filter(Boolean) as { musician: Musician; path: [Position2D, Position2D] }[];

    // Style zone background polygons (unused for now, keeping for potential future use)
    // const zoneData = styleZones.map((zone) => {
    //   const [r, g, b] = getStyleColor(zone.style) as [number, number, number];
    //   return {
    //     zone,
    //     path: [
    //       [zone.x, -h / 2 + 100],
    //       [zone.x + zone.width, -h / 2 + 100],
    //       [zone.x + zone.width, h / 2 - 100],
    //       [zone.x, h / 2 - 100],
    //       [zone.x, -h / 2 + 100],
    //     ] as Position2D[],
    //     color: [r, g, b, 12] as [number, number, number, number],
    //   };
    // });

    return [
      // Zone backgrounds
      new PathLayer({
        id: 'zone-borders',
        data: styleZones,
        getPath: (d) => [[d.x, -h / 2 + 100], [d.x, h / 2 - 100]] as Position2D[],
        getColor: (d): [number, number, number, number] => {
          const [r, g, b] = getStyleColor(d.style) as [number, number, number];
          return [r, g, b, 40];
        },
        getWidth: 1,
        widthUnits: 'pixels' as const,
        pickable: false,
      }),
      // Decade grid lines
      new PathLayer({
        id: 'decade-lines',
        data: tickLines,
        getPath: (d) => d.path,
        getColor: (): [number, number, number, number] => [255, 255, 255, 40],
        getWidth: 1,
        widthUnits: 'pixels' as const,
        pickable: false,
      }),
      // Lifespan lines (dim)
      new PathLayer({
        id: 'lifespan-dim',
        data: lifespanData.filter((d) => !focusId || d.musician.id !== focusId),
        getPath: (d) => d.path,
        getColor: (d): [number, number, number, number] => {
          const [r, g, b] = getStyleColor(d.musician.bluesStyle);
          return [r, g, b, focusId ? 20 : 50];
        },
        getWidth: 1.5,
        widthUnits: 'pixels' as const,
        pickable: false,
        updateTriggers: { getColor: [focusId] },
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
          getWidth: 2.5,
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
        getPath: (d) => d.path,
        getColor: (d): [number, number, number, number] => {
          const m = displayMusicians.find((x) => x.id === d.targetId);
          return [...getStyleColor(m?.bluesStyle ?? ''), effectiveRelatedIds ? 18 : 55] as [number, number, number, number];
        },
        getWidth: 1,
        widthUnits: 'pixels' as const,
        pickable: false,
      }),
      // Influence edges (highlighted)
      ...(effectiveRelatedIds
        ? [new PathLayer({
          id: 'edges-highlight',
          data: edges.filter((e) => effectiveRelatedIds.has(e.sourceId) && effectiveRelatedIds.has(e.targetId)),
          getPath: (d) => d.path,
          getColor: (d): [number, number, number, number] => {
            const m = displayMusicians.find((x) => x.id === d.targetId);
            return [...getStyleColor(m?.bluesStyle ?? ''), 210] as [number, number, number, number];
          },
          getWidth: 2,
          widthUnits: 'pixels' as const,
          pickable: false,
        })]
        : []),
      // Played with edges (dim)
      new PathLayer({
        id: 'played-with-dim',
        data: effectiveRelatedIds
          ? playedWithEdges.filter((e) => !effectiveRelatedIds.has(e.sourceId) || !effectiveRelatedIds.has(e.targetId))
          : playedWithEdges,
        getPath: (d) => d.path,
        getColor: (): [number, number, number, number] => [255, 255, 255, effectiveRelatedIds ? 15 : 40],
        getWidth: 1,
        widthUnits: 'pixels' as const,
        pickable: false,
      }),
      // Played with edges (highlighted)
      ...(effectiveRelatedIds
        ? [new PathLayer({
          id: 'played-with-highlight',
          data: playedWithEdges.filter((e) => effectiveRelatedIds.has(e.sourceId) && effectiveRelatedIds.has(e.targetId)),
          getPath: (d) => d.path,
          getColor: (): [number, number, number, number] => [255, 255, 255, 200],
          getWidth: 2,
          widthUnits: 'pixels' as const,
          pickable: false,
        })]
        : []),
      // Musician circles (filled background)
      new ScatterplotLayer({
        id: 'musician-circles',
        data: musicianData,
        getPosition: (d) => d.position,
        getRadius: (d) => d.musician.id === hovered ? NODE_RADIUS * 2 : NODE_RADIUS,
        getFillColor: (d): [number, number, number, number] => {
          const [r, g, b] = getStyleColor(d.musician.bluesStyle);
          const dimmed = effectiveRelatedIds && !effectiveRelatedIds.has(d.musician.id);
          const isSelected = d.musician.id === selectedId;
          const isHovered = d.musician.id === hovered;
          if (dimmed) return [r, g, b, 40];
          if (isSelected || isHovered) return [r, g, b, 255];
          return [r, g, b, 200];
        },
        getLineColor: (d): [number, number, number, number] => {
          const [r, g, b] = getStyleColor(d.musician.bluesStyle);
          const isSelected = d.musician.id === selectedId;
          const isHovered = d.musician.id === hovered;
          if (isSelected) return [255, 255, 255, 255];
          if (isHovered) return [r, g, b, 255];
          return [r, g, b, 180];
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
          getRadius: [hovered],
          getFillColor: [effectiveRelatedIds, selectedId, hovered],
          getLineColor: [selectedId, hovered],
        },
        transitions: {
          getRadius: {
            duration: 150,
            easing: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
          },
        },
      }),
      // Musician photos
      new IconLayer({
        id: 'musician-photos',
        data: musicianData,
        getPosition: (d) => d.position,
        getIcon: (d) => ({
          url: d.musician.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(d.musician.name)}&background=251a0d&color=c8872a&size=80`,
          width: 128,
          height: 128,
          mask: false,
        }),
        getSize: (d) => d.musician.id === hovered ? ICON_SIZE * 2 : ICON_SIZE,
        sizeUnits: 'common' as const,
        pickable: true,
        onHover,
        onClick,
        getColor: (d): [number, number, number, number] => {
          const dimmed = effectiveRelatedIds && !effectiveRelatedIds.has(d.musician.id);
          if (dimmed) return [255, 255, 255, 60];
          return [255, 255, 255, 255];
        },
        updateTriggers: {
          getSize: [hovered],
          getColor: [effectiveRelatedIds],
        },
        transitions: {
          getSize: {
            duration: 150,
            easing: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
          },
        },
      }),
      // Musician labels
      new TextLayer({
        id: 'musician-labels',
        data: musicianData.filter((d) => !effectiveRelatedIds || effectiveRelatedIds.has(d.musician.id)),
        getPosition: (d) => {
          const radius = d.musician.id === hovered ? NODE_RADIUS * 2 : NODE_RADIUS;
          return [d.position[0], d.position[1] + radius + 12];
        },
        getText: (d) => d.musician.name,
        getSize: 14,
        getColor: (d): [number, number, number, number] => {
          const isSelected = d.musician.id === selectedId;
          const isHovered = d.musician.id === hovered;
          if (isSelected) return [245, 237, 224, 255];
          if (isHovered) return [232, 200, 152, 255];
          return [184, 164, 136, effectiveRelatedIds ? 255 : 190];
        },
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'top',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontWeight: '600',
        outlineWidth: 3,
        outlineColor: [0, 0, 0, 200],
        sizeUnits: 'common' as const,
        pickable: false,
        updateTriggers: {
          getPosition: [hovered],
          getColor: [selectedId, hovered, effectiveRelatedIds],
          data: [effectiveRelatedIds],
        },
      }),
      // Zone labels
      new TextLayer({
        id: 'zone-labels',
        data: styleZones,
        getPosition: (d) => [d.x + d.width / 2, h / 2 - 80],
        getText: (d) => groupBy === 'style' ? d.style.replace(' Blues', '') : d.style,
        getSize: 11,
        getColor: (d): [number, number, number, number] => {
          const [r, g, b] = getStyleColor(d.style) as [number, number, number];
          return [r, g, b, 160];
        },
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'top',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontWeight: '700',
        sizeUnits: 'common' as const,
        pickable: false,
      }),
    ];
  }, [dims.width, edges, playedWithEdges, decadeTicks, styleZones, effectiveRelatedIds, positions, focusId, displayMusicians, musicianData, selectedId, hovered, groupBy, WW, WH, onHover, onClick]);

  // Search
  const searchQuery = search.trim().toLowerCase();
  const searchMatches = searchQuery
    ? displayMusicians.filter((m) => m.name.toLowerCase().includes(searchQuery)).slice(0, 8)
    : [];

  const goToMusician = useCallback((m: Musician) => {
    const pos = positions[m.id];
    if (!pos || !deckVS) return;
    setDeckVS({ ...deckVS, target: [pos[0], pos[1], 0], zoom: Math.max(deckVS.zoom, 0.5) });
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
    setDeckVS({ ...deckVS, target: [0, 0, 0], zoom: deckVS.minZoom });
  }, [deckVS]);

  const handleViewStateChange = useCallback(({ viewState }: { viewState: unknown }) => {
    const v = viewState as { target?: [number, number, number]; zoom?: number };
    const z = v.zoom ?? 0;
    const tx = v.target?.[0] ?? 0;
    const ty = v.target?.[1] ?? 0;
    const { width, height } = dimsRef.current;
    const s = 2 ** z;

    // Clamp pan to world bounds
    const { w, h } = worldRef.current!;
    const maxTx = Math.max(0, w / 2 - width / (2 * s));
    const maxTy = Math.max(0, h / 2 - height / (2 * s));
    const ctx = Math.max(-maxTx, Math.min(maxTx, tx));
    const cty = Math.max(-maxTy, Math.min(maxTy, ty));

    setDeckVS((prev) => prev ? { ...prev, target: [ctx, cty, 0], zoom: z } : null);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-bg select-none"
      style={{ touchAction: 'none' }}
    >
      {deckVS !== null && (
        <>
          <DeckGL
            views={[new OrthographicView({ id: 'ortho', controller: true })]}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            viewState={deckVS as any}
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
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: screenY,
                    transform: 'translateY(-50%)',
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.5)',
                    fontFamily: 'Georgia, serif',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {year}
                </div>
              );
            })}
          </div>

          {/* Left search panel */}
          <div className="absolute left-3 sm:left-4 top-3 sm:top-4 z-40 flex flex-col gap-2" style={{ width: 220 }}>
            <div className="relative">
              <SearchInput
                ref={searchInputRef}
                value={search}
                onChange={setSearch}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchMatches[0]) goToMusician(searchMatches[0]);
                  if (e.key === 'Escape') setSearch('');
                }}
                placeholder="Find by name…"
              />
              {searchMatches.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-[#0f0c07] border border-[#2a1e0e] rounded-lg overflow-hidden shadow-xl z-50 max-h-60 overflow-y-auto">
                  {searchMatches.map((m) => {
                    const hex = getStyleHex(m.bluesStyle);
                    return (
                      <button key={m.id} onClick={() => goToMusician(m)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1a1208] transition-colors">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: hex }} />
                        <span className="text-[0.8rem] text-ink flex-1 truncate">{m.name}</span>
                        <span className="text-[0.65rem] shrink-0" style={{ color: hex }}>{m.bluesStyle.replace(' Blues', '')}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <SearchInput
              value={textFilter}
              onChange={setTextFilter}
              placeholder="Filter by description or albums…"
            />
            {textFilter && (
              <p className="text-[0.65rem] text-ink3 px-0.5">{displayMusicians.length} musician{displayMusicians.length !== 1 ? 's' : ''} shown</p>
            )}

            {/* Year range filter */}
            <div className="bg-bg/90 border border-[#2a1e0e] rounded-lg px-3 py-2 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.6rem] text-accent tracking-widest uppercase">Active years</span>
                {yearRange && (
                  <button
                    onClick={() => setYearRange(null)}
                    className="text-[0.55rem] text-ink3 hover:text-ink transition-colors"
                  >
                    reset
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between text-[0.65rem] text-ink3">
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
                <div className="absolute w-full h-1 rounded bg-[#2a1e0e]" style={{ zIndex: 1 }}>
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
          </div>

          {/* Top bar: group-by + scatter */}
          <div className="absolute top-3 sm:top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
            <div className="flex items-center bg-bg/90 border border-[#2a1e0e] rounded-lg p-0.5 gap-0.5">
              {(['style', 'instrument'] as GroupBy[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setGroupBy(mode)}
                  className={`px-2 sm:px-3 py-1 rounded text-[0.65rem] sm:text-xs font-semibold tracking-wide uppercase transition-all ${groupBy === mode ? 'bg-accent text-bg' : 'text-ink3 hover:text-ink'}`}
                >
                  {mode === 'style' ? 'Style' : 'Instrument'}
                </button>
              ))}
            </div>

            <button
              onClick={() => setScatter((s) => !s)}
              title={scatter ? 'Switch to sorted lines' : 'Switch to scattered layout'}
              className={`px-2 sm:px-3 py-1 rounded-lg text-[0.65rem] sm:text-xs font-semibold tracking-wide uppercase transition-all bg-bg/90 border border-[#2a1e0e] ${scatter ? 'bg-accent text-bg' : 'text-ink3 hover:text-ink'}`}
            >
              Scatter
            </button>
          </div>

          {/* Zoom controls */}
          <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-1">
            <button
              onClick={() => handleZoom(0.4)}
              title="Zoom in"
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg/90 border border-[#2a1e0e] text-ink3 hover:text-ink hover:border-accent/60 text-base transition-colors"
            >
              +
            </button>
            <button
              onClick={() => handleZoom(-0.4)}
              title="Zoom out"
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg/90 border border-[#2a1e0e] text-ink3 hover:text-ink hover:border-accent/60 text-base transition-colors"
            >
              −
            </button>
            <button
              onClick={handleReset}
              title="Reset view"
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg/90 border border-[#2a1e0e] text-ink3 hover:text-ink hover:border-accent/60 text-xs transition-colors mt-1"
            >
              ⊙
            </button>
          </div>

          {/* Color legend */}
          <div className="hidden sm:flex absolute bottom-5 left-15 flex-col z-40 bg-bg/90 border border-[#2a1e0e] rounded-lg py-2">
            <button
              onClick={() => setLegendOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 pb-1 text-[0.6rem] text-accent tracking-widest uppercase hover:text-accent2 transition-colors"
            >
              Blues Style
              <span className="text-[0.55rem] opacity-60">{legendOpen ? '▲' : '▼'}</span>
            </button>
            {legendOpen && CANONICAL_STYLES.filter((style) => completeMusicians.some((m) => m.bluesStyle === style)).map((style) => {
              const [r, g, b] = STYLE_COLORS[style] ?? [150, 150, 150];
              const isActive = hoveredStyle === style;
              return (
                <div
                  key={style}
                  className="flex items-center gap-2 px-3 py-0.5 cursor-pointer transition-colors"
                  style={{
                    background: isActive || styleFilter === style ? `rgba(${r},${g},${b},0.15)` : undefined,
                    color: isActive || styleFilter === style ? `rgb(${r},${g},${b})` : 'rgba(255,255,255,0.65)',
                  }}
                  onMouseEnter={() => setHoveredStyle(style)}
                  onMouseLeave={() => setHoveredStyle(null)}
                  onClick={() => onStyleFilterChange(styleFilter === style ? null : style)}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0 transition-transform"
                    style={{
                      background: `rgb(${r},${g},${b})`,
                      transform: isActive || styleFilter === style ? 'scale(1.3)' : 'scale(1)',
                      boxShadow: isActive || styleFilter === style ? `0 0 5px rgba(${r},${g},${b},0.6)` : 'none',
                    }}
                  />
                  <span className="text-[0.7rem] flex-1">{style}</span>
                  {styleFilter === style && (
                    <span className="text-[0.6rem] opacity-50">✕</span>
                  )}
                </div>
              );
            })}
          </div>


          {/* Hover tooltip */}
          {hovered && !selectedId && (() => {
            const m = displayMusicians.find((x) => x.id === hovered);
            if (!m) return null;
            return (
              <div className="absolute bottom-4 sm:bottom-5 left-1/2 -translate-x-1/2 max-w-[90vw] bg-[#0f0c07]/95 border border-accent/60 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 flex items-center gap-2 sm:gap-3 pointer-events-none z-50 shadow-lg overflow-hidden">
                <strong className="text-ink text-xs sm:text-sm truncate">{m.name}</strong>
                <span className="text-ink3 text-xs shrink-0">
                  {getYear(m.birthDate)}{m.deathDate ? ` – ${getYear(m.deathDate)}` : ''}
                </span>
                <span className="hidden sm:inline text-xs px-1.5 py-0.5 rounded shrink-0" style={{ color: getStyleHex(m.bluesStyle), border: `1px solid ${getStyleHex(m.bluesStyle)}40`, background: `${getStyleHex(m.bluesStyle)}15` }}>
                  {m.bluesStyle}
                </span>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
