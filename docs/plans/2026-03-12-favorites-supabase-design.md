# Favorites & Lists Feature - Design Document

**Date:** 2026-03-12  
**Status:** Approved

## Overview

Add user authentication and favorites/lists functionality using Supabase, deployed on Netlify with zero server costs.

## Requirements

- **Authentication:** Google OAuth + Email/Password
- **Default list:** Every user gets one "Favorites" list (auto-created on first sign-in)
- **Custom lists:** Users can create up to 20 named lists
- **Favorites limit:** 500 musicians per list
- **Sharing:** Lists can be made public with shareable links
- **Anonymous users:** Must sign in to use favorites

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Netlify                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Vite React App                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │  │
│  │  │ Jotai Atoms │  │   Hooks     │  │ UI Comps  │  │  │
│  │  └──────┬──────┘  └──────┬──────┘  └───────────┘  │  │
│  └─────────┼────────────────┼────────────────────────┘  │
└────────────┼────────────────┼───────────────────────────┘
             │                │
             ▼                ▼
┌─────────────────────────────────────────────────────────┐
│                    Supabase                             │
│  ┌─────────────────┐  ┌──────────────────────────────┐  │
│  │   Auth          │  │   PostgreSQL                 │  │
│  │  - Google OAuth │  │  - lists table               │  │
│  │  - Email/Pass   │  │  - favorites table           │  │
│  └─────────────────┘  │  - RLS policies              │  │
│                       └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

No Netlify Functions required - Supabase client talks directly to DB with Row-Level Security.

## Database Schema

```sql
-- Lists table
CREATE TABLE lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  is_public BOOLEAN DEFAULT FALSE,
  share_slug TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Favorites table
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID REFERENCES lists(id) ON DELETE CASCADE,
  musician_id TEXT NOT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, musician_id)
);

-- Indexes
CREATE INDEX idx_lists_user_id ON lists(user_id);
CREATE INDEX idx_lists_share_slug ON lists(share_slug);
CREATE INDEX idx_favorites_list_id ON favorites(list_id);
CREATE INDEX idx_favorites_musician_id ON favorites(musician_id);
```

## Row-Level Security Policies

```sql
-- Enable RLS
ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Lists: Users can view own lists
CREATE POLICY "Users can view own lists"
  ON lists FOR SELECT
  USING (auth.uid() = user_id);

-- Lists: Anyone can view public lists
CREATE POLICY "Anyone can view public lists"
  ON lists FOR SELECT
  USING (is_public = TRUE);

-- Lists: Users can create own lists (max 20, rate limited)
CREATE POLICY "Users can create own lists"
  ON lists FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (SELECT COUNT(*) FROM lists WHERE user_id = auth.uid()) < 20
    AND (
      SELECT COUNT(*) FROM lists 
      WHERE user_id = auth.uid() 
      AND created_at > NOW() - INTERVAL '1 minute'
    ) < 5
  );

-- Lists: Users can update own lists
CREATE POLICY "Users can update own lists"
  ON lists FOR UPDATE
  USING (auth.uid() = user_id);

-- Lists: Users can delete own non-default lists
CREATE POLICY "Users can delete own lists"
  ON lists FOR DELETE
  USING (auth.uid() = user_id AND is_default = FALSE);

-- Favorites: Users can view favorites in own lists
CREATE POLICY "Users can view favorites in own lists"
  ON favorites FOR SELECT
  USING (list_id IN (SELECT id FROM lists WHERE user_id = auth.uid()));

-- Favorites: Anyone can view favorites in public lists
CREATE POLICY "Anyone can view favorites in public lists"
  ON favorites FOR SELECT
  USING (list_id IN (SELECT id FROM lists WHERE is_public = TRUE));

-- Favorites: Users can add to own lists (max 500 per list)
CREATE POLICY "Users can add to own lists"
  ON favorites FOR INSERT
  WITH CHECK (
    list_id IN (SELECT id FROM lists WHERE user_id = auth.uid())
    AND (SELECT COUNT(*) FROM favorites f WHERE f.list_id = favorites.list_id) < 500
  );

-- Favorites: Users can remove from own lists
CREATE POLICY "Users can remove from own lists"
  ON favorites FOR DELETE
  USING (list_id IN (SELECT id FROM lists WHERE user_id = auth.uid()));
```

## State Management (Jotai)

```tsx
// src/atoms/auth.ts
export const userAtom = atom<User | null>(null)
export const authLoadingAtom = atom(true)

// src/atoms/lists.ts
export const listsAtom = atom<List[]>([])
export const currentListIdAtom = atom<string | null>(null)
export const defaultListAtom = atom((get) => 
  get(listsAtom).find(l => l.is_default)
)
export const favoritesMapAtom = atom<Map<string, Set<string>>>(new Map())
export const musicianInAnyListAtom = atom((get) => 
  (musicianId: string) => {
    const map = get(favoritesMapAtom)
    return [...map.values()].some(set => set.has(musicianId))
  }
)
```

## UI Components

### New Components

| Component | Purpose |
|-----------|---------|
| `AuthButton` | Sign in/out button in NavBar |
| `AuthModal` | Google + Email sign-in form |
| `ListsDropdown` | Select which list to add favorites to |
| `ListsManager` | Create/rename/delete/share lists |
| `PublicListView` | View shared list (no auth required) |

### Modified Components

| Component | Changes |
|-----------|---------|
| `NavBar` | Add AuthButton |
| `MusicianPanel` | Add heart + "Add to list" buttons |
| `InfluenceView` | Heart icon shows filled if in any list |
| `MapView` | Heart icon shows filled if in any list |

### MusicianPanel Layout

```
┌─────────────────────────────────────┐
│  Muddy Waters                    X  │
│  ─────────────────────────────────  │
│  [Photo]                            │
│                                     │
│  Chicago Blues • Guitar             │
│  1913-1983                          │
│                                     │
│  ♥ Favorite    📁 Add to list       │
│                                     │
│  Description...                     │
└─────────────────────────────────────┘
```

- **Heart** - Quick toggle for default "Favorites" list
- **"Add to list"** - Opens dropdown with all lists + checkboxes

## Routes

| Route | Component | Auth Required |
|-------|-----------|---------------|
| `/list/:slug` | `PublicListView` | No |
| `/*` | Existing app | No (favorites require auth) |

## File Structure

```
src/
├── lib/
│   └── supabase.ts
├── atoms/
│   ├── auth.ts
│   └── lists.ts
├── hooks/
│   ├── useAuth.ts
│   └── useLists.ts
├── components/
│   ├── auth/
│   │   ├── AuthButton.tsx
│   │   └── AuthModal.tsx
│   ├── lists/
│   │   ├── ListsDropdown.tsx
│   │   ├── ListsManager.tsx
│   │   └── PublicListView.tsx
```

## Dependencies

```json
{
  "@supabase/supabase-js": "^2.x",
  "jotai": "^2.x"
}
```

## Environment Variables

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
```

## Manual Setup Steps

1. Create Supabase project at supabase.com
2. Enable Google OAuth provider in Auth settings
3. Enable Email provider in Auth settings
4. Run SQL schema + RLS policies in SQL editor
5. Copy project URL and anon key to `.env` files
6. Configure OAuth redirect URLs in Supabase dashboard

## Spam Prevention

- Max 20 lists per user (enforced via RLS)
- Max 500 favorites per list (enforced via RLS)
- Max 5 list creations per minute (enforced via RLS)
- Client-side debounce on favorite toggles
- Supabase built-in rate limiting on API

## Cost

$0/month on free tiers:
- Supabase: 50K MAU, 500MB database
- Netlify: Static hosting + 125K function invocations (not needed)
