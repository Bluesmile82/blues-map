import { useState, useCallback, useEffect } from 'react';
import NavBar from './components/NavBar';
import InfluenceView from './components/InfluenceView';
import MapView from './components/MapView';
import MusicianPanel from './components/MusicianPanel';
import EditPanel from './components/EditPanel';
import FloatingVideoPlayer from './components/FloatingVideoPlayer';
import CreditsPage from './components/CreditsPage';
import PublicListView from './components/lists/PublicListView';
import type { Musician } from './types';
import musiciansData from './data/musicians.json';

const EDIT_MODE_ENABLED = import.meta.env.VITE_ENABLE_EDIT_MODE === 'true';

export default function App() {
const [musicians, setMusicians] = useState<Musician[]>(musiciansData as unknown as Musician[]);
   const [view, setView] = useState<'influence' | 'map'>('influence');
   const [theme, setTheme] = useState<'light' | 'dark'>(() => {
     const stored = localStorage.getItem('theme');
     return (stored === 'dark' || stored === 'light') ? stored : 'light';
   });
   const [publicListSlug, setPublicListSlug] = useState<string | null>(null);

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
     return stored ? stored === 'true' : false;
   });
   // Tracks whose video is in the player — independent of the info panel (persists when panel closes)
   const [videoMusician, setVideoMusician] = useState<Musician | null>(initialMusician ?? null);
   const [editing, setEditing] = useState<Musician | null>(null);
   const [isCreating, setIsCreating] = useState(false);
   const [styleFilter, setStyleFilter] = useState<string | null>(null);
   const [showCredits, setShowCredits] = useState(false);
   const [forceZoomToId, setForceZoomToId] = useState<string | null>(null);
   const [filteredMusicians, setFilteredMusicians] = useState<Musician[]>(musiciansData as unknown as Musician[]);
   const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

   // Listen for window resize to update isMobile
   useEffect(() => {
     const handleResize = () => setIsMobile(window.innerWidth < 640);
     window.addEventListener('resize', handleResize);
     return () => window.removeEventListener('resize', handleResize);
   }, []);

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

    // Sync URL → selection on browser back/forward
    useEffect(() => {
      const onPop = () => {
        const listMatch = window.location.pathname.match(/^\/list\/([a-z0-9]+)$/i);
        if (listMatch) {
          setPublicListSlug(listMatch[1]);
          setSelected(null);
        } else {
          setPublicListSlug(null);
          const id = window.location.pathname.slice(1);
          setSelected(id ? (musicians.find((m) => m.id === id) ?? null) : null);
        }
      };
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }, [musicians]);

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
               window.history.pushState(null, '', '/');
             }}
           />
         )}
          {!publicListSlug && (
            <>
               {view === 'influence' ? (
                 <InfluenceView key="influence" musicians={musicians} onSelect={handleSelect} selectedId={selected?.id ?? null} styleFilter={styleFilter} onStyleFilterChange={setStyleFilter} forceZoomToId={forceZoomToId} onZoomComplete={() => setForceZoomToId(null)} onFilteredMusiciansChange={setFilteredMusicians} theme={theme} isMobile={isMobile} />
               ) : (
                 <MapView key="map" musicians={musicians} onSelect={handleSelect} selectedId={selected?.id ?? null} styleFilter={styleFilter} onStyleFilterChange={setStyleFilter} theme={theme} isMobile={isMobile} />
               )}
            </>
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
            videoMusician={videoMusician}
            manualVideoUrl={manualVideoUrl}
            autoplay={autoplay}
            onVideoClose={() => setShowPlayer(false)}
            isMobile={isMobile}
            bottomInset={isMobile ? 72 : 0}
          />
        )}

       {!isMobile && videoMusician && showPlayer && !editMode && (
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
             autoplay={autoplay}
           />
         </div>
       )}

      {showCredits && (
        <CreditsPage onClose={() => setShowCredits(false)} />
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
