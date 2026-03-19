import { STYLE_COLORS, CANONICAL_STYLES } from '../utils/colors'

interface BluesStyleLegendProps {
  isOpen: boolean
  onToggle: () => void
  styleFilter: string | null
  onStyleFilterChange: (style: string | null) => void
  onHoverStyle: (style: string | null) => void
  hoveredStyle: string | null
  availableStyles: string[]
  position?: 'bottom-left' | 'top-right' | 'bottom-right'
  embedded?: boolean
}

export default function BluesStyleLegend({
  isOpen,
  onToggle,
  styleFilter,
  onStyleFilterChange,
  onHoverStyle,
  hoveredStyle,
  availableStyles,
  position = 'bottom-left',
  embedded = false,
}: BluesStyleLegendProps) {
  const positionClasses = {
    'bottom-left': 'absolute bottom-4 left-4 sm:bottom-5 sm:left-15',
    'top-right': 'absolute top-16 right-4',
    'bottom-right': 'absolute bottom-4 right-4',
  }

  const styles = CANONICAL_STYLES.filter((style) => availableStyles.includes(style))

  const containerClass = embedded
    ? 'flex flex-col'
    : `flex flex-col z-40 bg-bg/55 rounded-lg shadow-lg backdrop-blur-sm ${positionClasses[position]}`

  return (
    <div className={containerClass}>
      <button
        onClick={onToggle}
        className="flex items-center justify-between gap-2 px-3 py-2 text-2xs sm:text-label text-accent tracking-widest uppercase hover:text-accent2 transition-colors"
      >
        <span>Blues Style</span>
        <span className="text-3xs opacity-60">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="py-2 max-h-[40vh] overflow-y-auto">
          {styles.map((style) => {
            const [r, g, b] = STYLE_COLORS[style] ?? [150, 150, 150]
            const isActive = hoveredStyle === style
            const isSelected = styleFilter === style

            return (
              <div
                key={style}
                className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors hover:bg-bg-hover ${isActive || isSelected ? '' : 'text-ink2'}`}
                style={{
                  background: isActive || isSelected ? `rgba(${r},${g},${b},0.15)` : undefined,
                  color: isActive || isSelected ? `rgb(${r},${g},${b})` : undefined,
                }}
                onMouseEnter={() => onHoverStyle(style)}
                onMouseLeave={() => onHoverStyle(null)}
                onClick={() => onStyleFilterChange(isSelected ? null : style)}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0 transition-transform"
                  style={{
                    background: `rgb(${r},${g},${b})`,
                    transform: isActive || isSelected ? 'scale(1.3)' : 'scale(1)',
                    boxShadow: isActive || isSelected ? `0 0 5px rgba(${r},${g},${b},0.6)` : 'none',
                  }}
                />
                <span className="text-label flex-1">{style}</span>
                {isSelected && (
                  <span className="text-2xs opacity-50">✕</span>
                )}
              </div>
            )
          })}

          {styleFilter && (
            <button
              onClick={() => onStyleFilterChange(null)}
              className="w-full px-3 py-1.5 text-2xs text-ink3 hover:text-ink hover:bg-bg-hover transition-colors text-left"
            >
              Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  )
}
