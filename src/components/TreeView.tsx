import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { select, zoom as d3Zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3';
import type { Musician } from '../types';
import { getStyleAbbreviation } from '../utils/layout';
import {
  computeBluesTree,
  activeYear,
  FIRST_YEAR,
  YEAR_MAX,
  CANOPY_Y,
  GROUND_Y,
  TRUNK_BASE_Y,
  type TreeMusician,
} from '../utils/treeLayout';
import FiltersPanel from './FiltersPanel';
import { useAtomValue } from 'jotai';
import { favoritesMapAtom } from '../atoms/lists';

// Names are the foliage: pack in as many as fit, most influential first.
const MAX_LABELS = 420;

// A sweetgum leaf: five pointed lobes on a short petiole, drawn pointing up from
// its stem at (0,0) so a rotation can aim it down its twig.
const LEAF_PATH =
  'M 0 0 L 0 -.55 C -.25 -.6 -.75 -.55 -1 -.75 C -.8 -.95 -.55 -1 -.42 -1.15 ' +
  'C -.62 -1.35 -.85 -1.6 -.78 -1.75 C -.55 -1.72 -.34 -1.6 -.22 -1.55 ' +
  'C -.2 -1.8 -.08 -2.1 0 -2.25 C .08 -2.1 .2 -1.8 .22 -1.55 ' +
  'C .34 -1.6 .55 -1.72 .78 -1.75 C .85 -1.6 .62 -1.35 .42 -1.15 ' +
  'C .55 -1 .8 -.95 1 -.75 C .75 -.55 .25 -.6 0 -.55 Z';
const LEAF_SCALE = 7.6;

const WOOD = { light: '#6b4a2f', dark: '#7a5537' };
const WOOD_DARK = { light: '#4a3220', dark: '#523822' };

type Props = {
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
};

export default function TreeView({
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
}: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  /** set as soon as the user pans or zooms, which stops the view re-framing itself */
  const userMovedRef = useRef(false);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [hovered, setHovered] = useState<TreeMusician | null>(null);
  const [search, setSearch] = useState('');
  const [textFilter, setTextFilter] = useState('');
  const [instrumentFilter, setInstrumentFilter] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [filterListId, setFilterListId] = useState<string | null>(null);
  const [yearRange, setYearRange] = useState<[number, number] | null>(null);
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);

  const favoritesMap = useAtomValue(favoritesMapAtom);

  const tree = useMemo(() => computeBluesTree(musicians), [musicians]);
  const yearToY = tree.yearToY;
  const wood = WOOD[theme];
  const woodDark = WOOD_DARK[theme];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDims({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // --- zoom / pan
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.08, 8])
      .on('zoom', (e: { transform: ZoomTransform; sourceEvent?: unknown }) => {
        if (e.sourceEvent) userMovedRef.current = true;
        setTransform(e.transform);
      });
    zoomRef.current = behavior;
    select(svg).call(behavior).on('dblclick.zoom', null);
    return () => { select(svg).on('.zoom', null); };
  }, []);

  const fitTransform = useCallback(() => {
    const { width, height } = dims;
    if (!width || !height) return zoomIdentity;
    const w = tree.maxX - tree.minX;
    const h = TRUNK_BASE_Y - CANOPY_Y + 360;
    // No gutter for the filter rail: it collapses, and the tree's left edge is the
    // sparse end of the canopy. Reserving width for it would shrink the whole tree.
    const k = Math.min(width / w, height / h) * 0.97;
    return zoomIdentity
      .translate(width / 2, height / 2)
      .scale(k)
      .translate(-(tree.minX + w / 2), -(CANOPY_Y + h / 2 - 100));
  }, [dims, tree]);

  // Keep framing the whole tree until the user takes the wheel — the container
  // is often laid out at the wrong size for a frame or two on first paint.
  useEffect(() => {
    if (userMovedRef.current || !dims.width || !svgRef.current || !zoomRef.current) return;
    select(svgRef.current).call(zoomRef.current.transform, fitTransform());
  }, [dims, fitTransform]);

  const zoomTo = useCallback((node: TreeMusician, k = 1.6) => {
    if (!svgRef.current || !zoomRef.current || !dims.width) return;
    const target = zoomIdentity
      .translate(dims.width / 2, dims.height / 2)
      .scale(k)
      .translate(-node.x, -node.y);
    userMovedRef.current = true;
    select(svgRef.current).transition().duration(750).call(zoomRef.current.transform, target);
  }, [dims]);

  useEffect(() => {
    if (!forceZoomToId) return;
    const node = tree.byId.get(forceZoomToId);
    if (node) zoomTo(node);
    onZoomComplete?.();
  }, [forceZoomToId, tree, zoomTo, onZoomComplete]);

  // Selecting a musician leans the view in on them, so it is obvious which leaf
  // is the selected one — but never fights a user who has zoomed in further.
  useEffect(() => {
    if (!selectedId) return;
    const node = tree.byId.get(selectedId);
    if (node) zoomTo(node, Math.max(transform.k, 1.1));
    // Deliberately only on a new selection: re-running on every pan would trap the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // --- filtering
  const query = search.trim().toLowerCase();
  const text = textFilter.trim().toLowerCase();

  const favoritesChecker = useMemo(() => {
    if (!showFavoritesOnly) return null;
    if (filterListId) {
      const set = favoritesMap.get(filterListId);
      return set ? (id: string) => set.has(id) : () => false;
    }
    return (id: string) => {
      for (const set of favoritesMap.values()) if (set.has(id)) return true;
      return false;
    };
  }, [showFavoritesOnly, filterListId, favoritesMap]);

  const matches = useCallback((m: Musician) => {
    if (styleFilter && m.bluesStyle !== styleFilter) return false;
    if (instrumentFilter) {
      const played = [m.instrument, ...(m.secondaryInstruments ?? [])];
      if (!played.some((i) => i === instrumentFilter)) return false;
    }
    if (query && !m.name.toLowerCase().includes(query)) return false;
    if (text) {
      const haystack = `${m.description ?? ''} ${(m.albums ?? []).map((a) => a.name).join(' ')}`.toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    if (yearRange) {
      const y = activeYear(m);
      if (y < yearRange[0] || y > yearRange[1]) return false;
    }
    if (favoritesChecker && !favoritesChecker(m.id)) return false;
    return true;
  }, [styleFilter, instrumentFilter, query, text, yearRange, favoritesChecker]);

  const isDimmed = useCallback((n: TreeMusician) => !matches(n.m), [matches]);

  const shown = useMemo(() => musicians.filter(matches), [musicians, matches]);
  useEffect(() => { onFilteredMusiciansChange?.(shown); }, [shown, onFilteredMusiciansChange]);

  const availableStyles = useMemo(
    () => [...new Set(musicians.map((m) => m.bluesStyle))],
    [musicians]
  );
  const availableInstruments = useMemo(
    () => [...new Set(musicians.flatMap((m) => [m.instrument, ...(m.secondaryInstruments ?? [])]))].filter(Boolean),
    [musicians]
  );
  const { minYear, maxYear } = useMemo(() => {
    const years = musicians.map(activeYear);
    return years.length
      ? { minYear: Math.min(...years), maxYear: Math.max(...years) }
      : { minYear: 1890, maxYear: 2021 };
  }, [musicians]);

  // --- static tree geometry: never re-renders on zoom or hover
  const woodwork = useMemo(() => (
    <g stroke={woodDark} strokeWidth={1.6} strokeLinejoin="round">
      <path d={tree.trunk} fill={wood} opacity={0.92} />
      {/* roots over the trunk, so they read as buttresses rather than a fringe */}
      {tree.roots.map((d, i) => (
        <path key={`root${i}`} d={d} fill={woodDark} opacity={0.9} />
      ))}
      {tree.branches.map((b) => (
        <path
          key={b.key}
          d={b.d}
          fill={b.graft ? 'none' : wood}
          stroke={b.graft ? b.color : 'none'}
          strokeWidth={b.graft ? b.w : undefined}
          strokeLinecap="round"
          opacity={b.graft ? 0.3 : 0.92}
          strokeDasharray={b.graft ? '7 11' : undefined}
        />
      ))}
      {tree.limbs.map((l) => (
        <path key={l.style} d={l.d} fill={wood} opacity={0.9} />
      ))}
      {tree.twigs.map((tw) => (
        <path key={tw.key} d={tw.d} fill={wood} opacity={0.85} />
      ))}
      {/* bark grain last, so it reads on top of the trunk */}
      {tree.bark.map((d, i) => (
        <path key={`bark${i}`} d={d} fill={woodDark} stroke="none" opacity={0.4} />
      ))}
    </g>
  ), [tree, wood, woodDark]);

  const decades = useMemo(() => {
    const out: number[] = [];
    // Below FIRST_YEAR there is only trunk — no decade to label.
    for (let y = Math.ceil(FIRST_YEAR / 10) * 10; y <= YEAR_MAX; y += 10) out.push(y);
    return out;
  }, []);

  // --- musician marks
  // Leaves first, so an influential musician always wins the click where hit areas overlap.
  const drawOrder = useMemo(() => [...tree.nodes].sort((a, b) => b.tier - a.tier), [tree]);

  const marks = useMemo(() => (
    <g>
      {drawOrder.map((n) => {
        const dim = isDimmed(n);
        const o = dim ? 0.12 : 1;
        return (
          <g
            key={n.m.id}
            opacity={o}
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered((h) => (h?.m.id === n.m.id ? null : h))}
            onClick={() => onSelect(n.m)}
          >
            {/* leaves ride a shared twig; only the ones straight on the limb need a stub */}
            {!n.twig && (
              <line x1={n.ax} y1={n.ay} x2={n.x} y2={n.y} stroke={wood} strokeWidth={3.4} opacity={0.6} />
            )}
            {n.tier === 2 ? (
              <path
                d={LEAF_PATH}
                fill={n.color}
                opacity={0.92}
                transform={`translate(${n.x} ${n.y}) rotate(${n.angle + 90}) scale(${LEAF_SCALE})`}
              />
            ) : n.tier === 1 ? (
              <circle cx={n.x} cy={n.y} r={10} fill={n.color} />
            ) : (
              <g>
                <circle cx={n.x} cy={n.y} r={20} fill={n.color} />
                {n.m.image && (
                  <>
                    <clipPath id={`clip-${n.m.id}`}>
                      <circle cx={n.x} cy={n.y} r={17} />
                    </clipPath>
                    <image
                      href={n.m.image}
                      x={n.x - 17}
                      y={n.y - 17}
                      width={34}
                      height={34}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#clip-${n.m.id})`}
                    />
                  </>
                )}
              </g>
            )}
            {/* generous hit area — leaves are tiny */}
            <circle cx={n.x} cy={n.y} r={n.tier === 2 ? 11 : 14} fill="transparent" />
          </g>
        );
      })}
    </g>
  ), [drawOrder, isDimmed, wood, onSelect]);

  const fontPx = transform.k < 0.35 ? 9.5 : transform.k < 0.8 ? 11 : 13;
  const styleFontPx = 15;

  // --- labels: as many as fit at this zoom, laid out greedily so none collide
  const labels = useMemo(() => {
    const k = transform.k;
    if (!dims.width) return [];
    // visible world rect, with a margin so labels near the edge still get placed
    const x0 = (-transform.x - 100) / k;
    const x1 = (dims.width - transform.x + 100) / k;
    const y0 = (-transform.y - 60) / k;
    const y1 = (dims.height - transform.y + 60) / k;

    const candidates = tree.nodes
      .filter((n) => !isDimmed(n) && n.x > x0 && n.x < x1 && n.y > y0 && n.y < y1)
      .sort((a, b) => (a.m.id === selectedId ? -1 : b.m.id === selectedId ? 1 : b.score - a.score));

    const fontWorld = fontPx / k;
    // the style names are already on the canvas — claim their boxes first
    const styleFont = styleFontPx / k;
    const placed: Array<[number, number, number, number]> = tree.limbs.map((l) => {
      const half = (getStyleAbbreviation(l.style).length * styleFont * 0.6) / 2;
      const lx = l.labelX - l.w / 2 - 12;
      return [lx - styleFont * 0.7, l.labelY - half, lx + styleFont * 0.7, l.labelY + half] as
        [number, number, number, number];
    });
    const out: Array<{ n: TreeMusician; x: number; y: number; anchor: 'start' | 'end' }> = [];

    for (const n of candidates) {
      const right = n.x >= n.ax;
      const pad = n.tier === 0 ? 24 : n.tier === 1 ? 13 : 12;
      const lx = n.x + (right ? pad : -pad);
      const w = n.m.name.length * fontWorld * 0.54;
      const box: [number, number, number, number] = [
        right ? lx : lx - w,
        n.y - fontWorld * 0.62,
        right ? lx + w : lx,
        n.y + fontWorld * 0.62,
      ];
      const hits = placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1]);
      if (hits) continue;
      placed.push(box);
      out.push({ n, x: lx, y: n.y, anchor: right ? 'start' : 'end' });
      if (out.length >= MAX_LABELS) break;
    }
    return out;
  }, [tree, transform, dims, isDimmed, selectedId, fontPx, styleFontPx]);

  // --- connections of the focused musician
  const focus = hovered ?? (selectedId ? tree.byId.get(selectedId) ?? null : null);
  const links = useMemo(() => {
    if (!focus) return [];
    const m = focus.m;
    const mk = (ids: string[], kind: 'influence' | 'played') =>
      ids
        .map((id) => tree.byId.get(id))
        .filter((n): n is TreeMusician => !!n)
        .map((n) => ({ n, kind }));
    return [
      ...mk([...(m.influences ?? []), ...(m.influencedBy ?? [])], 'influence'),
      ...mk(m.playedWith ?? [], 'played'),
    ];
  }, [focus, tree]);

  const screen = focus ? { x: transform.applyX(focus.x), y: transform.applyY(focus.y) } : null;

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      <svg ref={svgRef} width="100%" height="100%" className="block touch-none select-none">
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* decade rules */}
          <g pointerEvents="none">
            {decades.map((year) => (
              <g key={year}>
                <line
                  x1={tree.minX} x2={tree.maxX}
                  y1={yearToY(year)} y2={yearToY(year)}
                  stroke="currentColor"
                  className="text-ink3"
                  strokeWidth={1 / transform.k}
                  opacity={year % 50 === 0 ? 0.28 : 0.12}
                />
              </g>
            ))}
            <line
              x1={tree.minX} x2={tree.maxX} y1={GROUND_Y} y2={GROUND_Y}
              stroke={woodDark} strokeWidth={2 / transform.k} opacity={0.5}
            />
          </g>

          {/* canopy wash — reads as foliage when the leaves are too small to see */}
          <g pointerEvents="none">
            {tree.foliage.map((f) => (
              <path
                key={f.style}
                d={f.d}
                fill={f.color}
                opacity={styleFilter && styleFilter !== f.style ? 0.02 : 0.07}
              />
            ))}
          </g>

          {woodwork}

          {/* connections of the focused musician, over the wood, under the marks */}
          <g pointerEvents="none">
            {focus && links.map(({ n, kind }) => (
              <path
                key={`${kind}-${n.m.id}`}
                d={`M ${focus.x} ${focus.y} Q ${(focus.x + n.x) / 2 + (focus.y - n.y) * 0.18} ${(focus.y + n.y) / 2} ${n.x} ${n.y}`}
                fill="none"
                stroke={kind === 'influence' ? focus.color : 'currentColor'}
                className={kind === 'played' ? 'text-ink3' : undefined}
                strokeWidth={kind === 'influence' ? 2.4 / transform.k : 1.4 / transform.k}
                strokeDasharray={kind === 'played' ? `${6 / transform.k} ${6 / transform.k}` : undefined}
                opacity={0.75}
              />
            ))}
          </g>

          {marks}

          {/* halo on the focused musician */}
          {focus && (
            <circle
              cx={focus.x} cy={focus.y}
              r={focus.tier === 0 ? 26 : 14}
              fill="none"
              stroke={focus.color}
              strokeWidth={2.5 / transform.k}
              pointerEvents="none"
            />
          )}

          {/* style names, written along their limb */}
          <g pointerEvents="none">
            {tree.limbs.map((l) => (
              <text
                key={l.style}
                x={l.labelX - l.w / 2 - 12}
                y={l.labelY}
                fontSize={styleFontPx / transform.k}
                textAnchor="middle"
                fill={l.color}
                opacity={styleFilter && styleFilter !== l.style ? 0.15 : 0.8}
                letterSpacing={2.2 / transform.k}
                transform={`rotate(${l.labelAngle} ${l.labelX - l.w / 2 - 12} ${l.labelY})`}
                style={{ fontWeight: 600 }}
              >
                {getStyleAbbreviation(l.style)}
              </text>
            ))}
          </g>

          {/* musician names */}
          <g pointerEvents="none">
            {labels.map(({ n, x, y, anchor }) => (
              <text
                key={n.m.id}
                x={x}
                y={y + fontPx * 0.34 / transform.k}
                textAnchor={anchor}
                fontSize={fontPx / transform.k}
                className="fill-ink"
                style={{ fontWeight: n.tier === 0 ? 700 : 400 }}
                paintOrder="stroke"
                stroke="var(--color-bg)"
                strokeWidth={2.6 / transform.k}
                strokeLinejoin="round"
                opacity={n.tier === 2 ? 0.72 : n.tier === 1 ? 0.92 : 1}
              >
                {n.m.name}
              </text>
            ))}
          </g>
        </g>
        {/* year rail, pinned to the right edge */}
        <g pointerEvents="none">
          {decades.map((year) => {
            const y = transform.applyY(yearToY(year));
            if (y < 14 || y > dims.height - 6) return null;
            return (
              <text
                key={year}
                x={dims.width - 12}
                y={y - 4}
                textAnchor="end"
                fontSize={11}
                className="fill-ink3"
                opacity={year % 50 === 0 ? 0.9 : 0.55}
                letterSpacing={1.5}
              >
                {year}
              </text>
            );
          })}
        </g>
      </svg>

      {/* hover card */}
      {hovered && screen && (
        <div
          className="pointer-events-none absolute z-40 rounded-lg bg-bg-elevated/95 border border-border-subtle px-3 py-2 shadow-xl backdrop-blur-sm"
          style={{
            left: Math.min(Math.max(screen.x + 18, 8), Math.max(8, dims.width - 230)),
            top: Math.min(Math.max(screen.y - 20, 8), Math.max(8, dims.height - 90)),
            width: 210,
          }}
        >
          <div className="text-sm font-semibold text-ink leading-tight">{hovered.m.name}</div>
          <div className="text-xs mt-0.5" style={{ color: hovered.color }}>{hovered.style}</div>
          <div className="text-2xs text-ink3 mt-1">
            {t('timeline.activeFrom', { defaultValue: 'Active from' })} {activeYear(hovered.m)}
            {hovered.score > 0 && ` · ${Math.round(hovered.score / 2)} ${t('tree.influenced', { defaultValue: 'influenced' })}`}
          </div>
        </div>
      )}

      {/* controls */}
      <div className="absolute top-3 left-3 z-30">
        <FiltersPanel
          searchValue={search}
          onSearchChange={setSearch}
          textFilterValue={textFilter}
          onTextFilterChange={setTextFilter}
          showFavoritesOnly={showFavoritesOnly}
          onFavoritesOnlyChange={setShowFavoritesOnly}
          filterListId={filterListId}
          onFilterListIdChange={setFilterListId}
          styleFilter={styleFilter}
          onStyleFilterChange={onStyleFilterChange}
          availableStyles={availableStyles}
          instrumentFilter={instrumentFilter}
          onInstrumentFilterChange={setInstrumentFilter}
          availableInstruments={availableInstruments}
          yearRange={yearRange}
          minYear={minYear}
          maxYear={maxYear}
          onYearRangeChange={setYearRange}
          displayMusiciansCount={shown.length}
          collapsed={filtersCollapsed}
          onCollapsedChange={setFiltersCollapsed}
          isMobile={isMobile}
        />
      </div>

      <button
        onClick={() => {
          userMovedRef.current = false;
          if (svgRef.current && zoomRef.current) {
            select(svgRef.current).transition().duration(600).call(zoomRef.current.transform, fitTransform());
          }
        }}
        className="absolute bottom-4 right-4 z-30 px-3 py-1.5 rounded-lg bg-bg/70 border border-border-subtle text-2xs uppercase tracking-widest text-ink3 hover:text-ink backdrop-blur-sm"
      >
        {t('tree.fit', { defaultValue: 'Whole tree' })}
      </button>
    </div>
  );
}
