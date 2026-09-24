import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { select, zoom as d3Zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3';
import type { Musician } from '../types';
import { getStyleAbbreviation } from '../utils/layout';
import { getStyleHex } from '../utils/colors';
import {
  computeBluesTree,
  activeYear,
  FIRST_YEAR,
  YEAR_MAX,
  CANOPY_Y,
  SOIL_Y,
  type TreeMusician,
} from '../utils/treeLayout';
import FiltersPanel from './FiltersPanel';
import SearchInput from './SearchInput';
import { useAtomValue } from 'jotai';
import { favoritesMapAtom } from '../atoms/lists';

// Names are the foliage: pack in as many as fit, most influential first. The
// ceiling is high enough that a filtered-down tree can show every match.
const MAX_LABELS = 900;

// A sweetgum leaf: five pointed lobes on a short petiole, drawn pointing up from
// its stem at (0,0) so a rotation can aim it out of its twig.
const LEAF_PATH =
  'M 0 0 L 0 -.55 C -.25 -.6 -.75 -.55 -1 -.75 C -.8 -.95 -.55 -1 -.42 -1.15 ' +
  'C -.62 -1.35 -.85 -1.6 -.78 -1.75 C -.55 -1.72 -.34 -1.6 -.22 -1.55 ' +
  'C -.2 -1.8 -.08 -2.1 0 -2.25 C .08 -2.1 .2 -1.8 .22 -1.55 ' +
  'C .34 -1.6 .55 -1.72 .78 -1.75 C .85 -1.6 .62 -1.35 .42 -1.15 ' +
  'C .55 -1 .8 -.95 1 -.75 C .75 -.55 .25 -.6 0 -.55 Z';
// Big enough to be the target in its own right — you should never have to aim
// at a name to pick a musician.
const LEAF_SCALE = 15;
// A link leaves its musician transparent and reaches full colour a fifth of the
// way along, so the bundle at a hub does not turn into a solid blot.
const LINK_FADE = 0.2;
const MIN_FADE = 40;
// The middle of the blade, measured out from the stem along the leaf's heading.
const LEAF_MID = LEAF_SCALE * 1.15;
const hitX = (n: TreeMusician) =>
  n.tier === 2 ? n.x + Math.sin((n.angle * Math.PI) / 180) * LEAF_MID : n.x;
const hitY = (n: TreeMusician) =>
  n.tier === 2 ? n.y - Math.cos((n.angle * Math.PI) / 180) * LEAF_MID : n.y;

// Wood, in three tones for a lit side and a shadow, with the bark drawn as pale
// gaps *left out* of the mass rather than lines laid over it. Brown rather than
// black on purpose: the names are near-black, and a black tree behind them left
// nothing to read them against.
const INK = {
  light: { lit: '#9a7549', mid: '#6b4d30', shade: '#422e1b', edge: '#33230f' },
  dark: { lit: '#b08a5c', mid: '#7d5c3a', shade: '#4e3722', edge: '#241806' },
};

type Detail = 0 | 1 | 2;

const Home = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" />
  </svg>
);

const Funnel = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 4h18l-7 8v7l-4 2v-9z" />
  </svg>
);

const Target = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round">
    <circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [textFilter, setTextFilter] = useState('');
  const [instrumentFilter, setInstrumentFilter] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [filterListId, setFilterListId] = useState<string | null>(null);
  const [yearRange, setYearRange] = useState<[number, number] | null>(null);
  // The funnel in the map controls slides the whole left column away — search,
  // filters and display together — leaving the controls alone at the edge.
  const [leftOpen, setLeftOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  /** which kinds of connection are drawn for the focused musician */
  const [linkKinds, setLinkKinds] = useState({ ancestor: true, descendant: true, played: true });
  /** null follows the zoom; a number pins the level of detail to that one */
  const [detailOverride, setDetailOverride] = useState<Detail | null>(null);

  const favoritesMap = useAtomValue(favoritesMapAtom);

  const tree = useMemo(() => computeBluesTree(musicians), [musicians]);
  const yearToY = tree.yearToY;
  const ink = INK[theme];

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
    // down to the tips of the roots, so the tree stands on something
    const h = tree.bottomY - CANOPY_Y + 80;
    // On a phone the whole canopy would fit at about a twentieth scale: a smear
    // in the middle of an empty screen. Fill the height instead and open on the
    // trunk — the branch rail is how you get out to the rest of it.
    const k = isMobile ? (height / h) * 0.95 : Math.min(width / w, height / h) * 0.97;
    return zoomIdentity
      .translate(width / 2, height / 2)
      .scale(k)
      .translate(isMobile ? -tree.trunkX : -(tree.minX + w / 2), -(CANOPY_Y + h / 2));
  }, [dims, tree, isMobile]);

  // Keep framing the whole tree until the user takes the wheel — the container
  // is often laid out at the wrong size for a frame or two on first paint.
  useEffect(() => {
    if (userMovedRef.current || !dims.width || !svgRef.current || !zoomRef.current) return;
    select(svgRef.current).call(zoomRef.current.transform, fitTransform());
  }, [dims, fitTransform]);

  const fit = useCallback(() => {
    userMovedRef.current = false;
    if (svgRef.current && zoomRef.current) {
      select(svgRef.current).transition().duration(600).call(zoomRef.current.transform, fitTransform());
    }
  }, [fitTransform]);

  const zoomBy = useCallback((factor: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    userMovedRef.current = true;
    select(svgRef.current).transition().duration(220).call(zoomRef.current.scaleBy, factor);
  }, []);


  const zoomTo = useCallback((node: TreeMusician, k = 1.6) => {
    if (!svgRef.current || !zoomRef.current || !dims.width) return;
    const target = zoomIdentity
      .translate(dims.width / 2, dims.height / 2)
      .scale(k)
      .translate(-node.x, -node.y);
    userMovedRef.current = true;
    select(svgRef.current).transition().duration(750).call(zoomRef.current.transform, target);
  }, [dims]);

  /**
   * Frame one style's limb. This is how the tree is usable on a phone: the whole
   * canopy will never fit a 390px screen at a readable size, but a single limb
   * will, so you pick a branch and read it.
   */
  const zoomToLimb = useCallback((style: string) => {
    const limb = tree.limbs.find((l) => l.style === style);
    if (!limb || !svgRef.current || !zoomRef.current || !dims.width) return;
    // Enough to read the limb top to bottom, never so close that it fills the
    // screen with two names and a stick.
    const k = Math.min(1.1, Math.max(0.45, (dims.height - 90) / (limb.bottomY - limb.topY + 160)));
    const target = zoomIdentity
      .translate(dims.width / 2, dims.height / 2)
      .scale(k)
      .translate(-limb.midX, -limb.midY);
    userMovedRef.current = true;
    select(svgRef.current).transition().duration(700).call(zoomRef.current.transform, target);
  }, [tree, dims]);

  useEffect(() => {
    if (!forceZoomToId) return;
    const node = tree.byId.get(forceZoomToId);
    if (node) zoomTo(node);
    onZoomComplete?.();
  }, [forceZoomToId, tree, zoomTo, onZoomComplete]);

  // Selecting a musician leans the view in on them, so it is obvious which leaf
  // is the selected one — but never fights a user who has zoomed in further.
  useEffect(() => {
    // a fresh selection supersedes whatever the pointer was last on
    setHovered(null);
    if (!selectedId) return;
    const node = tree.byId.get(selectedId);
    if (node) zoomTo(node, Math.max(transform.k, 1.1));
    // Deliberately only on a new selection: re-running on every pan would trap the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // --- find a musician: this jumps the view, it does not filter the tree
  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return musicians
      .filter((m) => m.name.toLowerCase().includes(q))
      .sort((a, b) =>
        a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q) ||
        a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [search, musicians]);

  const jumpTo = useCallback((m: Musician) => {
    const node = tree.byId.get(m.id);
    if (node) zoomTo(node, 1.5);
    onSelect(m);
    setSearchOpen(false);
    setSearch('');
  }, [tree, zoomTo, onSelect]);

  // --- filtering
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
  }, [styleFilter, instrumentFilter, text, yearRange, favoritesChecker]);

  const filterActive = !!(styleFilter || instrumentFilter || text || yearRange || favoritesChecker);
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
    <g stroke={ink.edge} strokeWidth={1.1} strokeLinejoin="round">
      {/* roots behind the trunk, in the same ink, so they spread out from under it */}
      {tree.roots.map((d, i) => (
        <path key={`root${i}`} d={d} fill="url(#tree-wood)" />
      ))}
      <path d={tree.trunk} fill="url(#tree-wood)" />
      {tree.branches.map((b) => (
        <path
          key={b.key}
          d={b.d}
          fill={b.graft ? 'none' : 'url(#tree-wood)'}
          stroke={b.graft ? b.color : ink.edge}
          strokeWidth={b.graft ? b.w : undefined}
          strokeLinecap="round"
          opacity={b.graft ? 0.35 : 1}
          strokeDasharray={b.graft ? '7 11' : undefined}
        />
      ))}
      {tree.limbs.map((l) => (
        <path key={l.style} d={l.d} fill="url(#tree-wood)" />
      ))}
      {tree.twigs.map((tw) => (
        <path key={tw.key} d={tw.d} fill="url(#tree-wood)" />
      ))}
    </g>
  ), [tree, ink]);

  // --- musician marks
  // Leaves first, so an influential musician always wins the click where hit areas overlap.
  const drawOrder = useMemo(() => [...tree.nodes].sort((a, b) => b.tier - a.tier), [tree]);

  // left to right, the order the limbs stand in
  const railStyles = useMemo(() => [...tree.limbs].sort((a, b) => a.midX - b.midX), [tree]);

  const marks = useMemo(() => (
    <g>
      {drawOrder.map((n) => {
        const dim = isDimmed(n);
        return (
          <g
            key={n.m.id}
            data-musician={n.m.id}
            opacity={dim ? 0.12 : 1}
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered((h) => (h?.m.id === n.m.id ? null : h))}
            onClick={() => onSelect(n.m)}
          >
            {/* the stem: off a twig for a leaf, straight off the limb for the rest */}
            <line
              x1={n.sx} y1={n.sy} x2={n.x} y2={n.y}
              stroke={ink.mid}
              strokeWidth={n.tier === 2 ? 2.6 : 3.4}
              strokeLinecap="round"
            />
            {n.tier === 2 ? (
              <path
                d={LEAF_PATH}
                fill={n.color}
                opacity={0.92}
                transform={`translate(${n.x} ${n.y}) rotate(${n.angle}) scale(${LEAF_SCALE})`}
              />
            ) : n.tier === 1 ? (
              <circle cx={n.x} cy={n.y} r={12} fill={n.color} />
            ) : (
              <g>
                <circle cx={n.x} cy={n.y} r={22} fill={n.color} />
                {n.m.image && (
                  <>
                    <clipPath id={`clip-${n.m.id}`}>
                      <circle cx={n.x} cy={n.y} r={19} />
                    </clipPath>
                    <image
                      href={n.m.image}
                      x={n.x - 19}
                      y={n.y - 19}
                      width={38}
                      height={38}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#clip-${n.m.id})`}
                    />
                  </>
                )}
              </g>
            )}
            {/* A leaf reaches outward from (x, y), so a circle centred there sits
                half on the twig behind it. Centre it on the blade instead. */}
            <circle cx={hitX(n)} cy={hitY(n)} r={n.tier === 2 ? 19 : 18} fill="transparent" />
          </g>
        );
      })}
    </g>
  ), [drawOrder, isDimmed, ink, onSelect]);

  /**
   * Level of detail. Fitting 800 names on one screen makes all 800 unreadable,
   * so by default the zoom decides how deep into the canopy the names go: the
   * giants first, then the notable, then everyone. Names get *bigger* as there
   * are fewer of them. The control in the corner pins it, and a filter forces
   * the deepest level — if you have narrowed the tree down, you want to read
   * every name you narrowed it to.
   */
  const zoomDetail: Detail = transform.k < 0.22 ? 0 : transform.k < 0.5 ? 1 : 2;
  const detail: Detail = detailOverride ?? (filterActive ? 2 : zoomDetail);
  /** whoever the pointer or the selection is on always gets their name, whatever their rank */
  const pinnedId = hovered?.m.id ?? selectedId;
  const fontPx = detail === 0 ? 15 : detail === 1 ? 13 : 12;
  const styleFontPx = detail === 0 ? 17 : 15;

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
      // The pinned one is exempt from both the tier cut and the viewport cut: if
      // the pointer found it, its name has to appear.
      .filter((n) => n.m.id === pinnedId ||
        (n.tier <= detail && !isDimmed(n) && n.x > x0 && n.x < x1 && n.y > y0 && n.y < y1))
      .sort((a, b) => (a.m.id === pinnedId ? -1 : b.m.id === pinnedId ? 1 : b.score - a.score));

    const fontWorld = fontPx / k;
    // The style names are already on the canvas, so claim their boxes first —
    // except at the widest zoom, where a name set in screen pixels covers most of
    // its own limb. There it becomes a watermark and the musicians win instead.
    const styleFont = styleFontPx / k;
    const placed: Array<[number, number, number, number]> = detail === 0 ? [] : tree.limbs.map((l) => {
      const half = (getStyleAbbreviation(l.style).length * styleFont * 0.6) / 2;
      const lx = l.labelX - l.w / 2 - 12;
      return [lx - styleFont * 0.7, l.labelY - half, lx + styleFont * 0.7, l.labelY + half] as
        [number, number, number, number];
    });
    const out: Array<{
      n: TreeMusician; x: number; y: number; anchor: 'start' | 'end';
      box: [number, number, number, number];
    }> = [];

    // At the coarse levels a name that collides is simply dropped — there is
    // always another one behind it. Once every name is meant to be on show, a
    // clash is shifted off its line instead, which is the difference between
    // "all names" and "all the names that happened to fit".
    const nudges = detail === 2 || filterActive
      ? [0, -1.15, 1.15, -2.3, 2.3, -3.45, 3.45, -4.6, 4.6]
      : [0];

    for (const n of candidates) {
      // The name hangs off the outer side of the limb, not of the stem — a leaf
      // that happens to point inward still reads with the rest of its branch.
      const right = n.side > 0;
      const pad = n.tier === 0 ? 26 : n.tier === 1 ? 16 : 24;
      const lx = n.x + (right ? pad : -pad);
      const w = n.m.name.length * fontWorld * 0.54;
      let box: [number, number, number, number] | null = null;
      let ly = n.y;
      for (const step of nudges) {
        const y = n.y + step * fontWorld;
        const b: [number, number, number, number] = [
          right ? lx : lx - w, y - fontWorld * 0.62,
          right ? lx + w : lx, y + fontWorld * 0.62,
        ];
        if (placed.some((p) => b[0] < p[2] && b[2] > p[0] && b[1] < p[3] && b[3] > p[1])) continue;
        box = b;
        ly = y;
        break;
      }
      // the pinned name goes down wherever it lands, clash or not
      if (!box) {
        if (n.m.id !== pinnedId) continue;
        box = [right ? lx : lx - w, n.y - fontWorld * 0.62, right ? lx + w : lx, n.y + fontWorld * 0.62];
      }
      placed.push(box);
      out.push({ n, x: lx, y: ly, anchor: right ? 'start' : 'end', box });
      if (out.length >= MAX_LABELS) break;
    }
    return out;
  }, [tree, transform, dims, isDimmed, pinnedId, detail, filterActive, fontPx, styleFontPx]);

  /**
   * Who influenced whom, read from both ends. An edge lives on whichever record
   * happened to record it, so Howlin' Wolf lists four descendants himself while
   * thirty-one other musicians name him as an ancestor on their own record.
   * Reading only his own two arrays loses those thirty-one.
   */
  const kin = useMemo(() => {
    const anc = new Map<string, Set<string>>();
    const desc = new Map<string, Set<string>>();
    const link = (from: string, to: string) => {
      const a = anc.get(to);
      if (a) a.add(from); else anc.set(to, new Set([from]));
      const d = desc.get(from);
      if (d) d.add(to); else desc.set(from, new Set([to]));
    };
    musicians.forEach((m) => {
      (m.influencedBy ?? []).forEach((id) => link(id, m.id));
      (m.influences ?? []).forEach((id) => link(m.id, id));
    });
    return { anc, desc };
  }, [musicians]);

  // --- connections of the focused musician
  const focus = hovered ?? (selectedId ? tree.byId.get(selectedId) ?? null : null);
  const linkColor = (kind: 'ancestor' | 'descendant' | 'played', n: TreeMusician) =>
    kind === 'played' ? ink.mid : kind === 'ancestor' ? n.color : focus?.color ?? n.color;
  const links = useMemo(() => {
    if (!focus) return [];
    const id = focus.m.id;
    const mk = (ids: Iterable<string>, kind: 'ancestor' | 'descendant' | 'played') =>
      [...ids]
        .map((i) => tree.byId.get(i))
        .filter((n): n is TreeMusician => !!n && n.m.id !== id)
        .map((n) => ({ n, kind }));
    return [
      ...(linkKinds.ancestor ? mk(kin.anc.get(id) ?? [], 'ancestor') : []),
      ...(linkKinds.descendant ? mk(kin.desc.get(id) ?? [], 'descendant') : []),
      ...(linkKinds.played ? mk(focus.m.playedWith ?? [], 'played') : []),
    ];
  }, [focus, tree, kin, linkKinds]);

  /**
   * The year rail. Always on screen: every year that falls inside the viewport
   * gets a tick, and the spacing tightens as you zoom in so the scale never
   * empties out.
   */
  const yearTicks = useMemo(() => {
    const step = transform.k > 1.6 ? 1 : transform.k > 0.6 ? 5 : 10;
    const out: Array<{ year: number; y: number; major: boolean }> = [];
    for (let year = Math.ceil(FIRST_YEAR / step) * step; year <= YEAR_MAX; year += step) {
      const y = transform.applyY(yearToY(year));
      if (y < 16 || y > dims.height - 8) continue;
      out.push({ year, y, major: year % 10 === 0 });
    }
    return out;
  }, [transform, dims.height, yearToY]);

  const decades = useMemo(() => {
    const out: number[] = [];
    // Below FIRST_YEAR there is only trunk — no decade to label.
    for (let y = Math.ceil(FIRST_YEAR / 10) * 10; y <= YEAR_MAX; y += 10) out.push(y);
    return out;
  }, []);

  const centerOnSelected = useCallback(() => {
    const node = selectedId ? tree.byId.get(selectedId) : null;
    if (node) zoomTo(node, Math.max(transform.k, 1.4));
  }, [selectedId, tree, zoomTo, transform.k]);

  const RAIL_W = 64;
  // the bottom-left corner belongs to the minimised video player
  const PLAYER_GAP = 96;
  const PANEL_W = isMobile ? 168 : 220;
  const btn = 'w-11 h-11 grid place-items-center rounded-md text-xl leading-none text-ink3 hover:text-ink hover:bg-bg-hover transition-colors disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink3';

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        className="block touch-none select-none"
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          {/* One light source over the whole tree: lit at the top left of the
              canopy, deepest in shadow down at the roots. */}
          <linearGradient
            id="tree-wood"
            gradientUnits="userSpaceOnUse"
            x1={tree.minX} y1={CANOPY_Y}
            x2={tree.maxX * 0.55} y2={tree.bottomY}
          >
            <stop offset="0%" stopColor={ink.lit} />
            <stop offset="42%" stopColor={ink.mid} />
            <stop offset="100%" stopColor={ink.shade} />
          </linearGradient>
        </defs>

        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* decade rules */}
          <g pointerEvents="none">
            {decades.map((year) => (
              <line
                key={year}
                x1={tree.minX} x2={tree.maxX}
                y1={yearToY(year)} y2={yearToY(year)}
                stroke="currentColor"
                className="text-ink3"
                strokeWidth={1 / transform.k}
                opacity={year % 50 === 0 ? 0.28 : 0.12}
              />
            ))}
            {/* the soil, drawn where the flare meets it */}
            <line
              x1={tree.minX} x2={tree.maxX} y1={SOIL_Y} y2={SOIL_Y}
              stroke={ink.mid} strokeWidth={2 / transform.k} opacity={0.45}
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

          {/* Style names, written along their limb — click one to read that branch.
              Drawn before the marks on purpose: set in screen pixels these glyph
              boxes are big enough to swallow every leaf on the limb, so they have
              to lose the hover and the click to the musicians on top of them. */}
          <g>
            {tree.limbs.map((l) => (
              <text
                key={l.style}
                x={l.labelX - l.w / 2 - 12}
                y={l.labelY}
                fontSize={styleFontPx / transform.k}
                textAnchor="middle"
                fill={l.color}
                opacity={styleFilter && styleFilter !== l.style ? 0.2 : 1}
                letterSpacing={2.2 / transform.k}
                transform={`rotate(${l.labelAngle} ${l.labelX - l.w / 2 - 12} ${l.labelY})`}
                style={{ fontWeight: 600, cursor: 'pointer' }}
                onClick={() => zoomToLimb(l.style)}
              >
                {getStyleAbbreviation(l.style)}
              </text>
            ))}
          </g>


          {/* Connections of the focused musician, over the wood, under the marks.
              Ancestors come in dashed and in their own colour, descendants go out
              solid in the focused musician's — the direction has to be readable
              without clicking anything. Each one fades in out of the musician so
              the bundle at the hub does not turn into a solid blot. */}
          <g pointerEvents="none" opacity={0.6}>
            {focus && (
              <defs>
                {links.map(({ n, kind }) => {
                  // The fade runs over the first fifth of the link. A gradient
                  // laid end to end on a very short link is near-degenerate and
                  // SVG then paints it a flat colour — which is why some of them
                  // used to come out with no fade at all. A floor on the vector
                  // length keeps every link fading the same way.
                  const dx = hitX(n) - hitX(focus);
                  const dy = hitY(n) - hitY(focus);
                  const len = Math.max(Math.hypot(dx, dy), 1);
                  const fade = Math.max(len * LINK_FADE, MIN_FADE);
                  return (
                    <linearGradient
                      key={`lg-${kind}-${n.m.id}`}
                      id={`lg-${kind}-${n.m.id}`}
                      gradientUnits="userSpaceOnUse"
                      x1={hitX(focus)} y1={hitY(focus)}
                      x2={hitX(focus) + (dx / len) * fade}
                      y2={hitY(focus) + (dy / len) * fade}
                    >
                      <stop offset="0%" stopColor={linkColor(kind, n)} stopOpacity={0} />
                      <stop offset="100%" stopColor={linkColor(kind, n)} stopOpacity={1} />
                    </linearGradient>
                  );
                })}
              </defs>
            )}
            {focus && links.map(({ n, kind }) => (
              <path
                key={`${kind}-${n.m.id}`}
                d={`M ${hitX(focus)} ${hitY(focus)} Q ${(hitX(focus) + hitX(n)) / 2 + (hitY(focus) - hitY(n)) * 0.18} ${(hitY(focus) + hitY(n)) / 2} ${hitX(n)} ${hitY(n)}`}
                fill="none"
                stroke={`url(#lg-${kind}-${n.m.id})`}
                strokeWidth={(kind === 'played' ? 1.4 : 2.4) / transform.k}
                strokeDasharray={
                  kind === 'played' ? `${6 / transform.k} ${6 / transform.k}`
                    : kind === 'ancestor' ? `${9 / transform.k} ${7 / transform.k}`
                      : undefined
                }
              />
            ))}
          </g>

          {marks}

          {/* halo on the focused musician */}
          {focus && (
            <circle
              cx={hitX(focus)} cy={hitY(focus)}
              r={focus.tier === 0 ? 28 : focus.tier === 1 ? 18 : 22}
              fill="none"
              stroke={focus.color}
              strokeWidth={2.5 / transform.k}
              pointerEvents="none"
            />
          )}

          {/* Musician names — hovering one is the same as hovering its leaf. The
              pinned name is drawn in a layer of its own rather than sorted to the
              end of this one: re-ordering the list moved DOM nodes out from under
              the cursor mid-hover, and the mouseleave that should have cleared the
              hover never arrived, so the selected musician never got its focus back. */}
          <g>
            {labels.filter((l) => l.n.m.id !== pinnedId).map(({ n, x, y, anchor, box }) => {
              const hot = n.m.id === pinnedId;
              // grows under the cursor, which is the whole feedback — no tooltip
              const size = (hot ? fontPx * 1.25 : fontPx) / transform.k;
              // The baseline stays put whatever the size — deriving it from the
              // grown size made every name hop as you touched it.
              const baseline = (fontPx / transform.k) * 0.34;
              return (
                <g
                  key={n.m.id}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered((h) => (h?.m.id === n.m.id ? null : h))}
                  onClick={() => onSelect(n.m)}
                >
                  <rect
                    x={box[0]}
                    y={box[1]}
                    width={box[2] - box[0]}
                    height={box[3] - box[1]}
                    fill="transparent"
                  />
                  {/* a name shifted off its line needs a leader back to its leaf */}
                  {Math.abs(y - n.y) > 1 && (
                    <line
                      x1={n.x} y1={n.y} x2={x} y2={y}
                      stroke={n.color} strokeWidth={1 / transform.k} opacity={0.4}
                    />
                  )}
                  <text
                    pointerEvents="none"
                    x={x}
                    y={y + baseline}
                    textAnchor={anchor}
                    fontSize={size}
                    className={hot ? undefined : 'fill-ink'}
                    fill={hot ? n.color : undefined}
                    style={{ fontWeight: hot || n.tier === 0 ? 700 : 400 }}
                    paintOrder="stroke"
                    stroke="var(--color-bg)"
                    strokeWidth={(hot ? 4 : 2.6) / transform.k}
                    strokeLinejoin="round"
                    opacity={hot ? 1 : n.tier === 2 ? 0.78 : n.tier === 1 ? 0.92 : 1}
                  >
                    {n.m.name}
                  </text>
                </g>
              );
            })}
          </g>

          <g>
            {labels.filter((l) => l.n.m.id === pinnedId).map(({ n, x, y, anchor, box }) => {
              const hot = n.m.id === pinnedId;
              // grows under the cursor, which is the whole feedback — no tooltip
              const size = (hot ? fontPx * 1.25 : fontPx) / transform.k;
              // baseline held at the un-grown size, so the name swells in place
              const baseline = (fontPx / transform.k) * 0.34;
              return (
                <g
                  key={n.m.id}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered((h) => (h?.m.id === n.m.id ? null : h))}
                  onClick={() => onSelect(n.m)}
                >
                  <rect
                    x={box[0]}
                    y={box[1]}
                    width={box[2] - box[0]}
                    height={box[3] - box[1]}
                    fill="transparent"
                  />
                  {/* a name shifted off its line needs a leader back to its leaf */}
                  {Math.abs(y - n.y) > 1 && (
                    <line
                      x1={n.x} y1={n.y} x2={x} y2={y}
                      stroke={n.color} strokeWidth={1 / transform.k} opacity={0.4}
                    />
                  )}
                  <text
                    pointerEvents="none"
                    x={x}
                    y={y + baseline}
                    textAnchor={anchor}
                    fontSize={size}
                    className={hot ? undefined : 'fill-ink'}
                    fill={hot ? n.color : undefined}
                    style={{ fontWeight: hot || n.tier === 0 ? 700 : 400 }}
                    paintOrder="stroke"
                    stroke="var(--color-bg)"
                    strokeWidth={(hot ? 4 : 2.6) / transform.k}
                    strokeLinejoin="round"
                    opacity={hot ? 1 : n.tier === 2 ? 0.78 : n.tier === 1 ? 0.92 : 1}
                  >
                    {n.m.name}
                  </text>
                </g>
              );
            })}
          </g>
        </g>

        {/* year rail, pinned to the right edge over its own strip so the scale
            stays readable whatever the tree is doing behind it */}
        <g pointerEvents="none">
          <rect
            x={dims.width - RAIL_W} y={0} width={RAIL_W} height={dims.height}
            className="fill-bg"
          />
          {yearTicks.map(({ year, y, major }) => (
            <g key={year}>
              <line
                x1={dims.width - RAIL_W} x2={dims.width - RAIL_W + (major ? 9 : 5)}
                y1={y} y2={y}
                stroke="currentColor" className="text-ink3" opacity={major ? 0.6 : 0.3}
              />
              <text
                x={dims.width - 8}
                y={y + 3.5}
                textAnchor="end"
                fontSize={major ? 14 : 11.5}
                className="fill-ink3"
                opacity={major ? 1 : 0.65}
                letterSpacing={0.8}
              >
                {year}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* find + filters, in that order: the search jumps you somewhere, the
          filters change what the tree is showing */}
      <div
        className={`absolute top-3 left-3 z-30 flex flex-col gap-2 transition-transform duration-300 ease-out
          ${leftOpen ? '' : 'pointer-events-none'}`}
        style={{
          width: PANEL_W,
          // parked just off the left edge, its own gutter included
          transform: leftOpen ? 'none' : 'translateX(calc(-100% - 0.75rem))',
        }}
        aria-hidden={!leftOpen}
      >
        {/* outside the scroll area: the results list has to be free to overflow */}
        <div className="relative">
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); setSearchOpen(true); }}
            placeholder={t('tree.findMusician', { defaultValue: 'Find a musician…' })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchHits[0]) jumpTo(searchHits[0]);
              if (e.key === 'Escape') setSearchOpen(false);
            }}
          />
          {searchOpen && searchHits.length > 0 && (
            <ul className="absolute left-0 right-0 top-full mt-1 z-40 max-h-72 overflow-y-auto rounded-lg border border-border-subtle bg-bg-elevated shadow-xl">
              {searchHits.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => jumpTo(m)}
                    className="w-full flex items-baseline gap-2 px-2.5 py-1.5 text-left hover:bg-bg-hover"
                  >
                    <span className="text-sm text-ink truncate">{m.name}</span>
                    <span
                      className="text-2xs ml-auto shrink-0 uppercase tracking-wide"
                      style={{ color: getStyleHex(m.bluesStyle) }}
                    >
                      {getStyleAbbreviation(m.bluesStyle)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          className="flex flex-col gap-2 overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5"
          style={{ maxHeight: `calc(100vh - 3.5rem - 0.75rem - 56px - ${PLAYER_GAP}px)` }}
        >
          <FiltersPanel
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

          {/* What the tree draws, as opposed to which musicians it draws */}
          <div className="flex flex-col rounded-lg border border-border-subtle bg-bg-subtle">
            <button
              onClick={() => setConfigOpen((o) => !o)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-bold text-ink"
            >
              <span>{t('tree.display', { defaultValue: 'Display' })}</span>
              <svg
                className={`h-4 w-4 transition-transform ${configOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {configOpen && (
              <div className="flex flex-col gap-2 px-3 pb-3">
                <div className="flex overflow-hidden rounded-lg border border-border-subtle">
                  {([
                    [null, t('tree.detailAuto', { defaultValue: 'Auto' })],
                    [2, t('tree.detailAll', { defaultValue: 'All names' })],
                  ] as const).map(([level, label]) => (
                    <button
                      key={String(level)}
                      onClick={() => setDetailOverride(level)}
                      className={`flex-1 px-2 py-1.5 text-2xs uppercase tracking-wide transition-colors ${detailOverride === level ? 'bg-accent text-bg font-semibold' : 'text-ink3 hover:text-ink'
                        }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {([
                  ['ancestor', t('tree.linkInfluencedBy', { defaultValue: 'Influenced by' })],
                  ['descendant', t('tree.linkInfluences', { defaultValue: 'Influences' })],
                  ['played', t('tree.linkPlayedWith', { defaultValue: 'Played with' })],
                ] as const).map(([kind, label]) => (
                  <label key={kind} className="flex cursor-pointer items-center gap-2 text-2xs text-ink2">
                    <input
                      type="checkbox"
                      checked={linkKinds[kind]}
                      onChange={(e) => setLinkKinds((k) => ({ ...k, [kind]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* How to read the tree, tucked behind an info button in the corner */}
      <div className="absolute bottom-4 z-30 flex flex-col items-end gap-2" style={{ right: RAIL_W + 12 }}>
        {legendOpen && (
          <div className="w-60 rounded-lg border border-border-subtle bg-bg-elevated p-3 text-2xs text-ink2 shadow-lg">
            <p className="mb-2 text-ink3">
              {t('tree.legendAxis', { defaultValue: 'Height is the year a musician became active.' })}
            </p>
            <div className="mb-2 flex flex-col gap-1.5">
              {([
                ['ancestor', t('tree.linkInfluencedBy', { defaultValue: 'Influenced by' })],
                ['descendant', t('tree.linkInfluences', { defaultValue: 'Influences' })],
                ['played', t('tree.linkPlayedWith', { defaultValue: 'Played with' })],
              ] as const).map(([kind, label]) => (
                <div key={kind} className="flex items-center gap-2">
                  <svg width="34" height="8" className="shrink-0">
                    <line
                      x1={1} y1={4} x2={33} y2={4}
                      stroke={kind === 'played' ? 'currentColor' : 'var(--color-accent)'}
                      className={kind === 'played' ? 'text-ink3' : undefined}
                      strokeWidth={kind === 'played' ? 1.4 : 2.4}
                      strokeDasharray={kind === 'played' ? '4 4' : kind === 'ancestor' ? '6 4' : undefined}
                    />
                  </svg>
                  {label}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              {([
                [22, t('tree.legendMajor', { defaultValue: 'The most influential' })],
                [11, t('tree.legendNotable', { defaultValue: 'Notable' })],
                [0, t('tree.legendLeaf', { defaultValue: 'Everyone else, as a leaf' })],
              ] as const).map(([r, label]) => (
                <div key={label} className="flex items-center gap-2">
                  <svg width="34" height="18" viewBox="-17 -9 34 18" className="shrink-0 text-ink3">
                    {r > 0
                      ? <circle cx={0} cy={0} r={r / 2.4} fill="currentColor" />
                      : <path d={LEAF_PATH} fill="currentColor" transform="scale(5)" />}
                  </svg>
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={() => setLegendOpen((o) => !o)}
          title={t('tree.legend', { defaultValue: 'How to read this' })}
          className={`grid h-9 w-9 place-items-center rounded-lg border border-border-subtle
            bg-bg-elevated transition-colors ${legendOpen ? 'text-accent' : 'text-ink3 hover:text-ink'}`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
            strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.6v.1" />
          </svg>
        </button>
      </div>

      {/* Branch rail: the way into the tree on a phone, where the whole canopy
          can never be both visible and readable at once. Tap a style, read that
          limb. On a desktop the style names on the limbs themselves do this. */}
      {isMobile && (
        <div className="absolute bottom-2 left-0 right-0 z-30 px-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {railStyles.map((l) => (
              <button
                key={l.style}
                onClick={() => zoomToLimb(l.style)}
                className="shrink-0 px-2.5 py-1.5 rounded-full bg-bg/85 border border-border-subtle text-2xs font-semibold uppercase tracking-wide backdrop-blur-sm active:bg-bg-hover"
                style={{ color: l.color }}
              >
                {getStyleAbbreviation(l.style)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Map controls: alone at the edge, or shifted over when the column is out */}
      <div
        className="absolute top-3 z-30 flex flex-col rounded-lg border border-border-subtle
          bg-bg-elevated transition-[left] duration-300 ease-out"
        style={{ left: leftOpen ? PANEL_W + 20 : 12 }}
      >
        <button className={btn} onClick={() => zoomBy(1.5)} title={t('tree.zoomIn', { defaultValue: 'Zoom in' })}>+</button>
        <button className={btn} onClick={() => zoomBy(1 / 1.5)} title={t('tree.zoomOut', { defaultValue: 'Zoom out' })}>−</button>
        <button
          className={btn}
          onClick={centerOnSelected}
          disabled={!selectedId}
          title={t('tree.centerSelected', { defaultValue: 'Centre on the selected musician' })}
        >
          <Target />
        </button>
        {/* home is the old "whole tree" button — same thing, so there is only one of it */}
        <button className={btn} onClick={fit} title={t('tree.fit', { defaultValue: 'Whole tree' })}><Home /></button>
        <button
          className={`${btn} ${leftOpen ? 'text-accent' : ''}`}
          onClick={() => setLeftOpen((o) => !o)}
          title={t('filters.title', { defaultValue: 'Filters' })}
        >
          <Funnel />
        </button>
      </div>
    </div>
  );
}
