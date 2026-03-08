import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { OrthographicView } from '@deck.gl/core';
import { PathLayer } from '@deck.gl/layers';
import type { Musician } from '../types';
import { getStyleColor, getStyleHex, STYLE_COLORS } from '../utils/colors';
import {
  computeTreeLayout,
  computeDecadeTicks,
  bezierPath,
  getYear,
  yearToWorldY,
  type GroupBy,
  type InfluenceLayout,
  type Position2D,
  type StyleZone,
} from '../utils/layout';

// Screen-space sizes (px on screen, independent of zoom)
const BASE_NODE_SCREEN = 50; // node diameter at zoom=0
const MIN_NODE_SCREEN = 50;  // never shrink below this on zoom-out
const MAX_NODE_SCREEN = 60;  // cap on zoom-in
const LABEL_SCREEN_SIZE = 11; // font-size always 11px on screen
const LABEL_GAP_SCREEN = 4;   // gap between node bottom and label

/** Circular musician photo node rendered as HTML over the deck.gl canvas */
function MusicianNode({
  musician, x, y, size,
  isSelected, isHovered, dimmed,
  onSelect, onHover,
}: {
  musician: Musician; x: number; y: number; size: number;
  isSelected: boolean; isHovered: boolean; dimmed: boolean;
  onSelect: (m: Musician) => void;
  onHover: (id: string | null) => void;
}) {
  const hex = getStyleHex(musician.bluesStyle);
  const [r, g, b] = getStyleColor(musician.bluesStyle) as [number, number, number];
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const borderW = isSelected ? 3 : isHovered ? 2.5 : 2;
  const shadow = isSelected
    ? `0 0 0 4px rgba(${r},${g},${b},0.35), 0 0 22px rgba(${r},${g},${b},0.55)`
    : isHovered
      ? `0 0 0 2px rgba(${r},${g},${b},0.25), 0 0 10px rgba(${r},${g},${b},0.4)`
      : 'none';

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        border: `${borderW}px solid ${hex}`,
        cursor: 'pointer',
        boxShadow: shadow,
        opacity: dimmed ? 0.18 : 1,
        zIndex: isSelected ? 30 : isHovered ? 20 : 10,
        transition: 'opacity 0.2s ease, box-shadow 0.15s ease',
        flexShrink: 0,
      }}
      onMouseDown={(e) => { downRef.current = { x: e.clientX, y: e.clientY }; }}
      onMouseUp={(e) => {
        const dp = downRef.current;
        if (dp && Math.hypot(e.clientX - dp.x, e.clientY - dp.y) < 6) onSelect(musician);
        downRef.current = null;
      }}
      onMouseEnter={() => onHover(musician.id)}
      onMouseLeave={() => onHover(null)}
    >
      <img
        src={musician.image}
        alt={musician.name}
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'sepia(12%)' }}
        onError={(e) => {
          (e.target as HTMLImageElement).src =
            `https://ui-avatars.com/api/?name=${encodeURIComponent(musician.name)}&background=251a0d&color=c8872a&size=80`;
        }}
      />
    </div>
  );
}

type DeckVS = { target: [number, number, number]; zoom: number; minZoom: number; maxZoom: number };

export default function InfluenceView({
  musicians,
  onSelect,
  selectedId,
}: {
  musicians: Musician[];
  onSelect: (m: Musician) => void;
  selectedId: string | null;
}) {
  const completeMusicians = useMemo(() => musicians.filter((m) =>
    m.name && m.bluesStyle && m.instrument && m.description && m.birthPlace && m.activeFrom
  ), [musicians]);

  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const yearAxisRef = useRef<HTMLDivElement>(null);
  const dimsRef = useRef({ width: 0, height: 0 });
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('style');
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // World dimensions locked on first valid dims — stays stable on resize
  const worldRef = useRef<{ w: number; h: number } | null>(null);

  // Controlled view state (enables pan clamping)
  const [deckVS, setDeckVS] = useState<DeckVS | null>(null);

  // Block browser pinch-to-zoom / ctrl+wheel so it doesn't fight the chart zoom
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

  // Init world size and deck view state once dims are known
  useEffect(() => {
    if (dims.width <= 0 || dims.height <= 0 || deckVS !== null) return;
    const WW = Math.max(dims.width, 900);       // fills screen width; min 900 for small devices
    const WH = Math.max(dims.height * 2.5, 2000); // 2.5× taller than screen for time axis
    worldRef.current = { w: WW, h: WH };
    const fitZoom = Math.log2(dims.width / WW);  // 0 on desktop, <0 on mobile
    setDeckVS({
      target: [0, 0, 0],
      zoom: fitZoom,
      minZoom: fitZoom - 0.8,
      maxZoom: 2.5,
    });
  }, [dims.width, dims.height, deckVS]);

  const WW = worldRef.current?.w ?? 1400;
  const WH = worldRef.current?.h ?? 2500;

  const { positions, styleZones, edges, decadeTicks } = useMemo(() => {
    if (!dims.width || !dims.height || !worldRef.current)
      return { positions: {} as InfluenceLayout, styleZones: [] as StyleZone[], edges: [] as { path: Position2D[]; targetId: string; sourceId: string }[], decadeTicks: [] };

    const { w, h } = worldRef.current;
    const { positions, styleZones } = computeTreeLayout(completeMusicians, w, h, groupBy);

    const edges = completeMusicians.flatMap((m) =>
      m.influences
        .map((srcId) => {
          const from = positions[srcId];
          const to = positions[m.id];
          if (!from || !to) return null;
          return { path: bezierPath(from, to), targetId: m.id, sourceId: srcId };
        })
        .filter(Boolean)
    ) as { path: Position2D[]; targetId: string; sourceId: string }[];

    const decadeTicks = computeDecadeTicks(h / 2, h);
    return { positions, styleZones, edges, decadeTicks };
  }, [completeMusicians, groupBy, WW, WH]);

  const focusId = hovered ?? selectedId;
  const focusedMusician = focusId ? completeMusicians.find((m) => m.id === focusId) : null;
  const relatedIds: Set<string> | null = focusedMusician
    ? new Set([
      focusedMusician.id,
      ...focusedMusician.influences,
      ...completeMusicians.filter((m) => m.influences.includes(focusId!)).map((m) => m.id),
    ])
    : null;

  const deckLayers = useMemo(() => {
    if (!dims.width || !worldRef.current) return [];

    const { w, h } = worldRef.current;
    const halfH = h / 2;

    const tickLines = decadeTicks.map(({ year, y }) => ({
      path: [[-w / 2, y], [w / 2, y]] as [Position2D, Position2D],
      year,
    }));

    const lifespanData = completeMusicians
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

    return [
      new PathLayer({
        id: 'decade-lines',
        data: tickLines,
        getPath: (d) => d.path,
        getColor: (): [number, number, number, number] => [255, 255, 255, 40],
        getWidth: 1,
        widthUnits: 'pixels' as const,
        pickable: false,
      }),
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
      new PathLayer({
        id: 'edges-dim',
        data: relatedIds
          ? edges.filter((e) => !relatedIds.has(e.sourceId) || !relatedIds.has(e.targetId))
          : edges,
        getPath: (d) => d.path,
        getColor: (d): [number, number, number, number] => {
          const m = completeMusicians.find((x) => x.id === d.targetId);
          return [...getStyleColor(m?.bluesStyle ?? ''), relatedIds ? 18 : 55] as [number, number, number, number];
        },
        getWidth: 1,
        widthUnits: 'pixels' as const,
        pickable: false,
      }),
      ...(relatedIds
        ? [new PathLayer({
          id: 'edges-highlight',
          data: edges.filter((e) => relatedIds.has(e.sourceId) && relatedIds.has(e.targetId)),
          getPath: (d) => d.path,
          getColor: (d): [number, number, number, number] => {
            const m = completeMusicians.find((x) => x.id === d.targetId);
            return [...getStyleColor(m?.bluesStyle ?? ''), 210] as [number, number, number, number];
          },
          getWidth: 2,
          widthUnits: 'pixels' as const,
          pickable: false,
        })]
        : []),
    ];
  }, [dims.width, edges, decadeTicks, relatedIds, positions, focusId, completeMusicians, WW, WH]);

  // Scale factor at current zoom
  const scale = 2 ** (deckVS?.zoom ?? 0);

  // Local sizes (within overlay which is CSS-scaled by `scale`).
  // visual_px = localSize * scale
  // visual = clamp(BASE * scale, MIN, MAX) → nodeLocalSize = visual / scale
  const visualNodeSize = Math.min(MAX_NODE_SCREEN, Math.max(MIN_NODE_SCREEN, BASE_NODE_SCREEN * scale));
  const nodeLocalSize = visualNodeSize / scale;
  const fontLocalSize = LABEL_SCREEN_SIZE / scale;   // always 11px on screen
  const labelGapLocal = LABEL_GAP_SCREEN / scale;    // always 4px on screen

  // Style zone bands in overlay space
  const bandTop = dims.height / 2 - WH / 2 + 100;
  const bandHeight = WH - 200;

  // Search
  const searchQuery = search.trim().toLowerCase();
  const searchMatches = searchQuery
    ? completeMusicians.filter((m) => m.name.toLowerCase().includes(searchQuery)).slice(0, 8)
    : [];

  const goToMusician = useCallback((m: Musician) => {
    const pos = positions[m.id];
    if (!pos || !deckVS) return;
    setDeckVS({ ...deckVS, target: [pos[0], pos[1], 0] });
    onSelect(m);
    setSearch('');
  }, [positions, deckVS, onSelect]);

  const handleZoom = useCallback((delta: number) => {
    if (!deckVS) return;
    const newZoom = Math.max(deckVS.minZoom, Math.min(deckVS.maxZoom, deckVS.zoom + delta));
    setDeckVS({ ...deckVS, zoom: newZoom });
  }, [deckVS]);

  const handleReset = useCallback(() => {
    if (!deckVS || !worldRef.current) return;
    const fitZoom = Math.log2(dims.width / worldRef.current.w);
    setDeckVS({ ...deckVS, target: [0, 0, 0], zoom: fitZoom });
  }, [deckVS, dims.width]);

  // Sync HTML overlay whenever deckVS changes (covers programmatic zoom/pan from buttons).
  // onViewStateChange does the same synchronously during user drag for smoothness,
  // but does NOT fire for programmatic state updates — this effect fills that gap.
  useEffect(() => {
    if (!deckVS) return;
    const { width, height } = dimsRef.current;
    const [ctx, cty] = [deckVS.target[0], deckVS.target[1]];
    const s = 2 ** deckVS.zoom;

    const el = overlayRef.current;
    if (el) {
      const ox = width / 2 * (1 - s) - ctx * s;
      const oy = height / 2 * (1 - s) - cty * s;
      el.style.transform = `translate(${ox}px,${oy}px) scale(${s})`;
    }

    const axis = yearAxisRef.current;
    if (axis) {
      axis.querySelectorAll<HTMLElement>('[data-wy]').forEach((label) => {
        const wy = parseFloat(label.dataset.wy ?? '0');
        const screenY = height / 2 + (wy - cty) * s;
        label.style.top = `${screenY}px`;
        label.style.display = screenY < 8 || screenY > height - 8 ? 'none' : 'block';
      });
    }
  }, [deckVS]);

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
            onViewStateChange={({ viewState }: { viewState: unknown }) => {
              const v = viewState as { target?: [number, number, number]; zoom?: number };
              const z = v.zoom ?? 0;
              const tx = v.target?.[0] ?? 0;
              const ty = v.target?.[1] ?? 0;
              const { width, height } = dimsRef.current;
              const s = 2 ** z;

              // Clamp pan to world bounds so user can't scroll into empty space
              const { w, h } = worldRef.current!;
              const maxTx = Math.max(0, w / 2 - width / (2 * s));
              const maxTy = Math.max(0, h / 2 - height / (2 * s));
              const ctx = Math.max(-maxTx, Math.min(maxTx, tx));
              const cty = Math.max(-maxTy, Math.min(maxTy, ty));

              // Update overlay transform directly (no React re-render, runs every frame)
              const el = overlayRef.current;
              if (el) {
                const ox = width / 2 * (1 - s) - ctx * s;
                const oy = height / 2 * (1 - s) - cty * s;
                el.style.transform = `translate(${ox}px,${oy}px) scale(${s})`;
              }

              // Update year axis labels directly in DOM
              const axis = yearAxisRef.current;
              if (axis) {
                axis.querySelectorAll<HTMLElement>('[data-wy]').forEach((label) => {
                  const wy = parseFloat(label.dataset.wy ?? '0');
                  const screenY = height / 2 + (wy - cty) * s;
                  label.style.top = `${screenY}px`;
                  label.style.display = screenY < 8 || screenY > height - 8 ? 'none' : 'block';
                });
              }

              // Update controlled view state (enables pan clamp + re-renders nodes)
              setDeckVS({ target: [ctx, cty, 0], zoom: z, minZoom: deckVS.minZoom, maxZoom: 2.5 });
            }}
            layers={deckLayers}
            getCursor={() => 'grab'}
            style={{ position: 'absolute', top: '0', left: '0', right: '0', bottom: '0' }}
          />

          {/* Fixed year axis — labels positioned via direct DOM in onViewStateChange */}
          <div
            ref={yearAxisRef}
            className="hidden sm:block absolute left-0 top-0 bottom-0 pointer-events-none z-30"
            style={{ width: 52 }}
          >
            {decadeTicks.map(({ year, y }) => (
              <div
                key={year}
                data-wy={y}
                style={{
                  position: 'absolute',
                  right: 6,
                  transform: 'translateY(-50%)',
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.5)',
                  fontFamily: 'Georgia, serif',
                  whiteSpace: 'nowrap',
                  top: dims.height / 2 + y, // initial position before first onViewStateChange
                }}
              >
                {year}
              </div>
            ))}
          </div>

          {/* HTML node overlay – transformed in sync with deck.gl camera */}
          <div
            ref={overlayRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 0,
              height: 0,
              transformOrigin: '0 0',
              pointerEvents: 'none',
            }}
          >
            {/* Style background bands */}
            {styleZones.map((zone) => {
              const [r, g, b] = getStyleColor(zone.style) as [number, number, number];
              return (
                <div key={zone.style}>
                  <div style={{
                    position: 'absolute',
                    left: dims.width / 2 + zone.x,
                    top: bandTop,
                    width: zone.width,
                    height: bandHeight,
                    background: `rgba(${r},${g},${b},0.05)`,
                    borderLeft: `1px solid rgba(${r},${g},${b},0.15)`,
                    pointerEvents: 'none',
                  }} />
                  <div style={{
                    position: 'absolute',
                    left: dims.width / 2 + zone.x + zone.width / 2,
                    top: bandTop + bandHeight + 8,
                    transform: 'translateX(-50%)',
                    color: `rgba(${r},${g},${b},0.65)`,
                    fontSize: 9,
                    fontWeight: '700',
                    letterSpacing: '0.07em',
                    whiteSpace: 'nowrap',
                    textTransform: 'uppercase' as const,
                    pointerEvents: 'none',
                  }}>
                    {groupBy === 'style' ? zone.style.replace(' Blues', '') : zone.style}
                  </div>
                </div>
              );
            })}

            {completeMusicians.map((m) => {
              const pos = positions[m.id];
              if (!pos) return null;
              const [wx, wy] = pos;
              // Centre of node in overlay-local coords
              const cx = dims.width / 2 + wx;
              const cy = dims.height / 2 + wy;
              const px = cx - nodeLocalSize / 2;
              const py = cy - nodeLocalSize / 2;

              const isSel = m.id === selectedId;
              const isHov = m.id === hovered;
              const dimmed = !!relatedIds && !relatedIds.has(m.id);

              return (
                <div key={m.id} style={{ pointerEvents: 'auto' }}>
                  <MusicianNode
                    musician={m}
                    x={px}
                    y={py}
                    size={nodeLocalSize}
                    isSelected={isSel}
                    isHovered={isHov}
                    dimmed={dimmed}
                    onSelect={onSelect}
                    onHover={setHovered}
                  />
                  {(!relatedIds || relatedIds.has(m.id)) && (
                    <div
                      style={{
                        position: 'absolute',
                        left: cx,
                        top: py + nodeLocalSize + labelGapLocal,
                        transform: 'translateX(-50%)',
                        whiteSpace: 'nowrap',
                        fontSize: fontLocalSize,
                        fontWeight: '600',
                        color: isSel ? '#f5ede0' : isHov ? '#e8c898' : '#b8a488',
                        pointerEvents: 'none',
                        textAlign: 'center',
                        textShadow: '0 2px 8px rgba(0,0,0,0.95)',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        opacity: relatedIds ? 1 : 0.75,
                        transition: 'opacity 0.2s',
                      }}
                    >
                      {m.name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Top bar: group-by + search ── */}
          <div className="absolute top-3 sm:top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
            {/* Group-by switch */}
            <div className="flex items-center bg-bg/90 border border-[#2a1e0e] rounded-lg p-0.5 gap-0.5">
              {(['style', 'instrument'] as GroupBy[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setGroupBy(mode)}
                  className={`px-2 sm:px-3 py-1 rounded text-[0.65rem] sm:text-xs font-semibold tracking-wide uppercase transition-all ${groupBy === mode ? 'bg-accent text-bg' : 'text-ink3 hover:text-ink'
                    }`}
                >
                  {mode === 'style' ? 'Style' : 'Instrument'}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchMatches[0]) goToMusician(searchMatches[0]);
                  if (e.key === 'Escape') setSearch('');
                }}
                placeholder="Search…"
                className="min-w-56 sm:w-40 bg-bg/90 border border-[#2a1e0e] rounded-lg px-2.5 py-1 text-[0.75rem] text-ink placeholder-ink3 outline-none focus:border-accent/60 transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink3 hover:text-ink text-xs"
                >
                  ✕
                </button>
              )}
              {/* Dropdown results */}
              {searchMatches.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-[#0f0c07] border border-[#2a1e0e] rounded-lg overflow-hidden shadow-xl z-50 max-h-60 overflow-y-auto">
                  {searchMatches.map((m) => {
                    const hex = getStyleHex(m.bluesStyle);
                    return (
                      <button
                        key={m.id}
                        onClick={() => goToMusician(m)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1a1208] transition-colors"
                      >
                        <img
                          src={m.image}
                          alt={m.name}
                          className="w-6 h-6 rounded-full object-cover shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=251a0d&color=c8872a&size=40`;
                          }}
                        />
                        <span className="text-[0.8rem] text-ink flex-1 truncate">{m.name}</span>
                        <span className="text-[0.65rem] shrink-0" style={{ color: hex }}>{m.bluesStyle.replace(' Blues', '')}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Zoom controls (right side) ── */}
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

          {/* Color legend – hidden on mobile */}
          <div className="hidden sm:flex absolute bottom-5 left-15 bg-bg/90 border border-[#2a1e0e] rounded-lg px-3.5 py-3 flex-col gap-1.5 pointer-events-none z-40">
            <p className="text-[0.62rem] text-accent tracking-widest uppercase mb-0.5">Blues Style</p>
            {Object.entries(STYLE_COLORS).map(([style, [r, g, b]]) => (
              <div key={style} className="flex items-center gap-2 text-[0.72rem] text-ink2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/10"
                  style={{ background: `rgb(${r},${g},${b})` }} />
                {style}
              </div>
            ))}
          </div>

          {/* Hover tooltip */}
          {hovered && !selectedId && (() => {
            const m = completeMusicians.find((x) => x.id === hovered);
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
