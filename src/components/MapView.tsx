import { useState, useMemo, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, ArcLayer, TextLayer } from '@deck.gl/layers';

import type { MapViewState } from '@deck.gl/core';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Musician } from '../types';
import { getStyleColor, getStyleHex } from '../utils/colors';
import { getStyleAbbreviation } from '../utils/layout';
import SearchInput from './SearchInput';
import BluesStyleLegend from './BluesStyleLegend';
import { useAtomValue } from 'jotai';
import { isMusicianFavoritedAtom, listsAtom, favoritesMapAtom } from '../atoms/lists';
import { userAtom } from '../atoms/auth';

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
    <div className="absolute left-0 top-0 bottom-0 px-4 pt-4 w-80 bg-bg/85 backdrop-blur-sm flex flex-col z-10 shadow-2xl border-r border-border-subtle">
      {/* Filters toggle */}
      <button
        onClick={() => setFiltersCollapsed(!filtersCollapsed)}
        className="flex items-center justify-between w-full text-2xs text-accent tracking-widest uppercase hover:text-accent2 transition-colors mb-3 px-1"
      >
        <span>Filters</span>
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
              placeholder="Search by name or birthplace..."
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
                  Show favorites only
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
                    <option value="">All lists</option>
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
          <div className="text-center py-8 text-ink3 text-sm">
            No musicians found matching your search
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredMusicians.items.map((item: any) => {
              if (item.type === 'decade') {
                return (
                  <div key={`decade-${item.decade}`} className="sticky -top-3 z-10 py-1 px-3 bg-bg border-b border-border">
                    <span className="text-xs font-bold text-accent tracking-wide">
                      <span className='uppercase'>Active in</span> {item.decade}s
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
                  className={`flex items-center gap-1 px-4 py-1 transition-all duration-200 text-left mb-2 ${isSelected
                    ? 'bg-[rgba(212, 154, 58, 0.12)] shadow-md'
                    : isHovered
                      ? 'bg-bg3 shadow-sm'
                      : 'bg-bg2 border-bode'
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
        {filteredMusicians.count} of {musicians.length} musicians
      </div>
    </div>
  );
}

export default function MapView({ musicians, onSelect, selectedId, styleFilter, onStyleFilterChange, theme, isMobile }: MapViewProps) {
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
        m.spentTimePlaces.map((s) => ({
          coords: s.coords,
          place: s.place,
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

  // CPU-side collision filtering for map labels
  const visibleMapLabels = useMemo(() => {
    const zoom = viewState.zoom;
    // Approximate pixels per degree at this zoom (Mercator)
    const pxPerDeg = 256 * Math.pow(2, zoom) / 360;
    const FONT_PX = 11;
    const CHAR_W = FONT_PX * 0.55;

    const candidates = completeMusicians.map((m) => {
      const [lng, lat] = m.birthCoords;
      const screenX = lng * pxPerDeg;
      const screenY = -lat * pxPerDeg; // Y inverted in screen space
      const textW = m.name.length * CHAR_W;
      const isFocused = m.id === focusId;
      return {
        musician: m,
        screenX,
        screenY,
        halfW: textW / 2 + 6,
        halfH: FONT_PX / 2 + 6,
        priority: isFocused ? 1 : 0,
      };
    });

    // Focused musician always wins
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
    return placed.map((c) => c.musician);
  }, [completeMusicians, viewState.zoom, focusId]);

  const layers = useMemo(() => [
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

    new ScatterplotLayer<SpentFlat>({
      id: 'spent-places',
      data: spentPlaces,
      getPosition: (d) => d.coords,
      getRadius: (d) => (!focusId || d.musicianId === focusId ? 22000 : 10000),
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

    new ScatterplotLayer<Musician>({
      id: 'birth-places',
      data: completeMusicians,
      getPosition: (d) => d.birthCoords,
      getRadius: (d) => (d.id === focusId ? 28000 : !focusId ? 18000 : 12000),
      getFillColor: (d): [number, number, number, number] => {
        const a = !focusId || d.id === focusId ? 220 : 140;
        return [...getStyleColor(d.bluesStyle), a] as [number, number, number, number];
      },
      stroked: true,
      getLineColor: (d): [number, number, number, number] => {
        const a = d.id === focusId ? 255 : !focusId ? 180 : 20;
        return [255, 255, 255, a];
      },
      lineWidthUnits: 'pixels' as const,
      getLineWidth: (d) => (d.id === focusId ? 2 : 1),
      pickable: true,
      autoHighlight: false,
      onClick: ({ object }: { object?: Musician }) => object && onSelect(object),
      onHover: ({ object }: { object?: Musician }) => {
        setHovered(object?.id ?? null);
        setListHovered(null);
      },
      updateTriggers: { getFillColor: [focusId], getLineColor: [focusId], getRadius: [focusId] },
    }),

    new TextLayer<Musician>({
      id: 'birth-labels',
      data: visibleMapLabels,
      getPosition: (d) => d.birthCoords,
      getText: (d) => d.name,
      getSize: (d) => (d.id === focusId ? 14 : !focusId ? 11 : 10),
      sizeUnits: 'pixels' as const,
      getPixelOffset: [0, -32] as [number, number],
      getColor: (d): [number, number, number, number] => {
        const a = !focusId || d.id === focusId ? 220 : 10;
        return theme === 'dark' ? [255, 255, 255, a] : [0, 0, 0, a];
      },
      getTextAnchor: 'middle' as const,
      fontFamily: 'Georgia, serif',
      pickable: false,
      updateTriggers: { getColor: [focusId], getSize: [focusId] },
    }),
  ], [spentPlaces, migrationArcs, focusId, onSelect, visibleMapLabels]);

  const hoveredMusician = hovered ? completeMusicians.find((m) => m.id === hovered) : null;

  return (
    <div className="relative w-full h-full">
      {/* Mobile sidebar toggle */}
      {sidebarOpen ? (
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="sm:hidden absolute top-1 right-2 z-20 flex items-center gap-1.5 px-3 py-2 bg-bg/55 border border-border rounded-lg text-xs text-ink3 hover:text-ink backdrop-blur-sm"
        >
          <span>✕</span>
          <span>Close</span>
        </button>
      ) : <button
        onClick={() => setSidebarOpen(o => !o)}
        className="sm:hidden absolute top-3 left-3 z-20 flex items-center gap-1.5 px-3 py-2 bg-bg/55 border border-border rounded-lg text-xs text-ink3 hover:text-ink backdrop-blur-sm"
      >
        <span>☰</span>
        <span>Musicians</span>
      </button>
      }

      {/* Musician Sidebar — always visible on sm+, toggleable on mobile */}
      <div className={`${sidebarOpen ? 'flex' : 'hidden'} sm:flex absolute left-0 top-0 bottom-0 z-10`}>
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

      {/* Map */}
      <div className="relative w-full h-full">
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState: vs }) => setViewState(vs as MapViewState)}
          controller={true}
          layers={layers}
          getCursor={({ isHovering }: { isHovering: boolean }) => (isHovering ? 'pointer' : 'grab')}
        >
          <Map
            mapStyle={MAP_STYLES[theme]}
            onLoad={(evt) => {
              // Darken the land on light mode
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
        <p className="text-2xs text-accent tracking-widest uppercase mb-1">Map Key</p>
          {[
            { label: 'Birth place', el: <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" /> },
            { label: 'Time spent', el: <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-accent shrink-0" /> },
            { label: 'Migration arc', el: <span className="w-4 h-0.5 bg-gradient-to-r from-accent/40 to-accent/90 rounded shrink-0" /> },
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
            <span className="text-ink2 text-xs">Born: {hoveredMusician.birthPlace}</span>
            <span className="text-accent text-xs">{hoveredMusician.bluesStyle}</span>
          </div>
        )}
      </div>
    </div>
  );
}
