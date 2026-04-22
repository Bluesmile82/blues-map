import { motion } from 'framer-motion';
import { GroupBy } from '../utils/layout';

interface MobileBottomToolbarProps {
  groupBy?: GroupBy;
  onGroupByChange?: (groupBy: GroupBy) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFilterToggle: () => void;
  onExpandAll?: () => void;
  allExpanded?: boolean;
  filterCount?: number;
  filterLabel?: string;
  filterActive?: boolean;
}

export default function MobileBottomToolbar({
  groupBy,
  onGroupByChange,
  onZoomIn,
  onZoomOut,
  onReset,
  onFilterToggle,
  onExpandAll,
  allExpanded = false,
  filterCount = 0,
  filterLabel = 'Filters',
  filterActive = false,
}: MobileBottomToolbarProps) {
  return (
    <motion.div
      className="fixed bottom-0 left-0 right-0 z-[70] sm:hidden"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <div className="bg-bg/95 backdrop-blur-lg border-t border-border-subtle" style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}>
        <div className="flex items-center justify-around px-2 py-2 gap-1">
          <motion.button
            onClick={onFilterToggle}
            className={`flex flex-col items-center justify-center min-w-[64px] min-h-[56px] px-2 rounded-lg active:bg-bg-hover transition-colors touch-manipulation relative ${filterActive ? 'bg-accent/15' : ''}`}
            whileTap={{ scale: 0.95 }}
            aria-label={filterLabel}
          >
            <svg className="w-6 h-6 text-accent mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M3 8h18M3 12h12" />
            </svg>
            <span className="text-2xs text-ink3">{filterLabel}</span>
            {filterCount > 0 && (
              <span className="absolute top-0 right-2 w-5 h-5 bg-accent text-bg text-xs font-bold rounded-full flex items-center justify-center">
                {filterCount}
              </span>
            )}
          </motion.button>

          {onExpandAll && groupBy === 'style' && (
            <motion.button
              onClick={onExpandAll}
              className="flex flex-col items-center justify-center min-w-[64px] min-h-[56px] px-2 rounded-lg active:bg-bg-hover transition-colors touch-manipulation"
              whileTap={{ scale: 0.95 }}
              aria-label={allExpanded ? 'Collapse all' : 'Expand all'}
            >
              <svg className="w-6 h-6 text-accent mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {allExpanded ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 14l6-6 6 6" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 10l6 6 6-6" />
                )}
              </svg>
              <span className="text-2xs text-ink3">{allExpanded ? 'Collapse' : 'Expand'}</span>
            </motion.button>
          )}

          {onGroupByChange && groupBy != null && (
            <div className="flex items-center bg-bg3/50 rounded-lg p-1 min-h-[48px]">
              {(['style', 'instrument'] as GroupBy[]).map((mode) => (
                <motion.button
                  key={mode}
                  onClick={() => onGroupByChange(mode)}
                  className={`px-3 py-2 rounded-md text-xs font-semibold tracking-wide uppercase transition-all touch-manipulation min-w-[72px] ${
                    groupBy === mode ? 'bg-accent text-bg' : 'text-ink3'
                  }`}
                  whileTap={{ scale: 0.95 }}
                  aria-pressed={groupBy === mode}
                >
                  {mode === 'style' ? 'Style' : 'Instrument'}
                </motion.button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1">
            <motion.button
              onClick={onZoomOut}
              className="flex items-center justify-center w-12 h-12 rounded-lg active:bg-bg-hover transition-colors touch-manipulation"
              whileTap={{ scale: 0.95 }}
              aria-label="Zoom out"
            >
              <svg className="w-6 h-6 text-ink2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </motion.button>

            <motion.button
              onClick={onZoomIn}
              className="flex items-center justify-center w-12 h-12 rounded-lg active:bg-bg-hover transition-colors touch-manipulation"
              whileTap={{ scale: 0.95 }}
              aria-label="Zoom in"
            >
              <svg className="w-6 h-6 text-ink2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </motion.button>
          </div>

          <motion.button
            onClick={onReset}
            className="flex flex-col items-center justify-center min-w-[64px] min-h-[56px] px-2 rounded-lg active:bg-bg-hover transition-colors touch-manipulation"
            whileTap={{ scale: 0.95 }}
            aria-label="Reset view"
          >
            <svg className="w-6 h-6 text-accent mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-2xs text-ink3">Reset</span>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
