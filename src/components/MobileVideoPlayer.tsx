import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
    loadVideoById(videoId: string);
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

interface MobileVideoPlayerProps {
  youtubeUrl: string;
  albums: Album[];
  musicianName: string;
  manualVideoUrl: string | null;
  onClose: () => void;
  autoplay?: boolean;
}

export default function MobileVideoPlayer({
  youtubeUrl,
  albums,
  musicianName,
  manualVideoUrl,
  onClose,
  autoplay = true,
}: MobileVideoPlayerProps) {
  const { t } = useTranslation();
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

  // Load YouTube IFrame API
  useEffect(() => {
    if (window.YT) {
      setApiReady(true);
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => setApiReady(true);

    return () => {
      window.onYouTubeIframeAPIReady = () => { };
    };
  }, []);

  // Initialize player when API is ready
  useEffect(() => {
    if (!apiReady || videos.length === 0) return;

    const videoId = videos[currentIndex].videoId;
    const containerId = `mobile-player-${musicianName}`;

    // Destroy existing player if any
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    try {
      playerRef.current = new YT.Player(containerId, {
        videoId,
        playerVars: {
          autoplay: autoplay ? 1 : 0,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          controls: 1,
        },
        events: {
          onReady: (event) => {
            console.log('YouTube player ready for video:', videoId);
            if (!autoplay) {
              event.target.pauseVideo();
              setIsPlaying(false);
            }
          },
          onStateChange: (event) => {
            const state = event.data;
            console.log('Player state changed:', state, 'PLAYING:', YT.PlayerState.PLAYING);
            setIsPlaying(state === YT.PlayerState.PLAYING);
          },
          onError: (event) => {
            console.error('YouTube player error:', event.data);
            // Try next video
            const nextIndex = currentIndexRef.current + 1;
            if (nextIndex < videosRef.current.length) {
              playerRef.current?.loadVideoById(videosRef.current[nextIndex].videoId);
              setCurrentIndex(nextIndex);
              currentIndexRef.current = nextIndex;
            }
          },
        },
      });
    } catch (error) {
      console.error('Error initializing YouTube player:', error);
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [apiReady, currentIndex, videos.length, musicianName, autoplay]);

  // When caller requests a specific video (e.g. album link clicked in panel)
  useEffect(() => {
    if (!manualVideoUrl || !playerRef.current) return;
    const id = extractVideoId(manualVideoUrl);
    if (!id) return;
    const idx = videosRef.current.findIndex((v) => v.videoId === id);
    const newIndex = idx >= 0 ? idx : 0;
    currentIndexRef.current = newIndex;
    setCurrentIndex(newIndex);
    // Stop current video before loading new one to prevent echo
    playerRef.current.stopVideo();
    playerRef.current.loadVideoById(id);
    setIsPlaying(true);
  }, [manualVideoUrl]);

  const handlePlayPause = () => {
    if (!playerRef.current || !playerRef.current.playVideo || !playerRef.current.pauseVideo) {
      console.warn('Player not ready or methods not available');
      return;
    }

    try {
      if (isPlaying) {
        playerRef.current.pauseVideo();
        setIsPlaying(false);
      } else {
        playerRef.current.playVideo();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error toggling play/pause:', error);
    }
  };

  const handleNavigate = (newIndex: number) => {
    if (newIndex < 0 || newIndex >= videos.length || !playerRef.current) return;
    currentIndexRef.current = newIndex;
    setCurrentIndex(newIndex);

    const videoId = videos[newIndex].videoId;
    // Stop current video before loading new one
    playerRef.current.stopVideo();
    playerRef.current.loadVideoById(videoId);
    setIsPlaying(true); // Video starts playing when loaded
  };

  if (videos.length === 0) return null;

  const currentLabel = videos[currentIndex]?.label ?? musicianName;
  const hasMultiple = videos.length > 1;

  return (
    <div className="shrink-0 border-t border-border-subtle bg-bg/50 relative" style={{ height: '180px' }}>
      {!apiReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg/50 z-10">
          <div className="text-ink3/50 text-xs">{t('video.loading')}</div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-ink text-sm font-medium truncate">{musicianName}</span>
          {currentLabel !== musicianName && (
            <span className="text-ink3/70 text-xs truncate">{currentLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasMultiple && (
            <>
              <button
                onClick={() => handleNavigate(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="p-1.5 rounded text-ink3/70 hover:text-ink hover:bg-bg3/30 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink3/70"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={() => handleNavigate(currentIndex + 1)}
                disabled={currentIndex === videos.length - 1}
                className="p-1.5 rounded text-ink3/70 hover:text-ink hover:bg-bg3/30 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink3/70"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded text-ink3/70 hover:text-ink hover:bg-bg3/30"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Video Player */}
      <div
        className="absolute inset-0 bg-bg/50"
        onClick={handlePlayPause}
      >
        <div
          id={`mobile-player-${musicianName}`}
          className="w-full h-full"
        />
      </div>

      {/* Minimal Controls Overlay */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1.5 bg-gradient-to-t from-bg/90 to-transparent">
        <div className="flex items-center gap-1">
          {hasMultiple && (
            <>
              <button
                onClick={() => handleNavigate(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="p-1 rounded text-ink/90 hover:bg-bg3/30 disabled:opacity-30"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-ink/70 text-xs px-1">
                {currentIndex + 1}/{videos.length}
              </span>
              <button
                onClick={() => handleNavigate(currentIndex + 1)}
                disabled={currentIndex === videos.length - 1}
                className="p-1 rounded text-ink/90 hover:bg-bg3/30 disabled:opacity-30"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded text-ink/90 hover:bg-bg3/30"
          title={t('video.closeVideo')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
