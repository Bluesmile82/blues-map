import { useState } from 'react'
import SearchInput from './SearchInput'
import { useAtomValue } from 'jotai'
import { userAtom } from '../atoms/auth'
import { listsAtom, favoritesMapAtom } from '../atoms/lists'
import { CANONICAL_STYLES, STYLE_COLORS } from '../utils/colors'

interface FiltersPanelProps {
  searchValue: string
  onSearchChange: (value: string) => void
  textFilterValue: string
  onTextFilterChange: (value: string) => void
  showFavoritesOnly: boolean
  onFavoritesOnlyChange: (show: boolean) => void
  filterListId: string | null
  onFilterListIdChange: (listId: string | null) => void
  styleFilter: string | null
  onStyleFilterChange: (style: string | null) => void
  availableStyles: string[]
  yearRange: [number, number] | null
  minYear: number
  maxYear: number
  onYearRangeChange: (range: [number, number] | null) => void
  displayMusiciansCount?: number
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  isMobile?: boolean
}

export default function FiltersPanel({
  searchValue,
  onSearchChange,
  textFilterValue,
  onTextFilterChange,
  showFavoritesOnly,
  onFavoritesOnlyChange,
  filterListId,
  onFilterListIdChange,
  styleFilter,
  onStyleFilterChange,
  availableStyles,
  yearRange,
  minYear,
  maxYear,
  onYearRangeChange,
  displayMusiciansCount,
  collapsed = false,
  onCollapsedChange,
  isMobile = false,
}: FiltersPanelProps) {
  const [localCollapsed, setLocalCollapsed] = useState(collapsed)
  const [legendOpen, setLegendOpen] = useState(false)

  const user = useAtomValue(userAtom)
  const lists = useAtomValue(listsAtom)
  const favoritesMap = useAtomValue(favoritesMapAtom)

  const isCollapsed = onCollapsedChange ? collapsed : localCollapsed
  const setCollapsed = onCollapsedChange ?? setLocalCollapsed

  const effectiveYearRange: [number, number] = yearRange ?? [minYear, maxYear]

  return (
    <div
      className={`flex flex-col gap-2 ${isMobile ? 'w-full' : ''} ${isCollapsed ? 'sm:max-h-[50px]' : ''
        }`}
      style={isMobile ? {} : { width: 220 }}
    >
      {/* Collapse toggle - only show on desktop or when collapsed */}
      {(isCollapsed || !isMobile) && (
        <button
          onClick={() => setCollapsed(!isCollapsed)}
          className="flex items-center justify-between w-full px-3 py-2 bg-bg-subtle/95 border border-border-subtle rounded-lg text-ink text-xs font-medium backdrop-blur-sm hover:border-border transition-colors"
        >
          <span>Filters</span>
          <svg
            className={`w-4 h-4 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Filters content */}
      <div className={`${isCollapsed ? 'hidden' : 'flex'} flex-col gap-2`}>
        {/* Search by name */}
        <div className="relative">
          <SearchInput
            value={searchValue}
            onChange={onSearchChange}
            placeholder="Find by name…"
          />
        </div>

        {/* Search by description/albums */}
        <SearchInput
          value={textFilterValue}
          onChange={onTextFilterChange}
          placeholder="Filter by description or albums…"
        />
        {textFilterValue && displayMusiciansCount !== undefined && (
          <p className="text-2xs text-ink3 px-0.5">
            {displayMusiciansCount} musician{displayMusiciansCount !== 1 ? 's' : ''} shown
          </p>
        )}

        {/* Favorites filter - only show when logged in */}
        {user && (
          <div className="bg-bg/50 border border-border-subtle rounded-lg px-3 py-2 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showFavoritesOnly}
                onChange={(e) => onFavoritesOnlyChange(e.target.checked)}
              />
              <span className="text-label text-ink3">Show favorites only</span>
            </div>

            {/* List selector dropdown */}
            {showFavoritesOnly && lists.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <select
                  value={filterListId ?? ''}
                  onChange={(e) => onFilterListIdChange(e.target.value || null)}
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

        {/* Blues style legend */}
        <div className="bg-bg/50 border border-border-subtle rounded-lg">
          <button
            onClick={() => setLegendOpen(!legendOpen)}
            className="flex items-center justify-between w-full px-3 py-2 text-2xs text-accent tracking-widest uppercase hover:text-accent2 transition-colors"
          >
            <span>Blues Style</span>
            <span className="text-3xs opacity-60">{legendOpen ? '▲' : '▼'}</span>
          </button>

          {legendOpen && (
            <div className="px-3 pb-2 max-h-48 overflow-y-auto">
              {CANONICAL_STYLES.filter((style) => availableStyles.includes(style)).map((style) => {
                const [r, g, b] = (STYLE_COLORS as Record<string, [number, number, number]>)[style] ?? [150, 150, 150]
                const isActive = styleFilter === style

                return (
                  <div
                    key={style}
                    className="flex items-center gap-2 px-2 py-1 cursor-pointer transition-colors hover:bg-bg-hover rounded"
                    style={{
                      background: isActive ? `rgba(${r},${g},${b},0.15)` : undefined,
                      color: isActive ? `rgb(${r},${g},${b})` : 'rgba(255,255,255,0.65)',
                    }}
                    onClick={() => onStyleFilterChange(isActive ? null : style)}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0 transition-transform"
                      style={{
                        background: `rgb(${r},${g},${b})`,
                        transform: isActive ? 'scale(1.3)' : 'scale(1)',
                        boxShadow: isActive ? `0 0 5px rgba(${r},${g},${b},0.6)` : 'none',
                      }}
                    />
                    <span className="text-label flex-1">{style}</span>
                    {isActive && (
                      <span className="text-2xs opacity-50">✕</span>
                    )}
                  </div>
                )
              })}

              {styleFilter && (
                <button
                  onClick={() => onStyleFilterChange(null)}
                  className="w-full px-2 py-1 text-2xs text-ink3 hover:text-ink hover:bg-bg-hover transition-colors text-left rounded"
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>

        {/* Year range filter */}
        <div className="bg-bg/50 border border-border-subtle rounded-lg px-3 py-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-2xs text-accent tracking-widest uppercase">Active years</span>
            {yearRange && (
              <button
                onClick={() => onYearRangeChange(null)}
                className="text-3xs text-ink3 hover:text-ink transition-colors"
              >
                reset
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
                const v = parseInt(e.target.value)
                onYearRangeChange([Math.min(v, effectiveYearRange[1] - 1), effectiveYearRange[1]])
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
                const v = parseInt(e.target.value)
                onYearRangeChange([effectiveYearRange[0], Math.max(v, effectiveYearRange[0] + 1)])
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
      </div>
    </div>
  )
}
