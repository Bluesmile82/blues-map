import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Musician } from '../types';
import { getStyleHex, getStyleColor, STYLE_HEX } from '../utils/colors';
import { getYear } from '../utils/layout';
import { useAtomValue } from 'jotai';
import { userAtom } from '../atoms/auth';
import { isMusicianFavoritedAtom } from '../atoms/lists';
import { useLists } from '../hooks/useLists';
import AuthModal from '../components/auth/AuthModal';
import ListsDropdown from '../components/lists/ListsDropdown';
import MobileVideoPlayer from './MobileVideoPlayer';

type PanelHeight = 'full' | 'half' | 'collapsed';

const HANDLE_H = 56; // collapsed shows just the drag handle
const NAVBAR_H = 56; // top nav bar height

function getSnapPx(h: PanelHeight, availH: number) {
  switch (h) {
    case 'full': return availH * 0.85;
    case 'half': return availH * 0.5;
    case 'collapsed': return HANDLE_H;
  }
}

interface MusicianPanelProps {
  musician: Musician;
  musicians: Musician[];
  onClose: () => void;
  onNavigate: (musician: Musician) => void;
  editMode: boolean;
  onEdit: () => void;
  onPlayVideo: (url: string) => void;
  videoMusician?: Musician | null;
  manualVideoUrl?: string | null | undefined;
  autoplay?: boolean;
  onVideoClose?: () => void;
  isMobile?: boolean;
  /** Pixel height of bottom toolbar to sit above (0 when no toolbar) */
  bottomInset?: number;
  /** When true, only snaps between full and closed (no half/collapsed), with opaque background */
  cardMode?: boolean;
}

export default function MusicianPanel({ musician, musicians, onClose, onNavigate, editMode, onEdit, onPlayVideo, videoMusician, manualVideoUrl, autoplay, onVideoClose, isMobile, bottomInset = 0, cardMode = false }: MusicianPanelProps) {
  const [panelHeight, setPanelHeight] = useState<PanelHeight>('full');
  const completeMusicians = useMemo(() => musicians.filter((m) =>
    m.name && m.bluesStyle && m.instrument && m.description && m.birthPlace && m.activeFrom
  ), [musicians]);
  const musicianMap = useMemo(() => Object.fromEntries(completeMusicians.map((m) => [m.id, m])), [completeMusicians]);

  const influencers = musician.influences.map((id) => musicianMap[id]).filter(Boolean) as Musician[];
  const influenced = completeMusicians.filter((m) => m.influences.includes(musician.id));
  const playedWith = (musician.playedWith ?? []).map((id) => musicianMap[id]).filter(Boolean) as Musician[];
  const hex = getStyleHex(musician.bluesStyle);
  const [r, g, b] = getStyleColor(musician.bluesStyle) as [number, number, number];

  // Auth and favorites state
  const user = useAtomValue(userAtom);
  const isFavorited = useAtomValue(isMusicianFavoritedAtom);
  const { toggleFavorite } = useLists();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showListsDropdown, setShowListsDropdown] = useState(false);
  const { t } = useTranslation();

  // Reset to full when musician changes
  const [, setCanClose] = useState(false);
  useEffect(() => {
    setCanClose(false);
    setPanelHeight('full');
    const timer = setTimeout(() => setCanClose(true), 400);
    return () => clearTimeout(timer);
  }, [musician.id]);

  // --- Mobile drag (handle-only) ---
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const availH = vh - NAVBAR_H - bottomInset; // usable height between navbar and toolbar
  const dragRef = useRef({ startY: 0, startH: 0, active: false });
  const [dragH, setDragH] = useState<number | null>(null); // null = not dragging

  const snapPx = cardMode ? getSnapPx('full', availH) : getSnapPx(panelHeight, availH);
  const maxH = availH * 0.85;
  const clamp = useCallback((h: number) => Math.max(HANDLE_H, Math.min(maxH, h)), [maxH]);

  const onHandleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    dragRef.current = { startY: e.touches[0].clientY, startH: snapPx, active: true };
  }, [snapPx]);

  const onHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current.active || e.touches.length !== 1) return;
    e.preventDefault();
    // drag up = increase height (startY - clientY is positive when dragging up)
    const dy = dragRef.current.startY - e.touches[0].clientY;
    setDragH(clamp(dragRef.current.startH + dy));
  }, [clamp]);

  const snapToNearest = useCallback((currentH: number) => {
    if (cardMode) {
      const fullPx = getSnapPx('full', availH);
      if (currentH < fullPx * 0.4) {
        onClose();
      } else {
        setPanelHeight('full');
      }
      return;
    }
    const points: { h: PanelHeight; px: number }[] = [
      { h: 'full', px: getSnapPx('full', availH) },
      { h: 'half', px: getSnapPx('half', availH) },
      { h: 'collapsed', px: getSnapPx('collapsed', availH) },
    ];
    let best = points[0];
    for (const p of points) {
      if (Math.abs(currentH - p.px) < Math.abs(currentH - best.px)) best = p;
    }
    // If dragged below collapsed threshold, close the panel
    if (currentH < HANDLE_H * 0.5) {
      onClose();
    } else {
      setPanelHeight(best.h);
    }
  }, [availH, onClose, cardMode]);

  const onHandleTouchEnd = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    const finalH = dragH ?? snapPx;
    setDragH(null);
    snapToNearest(finalH);
  }, [dragH, snapPx, snapToNearest]);

  // Mouse drag for desktop testing
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      e.preventDefault();
      const dy = dragRef.current.startY - e.clientY;
      setDragH(clamp(dragRef.current.startH + dy));
    };
    const onMouseUp = () => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      setDragH(prev => {
        snapToNearest(prev ?? snapPx);
        return null;
      });
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [clamp, snapPx, snapToNearest]);

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: snapPx, active: true };
  }, [snapPx]);

  const currentH = dragH ?? snapPx;

  return (
    <>
      <div
        className={`fixed z-80 flex flex-col overflow-hidden shadow-2xl border-t border-border-subtle
          ${isMobile
            ? `left-0 right-0 rounded-t-3xl ${cardMode ? 'bg-bg/95 backdrop-blur-lg' : 'bg-bg/10 backdrop-blur-md'}`
            : 'top-14 right-0 bottom-0 w-full sm:w-[26rem] h-auto rounded-t-none bg-bg/10 backdrop-blur-md transition-all duration-300 ease-out'
          }`}
        style={isMobile ? {
          bottom: bottomInset,
          height: currentH,
          transition: dragH !== null ? 'none' : 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        } : undefined}
      >
        {/* Mobile drag handle — only this area is draggable */}
        <div
          className="w-full flex justify-center py-3 shrink-0 sm:hidden cursor-grab active:cursor-grabbing select-none"
          style={{ touchAction: 'none' }}
          onTouchStart={isMobile ? onHandleTouchStart : undefined}
          onTouchMove={isMobile ? onHandleTouchMove : undefined}
          onTouchEnd={isMobile ? onHandleTouchEnd : undefined}
          onTouchCancel={isMobile ? onHandleTouchEnd : undefined}
          onMouseDown={isMobile ? onHandleMouseDown : undefined}
        >
          <div className="w-12 h-1.5 rounded-full bg-ink3/40" />
        </div>

        {/* ── Close button – always visible, top-right corner ── */}
        <button
          onClick={onClose}
          aria-label={t('musician.closePanel')}
          className={`absolute z-50 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full bg-bg-hover border border-border text-ink3 text-sm hover:text-ink hover:border-accent hover:bg-bg-deep transition-all duration-200 shadow-sm pointer-events-auto
            ${isMobile ? 'top-2 right-3' : 'top-4 right-4'}`}
        >
          ✕
        </button>

        {/* ── Compact header (half / collapsed on mobile) ── */}
        {isMobile && panelHeight !== 'full' ? (
          <div
            className="shrink-0 p-3"
            style={{
              background: `linear-gradient(160deg, rgba(${r},${g},${b},0.15) 0%, rgba(10,8,5,0) 70%)`,
            }}
          >
            <div className="flex gap-3 items-center">
              <div className="relative shrink-0">
                <img
                  src={musician.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(musician.name)}&background=251a0d&color=c8872a&size=80`}
                  alt={musician.name}
                  className="w-11 h-11 rounded-full object-cover"
                  style={{ filter: 'sepia(8%) contrast(1.05)' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(musician.name)}&background=251a0d&color=c8872a&size=80`;
                  }}
                />
                <div className="absolute inset-[-2px] rounded-full pointer-events-none"
                  style={{ border: `2px solid ${hex}` }} />
              </div>
              <div className="flex-1 min-w-0 pr-10">
                <h2 className="text-ink font-bold text-base leading-tight truncate">{musician.name}</h2>
                <p className="text-ink3 text-2xs mt-0.5 truncate">
                  {t(`styles.${musician.bluesStyle}`, musician.bluesStyle)} · {musician.birthPlace} · {getYear(musician.birthDate)}
                  {musician.deathDate ? `–${getYear(musician.deathDate)}` : ''}
                </p>
              </div>
            </div>
            <button
              onClick={() => setPanelHeight('full')}
              className="mt-3 w-full py-2.5 rounded-lg text-sm font-semibold transition-colors touch-manipulation"
              style={{
                color: hex,
                background: `rgba(${r},${g},${b},0.12)`,
                border: `1px solid rgba(${r},${g},${b},0.25)`,
              }}
            >
              {t('musician.details')}
            </button>
          </div>
        ) : (
        <>
        {/* ── Full header ── */}
        <div
          className="shrink-0 p-3 sm:p-4"
          style={{
            background: `linear-gradient(160deg, rgba(${r},${g},${b},0.15) 0%, rgba(10,8,5,0) 70%)`,
            borderBottom: `1px solid rgba(${r},${g},${b},0.2)`,
          }}
        >
          <div className="flex gap-3 sm:gap-5 items-start">
            {/* Avatar with colored ring */}
            <div className="relative shrink-0 mt-0.5">
              <img
                src={musician.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(musician.name)}&background=251a0d&color=c8872a&size=200`}
                alt={musician.name}
                className="w-[64px] h-[64px] sm:w-[88px] sm:h-[88px] rounded-full object-cover"
                style={{ filter: 'sepia(8%) contrast(1.05)' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(musician.name)}&background=251a0d&color=c8872a&size=200`;
                }}
              />
              {/* Outer glow ring */}
              <div
                className="absolute rounded-full pointer-events-none"
                style={{
                  inset: '-3px sm:-4px',
                  border: `${isMobile ? '2px' : '2.5px'} solid ${hex}`,
                  borderRadius: '50%',
                  boxShadow: `0 0 12px rgba(${r},${g},${b},0.4)`,
                }}
              />
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0 pr-10 sm:pr-12">
              <h2 className="text-ink font-bold text-lg sm:text-[1.25rem] leading-tight mb-1.5 sm:mb-2">{musician.name}</h2>
              <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 mb-2 sm:mb-2.5">
                <span
                  className="inline-block text-3xs sm:text-label font-semibold tracking-wide uppercase px-2 py-0.5 sm:px-3 sm:py-1 rounded-md sm:rounded-lg"
                  style={{
                    color: hex,
                    background: `rgba(${r},${g},${b},0.12)`,
                    border: `1px solid rgba(${r},${g},${b},0.25)`,
                  }}
                >
                  {t(`styles.${musician.bluesStyle}`, musician.bluesStyle)}
                </span>
                {musician.secondaryStyles?.map(style => {
                  const styleHex = STYLE_HEX[style] ?? '#969696';
                  return (
                    <span
                      key={style}
                      className="inline-block text-[0.6rem] sm:text-2xs font-medium tracking-wide uppercase px-2 py-0.5 rounded-md opacity-75"
                      style={{
                        color: styleHex,
                        border: `1px solid ${styleHex}55`,
                        background: `${styleHex}12`,
                      }}
                    >
                      {t(`styles.${style}`, style)}
                    </span>
                  );
                })}
              </div>
              <p className="text-ink3 text-2xs sm:text-ui leading-relaxed font-medium">
                {musician.birthPlace} · {t('musician.bornAbbr')} {getYear(musician.birthDate)}
                {musician.deathDate
                  ? ` — ${t('musician.diedAbbr')} ${getYear(musician.deathDate)}`
                  : ` — ${t('musician.active')}`}
              </p>
              <p className="text-ink2 text-2xs sm:text-ui mt-0.5">{[musician.instrument, ...(musician.secondaryInstruments ?? [])].map(i => t(`instruments.${i}`, i)).join(', ')}</p>
              {editMode && (
                <button
                  onClick={onEdit}
                  className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-accent text-bg rounded text-xs sm:text-sm font-medium hover:bg-accent/90 transition-colors"
                >
                  ✏️ {t('musician.editBtn')}
                </button>
              )}
              {/* Favorite buttons */}
              <div className="flex items-center gap-2 mt-3 sm:mt-4">
                <button
                  onClick={() => {
                    if (!user) {
                      setShowAuthModal(true);
                    } else {
                      toggleFavorite(musician.id);
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg transition-colors touch-manipulation ${isFavorited(musician.id)
                    ? 'bg-danger-bg text-danger'
                    : 'bg-bg-hover hover:bg-bg-deep active:bg-border-subtle'
                    }`}
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill={isFavorited(musician.id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  <span className="text-xs sm:text-sm font-medium">{isFavorited(musician.id) ? t('musician.favorited') : t('musician.favorite')}</span>
                </button>

                <button
                  onClick={() => {
                    if (!user) {
                      setShowAuthModal(true);
                    } else {
                      setShowListsDropdown(true);
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg bg-bg3/30 hover:bg-bg3/50 active:bg-bg3/70 transition-colors touch-manipulation"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span className="text-xs sm:text-sm font-medium">{t('musician.addToList')}</span>
                </button>
              </div>

              {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
              {showListsDropdown && (
                <ListsDropdown
                  musicianId={musician.id}
                  onClose={() => setShowListsDropdown(false)}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-6 sm:px-12 sm:py-10 flex flex-col gap-6 sm:gap-10">

            {/* Description */}
            {musician.description && (
              <p className="text-ui text-ink leading-[1.75]">{musician.description}</p>
            )}

            {/* Listen */}
            {musician.youtubeLink && (
              <Section title={t('musician.listen')} r={r} g={g} b={b} hex={hex}>
                <button
                  onClick={() => onPlayVideo(musician.youtubeLink)}
                  className="inline-flex items-center gap-3 px-5 py-3 rounded-md text-ui font-medium border transition-all duration-150"
                  style={{
                    color: hex,
                    background: `rgba(${r},${g},${b},0.1)`,
                    borderColor: `rgba(${r},${g},${b},0.3)`,
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.background = `rgba(${r},${g},${b},0.2)`;
                    el.style.borderColor = hex;
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.background = `rgba(${r},${g},${b},0.1)`;
                    el.style.borderColor = `rgba(${r},${g},${b},0.3)`;
                  }}
                >
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-2xs"
                    style={{ background: `rgba(${r},${g},${b},0.25)` }}>
                    ▶
                  </span>
                  {t('musician.watchOnYoutube')}
                </button>
              </Section>
            )}

            {/* Albums */}
            {musician.albums.length > 0 && (
              <Section title={t('musician.notableAlbums')} r={r} g={g} b={b} hex={hex}>
                <ul className="flex flex-col gap-4">
                  {musician.albums.map((album) => (
                    <li key={album.name} className="flex items-start gap-3">
                      <span className="mt-1.5 shrink-0 text-2xs" style={{ color: hex }}>◆</span>
                      <div className="flex-1 flex items-center justify-between gap-3 py-1.5">
                        <span className="text-ui text-ink2">{album.name}</span>
                        {album.youtubeLink && (
                          <button
                            onClick={() => onPlayVideo(album.youtubeLink)}
                            className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded text-label font-medium border transition-all duration-150"
                            style={{
                              color: hex,
                              background: `rgba(${r},${g},${b},0.08)`,
                              borderColor: `rgba(${r},${g},${b},0.25)`,
                            }}
                            onMouseEnter={(e) => {
                              const el = e.currentTarget as HTMLElement;
                              el.style.background = `rgba(${r},${g},${b},0.18)`;
                              el.style.borderColor = hex;
                            }}
                            onMouseLeave={(e) => {
                              const el = e.currentTarget as HTMLElement;
                              el.style.background = `rgba(${r},${g},${b},0.08)`;
                              el.style.borderColor = `rgba(${r},${g},${b},0.25)`;
                            }}
                          >
                            <span className="text-2xs">▶</span>
                            {t('musician.listen')}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Influenced by */}
            {influencers.length > 0 && (
              <Section title={t('musician.influencedBy')} r={r} g={g} b={b} hex={hex}>
                <div className="flex flex-wrap gap-2.5">
                  {influencers.map((m) => (
                    <MusicianChip key={m.id} musician={m} onClick={() => onNavigate(m)} />
                  ))}
                </div>
              </Section>
            )}

            {/* Influenced */}
            {influenced.length > 0 && (
              <Section title={t('musician.influenced')} r={r} g={g} b={b} hex={hex}>
                <div className="flex flex-wrap gap-2.5">
                  {influenced.map((m) => (
                    <MusicianChip key={m.id} musician={m} onClick={() => onNavigate(m)} />
                  ))}
                </div>
              </Section>
            )}

            {/* Played with */}
            {playedWith.length > 0 && (
              <Section title={t('musician.playedWith')} r={r} g={g} b={b} hex={hex}>
                <div className="flex flex-wrap gap-2.5">
                  {playedWith.map((m) => (
                    <MusicianChip key={m.id} musician={m} onClick={() => onNavigate(m)} />
                  ))}
                </div>
              </Section>
            )}

            {/* Details */}
            <Section title={t('musician.details')} r={r} g={g} b={b} hex={hex}>
              <div className="flex flex-col gap-2">
                <DetailRow label={t('musician.born')} value={`${musician.birthDate.split('-')[0]} — ${musician.birthPlace}`} />
                {musician.deathDate && musician.deathPlace && (
                  <DetailRow label={t('musician.died')} value={`${musician.deathDate.split('-')[0]} — ${musician.deathPlace}`} />
                )}
                {musician.spentTimePlaces.length > 0 && (
                  <DetailRow label={t('musician.activeIn')} value={musician.spentTimePlaces.map((s) => s.place).join(', ')} />
                )}
              </div>
            </Section>

          </div>
        </div>
        </>
        )}

        {/* Mobile video player - embedded at bottom */}
        {isMobile && videoMusician && onVideoClose && (
          <div className="shrink-0">
            <MobileVideoPlayer
              key={videoMusician.id}
              youtubeUrl={videoMusician.youtubeLink}
              albums={videoMusician.albums}
              musicianName={videoMusician.name}
              manualVideoUrl={manualVideoUrl ?? null}
              onClose={onVideoClose ?? (() => { })}
              autoplay={autoplay ?? false}
            />
          </div>
        )}
      </div>
    </>
  );
}

function Section({
  title, hex, r, g, b, children,
}: {
  title: string; hex: string; r: number; g: number; b: number; children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="w-1 h-4.5 rounded-full shrink-0" style={{ background: hex }} />
        <h3 className="text-label font-semibold tracking-wide uppercase" style={{ color: hex }}>
          {title}
        </h3>
        <div className="flex-1 h-px" style={{ background: `rgba(${r},${g},${b},0.12)` }} />
      </div>
      {children}
    </section>
  );
}

function MusicianChip({ musician, onClick }: { musician: Musician; onClick: () => void }) {
  const hex = getStyleHex(musician.bluesStyle);
  const [r, g, b] = getStyleColor(musician.bluesStyle) as [number, number, number];
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-full pl-1 pr-4 py-2 text-ink2 text-ui font-medium border border-border-subtle bg-bg-elevated transition-all duration-200 hover:shadow-md"
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = hex;
        el.style.background = `rgba(${r},${g},${b},0.12)`;
        el.style.color = 'var(--color-ink-warm)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = '';
        el.style.background = '';
        el.style.color = '';
      }}
    >
      <div className="relative shrink-0">
        <img
          src={musician.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(musician.name)}&background=251a0d&color=c8872a&size=40`}
          alt={musician.name}
          className="w-7.5 h-7.5 rounded-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              `https://ui-avatars.com/api/?name=${encodeURIComponent(musician.name)}&background=251a0d&color=c8872a&size=40`;
          }}
        />
        <div className="absolute inset-0 rounded-full pointer-events-none"
          style={{ border: `1.5px solid ${hex}`, opacity: 0.75 }} />
      </div>
      {musician.name}
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3.5 text-ui">
      <span className="text-ink3 w-[4.8rem] shrink-0 pt-px">{label}</span>
      <span className="text-ink2 leading-snug">{value}</span>
    </div>
  );
}
