import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, ArcLayer, TextLayer, LineLayer, SolidPolygonLayer } from '@deck.gl/layers';

import type { MapViewState } from '@deck.gl/core';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Musician } from '../types';
import { getStyleColor, getStyleHex } from '../utils/colors';
import { getStyleAbbreviation } from '../utils/layout';
import SearchInput from './SearchInput';
import BluesStyleLegend from './BluesStyleLegend';
import MapBottomSheet from './MapBottomSheet';
import { useAtomValue } from 'jotai';
import { isMusicianFavoritedAtom, listsAtom, favoritesMapAtom } from '../atoms/lists';
import { userAtom } from '../atoms/auth';
import { useMapClusters } from '../hooks/useMapClusters';
import type { ClusterGroup, ClusterPoint, SpiderLeg } from '../hooks/useMapClusters';
import { useTranslation } from 'react-i18next';
import { ChevronUp, ChevronDown } from 'lucide-react';

const MAP_STYLES = {
  light: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};

const INITIAL_VIEW_STATE: MapViewState = {
  longitude: -93,
  latitude: 36,
  zoom: 4,
  pitch: 35,
  bearing: -5,
  minZoom: 2,
  maxZoom: 14,
};

// ── Pie wedge polygon type ──────────────────────────────────────────────────

interface PieWedge {
  polygon: [number, number][];
  color: [number, number, number, number];
  clusterId: number;
}

interface SpentFlat {
  coords: [number, number];
  place: string;
  musicianId: string;
  musician: Musician;
}

interface MigrationArc {
  source: [number, number];
  target: [number, number];
  musician: Musician;
}

interface MapViewProps {
  musicians: Musician[];
  onSelect: (musician: Musician) => void;
  selectedId: string | null;
  styleFilter: string | null;
  onStyleFilterChange: (style: string | null) => void;
  theme: 'light' | 'dark';
  isMobile: boolean;
}

function MusicianSidebar({
  musicians,
  onSelect,
  onHover,
  selectedId,
  hoveredId,
  styleFilter,
  onStyleFilterChange,
}: {
  musicians: Musician[];
  onSelect: (musician: Musician) => void;
  onHover: (id: string | null) => void;
  selectedId: string | null;
  hoveredId: string | null;
  styleFilter: string | null;
  onStyleFilterChange: (style: string | null) => void;
}) {
  const { t } = useTranslation();
  const favorites = useAtomValue(isMusicianFavoritedAtom);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [filterListId, setFilterListId] = useState<string | null>(null);
  const [styleLegendCollapsed, setStyleLegendCollapsed] = useState(true);
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [hoveredStyle, setHoveredStyle] = useState<string | null>(null);

  const user = useAtomValue(userAtom);
  const lists = useAtomValue(listsAtom);
  const favoritesMap = useAtomValue(favoritesMapAtom);

  const filteredMusicians = useMemo(() => {
    // Create favorites checker for the selected list or all lists
    const favoritesChecker = showFavoritesOnly
      ? filterListId
        ? (id: string) => favoritesMap.get(filterListId)?.has(id) ?? false
        : favorites
      : null;

    const filtered = musicians.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(searchQuery) ||
        m.birthPlace.toLowerCase().includes(searchQuery);

      const matchesStyle = !styleFilter || m.bluesStyle === styleFilter;
      const matchesFavorites = !showFavoritesOnly || (favoritesChecker && favoritesChecker(m.id));

      return matchesSearch && matchesStyle && matchesFavorites;
    });

    // Group by decade when active
    const byDecade = filtered.reduce((acc, m) => {
      const year = parseInt(m.activeFrom);
      const decade = Math.floor(year / 10) * 10;
      if (!acc[decade]) acc[decade] = [];
      acc[decade].push(m);
      return acc;
    }, {} as Record<number, Musician[]>);

    // Sort decades and musicians within each decade
    const sortedDecades = Object.keys(byDecade).sort((a, b) => parseInt(b) - parseInt(a));
    return {
      items: sortedDecades.flatMap(decadeStr => {
        const decade = parseInt(decadeStr);
        return [
          { type: 'decade', decade } as const,
          ...byDecade[decade].map((m: Musician) => ({ type: 'musician', musician: m }) as const)
        ];
      }),
      count: filtered.length
    };
  }, [musicians, searchQuery, styleFilter, showFavoritesOnly, filterListId, favorites, favoritesMap]);

  return (
    <div className="absolute left-0 top-0 bottom-0 px-4 pt-4 w-80 bg-bg/30 backdrop-blur-sm flex flex-col z-10 shadow-2xl border-r border-border-subtle">
      {/* Filters toggle */}
      <button
        onClick={() => setFiltersCollapsed(!filtersCollapsed)}
        className="flex items-center justify-between w-full text-sm font-bold text-accent tracking-widest uppercase hover:text-accent3 transition-colors mb-1 p-3"
      >
        <span>{t('filters.title')}</span>
        {filtersCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        <svg
          className={`w-3 h-3 opacity-60 transition-transform ${filtersCollapsed ? '' : 'rotate-180'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!filtersCollapsed && (
        <>
          {/* Search */}
          <div className="mb-3">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t('map.searchByNameOrBirthplace')}
            />
          </div>

          {/* Favorites filter */}
          {user && (
            <div className="mb-3 bg-bg/50 border border-border-subtle rounded-lg px-3 py-2 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="map-favorites-filter"
                  checked={showFavoritesOnly}
                  onChange={(e) => setShowFavoritesOnly(e.target.checked)}
                />
                <label htmlFor="map-favorites-filter" className="text-label text-ink3 cursor-pointer">
                  {t('filters.showFavoritesOnly')}
                </label>
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

          {/* Blues Style Legend - collapsible */}
          <div className="mb-3 bg-bg/50 border border-border-subtle rounded-lg px-3 py-2">
            <BluesStyleLegend
              embedded
              isOpen={!styleLegendCollapsed}
              onToggle={() => setStyleLegendCollapsed((c) => !c)}
              styleFilter={styleFilter}
              onStyleFilterChange={onStyleFilterChange}
              onHoverStyle={setHoveredStyle}
              hoveredStyle={hoveredStyle}
              availableStyles={[...new Set(musicians.map((m) => m.bluesStyle))]}
            />
          </div>
        </>
      )}

      {/* Musician List */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {filteredMusicians.items.length === 0 ? (
          <div className="text-center py-8 text-ink3 text-sm rounded-lg">
            {t('map.noMusiciansFound')}
          </div>
        ) : (
          <div className="flex flex-col rounded-lg">
            {filteredMusicians.items.map((item: any) => {
              if (item.type === 'decade') {
                return (
                  <div key={`decade-${item.decade}`} className="sticky -top-3 z-10 py-1 px-3 bg-bg/80 backdrop-blur-lg rounded-t-lg border-b border-border">
                    <span className="text-xs font-bold text-accent tracking-wide">
                      <span className='uppercase'>{t('map.activeInDecade')}</span> {item.decade}s
                    </span>
                  </div>
                );
              }

              const musician = item.musician;
              const isSelected = musician.id === selectedId;
              const isHovered = musician.id === hoveredId;
              const hex = getStyleHex(musician.bluesStyle);
              const [r, g, b] = getStyleColor(musician.bluesStyle) as [number, number, number];
              const isFav = favorites(musician.id);

              return (
                <button
                  key={musician.id}
                  onClick={() => onSelect(musician)}
                  onMouseEnter={() => onHover(musician.id)}
                  onMouseLeave={() => onHover(null)}
                  className={`flex items-center gap-1 px-4 py-1 transition-all duration-200 text-left mb-2 rounded-lg bg-bg/40 ${isSelected
                    ? 'bg-bg/80 shadow-md'
                    : isHovered
                      ? 'shadow-sm bg-bg/80'
                      : 'border-bode'
                    }`}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <img
                      src={musician.image}
                      alt={musician.name}
                      className="w-11 h-11 rounded-full object-cover"
                      style={{ filter: 'sepia(8%) contrast(1.02)' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(musician.name)}&background=251a0d&color=c8872a&size=40`;
                      }}
                    />
                    <div
                      className="absolute inset-0 rounded-full pointer-events-none border-2"
                      style={{ borderColor: hex, opacity: isSelected || isHovered ? 1 : 0.6 }}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-medium truncate ${isSelected || isHovered ? 'text-ink' : 'text-ink2'}`}>
                        {musician.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-2xs font-medium px-2 py-0.5 rounded-md"
                        style={{
                          color: hex,
                          background: `rgba(${r},${g},${b},0.12)`,
                          border: `1px solid rgba(${r},${g},${b},0.25)`,
                        }}
                      >
                        {getStyleAbbreviation(musician.bluesStyle)}
                      </span>
                      <span className="text-xs text-ink3 truncate">{musician.birthPlace}</span>
                    </div>
                  </div>

                  {/* Favorite star indicator */}
                  {import.meta.env.VITE_ENABLE_EDIT_MODE === 'true' && (
                    <svg
                      className="w-4 h-4 shrink-0 cursor-pointer hover:scale-110 transition-transform"
                      viewBox="0 0 24 24"
                      fill={isFav ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ color: isFav ? '#c8872a' : '#6b5c4a' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Toggle favorite functionality removed - using jotai state instead
                      }}
                    >
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  )}

                  {/* Selection indicator */}
                  {isSelected && (
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: hex, boxShadow: `0 0 10px rgba(${r},${g},${b},0.7)` }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer count */}
      <div className="shrink-0 px-5 py-3 border-t border-border text-xs text-ink3 bg-bg font-medium">
        {filteredMusicians.count} {t('map.ofMusicians')} {musicians.length} {t('filters.musicians')}
      </div>
    </div>
  );
}

export default function MapView({ musicians, onSelect, selectedId, styleFilter, onStyleFilterChange, theme, isMobile }: MapViewProps) {
  const { t } = useTranslation();
  const completeMusicians = useMemo(() => {
    const valid = musicians.filter((m) =>
      m.name && m.bluesStyle && m.instrument && m.description && m.birthPlace && m.image && m.activeFrom
    );
    return styleFilter ? valid.filter((m) => m.bluesStyle === styleFilter) : valid;
  }, [musicians, styleFilter]);

  const [hovered, setHovered] = useState<string | null>(null);
  const [listHovered, setListHovered] = useState<string | null>(null);
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW_STATE);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sheetHeight, setSheetHeight] = useState<'collapsed' | 'half' | 'full'>('collapsed');

  // Compute viewport bounds from viewState for supercluster
  const viewportBounds = useMemo<[number, number, number, number] | null>(() => {
    const { longitude, latitude, zoom } = viewState;
    // Approximate bounds from center + zoom
    const latRange = 180 / Math.pow(2, zoom);
    const lngRange = 360 / Math.pow(2, zoom);
    return [
      Math.max(-180, longitude - lngRange),
      Math.max(-90, latitude - latRange),
      Math.min(180, longitude + lngRange),
      Math.min(90, latitude + latRange),
    ];
  }, [viewState]);

  // Clustering + spidering
  const {
    clusters,
    points,
    spiderLegs,
    spiderRadiusPx,
    spideredClusterId,
    onClusterClick,
    collapseSpider,
    onZoomChange,
  } = useMapClusters({
    musicians: completeMusicians,
    zoom: viewState.zoom,
    bounds: viewportBounds,
    selectedId,
  });

  // Spider expand animation (0 → 1)
  const [spiderProgress, setSpiderProgress] = useState(1);
  const spiderAnimRef = useRef(0);
  useEffect(() => {
    if (spideredClusterId !== null) {
      setSpiderProgress(0);
      const start = performance.now();
      const duration = 350;
      const id = ++spiderAnimRef.current;
      const animate = (now: number) => {
        if (spiderAnimRef.current !== id) return; // cancelled
        const t = Math.min(1, (now - start) / duration);
        setSpiderProgress(1 - Math.pow(1 - t, 3)); // ease-out cubic
        if (t < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    } else {
      setSpiderProgress(1);
    }
  }, [spideredClusterId]);

  // Collapse spider on zoom change
  const handleViewStateChange = useCallback(
    ({ viewState: vs }: { viewState: unknown }) => {
      const next = vs as MapViewState;
      onZoomChange(next.zoom);
      setViewState(next);
    },
    [onZoomChange]
  );

  // Zoom to selected musician
  useEffect(() => {
    if (selectedId) {
      const musician = completeMusicians.find((m) => m.id === selectedId);
      if (musician) {
        setViewState({
          ...viewState,
          longitude: musician.birthCoords[0],
          latitude: musician.birthCoords[1],
          zoom: 6,
          transitionDuration: 1500,
        });
      }
    }
  }, [selectedId, completeMusicians]);

  const spentPlaces = useMemo<SpentFlat[]>(
    () =>
      completeMusicians.flatMap((m) =>
        (m.spentTimePlaces ?? [])
          .filter((s): s is { coords: [number, number]; place: string; name?: string } => typeof s === 'object' && s !== null && 'coords' in s)
          .map((s) => ({
            coords: s.coords,
            place: s.place ?? s.name ?? '',
            musicianId: m.id,
            musician: m,
          }))
      ),
    [completeMusicians]
  );

  const migrationArcs = useMemo<MigrationArc[]>(
    () =>
      completeMusicians.flatMap((m) =>
        m.spentTimePlaces.map((s) => ({
          source: m.birthCoords,
          target: s.coords,
          musician: m,
        }))
      ),
    [completeMusicians]
  );

  const focusId = hovered ?? listHovered ?? selectedId;

  // CPU-side collision filtering for labels (only unclustered individual points)
  const visibleMapLabels = useMemo(() => {
    const zoom = viewState.zoom;
    const pxPerDeg = 256 * Math.pow(2, zoom) / 360;
    const FONT_PX = 11;
    const CHAR_W = FONT_PX * 0.55;

    const candidates = points.map((p) => {
      const [lng, lat] = p.position;
      const screenX = lng * pxPerDeg;
      const screenY = -lat * pxPerDeg;
      const textW = p.musician.name.length * CHAR_W;
      const isFocused = p.musician.id === focusId;
      return {
        point: p,
        screenX,
        screenY,
        halfW: textW / 2 + 6,
        halfH: FONT_PX / 2 + 6,
        priority: isFocused ? 2 : p.spidered ? 1 : 0,
      };
    });

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
    return placed.map((c) => c.point);
  }, [points, viewState.zoom, focusId]);

  const layers = useMemo(() => [
    // Migration arcs (only for focused musician)
    new ArcLayer<MigrationArc>({
      id: 'arcs',
      data: migrationArcs,
      getSourcePosition: (d) => d.source,
      getTargetPosition: (d) => d.target,
      getSourceColor: (d): [number, number, number, number] => {
        const a = !focusId ? 0 : d.musician.id === focusId ? 80 : 0;
        return [...getStyleColor(d.musician.bluesStyle), a] as [number, number, number, number];
      },
      getTargetColor: (d): [number, number, number, number] => {
        const a = !focusId ? 0 : d.musician.id === focusId ? 160 : 0;
        return [...getStyleColor(d.musician.bluesStyle), a] as [number, number, number, number];
      },
      getWidth: (d) => (!focusId ? 0 : d.musician.id === focusId ? 2 : 0),
      getHeight: 0.4,
      pickable: false,
      updateTriggers: { getSourceColor: [focusId], getTargetColor: [focusId], getWidth: [focusId] },
    }),

    // Spent time places (below clusters and musician dots)
    new ScatterplotLayer<SpentFlat>({
      id: 'spent-places',
      data: spentPlaces,
      getPosition: (d) => d.coords,
      radiusUnits: 'pixels' as const,
      getRadius: (d) => (!focusId || d.musicianId === focusId ? 12 : 6),
      getFillColor: [0, 0, 0, 0],
      stroked: true,
      getLineColor: (d): [number, number, number, number] => {
        const a = !focusId || d.musicianId === focusId ? 160 : 30;
        return [...getStyleColor(d.musician.bluesStyle), a] as [number, number, number, number];
      },
      lineWidthUnits: 'pixels' as const,
      getLineWidth: 1.5,
      pickable: false,
      updateTriggers: { getRadius: [focusId], getLineColor: [focusId] },
    }),

    // Cluster pie chart wedges — computed inline, depth test disabled so they render above spent-places
    ...((): SolidPolygonLayer<PieWedge>[] => {
      const wedges: PieWedge[] = [];
      const SEGMENTS = 20;
      const scale = 360 / (256 * Math.pow(2, viewState.zoom));

      for (const cluster of clusters) {
        const [lng, lat] = cluster.position;
        const radiusPx = Math.min(16, Math.max(10, 7 + Math.sqrt(cluster.count) * 1.5));
        const rLng = radiusPx * scale;
        const rLat = radiusPx * scale * Math.cos(lat * Math.PI / 180);

        const dist = cluster.styleDistribution;
        const total = Object.values(dist).reduce((a, b) => a + b, 0);
        if (total === 0) continue;

        const styles = Object.entries(dist).sort((a, b) => b[1] - a[1]);
        let startAngle = -Math.PI / 2;
        for (const [style, count] of styles) {
          const fraction = count / total;
          const endAngle = startAngle + fraction * 2 * Math.PI;
          const [r, g, b] = getStyleColor(style);
          const segCount = Math.max(3, Math.round(fraction * SEGMENTS));
          const pts: [number, number][] = [[lng, lat]];
          for (let i = 0; i <= segCount; i++) {
            const angle = startAngle + (endAngle - startAngle) * (i / segCount);
            pts.push([lng + rLng * Math.cos(angle), lat + rLat * Math.sin(angle)]);
          }
          wedges.push({ polygon: pts, color: [r, g, b, 200], clusterId: cluster.clusterId });
          startAngle = endAngle;
        }
      }

      return [new SolidPolygonLayer<PieWedge>({
        id: 'cluster-pies',
        data: wedges,
        getPolygon: (d) => d.polygon,
        getFillColor: (d) => d.color,
        pickable: false,
        parameters: { depthCompare: 'always' as const },
      })];
    })(),

    // Cluster border ring + picking — filled transparent for full-area click target
    new ScatterplotLayer<ClusterGroup>({
      id: 'cluster-rings',
      data: clusters,
      getPosition: (d) => d.position,
      radiusUnits: 'pixels' as const,
      getRadius: (d) => Math.min(16, Math.max(10, 7 + Math.sqrt(d.count) * 1.5)),
      filled: true,
      getFillColor: [0, 0, 0, 0],
      stroked: true,
      getLineColor: [255, 255, 255, 200] as [number, number, number, number],
      lineWidthUnits: 'pixels' as const,
      getLineWidth: 2,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 60],
      onClick: ({ object }: { object?: ClusterGroup }) => {
        if (object) {
          const result = onClusterClick(object.clusterId, object.count, object.position);
          if (result?.zoomTo) {
            setViewState((prev) => ({
              ...prev,
              ...result.zoomTo,
              transitionDuration: 800,
            }));
          }
        }
      },
      onHover: ({ object }: { object?: ClusterGroup }) => {
        if (object) {
          setHovered(null);
          setListHovered(null);
        }
      },
      parameters: { depthCompare: 'always' as const },
    }),

    // Cluster count labels — disable depth test so text always renders on top of circles
    new TextLayer<ClusterGroup>({
      id: 'cluster-labels',
      data: clusters,
      getPosition: (d) => d.position,
      getText: (d) => String(d.count),
      getSize: 13,
      sizeUnits: 'pixels' as const,
      getColor: [255, 255, 255, 255] as [number, number, number, number],
      getTextAnchor: 'middle' as const,
      getAlignmentBaseline: 'center' as const,
      fontFamily: 'Georgia, serif',
      fontWeight: 700,
      pickable: false,
      parameters: { depthCompare: 'always' as const },
    }),

    // Spider background — semi-opaque disc behind expanded spider points (above clusters)
    ...((): ScatterplotLayer[] => {
      if (spiderLegs.length === 0 || spiderProgress === 0) return [];
      const center = spiderLegs[0].source;
      const radiusPx = spiderRadiusPx * spiderProgress * 2.2;
      return [new ScatterplotLayer({
        id: 'spider-bg',
        data: [{ position: center }],
        getPosition: (d: { position: [number, number] }) => d.position,
        radiusUnits: 'pixels' as const,
        getRadius: radiusPx,
        filled: true,
        getFillColor: theme === 'dark' ? [20, 15, 10, 160] : [245, 242, 238, 190],
        stroked: false,
        pickable: false,
        parameters: { depthCompare: 'always' as const },
      })];
    })(),

    // Spider legs — lines from cluster center to spidered musicians
    new LineLayer<SpiderLeg>({
      id: 'spider-legs',
      data: spiderLegs,
      getSourcePosition: (d) => d.source,
      getTargetPosition: (d) => [
        d.source[0] + (d.target[0] - d.source[0]) * spiderProgress,
        d.source[1] + (d.target[1] - d.source[1]) * spiderProgress,
      ] as [number, number],
      getColor: (d): [number, number, number, number] => {
        const isFocused = d.musician.id === focusId;
        const [r, g, b] = getStyleColor(d.musician.bluesStyle);
        return [r, g, b, isFocused ? 200 : 100];
      },
      getWidth: (d) => (d.musician.id === focusId ? 2 : 1),
      widthUnits: 'pixels' as const,
      pickable: false,
      updateTriggers: { getColor: [focusId], getWidth: [focusId], getTargetPosition: [spiderProgress] },
    }),

    // Individual musician dots (unclustered + spidered)
    // Sort so focused musician renders last (on top) for easier selection
    new ScatterplotLayer<ClusterPoint>({
      id: 'birth-places',
      data: [...points].sort((a, b) => {
        const aFocus = a.musician.id === focusId ? 1 : 0;
        const bFocus = b.musician.id === focusId ? 1 : 0;
        return aFocus - bFocus;
      }),
      getPosition: (d) => {
        if (d.spidered && spiderProgress < 1 && spiderLegs.length > 0) {
          const center = spiderLegs[0].source;
          return [
            center[0] + (d.position[0] - center[0]) * spiderProgress,
            center[1] + (d.position[1] - center[1]) * spiderProgress,
          ] as [number, number];
        }
        return d.position;
      },
      radiusUnits: 'pixels' as const,
      getRadius: (d) => {
        const id = d.musician.id;
        return id === focusId ? 14 : 10;
      },
      getFillColor: (d): [number, number, number, number] => {
        const a = !focusId || d.musician.id === focusId ? 220 : 140;
        return [...getStyleColor(d.musician.bluesStyle), a] as [number, number, number, number];
      },
      stroked: true,
      getLineColor: (d): [number, number, number, number] => {
        const a = d.musician.id === focusId ? 255 : !focusId ? 180 : 20;
        return [255, 255, 255, a];
      },
      lineWidthUnits: 'pixels' as const,
      getLineWidth: (d) => (d.musician.id === focusId ? 2 : 1),
      pickable: true,
      autoHighlight: false,
      onClick: ({ object }: { object?: ClusterPoint }) => {
        if (object) {
          if (!object.spidered && spideredClusterId !== null) {
            collapseSpider();
          }
          onSelect(object.musician);
        }
      },
      onHover: ({ object }: { object?: ClusterPoint }) => {
        setHovered(object?.musician.id ?? null);
        setListHovered(null);
      },
      updateTriggers: {
        getFillColor: [focusId],
        getLineColor: [focusId],
        getRadius: [focusId],
        getPosition: [spiderProgress],
        data: [focusId],
      },
    }),

    // Musician name labels
    new TextLayer<ClusterPoint>({
      id: 'birth-labels',
      data: visibleMapLabels,
      getPosition: (d) => d.position,
      getText: (d) => d.musician.name,
      getSize: (d) => {
        const isFocused = d.musician.id === focusId;
        return isFocused ? 14 : d.spidered ? 12 : !focusId ? 11 : 10;
      },
      sizeUnits: 'pixels' as const,
      getPixelOffset: [0, -32] as [number, number],
      getColor: (d): [number, number, number, number] => {
        const a = !focusId || d.musician.id === focusId ? 220 : d.spidered ? 180 : 10;
        return theme === 'dark' ? [255, 255, 255, a] : [0, 0, 0, a];
      },
      getTextAnchor: 'middle' as const,
      fontFamily: 'Georgia, serif',
      background: true,
      getBackgroundColor: (): [number, number, number, number] =>
        theme === 'dark' ? [20, 15, 10, 180] : [255, 252, 248, 200],
      backgroundPadding: [4, 2] as [number, number],
      pickable: false,
      updateTriggers: { getColor: [focusId], getSize: [focusId], getBackgroundColor: [theme] },
    }),
  ], [spentPlaces, migrationArcs, focusId, onSelect, visibleMapLabels, clusters, points,
    spiderLegs, spideredClusterId, collapseSpider, onClusterClick, viewState, theme, spiderProgress]);

  const hoveredMusician = hovered ? completeMusicians.find((m) => m.id === hovered) : null;
  return (
    <div className="relative w-full h-full">
      {/* Mobile sidebar toggle */}
      {isMobile ? (
        sheetHeight !== 'collapsed' ? (
          <button
            onClick={() => setSheetHeight('collapsed')}
            className="sm:hidden absolute top-1 right-2 z-76 flex items-center gap-1.5 px-3 py-2 bg-bg/55 border border-border rounded-lg text-xs text-ink3 hover:text-ink backdrop-blur-sm"
          >
            <span>✕</span>
            <span>{t('map.close')}</span>
          </button>
        ) : (
          <button
            onClick={() => setSheetHeight('half')}
            className="sm:hidden absolute top-3 left-3 z-20 flex items-center gap-1.5 px-3 py-2 bg-bg/55 border border-border rounded-lg text-xs text-ink3 hover:text-ink backdrop-blur-sm"
          >
            <span>☰</span>
            <span>{t('map.musicians')}</span>
          </button>
        )
      ) : (
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-3 py-2 bg-bg/55 border border-border rounded-lg text-xs text-ink3 hover:text-ink backdrop-blur-sm"
        >
          <span>{sidebarOpen ? '✕' : '☰'}</span>
          <span>{sidebarOpen ? t('map.close') : t('map.musicians')}</span>
        </button>
      )}

       {/* Musician Sidebar */}
       {isMobile ? (
         <MapBottomSheet
           height={sheetHeight}
           onHeightChange={setSheetHeight}
           onClose={() => setSheetHeight('collapsed')}
         >
           <MusicianSidebar
             musicians={completeMusicians}
             onSelect={(m) => {
               onSelect(m);
               setSheetHeight('collapsed');
             }}
             onHover={setListHovered}
             selectedId={selectedId}
             hoveredId={listHovered}
             styleFilter={styleFilter}
             onStyleFilterChange={onStyleFilterChange}
           />
         </MapBottomSheet>
       ) : (
         <div className="absolute left-0 top-0 bottom-0 z-10">
           <MusicianSidebar
             musicians={completeMusicians}
             onSelect={(m) => {
               onSelect(m);
               setSidebarOpen(false);
             }}
             onHover={setListHovered}
             selectedId={selectedId}
             hoveredId={listHovered}
             styleFilter={styleFilter}
             onStyleFilterChange={onStyleFilterChange}
           />
         </div>
       )}

      {/* Map */}
      <div className="relative w-full h-full">
        <DeckGL
          viewState={viewState}
          onViewStateChange={handleViewStateChange}
          controller={true}
          layers={layers}
          getCursor={({ isHovering }: { isHovering: boolean }) => (isHovering ? 'pointer' : 'grab')}
          onClick={(info: { object?: unknown }) => {
            // Click on empty space collapses spider
            if (!info.object && spideredClusterId !== null) {
              collapseSpider();
            }
          }}
        >
          <Map
            mapStyle={MAP_STYLES[theme]}
            onLoad={(evt) => {
              if (theme === 'light') {
                const map = evt.target;
                const layers = map.getStyle().layers;
                layers?.forEach((layer: { type?: string; id?: string }) => {
                  if (layer.type === 'fill' && layer.id?.includes('land')) {
                    map.setPaintProperty(layer.id, 'fill-color', '#c8c5c4');
                  }
                });
              }
            }}
          />
        </DeckGL>

        {/* Legend */}
        <div className={`absolute right-6 bg-bg/50 border border-bg3 rounded-md px-4 py-3 flex flex-col gap-1.5 pointer-events-none transition-all ${isMobile ? 'bottom-16' : 'bottom-6'}`}>
          <p className="text-2xs text-accent tracking-widest uppercase mb-1">{t('map.legend.title')}</p>
          {[
            { label: t('map.legend.birthPlace'), el: <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" /> },
            { label: t('map.legend.cluster'), el: <span className="w-3.5 h-3.5 rounded-full bg-accent/60 border-[1.5px] border-white/60 shrink-0 flex items-center justify-center text-[6px] text-white font-bold">n</span> },
            { label: t('map.legend.timeSpent'), el: <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-accent shrink-0" /> },
            { label: t('map.legend.migrationArc'), el: <span className="w-4 h-0.5 bg-gradient-to-r from-accent/40 to-accent/90 rounded shrink-0" /> },
          ].map(({ label, el }) => (
            <div key={label} className="flex items-center gap-2 text-xs text-ink2">
              {el}
              {label}
            </div>
          ))}
        </div>

        {/* Hover tooltip */}
        {hoveredMusician && !selectedId && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-bg2/96 border border-accent rounded-md px-4 py-2 flex items-center gap-2.5 pointer-events-none whitespace-nowrap">
            <strong className="text-ink text-sm">{hoveredMusician.name}</strong>
            <span className="text-ink2 text-xs">{t('map.tooltip.born')}: {hoveredMusician.birthPlace}</span>
            <span className="text-accent text-xs">{t(`styles.${hoveredMusician.bluesStyle}`, hoveredMusician.bluesStyle)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
