import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTranslation } from 'react-i18next';
import { Guitar, Piano, Mic, Drum, Music, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Info, Dice5, Play, Pause, Search, Heart, ListPlus } from 'lucide-react';
import type { Musician } from '../types';
import { getStyleHex, getStyleColor } from '../utils/colors';
import MobileVideoPlayer from './MobileVideoPlayer';
import MusicianPanel from './MusicianPanel';
import MiniPlayer from './MiniPlayer';
import SearchInput from './SearchInput';
import ListsDropdown from './lists/ListsDropdown';
import { useAtomValue } from 'jotai';
import { userAtom } from '../atoms/auth';
import { isMusicianFavoritedAtom } from '../atoms/lists';
import { useLists } from '../hooks/useLists';

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

/** Returns the nearest item index using 2D distance from the touch point,
 *  but only when the touch is within the dialog card's bounding box.
 *  Returns null when the touch is outside the dialog. */
function hitTestNearest(
  dialog: HTMLDivElement | null,
  refs: (HTMLDivElement | null)[],
  x: number,
  y: number,
): number | null {
  if (!dialog) return null;
  const dr = dialog.getBoundingClientRect();
  if (x < dr.left || x > dr.right || y < dr.top || y > dr.bottom) return null;
  let best = -1, bestDist = Infinity;
  for (let i = 0; i < refs.length; i++) {
    const el = refs[i];
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    const dist = Math.hypot(x - cx, y - cy);
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best >= 0 ? best : null;
}

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
  
  // Mobile gesture state
  const [dragDirection, setDragDirection] = useState<Direction | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [selectedMusicianIndex, setSelectedMusicianIndex] = useState(0);
  
  // Mobile drawer state
  const [showDrawer, setShowDrawer] = useState(false);

  // Mini player state
  const [miniPlayerActive, setMiniPlayerActive] = useState(false);
  const [loadVideoId, setLoadVideoId] = useState<string | null>(null);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Favourites state
  const [showListsDropdown, setShowListsDropdown] = useState(false);
  const user = useAtomValue(userAtom);
  const isMusicianFavorited = useAtomValue(isMusicianFavoritedAtom);
  const { toggleFavorite } = useLists();
  
  // Gyroscope state - use ref to avoid re-renders
  const gyroRef = useRef({ alpha: 0, beta: 0, gamma: 0, enabled: false });
  const [gyroPermissionGranted, setGyroPermissionGranted] = useState(false);
  const [gyroNeedsPrompt, setGyroNeedsPrompt] = useState(false);

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

  // Search logic
  const searchQuery = search.trim().toLowerCase();
  const searchMatches = searchQuery
    ? completeMusicians.filter(m => m.name.toLowerCase().includes(searchQuery)).slice(0, 8)
    : [];

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

  // Mobile: determine if iOS gyro prompt is needed (must run before the tilt effect)
  useEffect(() => {
    if (!isMobile) return;
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    ) {
      // iOS 13+ — needs a user gesture before we can request permission
      setGyroNeedsPrompt(true);
    } else {
      // Android / non-iOS — attach listener directly, no prompt needed
      setGyroPermissionGranted(true);
    }
  }, [isMobile]);

  const handleGyroPermissionRequest = useCallback(async () => {
    try {
      const permissionState = await (DeviceOrientationEvent as any).requestPermission();
      if (permissionState === 'granted') {
        setGyroPermissionGranted(true);
      }
    } catch (error) {
      console.log('Gyroscope permission denied or error:', error);
    }
    setGyroNeedsPrompt(false);
  }, []);

  // Mobile: apply subtle constant 3D tilt with gyroscope
  useEffect(() => {
    if (!isMobile || !tiltWrapperRef.current) return;

    let animationFrameId: number;
    let startTime = Date.now();

    // Gyroscope handler
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const beta = event.beta || 0;   // x-axis tilt (-180 to 180)
      const gamma = event.gamma || 0;  // y-axis tilt (-90 to 90)

      gyroRef.current = {
        alpha: event.alpha || 0,
        beta: beta,
        gamma: gamma,
        enabled: true
      };
    };

    if (gyroPermissionGranted) {
      window.addEventListener('deviceorientation', handleOrientation);
      gyroRef.current.enabled = true;
    }
    
    const animate = () => {
      if (!tiltWrapperRef.current || isTouchingRef.current) return;
      
      const elapsed = Date.now() - startTime;
      
      // Use gyroscope if available and enabled, otherwise fall back to animation only
      let rotX: number, rotY: number;
      
      if (gyroRef.current.enabled) {
        // Normalize beta (-180 to 180) to roughly -45 to 45 for tilt
        const normalizedBeta = Math.max(-45, Math.min(45, gyroRef.current.beta - 45));
        // Normalize gamma (-90 to 90) to roughly -30 to 30
        const normalizedGamma = Math.max(-30, Math.min(30, gyroRef.current.gamma));
        
        // Use gyro for more natural movement (increased intensity)
        const gyroRotX = normalizedBeta * 0.4;
        const gyroRotY = normalizedGamma * 0.5;
        
        // Add subtle oscillation on top of gyroscope
        const animRotX = Math.sin(elapsed * 0.001) * 1.5;
        const animRotY = Math.cos(elapsed * 0.0012) * 1.5;
        
        rotX = gyroRotX + animRotX;
        rotY = gyroRotY + animRotY;
      } else {
        // Fallback to animation only
        rotX = Math.sin(elapsed * 0.002) * 4 + 2;
        rotY = Math.cos(elapsed * 0.0025) * 5 - 3;
      }
      
      tiltWrapperRef.current.style.transition = 'transform 0.1s linear, box-shadow 0.15s ease';
      tiltWrapperRef.current.style.transform =
        `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.03)`;
      
      const shadowX = -rotY * 2;
      const shadowY = -rotX * 2;
      tiltWrapperRef.current.style.boxShadow = `
        ${shadowX}px ${shadowY}px 30px rgba(0,0,0,0.25),
        ${shadowX * 0.5}px ${shadowY * 0.5}px 60px rgba(0,0,0,0.15)
      `;
      
      animationFrameId = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [isMobile, current?.id, gyroPermissionGranted]);

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
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    setDragDirection(null);
    dragDirectionRef.current = null;
    hadSignificantDragRef.current = false;
    setShowHints(true);
    setSelectedMusicianIndex(0);
    dragDistanceRef.current = 0;
    dragVelocityRef.current = { x: 0, y: 0 };
    lastTouchRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    lockedDirectionRef.current = null;
    dismissedDirsRef.current = new Set();

    // Cancel any running inertia animation
    if (inertiaAnimationRef.current) {
      cancelAnimationFrame(inertiaAnimationRef.current);
      inertiaAnimationRef.current = null;
    }
  }, []);

  const isTouchingRef = useRef(false);
  const dismissedDirsRef = useRef<Set<Direction>>(new Set());
  const dragDirectionRef = useRef<Direction | null>(null);   // always-current mirror of dragDirection state
  const hadSignificantDragRef = useRef(false);               // true if drag ever left the cancel zone
  const dragDistanceRef = useRef(0);
  // Refs to rendered overlay items and containers for hit-testing
  const influencerItemRefs     = useRef<(HTMLDivElement | null)[]>([]);
  const influencedItemRefs     = useRef<(HTMLDivElement | null)[]>([]);
  const playedWithItemRefs     = useRef<(HTMLDivElement | null)[]>([]);
  const influencerContainerRef = useRef<HTMLDivElement | null>(null);
  const influencedContainerRef = useRef<HTMLDivElement | null>(null);
  const playedWithContainerRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const dragVelocityRef = useRef({ x: 0, y: 0 });
  const lastTouchRef = useRef({ x: 0, y: 0, time: 0 });
  const inertiaAnimationRef = useRef<number | null>(null);
  const lockedDirectionRef = useRef<Direction | null>(null);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    if (!touchStartRef.current || !tiltWrapperRef.current) return;
    
    isTouchingRef.current = true;
    const touch = e.touches[0];
    const currentTime = Date.now();
    
    // Calculate drag offset from start position
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    // Calculate velocity for inertia
    const deltaTime = currentTime - lastTouchRef.current.time;
    if (deltaTime > 0) {
      dragVelocityRef.current = {
        x: (touch.clientX - lastTouchRef.current.x) / deltaTime,
        y: (touch.clientY - lastTouchRef.current.y) / deltaTime
      };
    }
    
    // Update last touch position
    lastTouchRef.current = { x: touch.clientX, y: touch.clientY, time: currentTime };
    
    // Movement limits — keep translation small
    const maxOffsetUnlocked = Math.min(window.innerWidth, window.innerHeight) * 0.06;
    const maxOffsetLocked   = Math.min(window.innerWidth, window.innerHeight) * 0.12;
    const currentMaxOffset  = lockedDirectionRef.current ? maxOffsetLocked : maxOffsetUnlocked;

    // Clamp position
    const clampedDx = Math.max(-currentMaxOffset, Math.min(currentMaxOffset, dx));
    const clampedDy = Math.max(-currentMaxOffset, Math.min(currentMaxOffset, dy));

    // Store clamped offset
    dragOffsetRef.current = { x: clampedDx, y: clampedDy };

    // Calculate how far we've dragged as a percentage (0 to 1)
    const dragProgressX = clampedDx / currentMaxOffset;
    const dragProgressY = clampedDy / currentMaxOffset;

    // Subtle 3D tilt
    const rotationX = dragProgressY * -22;
    const rotationY = dragProgressX * 22;
    const rotation  = clampedDx * 0.12;

    tiltWrapperRef.current.style.transition = 'none';
    tiltWrapperRef.current.style.transform = `
      translate(${clampedDx}px, ${clampedDy}px)
      rotateX(${rotationX}deg) rotateY(${rotationY}deg) rotate(${rotation}deg)
      scale(1.04)
    `;

    const shadowX = -clampedDx * 0.3;
    const shadowY = -clampedDy * 0.3;
    tiltWrapperRef.current.style.boxShadow = `
      ${shadowX}px ${shadowY}px 40px rgba(0,0,0,0.3),
      ${shadowX * 0.5}px ${shadowY * 0.5}px 80px rgba(0,0,0,0.15)
    `;

    const distance = Math.max(absDx, absDy);
    dragDistanceRef.current = distance;

    const dragPercent    = distance / currentMaxOffset;
    const CANCEL_ZONE    = 0.25; // inner 25% = neutral
    const LOCK_THRESHOLD = 0.45; // must drag 45% to lock
    const UNLOCK_THRESHOLD = 0.30; // return to 30% to unlock

    // Helpers — setDir keeps the ref and state in sync
    const setDir = (d: Direction | null) => {
      dragDirectionRef.current = d;
      setDragDirection(d);
    };
    // unlock: just removes the lock, direction can re-lock this gesture
    const unlock = () => {
      lockedDirectionRef.current = null;
      setDir(null);
      setSelectedMusicianIndex(0);
    };
    // dismiss: also blocks this direction for the rest of the gesture
    const dismiss = (dir: Direction) => {
      dismissedDirsRef.current.add(dir);
      unlock();
    };

    // Track that the finger has left the cancel zone at least once
    if (dragPercent > CANCEL_ZONE) hadSignificantDragRef.current = true;

    // Locked and finger reverses back past the drag origin → permanently dismiss this direction
    if (lockedDirectionRef.current) {
      const dir = lockedDirectionRef.current;
      const reversed =
        (dir === 'up'    && dy > 0) ||
        (dir === 'down'  && dy < 0) ||
        (dir === 'right' && dx < 0) ||
        (dir === 'left'  && dx > 0);
      if (reversed) { dismiss(dir); return; }
    }

    // Returning to center while locked → just unlock (direction can re-lock later this gesture)
    if (lockedDirectionRef.current && dragPercent < UNLOCK_THRESHOLD) {
      unlock();
      return;
    }

    if (dragPercent > CANCEL_ZONE) {
      if (absDx > absDy * 1.0) {
        const dir = dx < 0 ? 'left' : 'right';

        if (lockedDirectionRef.current && lockedDirectionRef.current !== dir) {
          // stay locked in current direction
        } else if (dismissedDirsRef.current.has(dir)) {
          // this direction was dismissed in this gesture — ignore
        } else if (dragPercent > LOCK_THRESHOLD) {
          lockedDirectionRef.current = dir;
          setDir(dir);
          setShowHints(false);

          if (dir === 'right' && playedWith.length > 1) {
            const i = hitTestNearest(playedWithContainerRef.current, playedWithItemRefs.current, touch.clientX, touch.clientY);
            if (i !== null) setSelectedMusicianIndex(i);
          }
        } else {
          setDir(dir);
          setShowHints(false);
        }
      } else if (absDy > absDx * 1.0) {
        const dir = dy < 0 ? 'up' : 'down';

        if (lockedDirectionRef.current && lockedDirectionRef.current !== dir) {
          // stay locked in current direction
        } else if (dismissedDirsRef.current.has(dir)) {
          // this direction was dismissed in this gesture — ignore
        } else if (dragPercent > LOCK_THRESHOLD) {
          lockedDirectionRef.current = dir;
          setDir(dir);
          setShowHints(false);

          const musicians = dir === 'up' ? influencers : influenced;
          if (musicians.length > 1) {
            const refs = dir === 'up' ? influencerItemRefs.current : influencedItemRefs.current;
            const container = dir === 'up' ? influencerContainerRef.current : influencedContainerRef.current;
            const i = hitTestNearest(container, refs, touch.clientX, touch.clientY);
            if (i !== null) setSelectedMusicianIndex(i);
          }
        } else {
          setDir(dir);
          setShowHints(false);
        }
      }
    } else {
      // In cancel zone — clear direction hint
      setDir(null);
    }
  }, [isMobile, playedWith, influencers, influenced]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Read from refs — avoids stale-closure issues with batched state updates
    const dirOnRelease = dragDirectionRef.current;
    const hadSignificantDrag = hadSignificantDragRef.current;
    
    // Apply smooth inertia animation without bounce
    if (tiltWrapperRef.current) {
      let currentX = dragOffsetRef.current.x;
      let currentY = dragOffsetRef.current.y;
      let velocityX = dragVelocityRef.current.x * 10;
      let velocityY = dragVelocityRef.current.y * 10;
      
      const friction = 0.85;
      const minVelocity = 0.5;
      
      const animateInertia = () => {
        if (!tiltWrapperRef.current) return;
        
        // Only apply friction, no return force (no spring effect)
        velocityX *= friction;
        velocityY *= friction;
        
        currentX += velocityX;
        currentY += velocityY;
        
        // Calculate rotation
        const maxOffset = Math.min(window.innerWidth, window.innerHeight) * (lockedDirectionRef.current ? 0.12 : 0.06);
        const rotationX = (currentY / maxOffset) * -22;
        const rotationY = (currentX / maxOffset) * 22;
        const rotation = currentX * 0.12;

        // Apply transform
        tiltWrapperRef.current.style.transform = `
          translate(${currentX}px, ${currentY}px)
          rotateX(${rotationX}deg) rotateY(${rotationY}deg) rotate(${rotation}deg)
          scale(1.04)
        `;

        // Update shadow
        const shadowX = -currentX * 0.3;
        const shadowY = -currentY * 0.3;
        tiltWrapperRef.current.style.boxShadow = `
          ${shadowX}px ${shadowY}px 40px rgba(0,0,0,0.3),
          ${shadowX * 0.5}px ${shadowY * 0.5}px 80px rgba(0,0,0,0.15)
        `;
        
        // Check if animation should continue
        const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
        const offset = Math.sqrt(currentX * currentX + currentY * currentY);
        
        if (speed > minVelocity && offset > 1) {
          inertiaAnimationRef.current = requestAnimationFrame(animateInertia);
        } else {
          // Animation complete - smooth CSS transition to center
          tiltWrapperRef.current.style.transition = 'transform 0.4s ease-out, box-shadow 0.4s ease-out';
          tiltWrapperRef.current.style.transform = 'translate(0, 0) rotateX(0deg) rotateY(0deg) rotate(0deg) scale(1.03)';
          tiltWrapperRef.current.style.boxShadow = '';
          inertiaAnimationRef.current = null;
        }
      };
      
      // Start inertia animation
      inertiaAnimationRef.current = requestAnimationFrame(animateInertia);
    }
    
    // Snap card back helper
    const snapBack = () => {
      if (tiltWrapperRef.current) {
        tiltWrapperRef.current.style.transition = 'transform 0.3s ease-out';
        tiltWrapperRef.current.style.transform = 'translate(0,0) rotateX(0deg) rotateY(0deg) rotate(0deg) scale(1.03)';
        tiltWrapperRef.current.style.boxShadow = '';
      }
    };

    // Reset all gesture state
    const resetGesture = () => {
      lockedDirectionRef.current = null;
      dragDirectionRef.current = null;
      hadSignificantDragRef.current = false;
      setDragDirection(null);
      setSelectedMusicianIndex(0);
      dragDistanceRef.current = 0;
      dragOffsetRef.current = { x: 0, y: 0 };
      dragVelocityRef.current = { x: 0, y: 0 };
      setTimeout(() => { isTouchingRef.current = false; }, 400);
    };

    const maxOffset = Math.min(window.innerWidth, window.innerHeight) * (lockedDirectionRef.current ? 0.12 : 0.06);
    const dragPercent = Math.max(absDx, absDy) / maxOffset;
    const CANCEL_THRESHOLD = 0.2;

    // Pure tap (no significant drag) → flip the card
    if (dragPercent < CANCEL_THRESHOLD && !hadSignificantDrag) {
      snapBack();
      resetGesture();
      setIsFlipped(f => !f);
      setTimeout(() => { setShowHints(false); }, 2000);
      return;
    }

    // Returned to center after a drag, or drag too small → just cancel, no flip
    if (dragPercent < CANCEL_THRESHOLD || !dirOnRelease) {
      snapBack();
      resetGesture();
      setShowHints(false);
      return;
    }

    // Committed directional drag — navigate
    const releaseX = e.changedTouches[0].clientX;
    const releaseY = e.changedTouches[0].clientY;
    switch (dirOnRelease) {
      case 'left':
        navigateLeft();
        break;
      case 'right': {
        if (playedWith.length === 1) {
          navigateToMusician(playedWith[0], 'right');
        } else {
          const hit = hitTestNearest(playedWithContainerRef.current, playedWithItemRefs.current, releaseX, releaseY);
          if (hit !== null && playedWith.length > 0)
            navigateToMusician(playedWith[Math.min(hit, playedWith.length - 1)], 'right');
        }
        break;
      }
      case 'up': {
        if (influencers.length === 1) {
          navigateToMusician(influencers[0], 'up');
        } else {
          const hit = hitTestNearest(influencerContainerRef.current, influencerItemRefs.current, releaseX, releaseY);
          if (hit !== null && influencers.length > 0)
            navigateToMusician(influencers[Math.min(hit, influencers.length - 1)], 'up');
        }
        break;
      }
      case 'down': {
        if (influenced.length === 1) {
          navigateToMusician(influenced[0], 'down');
        } else {
          const hit = hitTestNearest(influencedContainerRef.current, influencedItemRefs.current, releaseX, releaseY);
          if (hit !== null && influenced.length > 0)
            navigateToMusician(influenced[Math.min(hit, influenced.length - 1)], 'down');
        }
        break;
      }
    }

    resetGesture();
    setShowHints(false);
  }, [navigateLeft, navigateRight, navigateToMusician, influencers, influenced, playedWith]);

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
      
      // Dynamic shadow on opposite side
      const shadowX = -(x - 0.5) * 20;
      const shadowY = -(y - 0.5) * 20;
      tiltWrapperRef.current.style.boxShadow = `
        ${shadowX}px ${shadowY}px 30px rgba(0,0,0,0.25),
        ${shadowX * 0.5}px ${shadowY * 0.5}px 60px rgba(0,0,0,0.15)
      `;
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
      tiltWrapperRef.current.style.boxShadow = '';
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
      className={isMobile ? "h-[70%] relative flex items-center justify-center" : "min-h-[80%] lg:h-full relative flex items-center justify-center gap-3 ml-4"}>
      <div
        className="relative flex items-center justify-center shrink-0"
        style={{
          width: isMobile ? cardW : cardW + arrowGap * 2,
          height: isMobile ? cardH : cardH + arrowGap * 2 + 10,
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none' as 'none',
        }}
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
        onContextMenu={isMobile ? (e) => e.preventDefault() : undefined}
      >
        {/* Top: influencedBy */}
        {!isMobile && (influencers.length > 0 || upIsBack) && (

          <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center" style={{ maxWidth: cardW + arrowGap }}>
            <span className="text-[10px] text-ink3 uppercase tracking-wide font-medium mb-2">{t('card.influencedBy')}</span>
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
        {!isMobile && (influenced.length > 0 || downIsBack) && (
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center" style={{ maxWidth: cardW + arrowGap }}>
            <span className="text-[10px] text-ink3 uppercase tracking-wide font-medium mb-2">{t('card.influences')}</span>
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
            initial={{ opacity: 0, y: 40, scale: 0.92, rotate: isMobile ? slideDir.x * 2 : 0 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, x: slideDir.x * 80, y: slideDir.y * 80 - 30, scale: 0.85, rotate: slideDir.x * 5 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            className="relative"
            style={{ width: cardW, height: cardH }}
          >
            {/* 3D tilt wrapper — mouse handlers only on desktop */}
            <div
              ref={tiltWrapperRef}
              onMouseMove={!isMobile ? handleMouseMove : undefined}
              onMouseEnter={!isMobile ? handleMouseEnter : undefined}
              onMouseLeave={!isMobile ? handleMouseLeave : undefined}
              onTouchMove={isMobile ? handleTouchMove : undefined}
              onClick={!isMobile ? () => setIsFlipped(f => !f) : undefined}
              style={{
                width: '100%',
                height: '100%',
                cursor: 'pointer',
                transform: 'perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)',
                transformStyle: 'preserve-3d',
                transition: 'transform 0.9s cubic-bezier(0.23, 1, 0.32, 1)',
                touchAction: 'none',
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
                      draggable={false}
                      className="w-full h-full object-cover pointer-events-none"
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
      {!isMobile && playedWith.length > 0 && (
        <PlayedWithRow
          key={current.id}
          musicians={playedWith}
          onNavigate={(m) => navigateToMusician(m, 'left')}
          className="shrink"
        />
      )}
    </div>
  );

  // Mobile: vertical stack
  if (isMobile) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-bg overflow-hidden relative">
        {/* Random musician button — top right */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.1 }}
          onClick={() => {
            const others = completeMusicians.filter(m => m.id !== current?.id);
            if (others.length > 0) onSelect(others[Math.floor(Math.random() * others.length)]);
          }}
          className="absolute top-3 right-3 z-50 flex flex-col items-center gap-0.5"
        >
          <div className="w-11 h-11 flex items-center justify-center rounded-full backdrop-blur-sm border bg-bg/80 border-border-subtle text-ink3 shadow-md transition-colors hover:text-ink hover:bg-bg-hover">
            <Dice5 size={20} />
          </div>
          <span className="text-[9px] text-ink3 uppercase tracking-wide font-medium">{t('card.random')}</span>
        </motion.button>

        {/* Play / pause button — top left */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.1 }}
          onClick={() => setMiniPlayerActive(v => !v)}
          className="absolute top-3 left-3 z-50 flex flex-col items-center gap-0.5"
        >
          <div className={`w-11 h-11 flex items-center justify-center rounded-full backdrop-blur-sm border shadow-md transition-colors ${miniPlayerActive ? 'bg-accent text-white border-accent' : 'bg-bg/80 border-border-subtle text-ink3 hover:text-ink hover:bg-bg-hover'}`}>
            {miniPlayerActive ? <Pause size={20} /> : <Play size={20} />}
          </div>
          <span className="text-[9px] text-ink3 uppercase tracking-wide font-medium">{miniPlayerActive ? t('card.pause') : t('card.play')}</span>
        </motion.button>

        {/* Mini player: hidden iframe + now-playing bar */}
        {current && (
          <MiniPlayer
            musician={current}
            isPlaying={miniPlayerActive}
            onPlayingChange={setMiniPlayerActive}
            loadVideoId={loadVideoId}
            onLoadVideoConsumed={() => setLoadVideoId(null)}
          />
        )}

        {cardZone}

        {/* Bottom toolbar: search left, favourite + add-to-list stacked right */}
        <div className="absolute bottom-3 left-3 z-40">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowSearch(v => !v)}
            className="flex flex-col items-center gap-0.5"
          >
            <div className={`w-11 h-11 flex items-center justify-center rounded-full backdrop-blur-sm border shadow-md transition-colors ${showSearch ? 'bg-accent text-white border-accent' : 'bg-bg/80 border-border-subtle text-ink3 hover:text-ink hover:bg-bg-hover'}`}>
              <Search size={20} />
            </div>
            <span className="text-[9px] text-ink3 uppercase tracking-wide font-medium">{t('card.search')}</span>
          </motion.button>
        </div>

        {user && (
          <div className="absolute bottom-3 right-3 z-40 flex flex-col items-center gap-1">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => current && toggleFavorite(current.id)}
              className="flex flex-col items-center gap-0.5"
            >
              <div className={`w-11 h-11 flex items-center justify-center rounded-full backdrop-blur-sm border shadow-md transition-colors ${current && isMusicianFavorited(current.id) ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-bg/80 border-border-subtle text-ink3 hover:text-ink hover:bg-bg-hover'}`}>
                <Heart size={20} fill={current && isMusicianFavorited(current.id) ? 'currentColor' : 'none'} />
              </div>
              <span className="text-[9px] text-ink3 uppercase tracking-wide font-medium">{t('card.favorite')}</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => current && setShowListsDropdown(true)}
              className="flex flex-col items-center gap-0.5"
            >
              <div className="w-11 h-11 flex items-center justify-center rounded-full backdrop-blur-sm border bg-bg/80 border-border-subtle text-ink3 shadow-md transition-colors hover:text-ink hover:bg-bg-hover">
                <ListPlus size={20} />
              </div>
              <span className="text-[9px] text-ink3 uppercase tracking-wide font-medium">{t('card.addToList')}</span>
            </motion.button>
          </div>
        )}

        {/* iOS gyroscope permission prompt — above the info button */}
        {gyroNeedsPrompt && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50">
            <button
              onClick={handleGyroPermissionRequest}
              className="px-4 py-2 rounded-full bg-accent text-white text-sm font-medium shadow-lg active:scale-95 transition-transform"
            >
              {t('card.enableTilt')}
            </button>
          </div>
        )}

        {/* Mobile search input overlay — bottom positioned */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-20 left-3 right-3 z-50"
            >
              <div className="relative">
                <SearchInput
                  ref={searchInputRef}
                  value={search}
                  onChange={setSearch}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchMatches[0]) {
                      onSelect(searchMatches[0]);
                      setSearch('');
                      setShowSearch(false);
                    }
                    if (e.key === 'Escape') {
                      setSearch('');
                      setShowSearch(false);
                    }
                  }}
                  placeholder={t('filters.findByName')}
                />
                {searchMatches.length > 0 && (
                  <div className="absolute bottom-full mb-1 left-0 right-0 bg-bg-subtle border border-border-subtle rounded-lg overflow-hidden shadow-xl z-50 max-h-60 overflow-y-auto">
                    {searchMatches.map((m) => {
                      const hex = getStyleHex(m.bluesStyle);
                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            onSelect(m);
                            setSearch('');
                            setShowSearch(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-hover transition-colors"
                        >
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: hex }} />
                          <span className="text-sm text-ink flex-1 truncate">{m.name}</span>
                          <span className="text-xs shrink-0" style={{ color: hex }}>{t(`styles.${m.bluesStyle}`, m.bluesStyle).replace(' Blues', '')}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Direction hints overlay - shows available directions only */}
        <div className="absolute inset-0 pointer-events-none">
          <AnimatePresence>
            {showHints && !dragDirection && influencers.length > 0 && (
              <motion.div
                key="hint-up"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.25 }}
                className="absolute top-24 left-1/2 -translate-x-1/2 text-center"
              >
                <div className="flex flex-col items-center gap-1 bg-bg/85 backdrop-blur-sm border border-border-subtle rounded-2xl px-4 py-2.5 shadow-lg">
                  <ChevronUp size={22} className="text-accent" />
                  <span className="text-[11px] text-ink font-semibold uppercase tracking-wide">{t('card.influencedBy')}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {showHints && !dragDirection && influenced.length > 0 && (
              <motion.div
                key="hint-down"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.25 }}
                className="absolute bottom-32 left-1/2 -translate-x-1/2 text-center"
              >
                <div className="flex flex-col items-center gap-1 bg-bg/85 backdrop-blur-sm border border-border-subtle rounded-2xl px-4 py-2.5 shadow-lg">
                  <ChevronDown size={22} className="text-accent" />
                  <span className="text-[11px] text-ink font-semibold uppercase tracking-wide">{t('card.influences')}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {showHints && !dragDirection && playedWith.length > 0 && (
              <motion.div
                key="hint-right"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.25 }}
                className="absolute right-4 top-1/2 -translate-y-1/2"
              >
                <div className="flex flex-col items-center gap-1 bg-bg/85 backdrop-blur-sm border border-border-subtle rounded-2xl px-3 py-2.5 shadow-lg">
                  <ChevronRight size={22} className="text-accent" />
                  <span className="text-[11px] text-ink font-semibold uppercase tracking-wide">{t('card.playedWith')}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {showHints && !dragDirection && leftIsBack && backMusician && (
              <motion.div
                key="hint-left"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="absolute left-4 top-1/2 -translate-y-1/2"
              >
                <div className="flex flex-col items-center gap-1 bg-accent/15 backdrop-blur-sm border border-accent/30 rounded-2xl px-3 py-2.5 shadow-lg">
                  <ChevronLeft size={22} className="text-accent" />
                  <span className="text-[11px] text-accent font-bold uppercase tracking-wide truncate max-w-18">{backMusician.name}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* Single direction hint overlay when dragging */}
        <AnimatePresence>
          {dragDirection && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute inset-0 pointer-events-none"
            >
              {dragDirection === 'up' && influencers.length > 0 && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[90vw] max-w-sm mx-4">
                  <div ref={influencerContainerRef} className="bg-bg-elevated/95 backdrop-blur-md rounded-2xl shadow-2xl px-4 py-4 text-center">
                    <ChevronUp size={36} className="mx-auto mb-2 text-accent" />
                    <span className="text-sm font-bold text-ink block mb-3">{t('card.influencedBy')}</span>
                    {influencers.length > 1 ? (
                      <div className={influencers.length > 5 ? 'grid grid-cols-2 gap-x-2 gap-y-1' : 'space-y-1'}>
                        {influencers.map((m, i) => (
                          <div key={m.id} ref={el => { influencerItemRefs.current[i] = el; }} className={`text-sm py-2 px-3 rounded-lg transition-all text-left ${i === selectedMusicianIndex ? 'bg-accent/20 text-accent font-semibold' : 'text-ink3'}`}>
                            {m.name}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-lg font-semibold text-ink">{influencers[0]?.name}</div>
                    )}
                  </div>
                </div>
              )}
              {dragDirection === 'down' && influenced.length > 0 && (
                <div className="absolute bottom-28 left-1/2 -translate-x-1/2 w-[90vw] max-w-sm mx-4">
                  <div ref={influencedContainerRef} className="bg-bg-elevated/95 backdrop-blur-md rounded-2xl shadow-2xl px-4 py-4 text-center">
                    <ChevronDown size={36} className="mx-auto mb-2 text-accent" />
                    <span className="text-sm font-bold text-ink block mb-3">{t('card.influences')}</span>
                    {influenced.length > 1 ? (
                      <div className={influenced.length > 5 ? 'grid grid-cols-2 gap-x-2 gap-y-1' : 'space-y-1'}>
                        {influenced.map((m, i) => (
                          <div key={m.id} ref={el => { influencedItemRefs.current[i] = el; }} className={`text-sm py-2 px-3 rounded-lg transition-all text-left ${i === selectedMusicianIndex ? 'bg-accent/20 text-accent font-semibold' : 'text-ink3'}`}>
                            {m.name}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-lg font-semibold text-ink">{influenced[0]?.name}</div>
                    )}
                  </div>
                </div>
              )}
              {dragDirection === 'right' && playedWith.length > 0 && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 w-40">
                  <div ref={playedWithContainerRef} className="bg-bg-elevated/95 backdrop-blur-md rounded-2xl shadow-2xl px-4 py-4 text-center">
                    <ChevronRight size={36} className="mx-auto mb-2 text-accent" />
                    <span className="text-sm font-bold text-ink block mb-3">{t('card.playedWith')}</span>
                    {playedWith.length > 1 ? (
                      <div className="space-y-1">
                        {playedWith.map((m, i) => (
                          <div key={m.id} ref={el => { playedWithItemRefs.current[i] = el; }} className={`text-sm py-2 px-3 rounded-lg transition-all text-left ${i === selectedMusicianIndex ? 'bg-accent/20 text-accent font-semibold' : 'text-ink3'}`}>
                            {m.name}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-lg font-semibold text-ink">{playedWith[0]?.name}</div>
                    )}
                  </div>
                </div>
              )}
              {dragDirection === 'left' && leftIsBack && backMusician && (
                <div className="absolute left-6 top-1/2 -translate-y-1/2 text-center">
                  <div className="bg-bg-elevated/95 backdrop-blur-md rounded-2xl shadow-2xl px-6 py-4 max-w-xs mx-4">
                    <ChevronLeft size={36} className="mx-auto mb-2 text-accent" />
                    <span className="text-[10px] text-ink3 uppercase tracking-wide font-medium block mb-1">{t('card.back')}</span>
                    <span className="text-base font-bold text-ink">{backMusician.name}</span>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Bottom button to open drawer */}
        <AnimatePresence>
          {!showDrawer && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={() => {
                setShowDrawer(true);
              }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-accent text-white px-5 py-3 rounded-full shadow-lg active:scale-95 transition-transform touch-manipulation"
            >
              <Info size={18} />
              <span className="text-sm font-semibold">{t('card.fullInfo')}</span>
            </motion.button>
          )}
        </AnimatePresence>
        
        {/* Bottom sheet drawer for musician details */}
        <AnimatePresence>
          {showDrawer && (
            <MusicianPanel
              musician={current}
              musicians={musicians}
              onClose={() => {
                setShowDrawer(false);
              }}
              onNavigate={onSelect}
              editMode={false}
              onEdit={() => {}}
              onPlayVideo={(url: string) => {
                const m = url.match(/[?&]v=([^&#]+)/) || url.match(/youtu\.be\/([^?&#]+)/);
                if (m) {
                  setLoadVideoId(m[1]);
                  setMiniPlayerActive(true);
                }
              }}
              videoMusician={null}
              manualVideoUrl={null}
              autoplay={autoplay}
              onVideoClose={() => {}}
              isMobile={true}
              bottomInset={0}
              cardMode={true}
            />
          )}
        </AnimatePresence>

        {/* Lists dropdown modal — mobile */}
        {showListsDropdown && current && (
          <ListsDropdown
            musicianId={current.id}
            onClose={() => setShowListsDropdown(false)}
          />
        )}
      </div>
    );
  }

  // Desktop: card left, description + video right, vertically centered together
  return (
    <div className="w-full h-full flex flex-wrap justify-center gap-4 items-center bg-bg overflow-auto relative">
      {/* Desktop toolbar — top right */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        {/* Search toggle */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.1 }}
          onClick={() => setShowSearch(v => !v)}
          className={`flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-sm border shadow-md transition-colors ${showSearch ? 'bg-accent text-white border-accent' : 'bg-bg/80 border-border-subtle text-ink3 hover:text-ink hover:bg-bg-hover'}`}
          title={t('card.search')}
        >
          <Search size={18} />
        </motion.button>

        {/* Random */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.1 }}
          onClick={() => {
            const others = completeMusicians.filter(m => m.id !== current?.id);
            if (others.length > 0) onSelect(others[Math.floor(Math.random() * others.length)]);
          }}
          className="flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-sm border bg-bg/80 border-border-subtle text-ink3 shadow-md transition-colors hover:text-ink hover:bg-bg-hover"
          title={t('card.random')}
        >
          <Dice5 size={18} />
        </motion.button>

        {/* Favourite toggle */}
        {user && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.1 }}
            onClick={() => current && toggleFavorite(current.id)}
            className={`flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-sm border shadow-md transition-colors ${current && isMusicianFavorited(current.id) ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-bg/80 border-border-subtle text-ink3 hover:text-ink hover:bg-bg-hover'}`}
            title={t('card.favorite')}
          >
            <Heart size={18} fill={current && isMusicianFavorited(current.id) ? 'currentColor' : 'none'} />
          </motion.button>
        )}

        {/* Add to list */}
        {user && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.1 }}
            onClick={() => current && setShowListsDropdown(true)}
            className="flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-sm border bg-bg/80 border-border-subtle text-ink3 shadow-md transition-colors hover:text-ink hover:bg-bg-hover"
            title={t('card.addToList')}
          >
            <ListPlus size={18} />
          </motion.button>
        )}
      </div>

      {/* Desktop search input overlay */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-16 right-4 z-50 w-72"
          >
            <div className="relative">
              <SearchInput
                ref={searchInputRef}
                value={search}
                onChange={setSearch}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchMatches[0]) {
                    onSelect(searchMatches[0]);
                    setSearch('');
                    setShowSearch(false);
                  }
                  if (e.key === 'Escape') {
                    setSearch('');
                    setShowSearch(false);
                  }
                }}
                placeholder={t('filters.findByName')}
              />
              {searchMatches.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-bg-subtle border border-border-subtle rounded-lg overflow-hidden shadow-xl z-50 max-h-60 overflow-y-auto">
                  {searchMatches.map((m) => {
                    const hex = getStyleHex(m.bluesStyle);
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          onSelect(m);
                          setSearch('');
                          setShowSearch(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-hover transition-colors"
                      >
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: hex }} />
                        <span className="text-sm text-ink flex-1 truncate">{m.name}</span>
                        <span className="text-xs shrink-0" style={{ color: hex }}>{t(`styles.${m.bluesStyle}`, m.bluesStyle).replace(' Blues', '')}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lists dropdown modal — desktop */}
      {showListsDropdown && current && (
        <ListsDropdown
          musicianId={current.id}
          onClose={() => setShowListsDropdown(false)}
        />
      )}

      {/* Left side: card + flip hint */}
      <div className="flex flex-1 flex-col items-center justify-center min-w-1/2">
        {cardZone}
      </div>

      {/* Right side: played with + description + video */}
      <div className="h-full shrink flex items-center min-w-[300px]">
        <div className="w-full max-w-xl px-8 py-6 flex flex-col gap-6 overflow-y-auto" style={{ maxHeight: cardH + arrowGap * 2 }}>
          {current.description && (
            <p className="text-ui text-ink leading-[1.75]">{current.description}</p>
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
    <div className={`flex ${alignItems} justify-center gap-2`}>
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
  className,
}: {
  musicians: Musician[];
  onNavigate: (m: Musician) => void;
  className?: string;
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
    <div className={`flex flex-col gap-2 ${className}`}>
      <span className="text-[10px] text-ink3 uppercase tracking-wide pl-1 font-medium">{t('card.playedWith')}</span>
      <div className="flex flex-col gap-1.5 flex-wrap">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setPage(p => p - 1)}
          disabled={!needsPaging || page === 0}
          className="flex items-center justify-center w-6 h-6 rounded-full bg-bg/60 border border-border-subtle text-ink3 hover:text-ink transition-colors shrink-0 disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronLeft size={12} />
        </motion.button>
        {visible.map(m => (
          <motion.button
            key={m.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate(m)}
            className="max-w-24 truncate px-3 py-1.5 rounded-full text-xs font-medium bg-bg/80 border border-border-subtle text-ink3 hover:text-ink hover:bg-bg-hover transition-colors whitespace-nowrap"
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
