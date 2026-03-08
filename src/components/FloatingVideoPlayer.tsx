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
  onClose: () => void;
}

export default function FloatingVideoPlayer({ youtubeUrl, albums, musicianName, manualVideoUrl, onClose }: Props) {
  const playerRef = useRef<YT.Player | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

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
      playerVars: { autoplay: 1, modestbranding: 1, rel: 0 },
      events: {
        onReady: ({ target }) => {
          target.playVideo();
          setIsPlaying(true);
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

  if (videos.length === 0) return null;

  const currentLabel = videos[currentIndex]?.label ?? musicianName;

  return (
    <div
      className="fixed top-14 right-100 z-40 flex flex-col rounded-bl-xl rounded-br-xl overflow-hidden shadow-2xl border border-white/10"
      style={{ width: 320, background: '#1a1a1a' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/60 backdrop-blur-sm">
        <div className="flex flex-col min-w-0 pr-2">
          <span className="text-white text-sm font-medium truncate">{musicianName}</span>
          {currentLabel !== musicianName && (
            <span className="text-white/50 text-xs truncate">{currentLabel}</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white transition-colors text-lg leading-none shrink-0"
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
      <div className="flex items-center justify-center gap-4 px-3 py-3 bg-black/60 backdrop-blur-sm">
        <button
          onClick={handlePlayPause}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
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
          className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
          aria-label="Stop"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="1" width="12" height="12" rx="2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
