import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Musician } from '../types';



function extractVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/[?&]v=([^&#]+)/) || url.match(/youtu\.be\/([^?&#]+)/);
  return match ? match[1] : null;
}

interface VideoEntry {
  label: string;
  videoId: string;
}

interface MiniPlayerProps {
  musician: Musician;
  isPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
  loadVideoId: string | null;
  onLoadVideoConsumed: () => void;
}

const PLAYER_DIV_ID = 'mini-player-container';
const MAX_RETRIES = 5;

export default function MiniPlayer({
  musician,
  isPlaying,
  onPlayingChange,
  loadVideoId,
  onLoadVideoConsumed,
}: MiniPlayerProps) {
  const [apiReady, setApiReady] = useState(false);
  const playerRef = useRef<YT.Player | null>(null);
  const playerReadyRef = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  const pendingVideoIdRef = useRef<string | null>(null);
  const musicianIdRef = useRef<string>(musician.id);
  const videosRef = useRef<VideoEntry[]>([]);
  const currentIndexRef = useRef(0);
  const requestingPlayRef = useRef(false);
  const retryCountRef = useRef(0);
  const onPlayingChangeRef = useRef(onPlayingChange);
  const [currentIndex, setCurrentIndex] = useState(0);

  isPlayingRef.current = isPlaying;
  onPlayingChangeRef.current = onPlayingChange;

  const buildVideos = (): VideoEntry[] => {
    const result: VideoEntry[] = [];
    for (const album of musician.albums) {
      const id = extractVideoId(album.youtubeLink);
      if (id) result.push({ label: album.name, videoId: id });
    }
    const mainId = extractVideoId(musician.youtubeLink);
    if (mainId && !result.some(v => v.videoId === mainId)) {
      result.unshift({ label: musician.name, videoId: mainId });
    }
    return result;
  };

  videosRef.current = buildVideos();

  const retryPlay = () => {
    if (retryCountRef.current >= MAX_RETRIES || !playerRef.current) {
      requestingPlayRef.current = false;
      retryCountRef.current = 0;
      onPlayingChangeRef.current(false);
      return;
    }
    retryCountRef.current++;
    const delay = 300 * retryCountRef.current;
    setTimeout(() => {
      if (requestingPlayRef.current && playerRef.current) {
        playerRef.current.playVideo();
      }
    }, delay);
  };

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
      window.onYouTubeIframeAPIReady = () => {};
    };
  }, []);

  useEffect(() => {
    if (!apiReady) return;
    if (playerRef.current) return;

    const videos = videosRef.current;
    const initialVideoId = videos.length > 0 ? videos[0].videoId : '';

    playerRef.current = new YT.Player(PLAYER_DIV_ID, {
      videoId: initialVideoId,
      playerVars: {
        autoplay: 0,
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        controls: 0,
      },
      events: {
        onReady: () => {
          playerReadyRef.current = true;
          if (pendingVideoIdRef.current) {
            const vid = pendingVideoIdRef.current;
            pendingVideoIdRef.current = null;
            if (isPlayingRef.current) {
              requestingPlayRef.current = true;
              retryCountRef.current = 0;
              playerRef.current?.loadVideoById(vid);
            } else {
              playerRef.current?.cueVideoById(vid);
            }
          } else if (isPlayingRef.current && initialVideoId) {
            requestingPlayRef.current = true;
            retryCountRef.current = 0;
            playerRef.current?.playVideo();
          }
        },
        onStateChange: (event: { data: number }) => {
          if (event.data === YT.PlayerState.PLAYING) {
            requestingPlayRef.current = false;
            retryCountRef.current = 0;
            onPlayingChangeRef.current(true);
          } else if (
            event.data === YT.PlayerState.PAUSED ||
            event.data === YT.PlayerState.ENDED
          ) {
            if (requestingPlayRef.current) {
              retryPlay();
            } else {
              onPlayingChangeRef.current(false);
            }
          }
        },
        onError: (event: { data: number }) => {
          console.error('MiniPlayer YT error:', event.data);
          requestingPlayRef.current = false;
          retryCountRef.current = 0;
          const nextIndex = currentIndexRef.current + 1;
          const videos = videosRef.current;
          if (nextIndex < videos.length) {
            currentIndexRef.current = nextIndex;
            setCurrentIndex(nextIndex);
            requestingPlayRef.current = true;
            retryCountRef.current = 0;
            playerRef.current?.loadVideoById(videos[nextIndex].videoId);
          }
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
  }, [apiReady]);

  useEffect(() => {
    if (!playerReadyRef.current || !playerRef.current) return;
    if (requestingPlayRef.current) return;
    if (isPlaying) {
      requestingPlayRef.current = true;
      retryCountRef.current = 0;
      playerRef.current.playVideo();
    } else {
      requestingPlayRef.current = false;
      retryCountRef.current = 0;
      playerRef.current.pauseVideo();
    }
  }, [isPlaying]);

  useEffect(() => {
    const videos = videosRef.current;
    if (videos.length === 0) return;

    const newVideoId = videos[0].videoId;
    currentIndexRef.current = 0;
    setCurrentIndex(0);

    if (!playerReadyRef.current || !playerRef.current) {
      pendingVideoIdRef.current = newVideoId;
      return;
    }

    if (isPlayingRef.current) {
      requestingPlayRef.current = true;
      retryCountRef.current = 0;
      playerRef.current.loadVideoById(newVideoId);
    } else {
      playerRef.current.cueVideoById(newVideoId);
    }
    musicianIdRef.current = musician.id;
  }, [musician.id]);

  useEffect(() => {
    if (!loadVideoId) return;
    if (!playerReadyRef.current || !playerRef.current) {
      pendingVideoIdRef.current = loadVideoId;
      onLoadVideoConsumed();
      return;
    }

    const videos = videosRef.current;
    const idx = videos.findIndex((v) => v.videoId === loadVideoId);
    if (idx >= 0) {
      currentIndexRef.current = idx;
      setCurrentIndex(idx);
    }

    requestingPlayRef.current = true;
    retryCountRef.current = 0;
    playerRef.current.loadVideoById(loadVideoId);
    onLoadVideoConsumed();
  }, [loadVideoId, onLoadVideoConsumed]);

  const navigateTo = (idx: number) => {
    const videos = videosRef.current;
    if (idx < 0 || idx >= videos.length || !playerRef.current) return;
    currentIndexRef.current = idx;
    setCurrentIndex(idx);
    requestingPlayRef.current = true;
    retryCountRef.current = 0;
    playerRef.current.loadVideoById(videos[idx].videoId);
  };

  const videos = videosRef.current;
  const currentLabel = videos[currentIndex]?.label ?? '';
  const hasMultiple = videos.length > 1;

  return (
    <>
      <div className="pointer-events-none">
        <div id={PLAYER_DIV_ID} className="w-0 h-0 overflow-hidden" />
      </div>
      <AnimatePresence>
        {isPlaying && videos.length > 0 && (
          <motion.div
            key="now-playing"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="absolute top-3 left-16 right-16 z-40 flex justify-center pointer-events-auto"
          >
            <div className="bg-bg/80 backdrop-blur-lg border border-border-subtle rounded-full px-2 py-1 shadow-md flex items-center gap-1">
              {hasMultiple && (
                <button
                  onClick={() => navigateTo(currentIndex - 1)}
                  disabled={currentIndex === 0}
                  className="p-0.5 text-ink3 disabled:opacity-30 shrink-0 active:scale-90 transition-transform"
                >
                  <ChevronLeft size={14} />
                </button>
              )}
              <div className="flex items-center gap-1.5 min-w-0 shrink">
                <div className="flex gap-[2px] shrink-0 items-end h-3">
                  <span className="w-[2px] h-3 bg-accent rounded-full origin-bottom animate-[equalizer_0.6s_ease-in-out_infinite_0ms]" />
                  <span className="w-[2px] h-3 bg-accent rounded-full origin-bottom animate-[equalizer_0.6s_ease-in-out_infinite_200ms]" />
                  <span className="w-[2px] h-3 bg-accent rounded-full origin-bottom animate-[equalizer_0.6s_ease-in-out_infinite_400ms]" />
                </div>
                {currentLabel && (
                  <span className="text-[11px] text-ink/80 truncate font-medium whitespace-nowrap">{currentLabel}</span>
                )}
              </div>
              {hasMultiple && (
                <button
                  onClick={() => navigateTo(currentIndex + 1)}
                  disabled={currentIndex >= videos.length - 1}
                  className="p-0.5 text-ink3 disabled:opacity-30 shrink-0 active:scale-90 transition-transform"
                >
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
