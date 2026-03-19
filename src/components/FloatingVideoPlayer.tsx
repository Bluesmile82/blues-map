import { useEffect, useRef, useState } from 'react';
import type { Album } from '../types';

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
  }
}

declare namespace YT {
  class Player {
    constructor(elementId: string, options: PlayerOptions);
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    loadVideoById(videoId: string): void;
    getPlayerState(): number;
    destroy(): void;
  }
  interface PlayerOptions {
    videoId: string;
    playerVars?: Record<string, number | string>;
    events?: {
      onReady?: (event: { target: Player }) => void;
      onStateChange?: (event: { data: number }) => void;
      onError?: (event: { data: number }) => void;
    };
  }
  const PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
}

function extractVideoId(url: string): string | null {
  const match = url.match(/[?&]v=([^&#]+)/) || url.match(/youtu\.be\/([^?&#]+)/);
  return match ? match[1] : null;
}

interface VideoEntry {
  label: string;
  videoId: string;
}

interface Props {
  youtubeUrl: string;
  albums: Album[];
  musicianName: string;
  manualVideoUrl: string | null;
  panelOpen: boolean;
  onClose: () => void;
  initialPos?: { x: number; y: number } | null;
  initialW?: number;
  onPositionChange?: (pos: { x: number; y: number }) => void;
  onSizeChange?: (w: number) => void;
  autoplay?: boolean;
}

const MIN_W = 200;
const MAX_W = 720;

export default function FloatingVideoPlayer({ youtubeUrl, albums, musicianName, manualVideoUrl, onClose, initialPos, initialW, onPositionChange, onSizeChange, autoplay = true }: Props) {
  const playerRef = useRef<YT.Player | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  type ResizeDir = 'nw' | 'ne' | 'sw' | 'se';

  // Drag/resize state
  const [pos, setPos] = useState<{ x: number; y: number } | null>(initialPos ?? null);
  const [w, setW] = useState(initialW ?? 320);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeDir, setResizeDir] = useState<ResizeDir | null>(null);
  const dragOffset = useRef({ dx: 0, dy: 0 });
  const resizeStart = useRef({ mouseX: 0, w: 0, x: 0, dir: 'se' as ResizeDir });
  const posRef = useRef({ x: 0, y: 0 });

  // Build ordered list of videos to try: main first, then albums
  const videos: VideoEntry[] = [];
  const mainId = extractVideoId(youtubeUrl);
  if (mainId) videos.push({ label: musicianName, videoId: mainId });
  for (const album of albums) {
    const id = extractVideoId(album.youtubeLink);
    if (id) videos.push({ label: album.name, videoId: id });
  }

  // Use refs so the onError closure always sees fresh values
  const videosRef = useRef(videos);
  videosRef.current = videos;
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  // Initialize position: right of screen adjacent to the sidebar panel (sm:w-[26rem] = 416px)
  useEffect(() => {
    if (pos === null) {
      const panelWidth = window.innerWidth >= 640 ? 416 : 0;
      const x = Math.max(0, window.innerWidth - panelWidth - w);
      const y = 56; // below navbar (h-14)
      posRef.current = { x, y };
      setPos({ x, y });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drag/resize mouse tracking
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isDragging) {
        const x = Math.max(0, Math.min(window.innerWidth - w, e.clientX - dragOffset.current.dx));
        const y = Math.max(0, Math.min(window.innerHeight - 80, e.clientY - dragOffset.current.dy));
        posRef.current = { x, y };
        setPos({ x, y });
        onPositionChange?.({ x, y });
      }
      if (resizeDir) {
        const dx = e.clientX - resizeStart.current.mouseX;
        const leftSide = resizeDir === 'nw' || resizeDir === 'sw';
        const rawW = leftSide ? resizeStart.current.w - dx : resizeStart.current.w + dx;
        const newW = Math.max(MIN_W, Math.min(MAX_W, rawW));
        setW(newW);
        onSizeChange?.(newW);
        if (leftSide) {
          const newX = resizeStart.current.x + (resizeStart.current.w - newW);
          posRef.current = { ...posRef.current, x: newX };
          setPos((p) => p ? { ...p, x: newX } : p);
          onPositionChange?.({ ...posRef.current, x: newX });
        }
      }
    };
    const onUp = () => {
      if (isDragging) setIsDragging(false);
      if (resizeDir) setResizeDir(null);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, resizeDir, w]);

  const handleDragStart = (e: React.MouseEvent) => {
    if (!pos) return;
    dragOffset.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    setIsDragging(true);
    e.preventDefault();
  };

  const handleResizeStart = (e: React.MouseEvent, dir: ResizeDir) => {
    resizeStart.current = { mouseX: e.clientX, w, x: pos?.x ?? 0, dir };
    setResizeDir(dir);
    e.preventDefault();
    e.stopPropagation();
  };

  // Load YouTube IFrame API once
  useEffect(() => {
    if (window.YT?.Player) {
      setApiReady(true);
      return;
    }
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      setApiReady(true);
    };
    if (!document.getElementById('yt-iframe-api')) {
      const script = document.createElement('script');
      script.id = 'yt-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
  }, []);

  // Create player once API is ready
  useEffect(() => {
    if (!apiReady || videosRef.current.length === 0) return;

    playerRef.current = new window.YT.Player('yt-floating-player', {
      videoId: videosRef.current[0].videoId,
      playerVars: { autoplay: autoplay ? 1 : 0, modestbranding: 1, rel: 0 },
      events: {
        onReady: ({ target }) => {
          if (autoplay) {
            target.playVideo();
            setIsPlaying(true);
          }
        },
        onStateChange: ({ data }) => {
          setIsPlaying(data === window.YT.PlayerState.PLAYING);
        },
        onError: () => {
          const nextIndex = currentIndexRef.current + 1;
          if (nextIndex < videosRef.current.length) {
            currentIndexRef.current = nextIndex;
            setCurrentIndex(nextIndex);
            playerRef.current?.loadVideoById(videosRef.current[nextIndex].videoId);
          }
        },
      },
    });

    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [apiReady]);

  // When caller requests a specific video (e.g. album link clicked in panel)
  useEffect(() => {
    if (!manualVideoUrl || !playerRef.current) return;
    const id = extractVideoId(manualVideoUrl);
    if (!id) return;
    const idx = videosRef.current.findIndex((v) => v.videoId === id);
    const newIndex = idx >= 0 ? idx : 0;
    currentIndexRef.current = newIndex;
    setCurrentIndex(newIndex);
    playerRef.current.loadVideoById(id);
    setIsPlaying(true);
  }, [manualVideoUrl]);

  const handlePlayPause = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  const handleStop = () => {
    playerRef.current?.stopVideo();
    setIsPlaying(false);
  };

  const handleNavigate = (newIndex: number) => {
    if (newIndex < 0 || newIndex >= videos.length || !playerRef.current) return;
    currentIndexRef.current = newIndex;
    setCurrentIndex(newIndex);
    playerRef.current.loadVideoById(videos[newIndex].videoId);
    setIsPlaying(true);
  };

  if (videos.length === 0 || pos === null) return null;

  const currentLabel = videos[currentIndex]?.label ?? musicianName;

  return (
    <>
      {/* Transparent overlay during drag/resize so iframe doesn't capture mouse */}
      {(isDragging || resizeDir) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 109,
            cursor: isDragging ? 'grabbing' : `${resizeDir}-resize`,
          }}
        />
      )}

      <div
        className='fixed z-50 rounded-lg border border-border-subtle overflow-hidden'
        style={{
          left: pos.x,
          top: pos.y,
          width: w,
        }}
      >
        {/* Header — drag handle */}
        <div
          className="flex items-center justify-between px-3 py-2 bg-bg/40 backdrop-blur-sm"
          style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
          onMouseDown={handleDragStart}
        >
          <div className="flex items-center gap-2 min-w-0 pr-2">
            {/* Drag indicator dots */}
            <svg width="10" height="14" viewBox="0 0 10 14" fill="rgba(255,255,255,0.25)" className="shrink-0">
              <circle cx="2.5" cy="2.5" r="1.5" />
              <circle cx="7.5" cy="2.5" r="1.5" />
              <circle cx="2.5" cy="7" r="1.5" />
              <circle cx="7.5" cy="7" r="1.5" />
              <circle cx="2.5" cy="11.5" r="1.5" />
              <circle cx="7.5" cy="11.5" r="1.5" />
            </svg>
            <div className="flex flex-col min-w-0">
              <span className="text-ink text-sm font-medium truncate">{musicianName}</span>
              {currentLabel !== musicianName && (
                <span className="text-ink3/70 text-xs truncate">{currentLabel}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            className="text-ink3/60 hover:text-ink transition-colors text-lg leading-none shrink-0"
            aria-label="Close player"
          >
            ✕
          </button>
        </div>

        {/* Video */}
        <div style={{ position: 'relative', paddingBottom: '56.25%' }}>
          <div
            id="yt-floating-player"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 px-3 py-3 bg-bg/50 backdrop-blur-sm">
          {videos.length > 1 && (
            <button
              onClick={() => handleNavigate(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-bg3/30 hover:bg-bg3/50 transition-colors text-ink disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Previous video"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M3 2h1.5v10H3V2zm1.5 5L11 2v10L4.5 7z" />
              </svg>
            </button>
          )}

          <button
            onClick={handlePlayPause}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-bg3/30 hover:bg-bg3/50 transition-colors text-ink"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="2" width="4" height="12" rx="1" />
                <rect x="9" y="2" width="4" height="12" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
              </svg>
            )}
          </button>

          <button
            onClick={handleStop}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-bg3/30 hover:bg-bg3/50 transition-colors text-ink"
            aria-label="Stop"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="1" y="1" width="12" height="12" rx="2" />
            </svg>
          </button>

          {videos.length > 1 && (
            <button
              onClick={() => handleNavigate(currentIndex + 1)}
              disabled={currentIndex === videos.length - 1}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-bg3/30 hover:bg-bg3/50 transition-colors text-ink disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next video"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M11 2h-1.5v10H11V2zM9.5 7L3 2v10l6.5-5z" />
              </svg>
            </button>
          )}
        </div>

        {/* Track indicator (only when multiple videos) */}
        {videos.length > 1 && (
          <div className="flex items-center justify-center gap-1 pb-2 bg-bg/50">
            {videos.map((v, i) => (
              <button
                key={i}
                onClick={() => handleNavigate(i)}
                className="transition-all"
                style={{
                  width: i === currentIndex ? 16 : 6,
                  height: 4,
                  borderRadius: 2,
                  background: i === currentIndex ? 'rgba(42, 31, 20, 0.8)' : 'rgba(42, 31, 20, 0.25)',
                }}
                aria-label={v.label}
              />
            ))}
          </div>
        )}

        {/* Resize handles — all 4 corners */}
        {([
          { dir: 'nw', style: { top: 0, left: 0, cursor: 'nw-resize' } },
          { dir: 'ne', style: { top: 0, right: 0, cursor: 'ne-resize' } },
          { dir: 'sw', style: { bottom: 0, left: 0, cursor: 'sw-resize' } },
          { dir: 'se', style: { bottom: 0, right: 0, cursor: 'se-resize' } },
        ] as { dir: ResizeDir; style: React.CSSProperties }[]).map(({ dir, style }) => (
          <div
            key={dir}
            onMouseDown={(e) => handleResizeStart(e, dir)}
            style={{
              position: 'absolute',
              width: 16,
              height: 16,
              zIndex: 1,
              ...style,
            }}
          />
        ))}
      </div>
    </>
  );
}
