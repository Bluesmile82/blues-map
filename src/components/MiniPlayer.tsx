import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Musician } from '../types';

declare namespace YT {
  class Player {
    constructor(elementId: string, options: PlayerOptions);
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    loadVideoById(videoId: string): void;
    destroy(): void;
    getPlayerState(): number;
  }
  interface PlayerOptions {
    videoId: string;
    playerVars?: Record<string, number | string>;
    events?: {
      onReady?: (e: { target: Player }) => void;
      onStateChange?: (e: { data: number }) => void;
      onError?: (e: { data: number }) => void;
    };
  }
  const PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
}

function extractVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/[?&]v=([^&#]+)/) || url.match(/youtu\.be\/([^?&#]+)/);
  return m ? m[1] : null;
}

interface VideoEntry { label: string; videoId: string; }

interface MiniPlayerProps {
  musician: Musician;
  isPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
  /** When set, loads and plays this specific video ID */
  loadVideoId?: string | null;
  onLoadVideoConsumed?: () => void;
}

const PLAYER_ID = 'mini-player-iframe';

export default function MiniPlayer({ musician, isPlaying, onPlayingChange, loadVideoId, onLoadVideoConsumed }: MiniPlayerProps) {
  const playerRef = useRef<YT.Player | null>(null);
  const playerReadyRef = useRef(false);
  const [apiReady, setApiReady] = useState(!!((window as any).YT?.Player));
  const [currentIndex, setCurrentIndex] = useState(0);
  const isPlayingRef = useRef(isPlaying);
  const currentIndexRef = useRef(0);
  const pendingVideoIdRef = useRef<string | null>(null);

  const buildVideos = (m: Musician): VideoEntry[] => {
    const list: VideoEntry[] = [];
    const mainId = extractVideoId(m.youtubeLink);
    if (mainId) list.push({ label: m.name, videoId: mainId });
    for (const album of m.albums) {
      const id = extractVideoId(album.youtubeLink);
      if (id) list.push({ label: album.name, videoId: id });
    }
    return list;
  };

  const videosRef = useRef<VideoEntry[]>(buildVideos(musician));

  // Keep isPlayingRef fresh
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Load YouTube IFrame API once
  useEffect(() => {
    if ((window as any).YT?.Player) { setApiReady(true); return; }
    if (!(window as any).onYouTubeIframeAPIReady) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    const prev = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      prev?.();
      setApiReady(true);
    };
  }, []);

  // Init player once when API is ready
  useEffect(() => {
    if (!apiReady) return;

    playerReadyRef.current = false;

    playerRef.current = new YT.Player(PLAYER_ID, {
      videoId: '',
      playerVars: {
        autoplay: 0,
        playsinline: 1,
        rel: 0,
        controls: 0,
        enablejsapi: 1,
      },
      events: {
        onReady: () => {
          playerReadyRef.current = true;
          if (pendingVideoIdRef.current) {
            playerRef.current?.loadVideoById(pendingVideoIdRef.current);
            pendingVideoIdRef.current = null;
          }
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) {
            const next = currentIndexRef.current + 1;
            if (next < videosRef.current.length) {
              navigateTo(next);
            } else {
              onPlayingChange(false);
            }
          }
        },
        onError: () => {
          const next = currentIndexRef.current + 1;
          if (next < videosRef.current.length) navigateTo(next);
          else onPlayingChange(false);
        },
      },
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
        playerReadyRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiReady]);

  // When musician changes, load new video into existing player
  useEffect(() => {
    if (!apiReady) return;

    const videos = buildVideos(musician);
    videosRef.current = videos;
    currentIndexRef.current = 0;
    setCurrentIndex(0);

    if (videos.length === 0) return;

    const videoId = videos[0].videoId;

    if (playerReadyRef.current && playerRef.current) {
      try {
        playerRef.current.loadVideoById(videoId);
        if (!isPlayingRef.current) {
          playerRef.current.pauseVideo();
        }
      } catch { /* player not ready yet */ }
    } else {
      pendingVideoIdRef.current = videoId;
    }
  }, [apiReady, musician.id]);

  // Play / pause when isPlaying prop changes
  useEffect(() => {
    if (!playerRef.current || !playerReadyRef.current) return;
    try {
      if (isPlaying) playerRef.current.playVideo();
      else playerRef.current.pauseVideo();
    } catch { /* player not ready yet */ }
  }, [isPlaying]);

  // Load a specific video when requested (from MusicianPanel buttons)
  useEffect(() => {
    if (!loadVideoId || !playerRef.current || !playerReadyRef.current) return;
    const videos = videosRef.current;
    const idx = videos.findIndex(v => v.videoId === loadVideoId);
    if (idx >= 0) {
      currentIndexRef.current = idx;
      setCurrentIndex(idx);
    }
    try {
      playerRef.current.loadVideoById(loadVideoId);
    } catch { /* player not ready */ }
    onPlayingChange(true);
    onLoadVideoConsumed?.();
  }, [loadVideoId, onPlayingChange, onLoadVideoConsumed]);

  const navigateTo = (idx: number) => {
    const videos = videosRef.current;
    if (idx < 0 || idx >= videos.length || !playerRef.current) return;
    currentIndexRef.current = idx;
    setCurrentIndex(idx);
    playerRef.current.stopVideo();
    playerRef.current.loadVideoById(videos[idx].videoId);
  };

  const videos = videosRef.current;
  const currentLabel = videos[currentIndex]?.label ?? musician.name;
  const hasMultiple = videos.length > 1;

  return (
    <>
      {/* Hidden iframe container — must stay in DOM */}
      <div
        aria-hidden
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none', zIndex: -1 }}
      >
        <div id={PLAYER_ID} />
      </div>

      {/* Now-playing bar */}
      <AnimatePresence>
        {isPlaying && videos.length > 0 && (
          <motion.div
            key="now-playing"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="absolute top-0 left-0 right-0 z-40 flex items-center gap-1 px-12 py-1.5 bg-bg/90 backdrop-blur-sm border-b border-border-subtle"
          >
            {hasMultiple && (
              <button
                onClick={() => navigateTo(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="p-1 text-ink3 disabled:opacity-30 shrink-0 active:scale-90 transition-transform"
              >
                <ChevronLeft size={14} />
              </button>
            )}
            <span className="text-[11px] text-ink font-medium truncate flex-1 text-center">{currentLabel}</span>
            {hasMultiple && (
              <button
                onClick={() => navigateTo(currentIndex + 1)}
                disabled={currentIndex === videos.length - 1}
                className="p-1 text-ink3 disabled:opacity-30 shrink-0 active:scale-90 transition-transform"
              >
                <ChevronRight size={14} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
