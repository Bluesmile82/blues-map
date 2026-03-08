import { useState, useCallback } from 'react';
import NavBar from './components/NavBar';
import InfluenceView from './components/InfluenceView';
import MapView from './components/MapView';
import MusicianPanel from './components/MusicianPanel';
import EditPanel from './components/EditPanel';
import FloatingVideoPlayer from './components/FloatingVideoPlayer';
import type { Musician } from './types';
import musiciansData from './data/musicians.json';

const STORAGE_KEY = 'blues-genealogy-musicians';

function getStoredMusicians(): Musician[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error reading from localStorage:', e);
  }
  return musiciansData as unknown as Musician[];
}

function saveMusiciansToStorage(musicians: Musician[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(musicians));
  } catch (e) {
    console.error('Error saving to localStorage:', e);
  }
}

export default function App() {
  const [musicians, setMusicians] = useState<Musician[]>(() => getStoredMusicians());
  const [view, setView] = useState<'influence' | 'map'>('influence');
  const [selected, setSelected] = useState<Musician | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [manualVideoUrl, setManualVideoUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState<Musician | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleSelect = useCallback((musician: Musician) => {
    if (editMode) {
      setEditing(musician);
    } else {
      setSelected(musician);
      setShowPlayer(true);
      setManualVideoUrl(null);
    }
  }, [editMode]);

  const handleClose = useCallback(() => setSelected(null), []);

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
    saveMusiciansToStorage(newMusicians);

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
    const newMusicians = musicians.filter(m => m.id !== musicianId);
    setMusicians(newMusicians);
    saveMusiciansToStorage(newMusicians);
    setEditing(null);
    setSelected(null);
  }, [musicians]);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      <NavBar
        view={view}
        onViewChange={setView}
        editMode={editMode}
        onEditModeChange={setEditMode}
        onCreateNew={handleCreateNew}
      />

      <main className="relative flex-1 mt-14 overflow-hidden">
        {view === 'influence' ? (
          <InfluenceView key="influence" musicians={musicians} onSelect={handleSelect} selectedId={selected?.id ?? null} />
        ) : (
          <MapView key="map" musicians={musicians} onSelect={handleSelect} selectedId={selected?.id ?? null} />
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
          onPlayVideo={(url) => { setManualVideoUrl(url); setShowPlayer(true); }}
        />
      )}

      {selected && selected.youtubeLink && showPlayer && !editMode && (
        <FloatingVideoPlayer
          key={selected.id}
          youtubeUrl={selected.youtubeLink}
          albums={selected.albums}
          musicianName={selected.name}
          manualVideoUrl={manualVideoUrl}
          onClose={() => setShowPlayer(false)}
        />
      )}

      {editing && (
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

      {isCreating && (
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
