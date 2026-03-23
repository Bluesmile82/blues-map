import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { Musician } from '../types';
import { getStyleHex } from '../utils/colors';
import { getYear } from '../utils/layout';

interface MusicianPreviewCardProps {
  musician: Musician;
  onViewDetails: () => void;
  onClose: () => void;
  isMobile: boolean;
}

export default function MusicianPreviewCard({ musician, onViewDetails, onClose, isMobile }: MusicianPreviewCardProps) {
  const { t } = useTranslation();
  const hex = getStyleHex(musician.bluesStyle);

  if (!isMobile) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed top-24 left-4 right-4 z-[55] pointer-events-auto"
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.2 }}
      >
        <div className="bg-bg/98 backdrop-blur-lg border-2 border-accent rounded-2xl shadow-2xl overflow-hidden">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 p-2 rounded-lg bg-bg/80 text-ink3 hover:text-ink transition-colors touch-manipulation z-10"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Content */}
          <div className="flex items-center gap-4 p-4">
            {/* Avatar */}
            <div className="relative shrink-0">
              <img
                src={musician.image}
                alt={musician.name}
                className="w-20 h-20 rounded-full object-cover"
                style={{ filter: 'sepia(8%) contrast(1.05)' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(musician.name)}&background=251a0d&color=c8872a&size=80`;
                }}
              />
              <div
                className="absolute inset-0 rounded-full pointer-events-none border-3"
                style={{ borderColor: hex, borderWidth: '3px' }}
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h3 className="text-ink font-bold text-lg leading-tight mb-1">{musician.name}</h3>

              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <span
                  className="inline-block text-2xs font-semibold tracking-wide uppercase px-2 py-0.5 rounded-md"
                  style={{
                    color: hex,
                    background: `${hex}20`,
                    border: `1px solid ${hex}40`,
                  }}
                >
                  {t(`styles.${musician.bluesStyle}`, musician.bluesStyle)}
                </span>
              </div>

              <p className="text-ink3 text-xs leading-relaxed">
                {musician.birthPlace} · {t('musician.bornAbbr')} {getYear(musician.birthDate)}
                {musician.deathDate
                  ? ` — ${t('musician.diedAbbr')} ${getYear(musician.deathDate)}`
                  : ` — ${t('musician.active')}`}
              </p>

              <p className="text-ink2 text-xs mt-0.5">{musician.instrument.split(', ')[0]}</p>
            </div>
          </div>

          {/* View Details Button */}
          <div className="px-4 pb-4">
            <motion.button
              onClick={onViewDetails}
              className="w-full py-3 bg-accent text-bg rounded-lg font-semibold text-sm touch-manipulation"
              whileTap={{ scale: 0.97 }}
            >
              {t('musician.details')}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
