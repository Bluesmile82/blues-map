import { useRef, useState, useEffect, useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { OrthographicView } from '@deck.gl/core';
import { PathLayer, TextLayer } from '@deck.gl/layers';
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
        // Positioned so that world origin (0,0) = top-left of canvas at zoom=0, pan=0.
        // CSS transform on the parent container handles pan+zoom.
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

const INITIAL_VS = { target: [0, 0, 0] as [number, number, number], zoom: 0, minZoom: -3, maxZoom: 5 };
const BASE_NODE_SIZE = 40; // px at zoom=0

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
    m.name && m.bluesStyle && m.instrument && m.description && m.birthPlace && m.image && m.activeFrom
  ), [musicians]);

  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dimsRef = useRef({ width: 0, height: 0 });
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('style');
  // zoom state only for node size calculation (not for positioning)
  const [zoom, setZoom] = useState(0);

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

  const { positions, styleZones, edges, decadeTicks } = useMemo(() => {
    if (!dims.width || !dims.height)
      return { positions: {} as InfluenceLayout, styleZones: [] as StyleZone[], edges: [] as { path: Position2D[]; targetId: string; sourceId: string }[], decadeTicks: [] };

    const { positions, styleZones } = computeTreeLayout(completeMusicians, dims.width, dims.height, groupBy);

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

    const decadeTicks = computeDecadeTicks(dims.height / 2, dims.height);
    return { positions, styleZones, edges, decadeTicks };
  }, [dims, completeMusicians, groupBy]);

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
    if (!dims.width) return [];

    const halfH = dims.height / 2;

    const tickLines = decadeTicks.map(({ year, y }) => ({
      path: [[-dims.width / 2 + 95, y], [dims.width / 2, y]] as [Position2D, Position2D],
      year,
    }));

    // Lifespan segments: birth → death (or 2025) at each musician's X position
    const lifespanData = completeMusicians
      .map((m) => {
        const pos = positions[m.id];
        if (!pos) return null;
        const x = pos[0];
        const yBirth = yearToWorldY(getYear(m.birthDate), halfH, dims.height, 100);
        const deathYear = m.deathDate ? getYear(m.deathDate) : 2025;
        const yDeath = yearToWorldY(deathYear, halfH, dims.height, 100);
        return { musician: m, path: [[x, yBirth], [x, yDeath]] as [Position2D, Position2D] };
      })
      .filter(Boolean) as { musician: Musician; path: [Position2D, Position2D] }[];

    return [
      // Decade grid lines
      new PathLayer({
        id: 'decade-lines',
        data: tickLines,
        getPath: (d) => d.path,
        getColor: (): [number, number, number, number] => [255, 255, 255, 60],
        getWidth: 1,
        widthUnits: 'pixels' as const,
        pickable: false,
      }),

      // Decade year labels
      new TextLayer({
        id: 'decade-labels',
        data: decadeTicks,
        getPosition: (d) => [-dims.width / 2 + 88, d.y] as Position2D,
        getText: (d) => String(d.year),
        getSize: 11,
        sizeUnits: 'pixels' as const,
        getColor: (): [number, number, number, number] => [255, 255, 255, 230],
        getTextAnchor: 'end' as const,
        getAlignmentBaseline: 'center' as const,
        fontFamily: 'Georgia, serif',
        pickable: false,
      }),

      // Lifespan lines (dim for all musicians)
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

      // Lifespan line for focused musician (bright, wider)
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

      // Dim edges
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

      // Highlighted edges
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
  }, [dims, edges, decadeTicks, relatedIds, positions, focusId, completeMusicians]);

  const scale = 2 ** zoom;
  const nodeSize = Math.max(32, Math.min(120, BASE_NODE_SIZE * scale));

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-bg select-none">
      {dims.width > 0 && (
        <>
          {/* Deck.gl canvas (edges + grid) */}
          <DeckGL
            views={[new OrthographicView({ id: 'ortho', controller: true })]}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            initialViewState={INITIAL_VS as any}
            onViewStateChange={({ viewState }: { viewState: unknown }) => {
              const v = viewState as { target?: [number, number, number]; zoom?: number };
              const z = v.zoom ?? 0;
              const tx = v.target?.[0] ?? 0;
              const ty = v.target?.[1] ?? 0;
              const { width, height } = dimsRef.current;
              const s = 2 ** z;

              // Update overlay transform synchronously (same frame as deck.gl render)
              const el = overlayRef.current;
              if (el) {
                // deck.gl OrthographicView: y+ = DOWN (screen convention).
                // Screen position of world (wx, wy) after pan (tx,ty) zoom s:
                //   screenX = W/2 + (wx - tx)*s
                //   screenY = H/2 + (wy - ty)*s   ← y+ DOWN, no sign flip
                // Node initially placed at (W/2 + wx, H/2 + wy).
                // CSS transform translate(ox,oy) scale(s) with transform-origin 0,0:
                //   ox + (W/2+wx)*s = W/2 + (wx-tx)*s  →  ox = W/2*(1-s) - tx*s
                //   oy + (H/2+wy)*s = H/2 + (wy-ty)*s  →  oy = H/2*(1-s) - ty*s
                const ox = width / 2 * (1 - s) - tx * s;
                const oy = height / 2 * (1 - s) - ty * s;
                el.style.transform = `translate(${ox}px,${oy}px) scale(${s})`;
              }

              setZoom(z);
            }}
            layers={deckLayers}
            getCursor={() => 'grab'}
            style={{ position: 'absolute', top: '0', left: '0', right: '0', bottom: '0' }}
          />

          {/* HTML node overlay – positioned at initial zoom=0,pan=0 coords;
              parent container is transformed via CSS to stay in sync with deck.gl */}
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
              const bandTop = 100; // overlay Y for newest year (top of time range)
              const bandHeight = dims.height - 200; // full time range height
              return (
                <div key={zone.style}>
                  {/* Colored background fill */}
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
                  {/* Style label at bottom of band */}
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
              // Initial pixel position at zoom=0, pan=0 (y+ = DOWN, so +wy goes down)
              const px = dims.width / 2 + wx - nodeSize / 2;
              const py = dims.height / 2 + wy - nodeSize / 2;

              const isSel = m.id === selectedId;
              const isHov = m.id === hovered;
              const dimmed = !!relatedIds && !relatedIds.has(m.id);

              return (
                <div key={m.id} style={{ pointerEvents: 'auto' }}>
                  <MusicianNode
                    musician={m}
                    x={px}
                    y={py}
                    size={nodeSize}
                    isSelected={isSel}
                    isHovered={isHov}
                    dimmed={dimmed}
                    onSelect={onSelect}
                    onHover={setHovered}
                  />
                  {/* Name label below node */}
                  {(!relatedIds || relatedIds.has(m.id)) && (
                    <div
                      style={{
                        position: 'absolute',
                        left: px + nodeSize / 2,
                        top: py + nodeSize + 6,
                        transform: 'translateX(-50%)',
                        whiteSpace: 'nowrap',
                        fontSize: Math.max(11, Math.min(15, 12 * scale)),
                        fontWeight: scale > 0.5 ? '600' : '500',
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

          {/* Group-by switch */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center bg-bg/90 border border-bg3 rounded-lg p-1 gap-1">
            {(['style', 'instrument'] as GroupBy[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setGroupBy(mode)}
                className={`px-3 py-1 rounded text-xs font-semibold tracking-wide uppercase transition-all ${
                  groupBy === mode
                    ? 'bg-accent text-bg'
                    : 'text-ink3 hover:text-ink'
                }`}
              >
                {mode === 'style' ? 'Blues Style' : 'Instrument'}
              </button>
            ))}
          </div>

          {/* Color legend */}
          <div className="absolute bottom-5 right-5 bg-bg/90 border border-bg3 rounded-lg px-3.5 py-3 flex flex-col gap-1.5 pointer-events-none z-40">
            <p className="text-[0.62rem] text-accent tracking-widest uppercase mb-0.5">Blues Style</p>
            {Object.entries(STYLE_COLORS).map(([style, [r, g, b]]) => (
              <div key={style} className="flex items-center gap-2 text-[0.72rem] text-ink2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/10"
                  style={{ background: `rgb(${r},${g},${b})` }} />
                {style}
              </div>
            ))}
          </div>

          {/* Time axis label */}
          <div
            className="absolute left-2 top-1/2 flex flex-col items-center gap-1 pointer-events-none"
            style={{ transform: 'translateY(-50%) rotate(-90deg)', transformOrigin: 'center center' }}
          >
            <span className="text-[0.6rem] tracking-widest whitespace-nowrap" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>EARLIEST ↑ TIME ↑ PRESENT</span>
          </div>

          {/* Hover tooltip */}
          {hovered && !selectedId && (() => {
            const m = completeMusicians.find((x) => x.id === hovered);
            if (!m) return null;
            return (
               <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-bg2/95 border border-accent/60 rounded-lg px-4 py-2.5 flex items-center gap-3 pointer-events-none whitespace-nowrap z-50 shadow-lg">
                 <strong className="text-ink text-sm">{m.name}</strong>
                  <span className="text-ink3 text-xs">
                    {getYear(m.birthDate)}{m.deathDate ? ` – ${getYear(m.deathDate)}` : ''}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: getStyleHex(m.bluesStyle), border: `1px solid ${getStyleHex(m.bluesStyle)}40`, background: `${getStyleHex(m.bluesStyle)}15` }}>
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
