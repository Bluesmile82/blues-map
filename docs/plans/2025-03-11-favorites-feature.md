# Favorites Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a favorites system for musicians that only runs in local development, allowing users to mark musicians as favorites and filter to view only their favorite blues musicians.

**Architecture:** Client-side state management with server-side persistence. Favorites stored in `data/favourites.json` on the server, accessed via REST API endpoints. All UI components wrapped in `EDIT_MODE_ENABLED` checks to hide in production. Star icon on MusicianPanel toggles favorite status, checkbox in InfluenceView filters to show only favorites.

**Tech Stack:** React (hooks: useState, useEffect), TypeScript, Express (server), Vite env variables

---

### Task 1: Create favorites data file

**Files:**
- Create: `data/favourites.json`

**Step 1: Create the favorites JSON file**

```bash
cat > data/favourites.json << 'EOF'
{
  "favorites": []
}
EOF
```

**Step 2: Verify file was created**

Run: `cat data/favourites.json`
Expected: Shows `{"favorites": []}`

**Step 3: Commit**

```bash
git add data/favourites.json
git commit -m "feat: add favorites data file"
```

---

### Task 2: Add server API endpoints for favorites

**Files:**
- Modify: `server/server.js`

**Step 1: Read the server file to understand structure**

Run: `head -50 server/server.js`
Note: Look for existing API endpoints and Express app setup

**Step 2: Add favorites endpoints to server**

Insert after the existing musicians API endpoints (look for `/api/musicians` routes):

```javascript
// Favorites API endpoints (dev only)
if (process.env.VITE_ENABLE_EDIT_MODE === 'true') {
  const fs = require('fs').promises;
  const FAVORITES_PATH = path.join(__dirname, '../data/favourites.json');

  // Helper to read favorites
  async function getFavorites() {
    try {
      const data = await fs.readFile(FAVORITES_PATH, 'utf8');
      return JSON.parse(data).favorites || [];
    } catch (error) {
      console.error('Error reading favorites:', error);
      return [];
    }
  }

  // Helper to write favorites
  async function saveFavorites(favorites) {
    await fs.writeFile(FAVORITES_PATH, JSON.stringify({ favorites }, null, 2));
  }

  // GET /api/favorites - Get all favorite musician IDs
  app.get('/api/favorites', async (req, res) => {
    try {
      const favorites = await getFavorites();
      res.json({ favorites });
    } catch (error) {
      res.status(500).json({ error: 'Failed to read favorites' });
    }
  });

  // POST /api/favorites - Add a musician to favorites
  app.post('/api/favorites', async (req, res) => {
    try {
      const { musicianId } = req.body;
      if (!musicianId) {
        return res.status(400).json({ error: 'musicianId is required' });
      }
      const favorites = await getFavorites();
      if (!favorites.includes(musicianId)) {
        favorites.push(musicianId);
        await saveFavorites(favorites);
      }
      res.json({ favorites });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add favorite' });
    }
  });

  // DELETE /api/favorites/:id - Remove a musician from favorites
  app.delete('/api/favorites/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let favorites = await getFavorites();
      favorites = favorites.filter(fav => fav !== id);
      await saveFavorites(favorites);
      res.json({ favorites });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove favorite' });
    }
  });

  console.log('✓ Favorites API endpoints enabled (dev mode)');
}
```

**Step 3: Restart the server to verify endpoints load**

Run: `npm run server`
Expected: Server starts and shows "✓ Favorites API endpoints enabled (dev mode)"

**Step 4: Test the endpoints manually**

Run (in another terminal):
```bash
# Test GET
curl http://localhost:3000/api/favorites

# Test POST
curl -X POST http://localhost:3000/api/favorites -H "Content-Type: application/json" -d '{"musicianId":"test-id"}'

# Test DELETE
curl -X DELETE http://localhost:3000/api/favorites/test-id
```
Expected: All return JSON with favorites array

**Step 5: Commit**

```bash
git add server/server.js
git commit -m "feat: add favorites API endpoints (dev only)"
```

---

### Task 3: Add favorites state and API calls to App.tsx

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add favorites state and fetch logic**

Add after line 31 (after `showCredits` state):

```typescript
const [favorites, setFavorites] = useState<Set<string>>(new Set());
```

**Step 2: Add useEffect to fetch favorites on mount**

Add after line 45 (after the popstate effect):

```typescript
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
```

**Step 3: Add toggle favorite function**

Add after line 102 (after handleDelete):

```typescript
const handleToggleFavorite = useCallback(async (musicianId: string) => {
  if (!EDIT_MODE_ENABLED) return;

  const isFavorited = favorites.has(musicianId);
  const method = isFavorited ? 'DELETE' : 'POST';

  try {
    const url = isFavorited
      ? `/api/favorites/${musicianId}`
      : '/api/favorites';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: isFavorited ? undefined : JSON.stringify({ musicianId }),
    });

    if (res.ok) {
      const data = await res.json();
      setFavorites(new Set(data.favorites || []));
    }
  } catch (error) {
    console.error('Failed to toggle favorite:', error);
  }
}, [favorites]);
```

**Step 4: Pass favorites and toggle function to components**

Update the InfluenceView and MusicianPanel renders (around line 180-200):

Find InfluenceView render and add:
```typescript
<InfluenceView
  musicians={musicians}
  onSelect={handleSelect}
  selectedId={selected?.id ?? null}
  styleFilter={styleFilter}
  onStyleFilterChange={setStyleFilter}
  favorites={favorites}
  onToggleFavorite={handleToggleFavorite}
/>
```

Find MusicianPanel render and add:
```typescript
<MusicianPanel
  musician={selected}
  musicians={musicians}
  onClose={handleClose}
  onNavigate={handleSelect}
  editMode={editMode}
  onEdit={handleEdit}
  onPlayVideo={(url) => {
    setManualVideoUrl(url);
    setShowPlayer(true);
    setVideoMusician(selected);
  }}
  isFavorited={selected ? favorites.has(selected.id) : false}
  onToggleFavorite={() => selected && handleToggleFavorite(selected.id)}
/>
```

**Step 5: Update InfluenceView props type**

The props will be inferred, but if you see type errors, the component should accept:
```typescript
{
  musicians: Musician[];
  onSelect: (m: Musician) => void;
  selectedId: string | null;
  styleFilter: string | null;
  onStyleFilterChange: (style: string | null) => void;
  favorites?: Set<string>;
  onToggleFavorite?: (id: string) => void;
}
```

**Step 6: Test the integration**

Run: `npm run dev`
Expected: App loads, check browser console for no errors

**Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add favorites state and API integration"
```

---

### Task 4: Add star icon to MusicianPanel

**Files:**
- Modify: `src/components/MusicianPanel.tsx`

**Step 1: Update MusicianPanel props interface**

Add these props to the interface (line 6-14):

```typescript
interface MusicianPanelProps {
  musician: Musician;
  musicians: Musician[];
  onClose: () => void;
  onNavigate: (musician: Musician) => void;
  editMode: boolean;
  onEdit: () => void;
  onPlayVideo: (url: string) => void;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
}
```

**Step 2: Update function signature to destructure new props**

Update line 16:

```typescript
export default function MusicianPanel({ musician, musicians, onClose, onNavigate, editMode, onEdit, onPlayVideo, isFavorited = false, onToggleFavorite }: MusicianPanelProps) {
```

**Step 3: Add star icon button in the header**

Add after the Edit button (around line 141), inside the `editMode &&` block or after it:

```typescript
{editMode && onToggleFavorite && import.meta.env.VITE_ENABLE_EDIT_MODE === 'true' && (
  <button
    onClick={onToggleFavorite}
    className={`mt-2 inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium border transition-all ${
      isFavorited
        ? 'bg-accent/20 border-accent text-accent'
        : 'bg-bg border-[#2a1e0e] text-ink3 hover:text-ink hover:border-accent/60'
    }`}
  >
    <svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorited ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
    {isFavorited ? 'Favorited' : 'Add to Favorites'}
  </button>
)}
```

**Step 4: Test the star button**

Run: `npm run dev`
Open a musician panel, click the star button
Expected: Button toggles between filled/unfilled states

**Step 5: Commit**

```bash
git add src/components/MusicianPanel.tsx
git commit -m "feat: add favorite star toggle to MusicianPanel"
```

---

### Task 5: Add favorites filter checkbox to InfluenceView

**Files:**
- Modify: `src/components/InfluenceView.tsx`

**Step 1: Add filter state and props**

Add to props interface (line 38-43):

```typescript
favorites?: Set<string>;
onToggleFavorite?: (id: string) => void;
```

Add state after line 56:

```typescript
const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
```

**Step 2: Update completeMusicians filter to include favorites**

Modify the `completeMusicians` useMemo (around line 68-79) to add favorites filter:

```typescript
const completeMusicians = useMemo(() => {
  const valid = musicians.filter((m) =>
    m.name && m.bluesStyle && m.instrument && m.description && m.birthPlace && m.activeFrom
  );
  const styleFiltered = styleFilter ? valid.filter((m) => m.bluesStyle === styleFilter) : valid;

  const yearFiltered = yearRange
    ? styleFiltered.filter((m) => {
        const y = parseInt(m.activeFrom);
        return y >= yearRange[0] && y <= yearRange[1];
      })
    : styleFiltered;

  // Favorites filter (dev only)
  const favoritesFiltered = showFavoritesOnly && favorites && favorites.size > 0
    ? yearFiltered.filter((m) => favorites.has(m.id))
    : yearFiltered;

  return favoritesFiltered;
}, [musicians, styleFilter, yearRange, showFavoritesOnly, favorites]);
```

**Step 3: Add checkbox in left filter panel**

Add after line 676 (after the text filter result count), inside the left panel div:

```typescript
{import.meta.env.VITE_ENABLE_EDIT_MODE === 'true' && (
  <label className="flex items-center gap-2 px-0.5 py-2 cursor-pointer hover:bg-[#1a1208] rounded transition-colors">
    <input
      type="checkbox"
      checked={showFavoritesOnly}
      onChange={(e) => setShowFavoritesOnly(e.target.checked)}
      className="w-4 h-4 rounded border-[#2a1e0e] bg-[#0f0c07] text-accent focus:ring-accent focus:ring-offset-0"
    />
    <span className="text-[0.7rem] text-ink3">Show favorites only</span>
    {favorites && favorites.size > 0 && (
      <span className="text-[0.65rem] text-accent">({favorites.size})</span>
    )}
  </label>
)}
```

**Step 4: Test the filter**

Run: `npm run dev`
1. Add some favorites via MusicianPanel
2. Check "Show favorites only" checkbox
Expected: Only favorited musicians shown in visualization

**Step 5: Commit**

```bash
git add src/components/InfluenceView.tsx
git commit -m "feat: add favorites filter checkbox to InfluenceView"
```

---

### Task 6: Add star indicators to search results

**Files:**
- Modify: `src/components/InfluenceView.tsx`

**Step 1: Update search results to show favorite status**

Modify the search results map (around line 656-665) to add star icon:

```typescript
{searchMatches.length > 0 && (
  <div className="absolute top-full mt-1 left-0 right-0 bg-[#0f0c07] border border-[#2a1e0e] rounded-lg overflow-hidden shadow-xl z-50 max-h-60 overflow-y-auto">
    {searchMatches.map((m) => {
      const hex = getStyleHex(m.bluesStyle);
      const isFav = favorites?.has(m.id);
      return (
        <button
          key={m.id}
          onClick={() => goToMusician(m)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1a1208] transition-colors group"
        >
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: hex }} />
          <span className="text-[0.8rem] text-ink flex-1 truncate">{m.name}</span>
          <span className="text-[0.65rem] shrink-0" style={{ color: hex }}>{m.bluesStyle.replace(' Blues', '')}</span>
          {import.meta.env.VITE_ENABLE_EDIT_MODE === 'true' && (
            <svg
              className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              viewBox="0 0 24 24"
              fill={isFav ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              style={{ color: isFav ? '#c8872a' : '#6b5c4a' }}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite?.(m.id);
              }}
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          )}
        </button>
      );
    })}
  </div>
)}
```

**Step 2: Test the search results stars**

Run: `npm run dev`
1. Search for a musician
2. Hover over the result
Expected: Star icon appears on hover, click to toggle favorite

**Step 3: Commit**

```bash
git add src/components/InfluenceView.tsx
git commit -m "feat: add favorite stars to search results"
```

---

### Task 7: Run lint and typecheck

**Step 1: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 2: Run typecheck (if available)**

Check package.json for typecheck script:
Run: `cat package.json | grep typecheck`
If exists, run: `npm run typecheck`

**Step 3: Fix any issues**

If there are any errors, fix them and run again.

**Step 4: Commit**

```bash
git add .
git commit -m "fix: lint and typecheck issues"
```

---

### Task 8: Manual testing checklist

**Step 1: Test in development mode**

Run: `npm run dev:server`

Test checklist:
- [ ] Open musician panel, click star button - toggles favorite status
- [ ] Star button shows correct state (filled/unfilled)
- [ ] Check "Show favorites only" - only favorited musicians shown
- [ ] Uncheck filter - all musicians shown
- [ ] Search for musician, hover result - star appears
- [ ] Click star in search - toggles favorite
- [ ] Refresh page - favorites persist
- [ ] Check data/favourites.json - contains added IDs

**Step 2: Verify production behavior**

Build production version:
Run: `npm run build`
Run: `npm run preview`

Verify:
- [ ] No star icon in MusicianPanel
- [ ] No checkbox in InfluenceView
- [ ] No stars in search results
- [ ] No favorites API calls in browser console

**Step 3: Commit any fixes**

```bash
git add .
git commit -m "fix: manual testing fixes"
```

---

### Task 9: Update documentation (optional)

**Step 1: Create feature documentation**

Create: `docs/favorites-feature.md`

```markdown
# Favorites Feature

## Overview
The favorites feature allows marking musicians as favorites in local development mode.

## Usage

### Adding to Favorites
1. Open a musician's info panel
2. Click the "Add to Favorites" button (star icon)
3. The button changes to "Favorited" with filled star

### Filtering by Favorites
1. In the Influence view left panel, check "Show favorites only"
2. Only favorited musicians will be displayed
3. Uncheck to show all musicians

### Managing in Search
1. Search for any musician
2. Hover over the search result
3. Click the star icon to toggle favorite status

## Technical Details

- **Storage**: `data/favourites.json`
- **API**: `/api/favorites` (GET, POST, DELETE)
- **Environment**: Only enabled when `VITE_ENABLE_EDIT_MODE=true`
- **State**: Managed in App.tsx, passed to components via props

## Files Modified
- `server/server.js` - API endpoints
- `src/App.tsx` - State management
- `src/components/MusicianPanel.tsx` - Star toggle button
- `src/components/InfluenceView.tsx` - Filter checkbox and search stars
```

**Step 2: Commit**

```bash
git add docs/favorites-feature.md
git commit -m "docs: add favorites feature documentation"
```

---

## Final Verification

**Step 1: Run all tests**

Run: `npm run lint`
Run: `npm run build`

**Step 2: Check git history**

Run: `git log --oneline -10`
Expected: Series of focused commits implementing the feature

**Step 3: Final commit**

```bash
git add .
git commit -m "feat: complete favorites feature implementation"
```
