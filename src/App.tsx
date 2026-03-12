import { useState, useCallback, useEffect, useRef } from 'react';
import NavBar from './components/NavBar';
import InfluenceView from './components/InfluenceView';
import MapView from './components/MapView';
import MusicianPanel from './components/MusicianPanel';
import EditPanel from './components/EditPanel';
import FloatingVideoPlayer from './components/FloatingVideoPlayer';
import CreditsPage from './components/CreditsPage';
import type { Musician } from './types';
import musiciansData from './data/musicians.json';

const EDIT_MODE_ENABLED = import.meta.env.VITE_ENABLE_EDIT_MODE === 'true';

export default function App() {
  const [musicians, setMusicians] = useState<Musician[]>(musiciansData as unknown as Musician[]);
  const [view, setView] = useState<'influence' | 'map'>('influence');

  const initialMusician = (() => {
    const id = window.location.pathname.slice(1);
    return id ? (musiciansData as unknown as Musician[]).find((m) => m.id === id) ?? null : null;
  })();
  const [selected, setSelected] = useState<Musician | null>(initialMusician);
  const [editMode, setEditMode] = useState(false);
  const [showPlayer, setShowPlayer] = useState(!!initialMusician?.youtubeLink);
  const [manualVideoUrl, setManualVideoUrl] = useState<string | null>(null);
  const [autoplay, setAutoplay] = useState(() => {
    const stored = localStorage.getItem('autoplay');
    return stored ? stored === 'true' : true;
  });
  // Tracks whose video is in the player — independent of the info panel (persists when panel closes)
  const [videoMusician, setVideoMusician] = useState<Musician | null>(initialMusician ?? null);
  const [editing, setEditing] = useState<Musician | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [styleFilter, setStyleFilter] = useState<string | null>(null);
  const [showCredits, setShowCredits] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const favoritesRef = useRef(favorites);

  // Keep ref in sync with state
  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  // Persist autoplay setting to localStorage
  useEffect(() => {
    localStorage.setItem('autoplay', String(autoplay));
  }, [autoplay]);

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

  // Sync URL → selection on browser back/forward
  useEffect(() => {
    const onPop = () => {
      const id = window.location.pathname.slice(1);
      setSelected(id ? (musicians.find((m) => m.id === id) ?? null) : null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [musicians]);

  // Fetch favorites on mount (dev only)
  useEffect(() => {
    if (!EDIT_MODE_ENABLED) return;

    const fetchFavorites = async () => {
      try {
        const res = await fetch('/api/favorites');
        if (res.ok) {
          const data = await res.json();
          setFavorites(new Set(data.favorites || []));
        }
      } catch (error) {
        console.error('Failed to fetch favorites:', error);
      }
    };

    fetchFavorites();
  }, []);

  const handleSelect = useCallback((musician: Musician) => {
    if (editMode) {
      setEditing(musician);
    } else {
      setSelected(musician);
      setManualVideoUrl(null);
      window.history.pushState(null, '', `/${musician.id}`);
      if (musician.youtubeLink) {
        setVideoMusician(musician);
        setShowPlayer(true);
      }
    }
  }, [editMode]);

  const handleClose = useCallback(() => {
    setSelected(null);
    window.history.pushState(null, '', '/');
  }, []);

  const handleRandom = useCallback(() => {
    const pick = musicians[Math.floor(Math.random() * musicians.length)];
    handleSelect(pick);
  }, [musicians, handleSelect]);

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

  const handleToggleFavorite = useCallback(async (musicianId: string) => {
    if (!EDIT_MODE_ENABLED) return;

    // Get current state from ref
    const currentFavorites = favoritesRef.current;
    const isCurrentlyFavorited = currentFavorites.has(musicianId);

    // Optimistic update
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(musicianId)) {
        newFavorites.delete(musicianId);
      } else {
        newFavorites.add(musicianId);
      }
      return newFavorites;
    });

    const method = isCurrentlyFavorited ? 'DELETE' : 'POST';

    try {
      const url = isCurrentlyFavorited
        ? `/api/favorites/${musicianId}`
        : '/api/favorites';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: isCurrentlyFavorited ? undefined : JSON.stringify({ musicianId }),
      });

      if (res.ok) {
        const data = await res.json();
        setFavorites(new Set(data.favorites || []));
      } else {
        // Revert on error
        setFavorites(prev => {
          const newFavorites = new Set(prev);
          if (isCurrentlyFavorited) {
            newFavorites.add(musicianId);
          } else {
            newFavorites.delete(musicianId);
          }
          return newFavorites;
        });
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      // Revert on error
      setFavorites(prev => {
        const newFavorites = new Set(prev);
        if (isCurrentlyFavorited) {
          newFavorites.add(musicianId);
        } else {
          newFavorites.delete(musicianId);
        }
        return newFavorites;
      });
    }
  }, []); // Empty deps - uses ref instead

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      <NavBar
        view={view}
        onViewChange={setView}
        editMode={editMode}
        onEditModeChange={setEditMode}
        onCreateNew={handleCreateNew}
        editModeEnabled={EDIT_MODE_ENABLED}
        onRandom={handleRandom}
        onCredits={() => setShowCredits(true)}
        autoplay={autoplay}
        onAutoplayChange={setAutoplay}
      />

      <main className="relative flex-1 mt-14 overflow-hidden">
        {view === 'influence' ? (
          <InfluenceView key="influence" musicians={musicians} onSelect={handleSelect} selectedId={selected?.id ?? null} styleFilter={styleFilter} onStyleFilterChange={setStyleFilter} favorites={favorites} onToggleFavorite={handleToggleFavorite} />
        ) : (
          <MapView key="map" musicians={musicians} onSelect={handleSelect} selectedId={selected?.id ?? null} styleFilter={styleFilter} onStyleFilterChange={setStyleFilter} favorites={favorites} onToggleFavorite={handleToggleFavorite} />
        )}
      </main>

      {selected && !editMode && (
        <MusicianPanel
          musician={selected}
          musicians={musicians}
          onClose={handleClose}
          onNavigate={handleSelect}
          editMode={false}
          onEdit={handleEdit}
          onPlayVideo={(url) => { setManualVideoUrl(url); setShowPlayer(true); setVideoMusician(selected); }}
          isFavorited={selected ? favorites.has(selected.id) : false}
          onToggleFavorite={() => selected && handleToggleFavorite(selected.id)}
        />
      )}

      {videoMusician && showPlayer && !editMode && (
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
          autoplay={autoplay}
        />
      )}

      {showCredits && (
        <CreditsPage onClose={() => setShowCredits(false)} />
      )}

      {EDIT_MODE_ENABLED && editing && (
        <EditPanel
          musician={editing}
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
          }}
          onClose={() => setIsCreating(false)}
          onSave={(musician) => handleSave(musician, true)}
          isNew={true}
        />
      )}
    </div>
  );
}
