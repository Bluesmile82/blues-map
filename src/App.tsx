import { useState, useCallback, useEffect, useRef } from 'react';
import NavBar from './components/NavBar';
import InfluenceView from './components/InfluenceView';
import MapView from './components/MapView';
import CardView from './components/CardView';
import MusicianPanel from './components/MusicianPanel';
import EditPanel from './components/EditPanel';
import FloatingVideoPlayer from './components/FloatingVideoPlayer';
import CreditsPage from './components/CreditsPage';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import PublicListView from './components/lists/PublicListView';
import PlaylistWizard, { PlaylistBar } from './components/PlaylistWizard';
import { parseSharedPlaylist } from './utils/playlist';
import { useAnalytics, trackMusicianView, trackSongPlay } from './hooks/useAnalytics';
import type { Musician } from './types';
import musiciansData from './data/musicians.json';

const EDIT_MODE_ENABLED = import.meta.env.VITE_ENABLE_EDIT_MODE === 'true';

export type ViewType = 'influence' | 'map' | 'card';
const VIEW_SLUGS: Record<string, ViewType> = { timeline: 'influence', map: 'map', card: 'card' };
const VIEW_TO_SLUG: Record<ViewType, string> = { influence: 'timeline', map: 'map', card: 'card' };

/** Parse pathname into { view, musicianId, listSlug } */
function parseUrl(pathname: string): { view: ViewType | null; musicianId: string | null; listSlug: string | null } {
  const listMatch = pathname.match(/^\/list\/([a-z0-9]+)$/i);
  if (listMatch) return { view: null, musicianId: null, listSlug: listMatch[1] };

  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { view: null, musicianId: null, listSlug: null };
  if (parts[0] === 'admin') return { view: null, musicianId: null, listSlug: null };

  if (parts[0] in VIEW_SLUGS) {
    return { view: VIEW_SLUGS[parts[0]], musicianId: parts[1] ?? null, listSlug: null };
  }
  // Backward compat: /{musicianId} without view prefix
  return { view: null, musicianId: parts[0], listSlug: null };
}

function buildUrl(view: ViewType, musicianId: string | null): string {
  const slug = VIEW_TO_SLUG[view];
  return musicianId ? `/${slug}/${musicianId}` : `/${slug}`;
}

export default function App() {
  const [musicians, setMusicians] = useState<Musician[]>(musiciansData as unknown as Musician[]);

  const initialParsed = parseUrl(window.location.pathname);
  const [view, setView] = useState<ViewType>(initialParsed.view ?? 'card');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('theme');
    return (stored === 'dark' || stored === 'light') ? stored : 'light';
  });
  const [publicListSlug, setPublicListSlug] = useState<string | null>(initialParsed.listSlug);

const initialMusician = (() => {
  const id = initialParsed.musicianId;
  if (id) {
    return (musiciansData as unknown as Musician[]).find((m) => m.id === id) ?? null;
  }
  
  // If on card view and no musician specified, select a random musician
  if (initialParsed.view === 'card' || (initialParsed.view === null && !initialParsed.musicianId && window.location.pathname !== '/admin')) {
    const musiciansArray = musiciansData as unknown as Musician[];
    if (musiciansArray.length === 0) return null;
    
    // Generate cryptographically secure random index
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const randomValue = array[0] / (0xFFFFFFFF + 1);
    const index = Math.floor(randomValue * musiciansArray.length);
    
    return musiciansArray[index];
  }
  
  return null;
})();
const [selected, setSelected] = useState<Musician | null>(initialMusician);
  const [editMode, setEditMode] = useState(false);
  const [showPlayer, setShowPlayer] = useState(!!initialMusician?.youtubeLink);
  const [manualVideoUrl, setManualVideoUrl] = useState<string | null>(null);
  const [autoplay, setAutoplay] = useState(() => {
    const stored = localStorage.getItem('autoplay');
    return stored ? stored === 'true' : false;
  });
  // Tracks whose video is in the player — independent of the info panel (persists when panel closes)
  const [videoMusician, setVideoMusician] = useState<Musician | null>(initialMusician ?? null);
  const [editing, setEditing] = useState<Musician | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [styleFilter, setStyleFilter] = useState<string | null>(null);
  const [showCredits, setShowCredits] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(window.location.pathname === '/admin');
  const [forceZoomToId, setForceZoomToId] = useState<string | null>(null);
  const [filteredMusicians, setFilteredMusicians] = useState<Musician[]>(musiciansData as unknown as Musician[]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const { setCurrentMusician } = useAnalytics();

  // Playlist wizard
  const [showWizard, setShowWizard] = useState(false);
  /** Non-null when the wizard was opened to edit an existing queue rather than draw a new one */
  const [wizardQueue, setWizardQueue] = useState<Musician[] | null>(null);
  const [playlist, setPlaylist] = useState<Musician[]>([]);
  const [playlistIndex, setPlaylistIndex] = useState(0);
  // Refs so the YouTube "ended" callback always sees the live queue/position
  const playlistRef = useRef<Musician[]>([]);
  const playlistIndexRef = useRef(0);
  playlistRef.current = playlist;
  playlistIndexRef.current = playlistIndex;

  const handleViewChange = useCallback((newView: ViewType) => {
    setView(newView);
    window.history.pushState(null, '', buildUrl(newView, selected?.id ?? null));
  }, [selected]);

  // Listen for window resize to update isMobile
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mobile doesn't have map view — redirect to card
  useEffect(() => {
    if (isMobile && view === 'map') setView('card');
  }, [isMobile, view]);

  // Persist autoplay setting to localStorage
  useEffect(() => {
    localStorage.setItem('autoplay', String(autoplay));
  }, [autoplay]);

  // Apply theme to HTML element and persist to localStorage
  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Persist video player position/size across sessions
  const [videoPlayerPos, setVideoPlayerPos] = useState<{ x: number; y: number } | null>(() => {
    const stored = localStorage.getItem('videoPlayerPos');
    return stored ? JSON.parse(stored) : null;
  });
  const [videoPlayerW, setVideoPlayerW] = useState(() => {
    const stored = localStorage.getItem('videoPlayerW');
    return stored ? Number(stored) : 320;
  });

  useEffect(() => {
    if (videoPlayerPos) {
      localStorage.setItem('videoPlayerPos', JSON.stringify(videoPlayerPos));
    }
  }, [videoPlayerPos]);

  useEffect(() => {
    localStorage.setItem('videoPlayerW', String(videoPlayerW));
  }, [videoPlayerW]);

  const handleSelect = useCallback((musician: Musician) => {
    if (editMode) {
      setEditing(musician);
    } else {
      setSelected(musician);
      setManualVideoUrl(null);
      window.history.pushState(null, '', buildUrl(view, musician.id));
      trackMusicianView(musician.id);
      setCurrentMusician(musician.id);
      if (musician.youtubeLink) {
        setVideoMusician(musician);
        setShowPlayer(true);
        trackSongPlay(musician.id, musician.youtubeLink);
      }
    }
  }, [editMode, view]);

  const handleClose = useCallback(() => {
    setSelected(null);
    setCurrentMusician(null);
    window.history.pushState(null, '', buildUrl(view, null));
  }, [view]);

  const handleRandom = useCallback(() => {
    const pool = filteredMusicians.length > 0 ? filteredMusicians : musicians;
    if (pool.length === 0) return;

    // Generate cryptographically secure random index
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const randomValue = array[0] / (0xFFFFFFFF + 1);
    const index = Math.floor(randomValue * pool.length);

    const pick = pool[index];
    setForceZoomToId(pick.id);
    handleSelect(pick);
  }, [filteredMusicians, musicians, handleSelect]);

  /** Move the playlist to `idx` — selects the musician, which zooms the view and starts its song. */
  const playPlaylistAt = useCallback((idx: number) => {
    const queue = playlistRef.current;
    if (idx < 0 || idx >= queue.length) {
      setPlaylist([]);
      setPlaylistIndex(0);
      return;
    }
    playlistIndexRef.current = idx;
    setPlaylistIndex(idx);
    const musician = queue[idx];
    setForceZoomToId(musician.id);
    handleSelect(musician);
  }, [handleSelect]);

  const handleStartPlaylist = useCallback((queue: Musician[]) => {
    if (queue.length === 0) return;
    playlistRef.current = queue;
    setPlaylist(queue);
    setShowWizard(false);
    // The timeline is where "focus moves to each musician" is visible
    setView('influence');
    playPlaylistAt(0);
  }, [playPlaylistAt]);

  const handlePlaylistNext = useCallback(() => playPlaylistAt(playlistIndexRef.current + 1), [playPlaylistAt]);

  const handleStopPlaylist = useCallback(() => {
    setPlaylist([]);
    setPlaylistIndex(0);
  }, []);

  const playlistActive = playlist.length > 0;

  // Restore a playlist shared via ?playlist=id1,id2,… (order preserved)
  useEffect(() => {
    const ids = parseSharedPlaylist(window.location.search);
    if (ids.length === 0) return;
    const queue = ids.map((id) => musicians.find((m) => m.id === id)).filter(Boolean) as Musician[];
    if (queue.length > 0) handleStartPlaylist(queue);
    // Mount only: a shared link is consumed once, then normal navigation takes over
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEdit = useCallback(() => {
    setEditing(selected);
    setSelected(null);
  }, [selected]);

  const handleCreateNew = useCallback(() => {
    setIsCreating(true);
    setSelected(null);
  }, []);

  const handleSave = useCallback(async (updated: Musician, isNew: boolean) => {
    const newMusicians = isNew
      ? [...musicians, updated]
      : musicians.map(m => m.id === updated.id ? updated : m);

    setMusicians(newMusicians);

    try {
      await fetch('/api/musicians', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (e) {
      console.error('Error saving to server:', e);
    }
  }, [musicians]);

  const handleDelete = useCallback((musicianId: string) => {
    setMusicians(prev => prev.filter(m => m.id !== musicianId));
    setEditing(null);
    setSelected(null);
  }, []);

  // Sync URL → selection + view on browser back/forward
  useEffect(() => {
    const onPop = () => {
      const pathname = window.location.pathname;
      setShowAnalytics(pathname === '/admin');
      if (pathname === '/admin') return;
      const parsed = parseUrl(pathname);
      if (parsed.listSlug) {
        setPublicListSlug(parsed.listSlug);
        setSelected(null);
      } else {
        setPublicListSlug(null);
        if (parsed.view) setView(parsed.view);
        setSelected(parsed.musicianId ? (musicians.find((m) => m.id === parsed.musicianId) ?? null) : null);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [musicians]);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      <NavBar
        view={view}
        onViewChange={handleViewChange}
        editMode={editMode}
        onEditModeChange={setEditMode}
        onCreateNew={handleCreateNew}
        editModeEnabled={EDIT_MODE_ENABLED}
        onRandom={handleRandom}
        onPlaylist={() => { setWizardQueue(null); setShowWizard(true); }}
        onCredits={() => setShowCredits(true)}
        autoplay={autoplay}
        onAutoplayChange={setAutoplay}
        theme={theme}
        onThemeChange={setTheme}
      />

      <main className="relative flex-1 mt-14 overflow-hidden">
        {publicListSlug && (
          <PublicListView
            slug={publicListSlug}
            musicians={musicians}
            onSelectMusician={(m) => {
              setPublicListSlug(null);
              handleSelect(m);
            }}
            onClose={() => {
              setPublicListSlug(null);
              window.history.pushState(null, '', buildUrl(view, null));
            }}
          />
        )}
        {!publicListSlug && (
          <>
            {view === 'influence' ? (
              <InfluenceView key="influence" musicians={musicians} onSelect={handleSelect} selectedId={selected?.id ?? null} styleFilter={styleFilter} onStyleFilterChange={setStyleFilter} forceZoomToId={forceZoomToId} onZoomComplete={() => setForceZoomToId(null)} onFilteredMusiciansChange={setFilteredMusicians} theme={theme} isMobile={isMobile} />
            ) : view === 'map' ? (
              <MapView key="map" musicians={musicians} onSelect={handleSelect} selectedId={selected?.id ?? null} styleFilter={styleFilter} onStyleFilterChange={setStyleFilter} theme={theme} isMobile={isMobile} />
            ) : (
              <CardView key="card" musicians={musicians} onSelect={handleSelect} selectedId={selected?.id ?? null} styleFilter={styleFilter} onStyleFilterChange={setStyleFilter} theme={theme} isMobile={isMobile} autoplay={autoplay} />
            )}
          </>
        )}
      </main>

      {selected && !editMode && view !== 'card' && (
        <MusicianPanel
          musician={selected}
          musicians={musicians}
          onClose={handleClose}
          onNavigate={handleSelect}
          editMode={false}
          onEdit={handleEdit}
          onPlayVideo={(url) => { setManualVideoUrl(url); setShowPlayer(true); setVideoMusician(selected); trackSongPlay(selected.id, url); }}
          videoMusician={videoMusician}
          manualVideoUrl={manualVideoUrl}
          autoplay={autoplay || playlistActive}
          onVideoClose={() => setShowPlayer(false)}
          onVideoEnded={playlistActive ? handlePlaylistNext : undefined}
          isMobile={isMobile}
          bottomInset={isMobile ? 72 : 0}
        />
      )}

      {!isMobile && videoMusician && showPlayer && !editMode && (view !== 'card' || playlistActive) && (
        <div className="block">
          <FloatingVideoPlayer
            key={videoMusician.id}
            youtubeUrl={videoMusician.youtubeLink}
            albums={videoMusician.albums}
            musicianName={videoMusician.name}
            manualVideoUrl={manualVideoUrl}
            panelOpen={!!selected}
            onClose={() => setShowPlayer(false)}
            initialPos={videoPlayerPos}
            initialW={videoPlayerW}
            onPositionChange={setVideoPlayerPos}
            onSizeChange={setVideoPlayerW}
            autoplay={autoplay || playlistActive}
            onEnded={playlistActive ? handlePlaylistNext : undefined}
          />
        </div>
      )}

      {showWizard && (
        <PlaylistWizard
          musicians={musicians}
          selected={selected}
          initialQueue={wizardQueue}
          onPlay={handleStartPlaylist}
          onClose={() => setShowWizard(false)}
        />
      )}

      {playlistActive && (
        <PlaylistBar
          queue={playlist}
          index={playlistIndex}
          onSkip={handlePlaylistNext}
          onStop={handleStopPlaylist}
          onSelect={(m) => playPlaylistAt(playlist.indexOf(m))}
          onEdit={() => { setWizardQueue(playlist); setShowWizard(true); }}
        />
      )}

      {showCredits && (
        <CreditsPage onClose={() => setShowCredits(false)} />
      )}

      {showAnalytics && (
        <AnalyticsDashboard onClose={() => { setShowAnalytics(false); window.history.pushState(null, '', '/'); }} />
      )}

      {EDIT_MODE_ENABLED && editing && (
        <EditPanel
          musician={editing}
          musicians={musicians}
          onClose={() => {
            setEditing(null);
            setSelected(null);
          }}
          onSave={(musician) => handleSave(musician, false)}
          onDelete={handleDelete}
          isNew={false}
        />
      )}

      {EDIT_MODE_ENABLED && isCreating && (
        <EditPanel
          musician={{
            id: '',
            name: '',
            image: '',
            image_source: '',
            birthDate: '',
            birthPlace: '',
            birthCoords: [0, 0],
            deathDate: null,
            deathPlace: null,
            deathCoords: null,
            spentTimePlaces: [],
            instrument: '',
            bluesStyle: '',
            youtubeLink: '',
            albums: [],
            description: '',
            activeFrom: '',
            influences: [],
            influencedBy: [],
            playedWith: [],
          }}
          musicians={musicians}
          onClose={() => setIsCreating(false)}
          onSave={(musician) => handleSave(musician, true)}
          isNew={true}
        />
      )}
    </div>
  );
}
