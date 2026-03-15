import { useMemo, useState } from 'react';
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
}

export default function MusicianPanel({ musician, musicians, onClose, onNavigate, editMode, onEdit, onPlayVideo, videoMusician, manualVideoUrl, autoplay, onVideoClose }: MusicianPanelProps) {
  const completeMusicians = useMemo(() => musicians.filter((m) =>
    m.name && m.bluesStyle && m.instrument && m.description && m.birthPlace && m.image && m.activeFrom
  ), [musicians]);
  const musicianMap = useMemo(() => Object.fromEntries(completeMusicians.map((m) => [m.id, m])), [completeMusicians]);

  const influencers = musician.influences.map((id) => musicianMap[id]).filter(Boolean) as Musician[];
  const influenced = completeMusicians.filter((m) => m.influences.includes(musician.id));
  const playedWith = musician.playedWith.map((id) => musicianMap[id]).filter(Boolean) as Musician[];
  const hex = getStyleHex(musician.bluesStyle);
  const [r, g, b] = getStyleColor(musician.bluesStyle) as [number, number, number];

  // Auth and favorites state
  const user = useAtomValue(userAtom);
  const isFavorited = useAtomValue(isMusicianFavoritedAtom);
  const { toggleFavorite } = useLists();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showListsDropdown, setShowListsDropdown] = useState(false);

  return (
    <div className="fixed top-14 right-0 bottom-0 w-full sm:w-[26rem] bg-bg flex flex-col overflow-hidden z-50 shadow-2xl">

      {/* ── Close button – always visible, top-right corner ── */}
      <button
        onClick={onClose}
        aria-label="Close panel"
        className="absolute top-4 right-4 z-[9999] w-9 h-9 flex items-center justify-center rounded-full bg-bg-hover border border-border text-ink3 text-sm hover:text-ink hover:border-accent hover:bg-bg-deep transition-all duration-200 shadow-sm pointer-events-auto"
      >
        ✕
      </button>

      {/* ── Header ── */}
      <div
        className="shrink-0 p-4"
        style={{
          background: `linear-gradient(160deg, rgba(${r},${g},${b},0.15) 0%, rgba(10,8,5,0) 70%)`,
          borderBottom: `1px solid rgba(${r},${g},${b},0.2)`,
        }}
      >
        <div className="flex gap-5 items-start">
          {/* Avatar with colored ring */}
          <div className="relative shrink-0 mt-0.5">
            <img
              src={musician.image}
              alt={musician.name}
              className="w-[88px] h-[88px] rounded-full object-cover"
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
                inset: '-4px',
                border: `2.5px solid ${hex}`,
                borderRadius: '50%',
                boxShadow: `0 0 16px rgba(${r},${g},${b},0.4)`,
              }}
            />
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0 pr-12">
            <h2 className="text-ink font-bold text-[1.25rem] leading-tight mb-2">{musician.name}</h2>
            <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
              <span
                className="inline-block text-label font-semibold tracking-wide uppercase px-3 py-1 rounded-lg"
                style={{
                  color: hex,
                  background: `rgba(${r},${g},${b},0.12)`,
                  border: `1px solid rgba(${r},${g},${b},0.25)`,
                }}
              >
                {musician.bluesStyle}
              </span>
              {musician.secondaryStyles?.map(style => {
                const styleHex = STYLE_HEX[style] ?? '#969696';
                return (
                  <span
                    key={style}
                    className="inline-block text-2xs font-medium tracking-wide uppercase px-2.5 py-0.5 rounded-lg opacity-75"
                    style={{
                      color: styleHex,
                      border: `1px solid ${styleHex}55`,
                      background: `${styleHex}12`,
                    }}
                  >
                    {style}
                  </span>
                );
              })}
            </div>
            <p className="text-ink3 text-ui leading-relaxed font-medium">
              {musician.birthPlace} · b. {getYear(musician.birthDate)}
              {musician.deathDate
                ? ` — d. ${getYear(musician.deathDate)}, ${musician.deathPlace}`
                : ' — still active'}
            </p>
            <p className="text-ink2 text-ui mt-1">{musician.instrument}</p>
            {musician.image_source && (
              <p className="text-ink3 text-xs mt-1 italic">Image: {musician.image_source}</p>
            )}
            {editMode && (
              <button
                onClick={onEdit}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-accent text-bg rounded text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                ✏️ Edit Musician
              </button>
            )}
            {/* Favorite buttons */}
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => {
                  if (!user) {
                    setShowAuthModal(true);
                  } else {
                    toggleFavorite(musician.id);
                  }
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-colors touch-manipulation ${isFavorited(musician.id)
                    ? 'bg-danger-bg text-danger'
                    : 'bg-bg-hover hover:bg-bg-deep active:bg-border-subtle'
                  }`}
              >
                <svg className="w-5 h-5" fill={isFavorited(musician.id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                <span className="text-sm font-medium">{isFavorited(musician.id) ? 'Favorited' : 'Favorite'}</span>
              </button>

              <button
                onClick={() => {
                  if (!user) {
                    setShowAuthModal(true);
                  } else {
                    setShowListsDropdown(true);
                  }
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors touch-manipulation"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="text-sm font-medium">Add to list</span>
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
            <Section title="Listen" r={r} g={g} b={b} hex={hex}>
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
                Watch on YouTube
              </button>
            </Section>
          )}

          {/* Albums */}
          {musician.albums.length > 0 && (
            <Section title="Notable Albums" r={r} g={g} b={b} hex={hex}>
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
                          Listen
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
            <Section title="Influenced by" r={r} g={g} b={b} hex={hex}>
              <div className="flex flex-wrap gap-2.5">
                {influencers.map((m) => (
                  <MusicianChip key={m.id} musician={m} onClick={() => onNavigate(m)} />
                ))}
              </div>
            </Section>
          )}

          {/* Influenced */}
          {influenced.length > 0 && (
            <Section title="Influenced" r={r} g={g} b={b} hex={hex}>
              <div className="flex flex-wrap gap-2.5">
                {influenced.map((m) => (
                  <MusicianChip key={m.id} musician={m} onClick={() => onNavigate(m)} />
                ))}
              </div>
            </Section>
          )}

          {/* Played with */}
          {playedWith.length > 0 && (
            <Section title="Played with" r={r} g={g} b={b} hex={hex}>
              <div className="flex flex-wrap gap-2.5">
                {playedWith.map((m) => (
                  <MusicianChip key={m.id} musician={m} onClick={() => onNavigate(m)} />
                ))}
              </div>
            </Section>
          )}

          {/* Details */}
          <Section title="Details" r={r} g={g} b={b} hex={hex}>
            <div className="flex flex-col gap-2">
              <DetailRow label="Born" value={`${musician.birthDate.split('-')[0]} — ${musician.birthPlace}`} />
              {musician.deathDate && musician.deathPlace && (
                <DetailRow label="Died" value={`${musician.deathDate.split('-')[0]} — ${musician.deathPlace}`} />
              )}
              {musician.spentTimePlaces.length > 0 && (
                <DetailRow label="Active in" value={musician.spentTimePlaces.map((s) => s.place).join(', ')} />
              )}
            </div>
          </Section>

        </div>
      </div>

      {/* Mobile video player - embedded at bottom */}
      {videoMusician && onVideoClose && (
        <div className="sm:hidden shrink-0">
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
          src={musician.image}
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
