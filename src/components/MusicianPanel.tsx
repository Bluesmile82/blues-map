import { useMemo } from 'react';
import type { Musician } from '../types';
import { getStyleHex, getStyleColor, STYLE_HEX } from '../utils/colors';
import { getYear } from '../utils/layout';

interface MusicianPanelProps {
  musician: Musician;
  musicians: Musician[];
  onClose: () => void;
  onNavigate: (musician: Musician) => void;
  editMode: boolean;
  onEdit: () => void;
  onPlayVideo: (url: string) => void;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
}

export default function MusicianPanel({ musician, musicians, onClose, onNavigate, editMode, onEdit, onPlayVideo, isFavorited = false, onToggleFavorite }: MusicianPanelProps) {
  const completeMusicians = useMemo(() => musicians.filter((m) =>
    m.name && m.bluesStyle && m.instrument && m.description && m.birthPlace && m.image && m.activeFrom
  ), [musicians]);
  const musicianMap = useMemo(() => Object.fromEntries(completeMusicians.map((m) => [m.id, m])), [completeMusicians]);

  const influencers = musician.influences.map((id) => musicianMap[id]).filter(Boolean) as Musician[];
  const influenced = completeMusicians.filter((m) => m.influences.includes(musician.id));
  const playedWith = musician.playedWith.map((id) => musicianMap[id]).filter(Boolean) as Musician[];
  const hex = getStyleHex(musician.bluesStyle);
  const [r, g, b] = getStyleColor(musician.bluesStyle) as [number, number, number];

  return (
    <div className="fixed top-14 right-0 bottom-0 w-full sm:w-[26rem] bg-bg flex flex-col overflow-hidden z-50 animate-slide-in shadow-2xl">

      {/* ── Close button – always visible, top-right corner ── */}
      <button
        onClick={onClose}
        aria-label="Close panel"
        className="absolute top-4 right-4 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-[#1a1208] border border-[#3a2a15] text-ink3 text-sm hover:text-ink hover:border-accent hover:bg-[#251a0d] transition-all duration-200 shadow-sm"
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
                className="inline-block text-[0.7rem] font-semibold tracking-wide uppercase px-3 py-1 rounded-lg"
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
                    className="inline-block text-[0.65rem] font-medium tracking-wide uppercase px-2.5 py-0.5 rounded-lg opacity-75"
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
            <p className="text-ink3 text-[0.82rem] leading-relaxed font-medium">
              {musician.birthPlace} · b. {getYear(musician.birthDate)}
              {musician.deathDate
                ? ` — d. ${getYear(musician.deathDate)}, ${musician.deathPlace}`
                : ' — still active'}
            </p>
            <p className="text-ink2 text-[0.82rem] mt-1">{musician.instrument}</p>
            {editMode && (
              <button
                onClick={onEdit}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-accent text-bg rounded text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                ✏️ Edit Musician
              </button>
            )}
            {editMode && onToggleFavorite && import.meta.env.VITE_ENABLE_EDIT_MODE === 'true' && (
              <button
                onClick={onToggleFavorite}
                className={`mt-2 inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium border transition-all ${
                  isFavorited
                    ? 'bg-accent/20 border-accent text-accent'
                    : 'bg-bg border-[#2a1e0e] text-ink3 hover:text-ink hover:border-accent/60'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorited ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                {isFavorited ? 'Favorited' : 'Add to Favorites'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-6 sm:px-12 sm:py-10 flex flex-col gap-6 sm:gap-10">

          {/* Description */}
          {musician.description && (
            <p className="text-[0.88rem] text-ink leading-[1.75]">{musician.description}</p>
          )}

          {/* Listen */}
          {musician.youtubeLink && (
            <Section title="Listen" r={r} g={g} b={b} hex={hex}>
              <button
                onClick={() => onPlayVideo(musician.youtubeLink)}
                className="inline-flex items-center gap-3 px-5 py-3 rounded-md text-[0.86rem] font-medium border transition-all duration-150"
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
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-[0.65rem]"
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
                    <span className="mt-1.5 shrink-0 text-[0.65rem]" style={{ color: hex }}>◆</span>
                    <div className="flex-1 flex items-center justify-between gap-3 py-1.5">
                      <span className="text-[0.86rem] text-ink2">{album.name}</span>
                      {album.youtubeLink && (
                        <button
                          onClick={() => onPlayVideo(album.youtubeLink)}
                          className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded text-[0.73rem] font-medium border transition-all duration-150"
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
                          <span className="text-[0.65rem]">▶</span>
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
        <h3 className="text-[0.7rem] font-semibold tracking-wide uppercase" style={{ color: hex }}>
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
      className="flex items-center gap-2 rounded-full pl-1 pr-4 py-2 text-ink2 text-[0.83rem] font-medium border border-[#2a1e0e] bg-[#141008] transition-all duration-200 hover:shadow-md"
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = hex;
        el.style.background = `rgba(${r},${g},${b},0.12)`;
        el.style.color = '#f0e6d3';
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
    <div className="flex gap-3.5 text-[0.82rem]">
      <span className="text-ink3 w-[4.8rem] shrink-0 pt-px">{label}</span>
      <span className="text-ink2 leading-snug">{value}</span>
    </div>
  );
}
