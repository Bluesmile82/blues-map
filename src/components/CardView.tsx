import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTranslation } from 'react-i18next';
import { Guitar, Piano, Mic, Drum, Music, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Musician } from '../types';
import { getStyleHex, getStyleColor } from '../utils/colors';
import MobileVideoPlayer from './MobileVideoPlayer';

const MAP_STYLES = {
  light: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};

const INSTRUMENT_ICONS: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  Guitar, 'Slide guitar': Guitar,
  Piano, Keyboards: Piano, Organ: Piano,
  Vocals: Mic, Voice: Mic,
  Drums: Drum, 'Drum kit': Drum,
};

function InstrumentIcon({ instrument, className, size }: { instrument: string; className?: string; size?: number }) {
  const Icon = INSTRUMENT_ICONS[instrument] ?? Music;
  return <Icon className={className} size={size} />;
}

function computeBounds(m: Musician) {
  const coords: [number, number][] = [m.birthCoords];
  if (m.deathCoords) coords.push(m.deathCoords);
  m.spentTimePlaces.forEach(p => coords.push(p.coords));

  if (coords.length === 1) {
    return { longitude: coords[0][0], latitude: coords[0][1], zoom: 5 };
  }

  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  coords.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  });

  const cLng = (minLng + maxLng) / 2;
  const cLat = (minLat + maxLat) / 2;
  const maxSpan = Math.max(maxLng - minLng, maxLat - minLat, 0.5);
  const zoom = Math.min(10, Math.max(1, Math.floor(Math.log2(360 / maxSpan)) - 1));

  return { longitude: cLng, latitude: cLat, zoom };
}

type Direction = 'left' | 'right' | 'up' | 'down';
const OPPOSITE: Record<Direction, Direction> = { left: 'right', right: 'left', up: 'down', down: 'up' };
const DIR_XY: Record<Direction, { x: number; y: number }> = {
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
};

interface HistoryEntry { musicianId: string; direction: Direction }

interface CardViewProps {
  musicians: Musician[];
  onSelect: (m: Musician) => void;
  selectedId: string | null;
  styleFilter: string | null;
  onStyleFilterChange: (s: string | null) => void;
  theme: 'light' | 'dark';
  isMobile: boolean;
  autoplay: boolean;
}

export default function CardView({ musicians, onSelect, selectedId, theme, isMobile, autoplay = false }: CardViewProps) {
  const { t } = useTranslation();
  const [isFlipped, setIsFlipped] = useState(false);
  const [slideDir, setSlideDir] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Navigation history stack: each entry = "I was at musicianId and pressed direction to get here"
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Active chain: when pressing the same direction repeatedly, cycle through the originating musician's pool
  const [chain, setChain] = useState<{ sourceId: string; direction: Direction; pool: Musician[]; index: number } | null>(null);

  const completeMusicians = useMemo(
    () => musicians.filter(m => m.name && m.bluesStyle && m.instrument && m.description && m.birthPlace && m.image && m.activeFrom),
    [musicians],
  );

  const musicianMap = useMemo(
    () => Object.fromEntries(completeMusicians.map(m => [m.id, m])),
    [completeMusicians],
  );

  const current = completeMusicians.find(m => m.id === selectedId) ?? completeMusicians[0];

  // Auto-select if nothing is selected
  useEffect(() => {
    if (!selectedId && completeMusicians.length > 0) {
      onSelect(completeMusicians[0]);
    }
  }, [selectedId, completeMusicians, onSelect]);

  // Reset flip when musician changes
  const prevId = useRef(current?.id);

  // 3D tilt + holo effect (desktop only)
  const tiltWrapperRef = useRef<HTMLDivElement>(null);
  const holoRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const sparkleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (current?.id !== prevId.current) {
      prevId.current = current?.id;
      setIsFlipped(false);

    }
  }, [current?.id]);

  // Resolve relationships
  const influencers = useMemo(
    () => (current?.influences ?? []).map(id => musicianMap[id]).filter(Boolean) as Musician[],
    [current, musicianMap],
  );
  const influenced = useMemo(
    () => completeMusicians.filter(m => m.influences.includes(current?.id ?? '')),
    [current, completeMusicians],
  );
  const playedWith = useMemo(
    () => ((current?.playedWith ?? []).map(id => musicianMap[id]).filter(Boolean)) as Musician[],
    [current, musicianMap],
  );

  // The direction we arrived from (if any) — the opposite direction is the "back" arrow
  const arrivedVia = history.length > 0 ? history[history.length - 1].direction : null;
  const backDirection = arrivedVia ? OPPOSITE[arrivedVia] : null;
  const backMusician = arrivedVia && history.length > 0 ? musicianMap[history[history.length - 1].musicianId] : null;

  // Which lateral side is back?
  const leftIsBack = backDirection === 'left' && !!backMusician;
  const rightIsBack = backDirection === 'right' && !!backMusician;

  // Get the pool of musicians for a given direction (for the current musician)
  const getPool = useCallback((dir: Direction): Musician[] => {
    if (dir === 'left' || dir === 'right') return playedWith;
    if (dir === 'up') return influencers;
    return influenced;
  }, [playedWith, influencers, influenced]);

  // Navigate back (pop history, clear chain)
  const navigateBack = useCallback(() => {
    if (!backMusician || !arrivedVia) return;
    setSlideDir(DIR_XY[OPPOSITE[arrivedVia]]);
    setHistory(h => h.slice(0, -1));
    setChain(null);
    onSelect(backMusician);
  }, [backMusician, arrivedVia, onSelect]);

  // Handle a directional press
  const handleDirection = useCallback((dir: Direction) => {
    // If this is the back direction, go back
    if (dir === backDirection && backMusician) {
      navigateBack();
      return;
    }

    // If we have an active chain in the same direction, advance it
    if (chain && chain.direction === dir) {
      const nextIdx = chain.index + 1;
      const target = chain.pool[nextIdx % chain.pool.length];
      setSlideDir(DIR_XY[dir]);
      setHistory(h => [...h, { musicianId: current?.id ?? '', direction: dir }]);
      setChain({ ...chain, index: nextIdx });
      onSelect(target);
      return;
    }

    // Start a new chain from the current musician's pool in this direction
    const pool = getPool(dir);
    if (pool.length === 0) return;
    const target = pool[0];
    setSlideDir(DIR_XY[dir]);
    setHistory(h => [...h, { musicianId: current?.id ?? '', direction: dir }]);
    setChain({ sourceId: current?.id ?? '', direction: dir, pool, index: 0 });
    onSelect(target);
  }, [backDirection, backMusician, navigateBack, chain, getPool, current?.id, onSelect]);

  const navigateLeft = useCallback(() => {
    if (leftIsBack) { navigateBack(); } else { handleDirection('left'); }
  }, [leftIsBack, navigateBack, handleDirection]);

  const navigateRight = useCallback(() => {
    if (rightIsBack) { navigateBack(); } else { handleDirection('right'); }
  }, [rightIsBack, navigateBack, handleDirection]);

  // Direct navigation to a specific musician (for influence arrows — no cycling)
  const navigateToMusician = useCallback((m: Musician, dir: Direction) => {
    setSlideDir(DIR_XY[dir]);
    setHistory(h => [...h, { musicianId: current?.id ?? '', direction: dir }]);
    setChain(null);
    onSelect(m);
  }, [current?.id, onSelect]);

  // Swipe detection (mobile)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const cardZoneRef = useRef<HTMLDivElement>(null);

  // Prevent page scroll while swiping the card on mobile (must be non-passive)
  useEffect(() => {
    if (!isMobile) return;
    const el = cardZoneRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (touchStartRef.current) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, [isMobile]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as Element).closest('button')) return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (Math.max(absDx, absDy) < 40) return;
    if (absDx > absDy * 1.2) {
      if (dx < 0) navigateLeft();
      else navigateRight();
    } else {
      // Vertical: always directional — up = ancestors, down = descendants. No back-cycling.
      if (dy < 0) {
        if (influencers.length > 0) navigateToMusician(influencers[0], 'up');
      } else {
        if (influenced.length > 0) navigateToMusician(influenced[0], 'down');
      }
    }
  }, [navigateLeft, navigateRight, navigateToMusician, influencers, influenced]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'ArrowLeft': navigateLeft(); e.preventDefault(); break;
        case 'ArrowRight': navigateRight(); e.preventDefault(); break;
        case 'ArrowUp':
          if (backDirection === 'up' && backMusician) { navigateBack(); }
          else if (influencers.length > 0) { navigateToMusician(influencers[0], 'up'); }
          e.preventDefault(); break;
        case 'ArrowDown':
          if (backDirection === 'down' && backMusician) { navigateBack(); }
          else if (influenced.length > 0) { navigateToMusician(influenced[0], 'down'); }
          e.preventDefault(); break;
        case ' ':
        case 'Enter': setIsFlipped(f => !f); e.preventDefault(); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateLeft, navigateRight, navigateBack, navigateToMusician, backDirection, backMusician, influencers, influenced]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;   // 0–1
    const y = (e.clientY - rect.top) / rect.height;    // 0–1
    const rotX = (y - 0.5) * -26;
    const rotY = (x - 0.5) * 26;
    const hue = x * 300 + y * 60;
    const angle = 120 + (x - 0.5) * 40;

    if (tiltWrapperRef.current) {
      tiltWrapperRef.current.style.transform =
        `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.03)`;
    }
    if (holoRef.current) {
      holoRef.current.style.backgroundImage = `
        repeating-linear-gradient(
          ${angle}deg,
          hsla(${hue},       100%, 65%, 0)    0%,
          hsla(${hue + 60},  100%, 65%, 0.55) 8%,
          hsla(${hue + 120}, 100%, 65%, 0)    16%,
          hsla(${hue + 180}, 100%, 65%, 0.55) 24%,
          hsla(${hue + 240}, 100%, 65%, 0)    32%,
          hsla(${hue + 300}, 100%, 65%, 0.55) 40%,
          hsla(${hue + 360}, 100%, 65%, 0)    50%
        )`;
      holoRef.current.style.opacity = '1';
    }
    if (glareRef.current) {
      glareRef.current.style.background = `
        radial-gradient(
          ellipse at ${x * 100}% ${y * 100}%,
          rgba(255,255,255,0.45) 0%,
          rgba(255,255,255,0.12) 50%,
          transparent 95%
        )`;
      glareRef.current.style.opacity = '0.5';
    }
    if (sparkleRef.current) {
      sparkleRef.current.style.backgroundPosition =
        `${x * 35}px ${y * 35}px, ${x * 22}px ${y * 22}px, ${x * 15}px ${y * 15}px`;
      sparkleRef.current.style.opacity = '0.7';
    }
  }, []);

  const handleMouseEnter = useCallback(() => {

    if (tiltWrapperRef.current) {
      tiltWrapperRef.current.style.transition = 'transform 0.08s linear, box-shadow 0.3s ease';
    }
  }, []);

  const handleMouseLeave = useCallback(() => {

    if (tiltWrapperRef.current) {
      tiltWrapperRef.current.style.transition = 'transform 0.9s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.5s ease';
      tiltWrapperRef.current.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)';
    }
    if (holoRef.current) { holoRef.current.style.opacity = '0'; }
    if (glareRef.current) { glareRef.current.style.opacity = '0'; }
    if (sparkleRef.current) { sparkleRef.current.style.opacity = '0'; }
  }, []);

  if (!current) return null;

  const hex = getStyleHex(current.bluesStyle);
  const [r, g, b] = getStyleColor(current.bluesStyle) as [number, number, number];
  const birthYear = current.birthDate?.slice(0, 4) ?? '';
  const cardW = isMobile ? Math.min(window.innerWidth * 0.72, 300) : 340;
  const cardH = cardW * 1.4;

  // Up/down: is the back direction?
  const upIsBack = backDirection === 'up' && !!backMusician;
  const downIsBack = backDirection === 'down' && !!backMusician;

  // Arrow gap from card edge
  const arrowGap = isMobile ? 48 : 64;

  const cardZone = (
    <div
      ref={cardZoneRef}
      className="relative flex items-center justify-center shrink-0"
      style={{
        width: cardW + arrowGap * 2,
        height: cardH + arrowGap * 2,
      }}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
    >
      {/* Top: influencedBy */}
      {(influencers.length > 0 || upIsBack) && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10" style={{ maxWidth: cardW + arrowGap }}>
          {upIsBack ? (
            <div className="flex items-end justify-center">
              <NavArrow direction="up" label={t('card.influencedBy')} targetName={backMusician!.name} count={1} isBack onClick={navigateBack} isMobile={isMobile} />
            </div>
          ) : (
            <PaginatedArrowRow
              key={current.id + '-influencers'}
              musicians={influencers}
              direction="up"
              label={t('card.influencedBy')}
              onNavigate={(m) => navigateToMusician(m, 'up')}
              isMobile={isMobile}
              maxVisible={isMobile ? 4 : 5}
            />
          )}
        </div>
      )}

      {/* Bottom: influenced */}
      {(influenced.length > 0 || downIsBack) && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-10" style={{ maxWidth: cardW + arrowGap }}>
          {downIsBack ? (
            <div className="flex items-start justify-center">
              <NavArrow direction="down" label={t('card.influences')} targetName={backMusician!.name} count={1} isBack onClick={navigateBack} isMobile={isMobile} />
            </div>
          ) : (
            <PaginatedArrowRow
              key={current.id + '-influenced'}
              musicians={influenced}
              direction="down"
              label={t('card.influences')}
              onNavigate={(m) => navigateToMusician(m, 'down')}
              isMobile={isMobile}
              maxVisible={isMobile ? 4 : 5}
            />
          )}
        </div>
      )}

      {/* Card centered in the zone */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, x: slideDir.x * 60, y: slideDir.y * 60, scale: 0.93 }}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          exit={{ opacity: 0, x: -slideDir.x * 60, y: -slideDir.y * 60, scale: 0.93 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="relative"
          style={{ width: cardW, height: cardH }}
        >
          {/* 3D tilt wrapper — mouse handlers only on desktop */}
          <div
            ref={tiltWrapperRef}
            onMouseMove={!isMobile ? handleMouseMove : undefined}
            onMouseEnter={!isMobile ? handleMouseEnter : undefined}
            onMouseLeave={!isMobile ? handleMouseLeave : undefined}
            onClick={() => setIsFlipped(f => !f)}
            style={{
              width: '100%',
              height: '100%',
              cursor: 'pointer',
              transform: 'perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)',
              transformStyle: 'preserve-3d',
              transition: 'transform 0.9s cubic-bezier(0.23, 1, 0.32, 1)',
            }}
          >
            <motion.div
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
              style={{ transformStyle: 'preserve-3d', width: '100%', height: '100%' }}
              className="relative"
            >
              {/* Front Face */}
              <div
                className="absolute inset-0 rounded-xl overflow-hidden border-2 shadow-xl bg-bg-elevated flex flex-col"
                style={{ backfaceVisibility: 'hidden', borderColor: `rgba(${r},${g},${b},0.4)` }}
              >
                <div className="h-1 shrink-0" style={{ background: hex }} />
                <div className="relative flex-1 min-h-0 overflow-hidden">
                  <img
                    src={current.image}
                    alt={current.name}
                    className="w-full h-full object-cover"
                    style={{ filter: 'sepia(8%) contrast(1.05)' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(current.name)}&background=333&color=fff&size=400`;
                    }}
                  />
                  <div className="absolute top-2 right-2 w-5 h-5 rotate-45 rounded-sm shadow-lg opacity-90" style={{ background: hex }} />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 pt-6 pb-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-white font-bold text-lg tracking-wide leading-tight truncate flex-1">{current.name}</h2>
                      <InstrumentIcon instrument={current.instrument} className="text-white/80 shrink-0" size={18} />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-block px-2 py-0.5 rounded-full text-white text-[11px] font-semibold tracking-wide" style={{ background: `rgba(${r},${g},${b},0.85)` }}>
                        {current.bluesStyle}
                      </span>
                      <span className="text-white/60 text-xs">{birthYear}</span>
                    </div>
                  </div>
                </div>
                <div className="px-3 py-2.5 shrink-0">
                  <p className="text-ink text-xs leading-relaxed line-clamp-3">{current.description}</p>
                </div>
                <div className="h-1 shrink-0" style={{ background: hex }} />

                {/* ── Holo overlays (desktop) ── */}
                {!isMobile && (<>
                  {/* Rainbow foil */}
                  {/* <div
                    ref={holoRef}
                    className="absolute inset-0 pointer-events-none z-20 rounded-xl"
                    style={{
                      opacity: 0,
                      mixBlendMode: 'color-dodge' as React.CSSProperties['mixBlendMode'],
                      transition: 'opacity 0.5s ease',
                    }}
                  /> */}
                  {/* Specular glare */}
                  <div
                    ref={glareRef}
                    className="absolute inset-0 pointer-events-none z-20 rounded-3xl"
                    style={{
                      opacity: 0,
                      mixBlendMode: 'screen' as React.CSSProperties['mixBlendMode'],
                      transition: 'opacity 0.1s ease',
                    }}
                  />
                  {/* Sparkle dot grid */}
                  {/* <div
                  ref={sparkleRef}
                  className="absolute inset-0 pointer-events-none z-20 rounded-xl overflow-hidden"
                  style={{
                    opacity: 0,
                    mixBlendMode: 'screen' as React.CSSProperties['mixBlendMode'],
                    transition: 'opacity 0.5s ease',
                    backgroundImage: [
                      'radial-gradient(circle at center, rgba(255,255,255,0.95) 0.5px, rgba(255,255,255,0.25) 1.5px, transparent 2.5px)',
                      'radial-gradient(circle at center, rgba(200,215,255,0.85) 0.5px, rgba(200,215,255,0.2) 1px, transparent 2px)',
                      'radial-gradient(circle at center, rgba(255,220,200,0.8) 0.5px, transparent 1.5px)',
                    ].join(', '),
                    backgroundSize: '26px 26px, 18px 18px, 13px 13px',
                  }}
                /> */}
                </>)}
              </div>

              {/* Back Face */}
              <div
                className="absolute inset-0 rounded-xl overflow-hidden border-2 shadow-xl bg-bg-elevated"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', borderColor: `rgba(${r},${g},${b},0.4)` }}
              >
                <div className="h-1 shrink-0" style={{ background: hex }} />
                <div className="px-3 py-2 text-center border-b border-border-subtle bg-bg/80">
                  <h3 className="text-ink font-bold text-sm tracking-wide">{current.name}</h3>
                </div>
                <div className="flex-1 relative" style={{ height: cardH - 90 }}>
                  {isFlipped && <CardMiniMap musician={current} theme={theme} />}
                </div>
                <div className="flex items-center justify-center gap-3 px-2 py-1.5 border-t border-border-subtle bg-bg/80">
                  <span className="flex items-center gap-1 text-[10px] text-ink3">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> {t('card.born')}
                  </span>
                  {current.deathCoords && (
                    <span className="flex items-center gap-1 text-[10px] text-ink3">
                      <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> {t('card.died')}
                    </span>
                  )}
                  {current.spentTimePlaces.length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-ink3">
                      <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> {t('card.lived')}
                    </span>
                  )}
                </div>
                <div className="h-1 shrink-0" style={{ background: hex }} />
              </div>
            </motion.div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );

  const flipHint = (
    <p className="text-2xs text-ink3 text-center select-none">
      {isFlipped ? t('card.flipToFront') : t('card.flipToMap')}
    </p>
  );

  // Mobile: vertical stack
  if (isMobile) {
    return (
      <div className="w-full h-full flex flex-col items-center bg-bg overflow-y-auto">
        {cardZone}
        {flipHint}
        {playedWith.length > 0 && (
          <PlayedWithRow
            key={current.id}
            musicians={playedWith}
            onNavigate={(m) => navigateToMusician(m, 'left')}
          />
        )}
        <div className="w-full px-4 pb-8 mt-2">
          {current.description && (
            <p className="text-ui text-ink leading-[1.75] mb-6">{current.description}</p>
          )}
          {current.youtubeLink && (
            <div className="max-w-lg mx-auto">
              <MobileVideoPlayer
                key={current.id}
                youtubeUrl={current.youtubeLink}
                albums={current.albums}
                musicianName={current.name}
                manualVideoUrl={null}
                onClose={() => { }}
                autoplay={autoplay}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Desktop: card left, description + video right, vertically centered together
  return (
    <div className="w-full h-full flex items-center bg-bg overflow-hidden">
      {/* Left side: card */}
      <div className="flex flex-col items-center shrink-0 pl-4 w-1/2">
        {cardZone}
        {flipHint}
        {playedWith.length > 0 && (
          <PlayedWithRow
            key={current.id}
            musicians={playedWith}
            onNavigate={(m) => navigateToMusician(m, 'left')}
          />
        )}
      </div>

      {/* Right side: description + video, vertically centered */}
      <div className="flex-1 min-w-0 h-full flex items-center">
        <div className="w-full max-w-xl px-8 py-6 overflow-y-auto" style={{ maxHeight: cardH + arrowGap * 2 }}>
          {current.description && (
            <p className="text-ui text-ink leading-[1.75] mb-6">{current.description}</p>
          )}
          {current.youtubeLink && (
            <MobileVideoPlayer
              key={current.id}
              youtubeUrl={current.youtubeLink}
              albums={current.albums}
              musicianName={current.name}
              manualVideoUrl={null}
              onClose={() => { }}
              autoplay={autoplay}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────── Navigation Arrow ───────── */

function NavArrow({
  direction,
  label,
  targetName,
  onClick,
  count,
  isMobile,
  isBack,
}: {
  direction: Direction;
  label: string;
  targetName: string;
  onClick: () => void;
  count: number;
  isMobile: boolean;
  isBack: boolean;
}) {
  const icons = { up: ChevronUp, down: ChevronDown, left: ChevronLeft, right: ChevronRight };
  const Icon = icons[direction];

  const isVertical = direction === 'up' || direction === 'down';

  // Left/right are absolutely positioned; up/down are flex children inside their parent row
  const posStyle: React.CSSProperties | undefined = !isVertical ? (() => {
    switch (direction) {
      case 'left': return { left: '-10px', top: '50%', transform: 'translateY(-50%)' };
      case 'right': return { right: '-10px', top: '50%', transform: 'translateY(-50%)' };
    }
  })() : undefined;

  const flexDir = {
    up: 'flex-col',
    down: 'flex-col-reverse',
    left: 'flex-col-reverse',
    right: 'flex-col-reverse',
  }[direction];

  const alignDir = {
    up: 'items-center',
    down: 'items-center',
    left: 'items-end',
    right: 'items-start',
  }[direction];

  return (
    <div
      className={`${!isVertical ? 'absolute' : ''} ${flexDir} flex ${alignDir} gap-1 z-10`}
      style={posStyle}
    >
      {/* Label on the outer side */}
      {!isMobile && (
        <div className={`text-[10px] text-ink3 leading-tight ${isVertical ? 'text-center max-w-[80px]' : 'max-w-[70px]'} ${direction === 'left' || direction === 'up' ? 'text-right' : 'text-left'}`}>
          {!isVertical && <><span className="opacity-60">{label}</span>{count > 1 && <span className="opacity-40"> ({count})</span>}<br /></>}
          <span className="font-medium text-ink truncate block">{targetName}</span>
        </div>
      )}
      <motion.button
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.1 }}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={`flex items-center justify-center ${isVertical ? 'w-9 h-9' : 'w-11 h-11'} rounded-full backdrop-blur-sm border transition-colors shadow-md ${isBack
          ? 'bg-accent/20 border-accent/40 text-accent hover:bg-accent/30'
          : 'bg-bg/80 border-border-subtle text-ink3 hover:text-ink hover:bg-bg-hover'
          }`}
        title={`${label}: ${targetName}`}
      >
        <Icon size={isVertical ? 16 : 20} />
      </motion.button>
    </div>
  );
}

/* ───────── Paginated Arrow Row (for influence arrows) ───────── */

function PaginatedArrowRow({
  musicians,
  direction,
  label,
  onNavigate,
  isMobile,
  maxVisible,
}: {
  musicians: Musician[];
  direction: 'up' | 'down';
  label: string;
  onNavigate: (m: Musician) => void;
  isMobile: boolean;
  maxVisible: number;
}) {
  const [page, setPage] = useState(0);
  const total = musicians.length;
  const needsPaging = total > maxVisible;
  const start = needsPaging ? page * maxVisible : 0;
  const visible = musicians.slice(start, start + maxVisible);
  const totalPages = Math.ceil(total / maxVisible);

  const prevPage = () => setPage(p => Math.max(0, p - 1));
  const nextPage = () => setPage(p => Math.min(totalPages - 1, p + 1));

  const alignItems = direction === 'up' ? 'items-end' : 'items-start';

  return (
    <div className={`flex ${alignItems} justify-center gap-0.5`}>
      {needsPaging && page > 0 && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={(e) => { e.stopPropagation(); prevPage(); }}
          className="flex items-center justify-center w-6 h-6 rounded-full bg-bg/60 border border-border-subtle text-ink3 hover:text-ink hover:bg-bg-hover transition-colors shrink-0"
          title="Previous"
        >
          <ChevronLeft size={12} />
        </motion.button>
      )}

      {visible.map(m => (
        <NavArrow
          key={m.id}
          direction={direction}
          label={label}
          targetName={m.name}
          count={total}
          isBack={false}
          onClick={() => onNavigate(m)}
          isMobile={isMobile}
        />
      ))}

      {needsPaging && page < totalPages - 1 && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={(e) => { e.stopPropagation(); nextPage(); }}
          className="flex items-center justify-center w-6 h-6 rounded-full bg-bg/60 border border-border-subtle text-ink3 hover:text-ink hover:bg-bg-hover transition-colors shrink-0"
          title="Next"
        >
          <ChevronRight size={12} />
        </motion.button>
      )}
    </div>
  );
}

/* ───────── Played With Row (mobile) ───────── */

function PlayedWithRow({
  musicians,
  onNavigate,
}: {
  musicians: Musician[];
  onNavigate: (m: Musician) => void;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const maxVisible = 4;
  const total = musicians.length;
  const needsPaging = total > maxVisible;
  const start = page * maxVisible;
  const visible = musicians.slice(start, start + maxVisible);
  const totalPages = Math.ceil(total / maxVisible);

  return (
    <div className="flex flex-col items-center gap-1.5 px-4 py-2">
      <span className="text-[10px] text-ink3 uppercase tracking-wide font-medium">{t('card.playedWith')}</span>
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {needsPaging && page > 0 && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setPage(p => p - 1)}
            className="flex items-center justify-center w-6 h-6 rounded-full bg-bg/60 border border-border-subtle text-ink3 hover:text-ink transition-colors shrink-0"
          >
            <ChevronLeft size={12} />
          </motion.button>
        )}
        {visible.map(m => (
          <motion.button
            key={m.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate(m)}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-bg/80 border border-border-subtle text-ink3 hover:text-ink hover:bg-bg-hover transition-colors whitespace-nowrap"
          >
            {m.name}
          </motion.button>
        ))}
        {needsPaging && page < totalPages - 1 && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setPage(p => p + 1)}
            className="flex items-center justify-center w-6 h-6 rounded-full bg-bg/60 border border-border-subtle text-ink3 hover:text-ink transition-colors shrink-0"
          >
            <ChevronRight size={12} />
          </motion.button>
        )}
      </div>
    </div>
  );
}

/* ───────── Card Minimap ───────── */

function CardMiniMap({ musician, theme }: { musician: Musician; theme: 'light' | 'dark' }) {
  const { longitude, latitude, zoom } = useMemo(() => computeBounds(musician), [musician]);

  const lineCoords = useMemo(() => {
    const coords: [number, number][] = [musician.birthCoords];
    musician.spentTimePlaces.forEach(p => coords.push(p.coords));
    if (musician.deathCoords) coords.push(musician.deathCoords);
    return coords;
  }, [musician]);

  const lineGeoJson = useMemo(() => ({
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: lineCoords },
  }), [lineCoords]);

  return (
    <Map
      initialViewState={{ longitude, latitude, zoom }}
      mapStyle={MAP_STYLES[theme]}
      style={{ width: '100%', height: '100%' }}
      interactive={false}
      attributionControl={false}
    >
      {lineCoords.length > 1 && (
        <Source id="route" type="geojson" data={lineGeoJson}>
          <Layer
            id="route-line"
            type="line"
            paint={{
              'line-color': theme === 'dark' ? '#ffffff40' : '#00000030',
              'line-width': 1.5,
              'line-dasharray': [4, 3],
            }}
          />
        </Source>
      )}

      {musician.spentTimePlaces.map((p, i) => (
        <Marker key={`spent-${i}`} longitude={p.coords[0]} latitude={p.coords[1]} anchor="center">
          <div className="w-3 h-3 rounded-full bg-blue-400 border border-white shadow-sm" title={p.place} />
        </Marker>
      ))}

      <Marker longitude={musician.birthCoords[0]} latitude={musician.birthCoords[1]} anchor="center">
        <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow-md flex items-center justify-center">
          <span className="text-white text-[8px] font-bold">B</span>
        </div>
      </Marker>

      {musician.deathCoords && (
        <Marker longitude={musician.deathCoords[0]} latitude={musician.deathCoords[1]} anchor="center">
          <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow-md flex items-center justify-center">
            <span className="text-white text-[8px] font-bold">D</span>
          </div>
        </Marker>
      )}
    </Map>
  );
}
