import { useState, useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, ArcLayer, TextLayer } from '@deck.gl/layers';
import type { MapViewState } from '@deck.gl/core';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Musician } from '../types';
import { getStyleColor, getStyleHex, STYLE_COLORS, CANONICAL_STYLES } from '../utils/colors';
import SearchInput from './SearchInput';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

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
}

function MusicianSidebar({
  musicians,
  onSelect,
  onHover,
  selectedId,
  hoveredId,
  styleFilter,
}: {
  musicians: Musician[];
  onSelect: (musician: Musician) => void;
  onHover: (id: string | null) => void;
  selectedId: string | null;
  hoveredId: string | null;
  styleFilter: string | null;
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMusicians = useMemo(() => {
    const filtered = musicians.filter((m) => {
      const matchesSearch =
        !searchQuery ||
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.birthPlace.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStyle = !styleFilter || m.bluesStyle === styleFilter;
      return matchesSearch && matchesStyle;
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
      items: sortedDecades.flatMap(decade => [
        { type: 'decade', decade: parseInt(decade) } as const,
        ...byDecade[decade].map(m => ({ type: 'musician', musician: m }) as const)
      ]),
      count: filtered.length
    };
  }, [musicians, searchQuery, styleFilter]);

  return (
    <div className="absolute left-0 top-0 bottom-0 w-80 bg-bg/95 backdrop-blur-md flex flex-col z-10 shadow-2xl">
      {/* Header */}
      <div className="shrink-0 p-6 border-b border-border bg-bg">
        {/* Search */}
        <div className="mb-3">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by name or birthplace..."
          />
        </div>
      </div>

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
                  <div key={`decade-${item.decade}`} className="sticky top-0 z-10 py-2.5 px-3 my-2 bg-[#0a0805] border-b border-border">
                    <span className="text-xs font-bold text-accent uppercase tracking-wide">
                      Active {item.decade}s
                    </span>
                  </div>
                );
              }

              const musician = item.musician;
              const isSelected = musician.id === selectedId;
              const isHovered = musician.id === hoveredId;
              const hex = getStyleHex(musician.bluesStyle);
              const [r, g, b] = getStyleColor(musician.bluesStyle) as [number, number, number];

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
                        className="text-[0.65rem] font-medium px-2 py-0.5 rounded-md"
                        style={{
                          color: hex,
                          background: `rgba(${r},${g},${b},0.12)`,
                          border: `1px solid rgba(${r},${g},${b},0.25)`,
                        }}
                      >
                        {musician.bluesStyle}
                      </span>
                      <span className="text-xs text-ink3 truncate">{musician.birthPlace}</span>
                    </div>
                  </div>

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
      <div className="shrink-0 px-5 py-3 border-t border-border text-xs text-ink3 bg-[#0a0805] font-medium">
        {filteredMusicians.count} of {musicians.length} musicians
      </div>
    </div>
  );
}

export default function MapView({ musicians, onSelect, selectedId, styleFilter, onStyleFilterChange }: MapViewProps) {
  const completeMusicians = useMemo(() => {
    const valid = musicians.filter((m) =>
      m.name && m.bluesStyle && m.instrument && m.description && m.birthPlace && m.image && m.activeFrom
    );
    return styleFilter ? valid.filter((m) => m.bluesStyle === styleFilter) : valid;
  }, [musicians, styleFilter]);

  const [hovered, setHovered] = useState<string | null>(null);
  const [listHovered, setListHovered] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW_STATE);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        const a = !focusId || d.id === focusId ? 220 : 40;
        return [...getStyleColor(d.bluesStyle), a] as [number, number, number, number];
      },
      stroked: true,
      getLineColor: (d): [number, number, number, number] => {
        const a = d.id === focusId ? 255 : !focusId ? 80 : 20;
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
      data: completeMusicians,
      getPosition: (d) => d.birthCoords,
      getText: (d) => d.name,
      getSize: (d) => (d.id === focusId ? 14 : !focusId ? 11 : 10),
      sizeUnits: 'pixels' as const,
      getPixelOffset: [0, -32] as [number, number],
      getColor: (d): [number, number, number, number] => {
        const a = !focusId || d.id === focusId ? 220 : 50;
        return [240, 210, 160, a];
      },
      getTextAnchor: 'middle' as const,
      fontFamily: 'Georgia, serif',
      pickable: false,
      updateTriggers: { getColor: [focusId], getSize: [focusId] },
    }),
  ], [spentPlaces, migrationArcs, focusId, onSelect]);

  const hoveredMusician = hovered ? completeMusicians.find((m) => m.id === hovered) : null;

  return (
    <div className="relative w-full h-full">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(o => !o)}
        className="sm:hidden absolute top-3 left-3 z-20 flex items-center gap-1.5 px-3 py-2 bg-bg/95 border border-border rounded-lg text-xs text-ink3 hover:text-ink backdrop-blur-md"
      >
        <span>{sidebarOpen ? '✕' : '☰'}</span>
        <span>{sidebarOpen ? 'Close' : 'Musicians'}</span>
      </button>

      {/* Musician Sidebar — always visible on sm+, toggleable on mobile */}
      <div className={`${sidebarOpen ? 'flex' : 'hidden'} sm:flex absolute left-0 top-0 bottom-0 z-10`}>
        <MusicianSidebar
          musicians={completeMusicians}
          onSelect={(m) => { onSelect(m); setSidebarOpen(false); }}
          onHover={setListHovered}
          selectedId={selectedId}
          hoveredId={listHovered}
          styleFilter={styleFilter}
          onStyleFilterChange={onStyleFilterChange}
        />
      </div>

      {/* Blues Style Legend — bottom-left, right of sidebar on sm+ */}
      <div className="hidden sm:flex absolute bottom-5 left-83 flex-col z-20">
        <button
          onClick={() => setLegendOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-2 bg-bg/90 border border-[#2a1e0e] rounded-lg text-[0.62rem] text-accent tracking-widest uppercase hover:border-accent/50 transition-colors"
        >
          <span className="flex-1 text-left">Blues Style</span>
          {styleFilter && <span className="text-[0.6rem] text-ink3 normal-case tracking-normal truncate max-w-20">{styleFilter}</span>}
          <span className="text-[0.65rem] text-ink3">{legendOpen ? '▲' : '▼'}</span>
        </button>
        {legendOpen && (
          <div className="mt-1 bg-bg/90 border border-[#2a1e0e] rounded-lg py-2 flex flex-col">
            {CANONICAL_STYLES.filter((style) =>
              musicians.some((m) => m.bluesStyle === style)
            ).map((style) => {
              const [r, g, b] = STYLE_COLORS[style] ?? [150, 150, 150];
              const isFiltered = styleFilter === style;
              return (
                <div
                  key={style}
                  className="flex items-center gap-2 px-3 py-1 cursor-pointer transition-colors"
                  style={{
                    background: isFiltered ? `rgba(${r},${g},${b},0.15)` : undefined,
                    color: isFiltered ? `rgb(${r},${g},${b})` : 'rgba(255,255,255,0.65)',
                  }}
                  onClick={() => onStyleFilterChange(isFiltered ? null : style)}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform"
                    style={{
                      background: `rgb(${r},${g},${b})`,
                      border: isFiltered ? `1.5px solid rgb(${r},${g},${b})` : '1px solid rgba(255,255,255,0.1)',
                      transform: isFiltered ? 'scale(1.3)' : 'scale(1)',
                      boxShadow: isFiltered ? `0 0 6px rgba(${r},${g},${b},0.6)` : 'none',
                    }}
                  />
                  <span className="text-[0.72rem] flex-1">{style}</span>
                  {isFiltered && <span className="text-[0.6rem] opacity-60">✕</span>}
                </div>
              );
            })}
          </div>
        )}
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
          <Map mapStyle={MAP_STYLE} />
        </DeckGL>

        {/* Legend */}
        <div className="absolute bottom-6 right-6 bg-bg/90 border border-bg3 rounded-md px-4 py-3 flex flex-col gap-1.5 pointer-events-none">
          <p className="text-[0.68rem] text-accent tracking-widest uppercase mb-1">Map Key</p>
          {[
            { label: 'Birth place', el: <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" /> },
            { label: 'Time spent', el: <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-accent shrink-0" /> },
            { label: 'Migration arc', el: <span className="w-4 h-0.5 bg-gradient-to-r from-accent/40 to-accent/90 rounded shrink-0" /> },
          ].map(({ label, el }) => (
            <div key={label} className="flex items-center gap-2 text-[0.75rem] text-ink2">
              {el}
              {label}
            </div>
          ))}
        </div>

        {/* Hover tooltip */}
        {hoveredMusician && !selectedId && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-bg2/96 border border-accent rounded-md px-4 py-2 flex items-center gap-2.5 pointer-events-none whitespace-nowrap">
            <strong className="text-ink text-[0.9rem]">{hoveredMusician.name}</strong>
            <span className="text-ink2 text-[0.78rem]">Born: {hoveredMusician.birthPlace}</span>
            <span className="text-accent text-[0.75rem]">{hoveredMusician.bluesStyle}</span>
          </div>
        )}
      </div>
    </div>
  );
}
