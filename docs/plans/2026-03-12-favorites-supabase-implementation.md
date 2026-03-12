# Favorites & Lists Feature - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add user authentication (Google + Email) and favorites/lists functionality using Supabase.

**Architecture:** Vite React app connects directly to Supabase for auth and database operations. State managed with Jotai atoms. Row-Level Security enforces permissions at database level.

**Tech Stack:** Supabase (Auth + PostgreSQL), Jotai, TypeScript, React

**Design Doc:** `docs/plans/2026-03-12-favorites-supabase-design.md`

---

## Phase 1: Setup & Infrastructure

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install Supabase and Jotai**

```bash
npm install @supabase/supabase-js jotai
```

**Step 2: Verify installation**

Run: `npm ls @supabase/supabase-js jotai`
Expected: Both packages listed

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add supabase and jotai dependencies"
```

---

### Task 2: Create Supabase Client

**Files:**
- Create: `src/lib/supabase.ts`
- Modify: `.env.development`
- Modify: `.env.production`

**Step 1: Create Supabase client file**

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

**Step 2: Add placeholder env vars to .env.development**

Add to `.env.development`:
```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Step 3: Add placeholder env vars to .env.production**

Add to `.env.production`:
```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Step 4: Update .gitignore if needed**

Verify `.env.development` and `.env.production` are in `.gitignore`.

**Step 5: Commit**

```bash
git add src/lib/supabase.ts .gitignore
git commit -m "feat: add supabase client configuration"
```

---

### Task 3: Create Database Types

**Files:**
- Create: `src/types/database.ts`

**Step 1: Create database types file**

```typescript
// src/types/database.ts
export interface DbList {
  id: string
  user_id: string
  name: string
  is_default: boolean
  is_public: boolean
  share_slug: string | null
  created_at: string
  updated_at: string
}

export interface DbFavorite {
  id: string
  list_id: string
  musician_id: string
  added_at: string
}

// Frontend-friendly types
export interface List {
  id: string
  userId: string
  name: string
  isDefault: boolean
  isPublic: boolean
  shareSlug: string | null
  createdAt: Date
  updatedAt: Date
}

export interface Favorite {
  id: string
  listId: string
  musicianId: string
  addedAt: Date
}

// Converters
export function dbListToList(db: DbList): List {
  return {
    id: db.id,
    userId: db.user_id,
    name: db.name,
    isDefault: db.is_default,
    isPublic: db.is_public,
    shareSlug: db.share_slug,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  }
}

export function dbFavoriteToFavorite(db: DbFavorite): Favorite {
  return {
    id: db.id,
    listId: db.list_id,
    musicianId: db.musician_id,
    addedAt: new Date(db.added_at),
  }
}
```

**Step 2: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add database types for lists and favorites"
```

---

## Phase 2: Authentication

### Task 4: Create Auth Atoms

**Files:**
- Create: `src/atoms/auth.ts`

**Step 1: Create auth atoms file**

```typescript
// src/atoms/auth.ts
import { atom } from 'jotai'
import type { User } from '@supabase/supabase-js'

export const userAtom = atom<User | null>(null)
export const authLoadingAtom = atom(true)
export const authErrorAtom = atom<string | null>(null)
```

**Step 2: Commit**

```bash
git add src/atoms/auth.ts
git commit -m "feat: add auth jotai atoms"
```

---

### Task 5: Create useAuth Hook

**Files:**
- Create: `src/hooks/useAuth.ts`

**Step 1: Create useAuth hook**

```typescript
// src/hooks/useAuth.ts
import { useEffect, useCallback } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { supabase } from '../lib/supabase'
import { userAtom, authLoadingAtom, authErrorAtom } from '../atoms/auth'

export function useAuth() {
  const [user, setUser] = useAtom(userAtom)
  const [loading, setLoading] = useAtom(authLoadingAtom)
  const setError = useSetAtom(authErrorAtom)

  // Initialize auth state
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [setUser, setLoading])

  const signInWithGoogle = useCallback(async () => {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
    if (error) setError(error.message)
  }, [setError])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) setError(error.message)
  }, [setError])

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    setError(null)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })
    if (error) setError(error.message)
  }, [setError])

  const signOut = useCallback(async () => {
    setError(null)
    const { error } = await supabase.auth.signOut()
    if (error) setError(error.message)
  }, [setError])

  return {
    user,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  }
}
```

**Step 2: Commit**

```bash
git add src/hooks/useAuth.ts
git commit -m "feat: add useAuth hook with Google and email auth"
```

---

### Task 6: Create AuthButton Component

**Files:**
- Create: `src/components/auth/AuthButton.tsx`

**Step 1: Create AuthButton component**

```typescript
// src/components/auth/AuthButton.tsx
import { useState } from 'react'
import { useAtomValue } from 'jotai'
import { userAtom, authLoadingAtom } from '../../atoms/auth'
import { useAuth } from '../../hooks/useAuth'
import AuthModal from './AuthModal'

export default function AuthButton() {
  const user = useAtomValue(userAtom)
  const loading = useAtomValue(authLoadingAtom)
  const { signOut } = useAuth()
  const [showModal, setShowModal] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  if (loading) {
    return (
      <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
    )
  }

  if (user) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-amber-600 flex items-center justify-center text-sm font-medium">
            {user.email?.[0].toUpperCase() ?? '?'}
          </div>
        </button>
        
        {showMenu && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setShowMenu(false)} 
            />
            <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-800 rounded-lg shadow-xl border border-white/10 z-50 py-1">
              <div className="px-3 py-2 text-sm text-zinc-400 border-b border-white/10 truncate">
                {user.email}
              </div>
              <button
                onClick={() => {
                  signOut()
                  setShowMenu(false)
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition-colors"
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 transition-colors text-sm font-medium"
      >
        Sign in
      </button>
      
      {showModal && <AuthModal onClose={() => setShowModal(false)} />}
    </>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/auth/AuthButton.tsx
git commit -m "feat: add AuthButton component"
```

---

### Task 7: Create AuthModal Component

**Files:**
- Create: `src/components/auth/AuthModal.tsx`

**Step 1: Create AuthModal component**

```typescript
// src/components/auth/AuthModal.tsx
import { useState } from 'react'
import { useAtomValue } from 'jotai'
import { authErrorAtom } from '../../atoms/auth'
import { useAuth } from '../../hooks/useAuth'

interface AuthModalProps {
  onClose: () => void
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const error = useAtomValue(authErrorAtom)
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    
    if (mode === 'signin') {
      await signInWithEmail(email, password)
    } else {
      await signUpWithEmail(email, password)
    }
    
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div 
        className="absolute inset-0" 
        onClick={onClose} 
      />
      
      <div className="relative w-full max-w-sm mx-4 bg-zinc-900 rounded-xl shadow-2xl border border-white/10">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-lg hover:bg-white/10 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-6">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </h2>
          
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-100 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
          
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-sm text-zinc-500">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 focus:border-amber-500 focus:outline-none transition-colors"
              />
            </div>
            
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 focus:border-amber-500 focus:outline-none transition-colors"
              />
            </div>
            
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}
            
            <button
              type="submit"
              disabled={submitting}
              className="w-full px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {submitting ? 'Loading...' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          
          <p className="mt-4 text-sm text-center text-zinc-400">
            {mode === 'signin' ? (
              <>
                Don't have an account?{' '}
                <button
                  onClick={() => setMode('signup')}
                  className="text-amber-500 hover:text-amber-400"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => setMode('signin')}
                  className="text-amber-500 hover:text-amber-400"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/auth/AuthModal.tsx
git commit -m "feat: add AuthModal component with Google and email auth"
```

---

### Task 8: Add AuthButton to NavBar

**Files:**
- Modify: `src/components/NavBar.tsx`

**Step 1: Read current NavBar**

Read `src/components/NavBar.tsx` to understand current structure.

**Step 2: Import and add AuthButton**

Add import at top:
```typescript
import AuthButton from './auth/AuthButton'
```

Add `<AuthButton />` in the NavBar, typically in the right section alongside other controls.

**Step 3: Commit**

```bash
git add src/components/NavBar.tsx
git commit -m "feat: add AuthButton to NavBar"
```

---

## Phase 3: Lists & Favorites State

### Task 9: Create Lists Atoms

**Files:**
- Create: `src/atoms/lists.ts`

**Step 1: Create lists atoms file**

```typescript
// src/atoms/lists.ts
import { atom } from 'jotai'
import type { List } from '../types/database'

// Core state
export const listsAtom = atom<List[]>([])
export const listsLoadingAtom = atom(true)
export const currentListIdAtom = atom<string | null>(null)

// Map of listId -> Set of musicianIds
export const favoritesMapAtom = atom<Map<string, Set<string>>>(new Map())

// Derived: get default list
export const defaultListAtom = atom((get) => {
  const lists = get(listsAtom)
  return lists.find((l) => l.isDefault) ?? null
})

// Derived: check if musician is in any list
export const isMusicianFavoritedAtom = atom((get) => {
  const favoritesMap = get(favoritesMapAtom)
  return (musicianId: string): boolean => {
    for (const favorites of favoritesMap.values()) {
      if (favorites.has(musicianId)) return true
    }
    return false
  }
})

// Derived: check if musician is in specific list
export const isMusicianInListAtom = atom((get) => {
  const favoritesMap = get(favoritesMapAtom)
  return (listId: string, musicianId: string): boolean => {
    return favoritesMap.get(listId)?.has(musicianId) ?? false
  }
})

// Derived: get all lists containing a musician
export const listsContainingMusicianAtom = atom((get) => {
  const lists = get(listsAtom)
  const favoritesMap = get(favoritesMapAtom)
  return (musicianId: string): List[] => {
    return lists.filter((list) => favoritesMap.get(list.id)?.has(musicianId))
  }
})
```

**Step 2: Commit**

```bash
git add src/atoms/lists.ts
git commit -m "feat: add lists and favorites jotai atoms"
```

---

### Task 10: Create useLists Hook

**Files:**
- Create: `src/hooks/useLists.ts`

**Step 1: Create useLists hook**

```typescript
// src/hooks/useLists.ts
import { useEffect, useCallback } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { supabase } from '../lib/supabase'
import { userAtom } from '../atoms/auth'
import {
  listsAtom,
  listsLoadingAtom,
  favoritesMapAtom,
  defaultListAtom,
} from '../atoms/lists'
import { dbListToList, dbFavoriteToFavorite } from '../types/database'
import type { DbList, DbFavorite } from '../types/database'

function generateSlug(): string {
  return Math.random().toString(36).substring(2, 10)
}

export function useLists() {
  const user = useAtomValue(userAtom)
  const [lists, setLists] = useAtom(listsAtom)
  const [loading, setLoading] = useAtom(listsLoadingAtom)
  const setFavoritesMap = useSetAtom(favoritesMapAtom)
  const defaultList = useAtomValue(defaultListAtom)

  // Fetch lists and favorites when user changes
  useEffect(() => {
    if (!user) {
      setLists([])
      setFavoritesMap(new Map())
      setLoading(false)
      return
    }

    async function fetchData() {
      setLoading(true)

      // Fetch user's lists
      const { data: listsData, error: listsError } = await supabase
        .from('lists')
        .select('*')
        .eq('user_id', user!.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })

      if (listsError) {
        console.error('Error fetching lists:', listsError)
        setLoading(false)
        return
      }

      let userLists = (listsData as DbList[]).map(dbListToList)

      // Create default list if it doesn't exist
      if (!userLists.some((l) => l.isDefault)) {
        const { data: newList, error: createError } = await supabase
          .from('lists')
          .insert({
            user_id: user!.id,
            name: 'Favorites',
            is_default: true,
            is_public: false,
          })
          .select()
          .single()

        if (createError) {
          console.error('Error creating default list:', createError)
        } else {
          userLists = [dbListToList(newList as DbList), ...userLists]
        }
      }

      setLists(userLists)

      // Fetch all favorites for user's lists
      const listIds = userLists.map((l) => l.id)
      if (listIds.length > 0) {
        const { data: favoritesData, error: favoritesError } = await supabase
          .from('favorites')
          .select('*')
          .in('list_id', listIds)

        if (favoritesError) {
          console.error('Error fetching favorites:', favoritesError)
        } else {
          const newMap = new Map<string, Set<string>>()
          for (const fav of favoritesData as DbFavorite[]) {
            if (!newMap.has(fav.list_id)) {
              newMap.set(fav.list_id, new Set())
            }
            newMap.get(fav.list_id)!.add(fav.musician_id)
          }
          setFavoritesMap(newMap)
        }
      }

      setLoading(false)
    }

    fetchData()
  }, [user, setLists, setFavoritesMap, setLoading])

  const createList = useCallback(
    async (name: string) => {
      if (!user) return null

      const { data, error } = await supabase
        .from('lists')
        .insert({
          user_id: user.id,
          name,
          is_default: false,
          is_public: false,
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating list:', error)
        return null
      }

      const newList = dbListToList(data as DbList)
      setLists((prev) => [...prev, newList])
      return newList
    },
    [user, setLists]
  )

  const renameList = useCallback(
    async (listId: string, name: string) => {
      const { error } = await supabase
        .from('lists')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', listId)

      if (error) {
        console.error('Error renaming list:', error)
        return false
      }

      setLists((prev) =>
        prev.map((l) => (l.id === listId ? { ...l, name, updatedAt: new Date() } : l))
      )
      return true
    },
    [setLists]
  )

  const deleteList = useCallback(
    async (listId: string) => {
      const { error } = await supabase.from('lists').delete().eq('id', listId)

      if (error) {
        console.error('Error deleting list:', error)
        return false
      }

      setLists((prev) => prev.filter((l) => l.id !== listId))
      setFavoritesMap((prev) => {
        const newMap = new Map(prev)
        newMap.delete(listId)
        return newMap
      })
      return true
    },
    [setLists, setFavoritesMap]
  )

  const togglePublic = useCallback(
    async (listId: string) => {
      const list = lists.find((l) => l.id === listId)
      if (!list) return false

      const newIsPublic = !list.isPublic
      const shareSlug = newIsPublic && !list.shareSlug ? generateSlug() : list.shareSlug

      const { error } = await supabase
        .from('lists')
        .update({
          is_public: newIsPublic,
          share_slug: shareSlug,
          updated_at: new Date().toISOString(),
        })
        .eq('id', listId)

      if (error) {
        console.error('Error toggling public:', error)
        return false
      }

      setLists((prev) =>
        prev.map((l) =>
          l.id === listId
            ? { ...l, isPublic: newIsPublic, shareSlug, updatedAt: new Date() }
            : l
        )
      )
      return true
    },
    [lists, setLists]
  )

  const addToList = useCallback(
    async (listId: string, musicianId: string) => {
      const { error } = await supabase.from('favorites').insert({
        list_id: listId,
        musician_id: musicianId,
      })

      if (error) {
        console.error('Error adding to list:', error)
        return false
      }

      setFavoritesMap((prev) => {
        const newMap = new Map(prev)
        if (!newMap.has(listId)) {
          newMap.set(listId, new Set())
        }
        newMap.get(listId)!.add(musicianId)
        return newMap
      })
      return true
    },
    [setFavoritesMap]
  )

  const removeFromList = useCallback(
    async (listId: string, musicianId: string) => {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('list_id', listId)
        .eq('musician_id', musicianId)

      if (error) {
        console.error('Error removing from list:', error)
        return false
      }

      setFavoritesMap((prev) => {
        const newMap = new Map(prev)
        newMap.get(listId)?.delete(musicianId)
        return newMap
      })
      return true
    },
    [setFavoritesMap]
  )

  const toggleFavorite = useCallback(
    async (musicianId: string) => {
      if (!defaultList) return false

      const isFavorited = favoritesMapAtom
      // Check current state
      const currentMap = await new Promise<Map<string, Set<string>>>((resolve) => {
        // This is a workaround - in real code we'd use the atom value directly
        resolve(new Map())
      })

      // Simpler approach - just use the setFavoritesMap to check
      let isCurrentlyFavorited = false
      setFavoritesMap((prev) => {
        isCurrentlyFavorited = prev.get(defaultList.id)?.has(musicianId) ?? false
        return prev
      })

      if (isCurrentlyFavorited) {
        return removeFromList(defaultList.id, musicianId)
      } else {
        return addToList(defaultList.id, musicianId)
      }
    },
    [defaultList, addToList, removeFromList, setFavoritesMap]
  )

  return {
    lists,
    loading,
    defaultList,
    createList,
    renameList,
    deleteList,
    togglePublic,
    addToList,
    removeFromList,
    toggleFavorite,
  }
}
```

**Step 2: Commit**

```bash
git add src/hooks/useLists.ts
git commit -m "feat: add useLists hook for list and favorites operations"
```

---

## Phase 4: UI Components

### Task 11: Create ListsDropdown Component

**Files:**
- Create: `src/components/lists/ListsDropdown.tsx`

**Step 1: Create ListsDropdown component**

```typescript
// src/components/lists/ListsDropdown.tsx
import { useState } from 'react'
import { useAtomValue } from 'jotai'
import { listsAtom, isMusicianInListAtom } from '../../atoms/lists'
import { useLists } from '../../hooks/useLists'

interface ListsDropdownProps {
  musicianId: string
  onClose: () => void
}

export default function ListsDropdown({ musicianId, onClose }: ListsDropdownProps) {
  const lists = useAtomValue(listsAtom)
  const isMusicianInList = useAtomValue(isMusicianInListAtom)
  const { addToList, removeFromList, createList } = useLists()
  const [newListName, setNewListName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleToggle = async (listId: string) => {
    if (isMusicianInList(listId, musicianId)) {
      await removeFromList(listId, musicianId)
    } else {
      await addToList(listId, musicianId)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newListName.trim()) return

    setCreating(true)
    const newList = await createList(newListName.trim())
    if (newList) {
      await addToList(newList.id, musicianId)
    }
    setNewListName('')
    setCreating(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className="relative w-full max-w-xs mx-4 bg-zinc-900 rounded-xl shadow-2xl border border-white/10">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="font-semibold">Add to list</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="max-h-64 overflow-y-auto p-2">
          {lists.map((list) => (
            <button
              key={list.id}
              onClick={() => handleToggle(list.id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                isMusicianInList(list.id, musicianId)
                  ? 'bg-amber-600 border-amber-600'
                  : 'border-white/30'
              }`}>
                {isMusicianInList(list.id, musicianId) && (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="flex-1 text-left truncate">{list.name}</span>
              {list.isDefault && (
                <span className="text-xs text-zinc-500">Default</span>
              )}
            </button>
          ))}
        </div>
        
        <form onSubmit={handleCreate} className="p-3 border-t border-white/10">
          <div className="flex gap-2">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="New list name..."
              maxLength={100}
              className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-zinc-800 border border-white/10 focus:border-amber-500 focus:outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={creating || !newListName.trim()}
              className="px-3 py-1.5 text-sm rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? '...' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/lists/ListsDropdown.tsx
git commit -m "feat: add ListsDropdown component"
```

---

### Task 12: Create ListsManager Component

**Files:**
- Create: `src/components/lists/ListsManager.tsx`

**Step 1: Create ListsManager component**

```typescript
// src/components/lists/ListsManager.tsx
import { useState } from 'react'
import { useAtomValue } from 'jotai'
import { listsAtom, favoritesMapAtom } from '../../atoms/lists'
import { useLists } from '../../hooks/useLists'

interface ListsManagerProps {
  onClose: () => void
}

export default function ListsManager({ onClose }: ListsManagerProps) {
  const lists = useAtomValue(listsAtom)
  const favoritesMap = useAtomValue(favoritesMapAtom)
  const { createList, renameList, deleteList, togglePublic } = useLists()
  const [newListName, setNewListName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newListName.trim()) return

    setCreating(true)
    await createList(newListName.trim())
    setNewListName('')
    setCreating(false)
  }

  const handleRename = async (listId: string) => {
    if (!editingName.trim()) {
      setEditingId(null)
      return
    }

    await renameList(listId, editingName.trim())
    setEditingId(null)
  }

  const handleCopyLink = (shareSlug: string) => {
    const url = `${window.location.origin}/list/${shareSlug}`
    navigator.clipboard.writeText(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className="relative w-full max-w-md mx-4 bg-zinc-900 rounded-xl shadow-2xl border border-white/10">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="font-semibold text-lg">My Lists</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="max-h-96 overflow-y-auto">
          {lists.map((list) => {
            const count = favoritesMap.get(list.id)?.size ?? 0
            
            return (
              <div
                key={list.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/5"
              >
                {editingId === list.id ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => handleRename(list.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(list.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    autoFocus
                    maxLength={100}
                    className="flex-1 px-2 py-1 text-sm rounded bg-zinc-800 border border-amber-500 focus:outline-none"
                  />
                ) : (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{list.name}</span>
                      {list.isDefault && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-600/20 text-amber-500">
                          Default
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-zinc-500">
                      {count} musician{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
                
                <div className="flex items-center gap-1">
                  {/* Public toggle */}
                  <button
                    onClick={() => togglePublic(list.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      list.isPublic ? 'text-amber-500 bg-amber-500/10' : 'text-zinc-500 hover:bg-white/10'
                    }`}
                    title={list.isPublic ? 'Public' : 'Private'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {list.isPublic ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      )}
                    </svg>
                  </button>
                  
                  {/* Copy link (only if public) */}
                  {list.isPublic && list.shareSlug && (
                    <button
                      onClick={() => handleCopyLink(list.shareSlug!)}
                      className="p-2 rounded-lg text-zinc-500 hover:bg-white/10 transition-colors"
                      title="Copy link"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                    </button>
                  )}
                  
                  {/* Rename */}
                  {!list.isDefault && (
                    <button
                      onClick={() => {
                        setEditingId(list.id)
                        setEditingName(list.name)
                      }}
                      className="p-2 rounded-lg text-zinc-500 hover:bg-white/10 transition-colors"
                      title="Rename"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                  
                  {/* Delete */}
                  {!list.isDefault && (
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${list.name}"?`)) {
                          deleteList(list.id)
                        }
                      }}
                      className="p-2 rounded-lg text-zinc-500 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        
        <form onSubmit={handleCreate} className="p-4 border-t border-white/10">
          <div className="flex gap-2">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="Create new list..."
              maxLength={100}
              className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 focus:border-amber-500 focus:outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={creating || !newListName.trim()}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {creating ? '...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/lists/ListsManager.tsx
git commit -m "feat: add ListsManager component"
```

---

### Task 13: Create PublicListView Component

**Files:**
- Create: `src/components/lists/PublicListView.tsx`

**Step 1: Create PublicListView component**

```typescript
// src/components/lists/PublicListView.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Musician } from '../../types'
import type { DbList, DbFavorite } from '../../types/database'

interface PublicListViewProps {
  slug: string
  musicians: Musician[]
  onSelectMusician: (musician: Musician) => void
  onClose: () => void
}

export default function PublicListView({
  slug,
  musicians,
  onSelectMusician,
  onClose,
}: PublicListViewProps) {
  const [list, setList] = useState<DbList | null>(null)
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchList() {
      setLoading(true)
      setError(null)

      // Fetch list by share_slug
      const { data: listData, error: listError } = await supabase
        .from('lists')
        .select('*')
        .eq('share_slug', slug)
        .eq('is_public', true)
        .single()

      if (listError || !listData) {
        setError('List not found or is private')
        setLoading(false)
        return
      }

      setList(listData as DbList)

      // Fetch favorites in this list
      const { data: favoritesData, error: favoritesError } = await supabase
        .from('favorites')
        .select('musician_id')
        .eq('list_id', listData.id)

      if (favoritesError) {
        setError('Failed to load list contents')
        setLoading(false)
        return
      }

      setFavoriteIds((favoritesData as DbFavorite[]).map((f) => f.musician_id))
      setLoading(false)
    }

    fetchList()
  }, [slug])

  const listMusicians = musicians.filter((m) => favoriteIds.includes(m.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className="relative w-full max-w-lg mx-4 bg-zinc-900 rounded-xl shadow-2xl border border-white/10 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h3 className="font-semibold text-lg">
              {loading ? 'Loading...' : list?.name ?? 'List'}
            </h3>
            {!loading && !error && (
              <p className="text-sm text-zinc-500">
                {listMusicians.length} musician{listMusicians.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          
          {error && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <svg className="w-12 h-12 text-zinc-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p className="text-zinc-400">{error}</p>
            </div>
          )}
          
          {!loading && !error && listMusicians.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <p className="text-zinc-400">This list is empty</p>
            </div>
          )}
          
          {!loading && !error && listMusicians.map((musician) => (
            <button
              key={musician.id}
              onClick={() => {
                onSelectMusician(musician)
                onClose()
              }}
              className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors text-left"
            >
              <img
                src={musician.image}
                alt={musician.name}
                className="w-12 h-12 rounded-lg object-cover bg-zinc-800"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{musician.name}</div>
                <div className="text-sm text-zinc-500 truncate">
                  {musician.bluesStyle} • {musician.instrument}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/lists/PublicListView.tsx
git commit -m "feat: add PublicListView component for shared lists"
```

---

## Phase 5: Integration

### Task 14: Update MusicianPanel with Favorite Buttons

**Files:**
- Modify: `src/components/MusicianPanel.tsx`

**Step 1: Read current MusicianPanel**

Read `src/components/MusicianPanel.tsx` to understand the current structure.

**Step 2: Add imports**

```typescript
import { useState } from 'react'
import { useAtomValue } from 'jotai'
import { userAtom } from '../atoms/auth'
import { isMusicianFavoritedAtom } from '../atoms/lists'
import { useLists } from '../hooks/useLists'
import AuthModal from './auth/AuthModal'
import ListsDropdown from './lists/ListsDropdown'
```

**Step 3: Add favorite buttons section**

Add near the musician info section, after the photo/header:

```tsx
// Inside MusicianPanel component
const user = useAtomValue(userAtom)
const isFavorited = useAtomValue(isMusicianFavoritedAtom)
const { toggleFavorite } = useLists()
const [showAuthModal, setShowAuthModal] = useState(false)
const [showListsDropdown, setShowListsDropdown] = useState(false)

// Favorite buttons JSX (add in appropriate location)
<div className="flex items-center gap-2 mt-4">
  <button
    onClick={() => {
      if (!user) {
        setShowAuthModal(true)
      } else {
        toggleFavorite(musician.id)
      }
    }}
    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
      isFavorited(musician.id)
        ? 'bg-red-500/20 text-red-400'
        : 'bg-white/10 hover:bg-white/20'
    }`}
  >
    <svg className="w-4 h-4" fill={isFavorited(musician.id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
    {isFavorited(musician.id) ? 'Favorited' : 'Favorite'}
  </button>
  
  <button
    onClick={() => {
      if (!user) {
        setShowAuthModal(true)
      } else {
        setShowListsDropdown(true)
      }
    }}
    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
    Add to list
  </button>
</div>

{showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
{showListsDropdown && (
  <ListsDropdown
    musicianId={musician.id}
    onClose={() => setShowListsDropdown(false)}
  />
)}
```

**Step 4: Remove old favorites props if present**

Remove any existing `isFavorited`, `onToggleFavorite` props that were passed from parent.

**Step 5: Commit**

```bash
git add src/components/MusicianPanel.tsx
git commit -m "feat: add favorite buttons to MusicianPanel"
```

---

### Task 15: Update App.tsx - Remove Old Favorites, Add Routing

**Files:**
- Modify: `src/App.tsx`

**Step 1: Read current App.tsx**

Read `src/App.tsx` to understand the current structure.

**Step 2: Remove old favorites state and logic**

Remove:
- `favorites` state (`useState<Set<string>>`)
- `favoritesRef`
- `handleToggleFavorite` function
- Old favorites fetch `useEffect`
- All `favorites` and `onToggleFavorite` props passed to children

**Step 3: Add public list route handling**

Add state for public list viewing:

```tsx
import { useState, useCallback, useEffect, useRef } from 'react'
import PublicListView from './components/lists/PublicListView'

// Inside App component
const [publicListSlug, setPublicListSlug] = useState<string | null>(() => {
  const match = window.location.pathname.match(/^\/list\/([a-z0-9]+)$/i)
  return match ? match[1] : null
})

// Handle /list/:slug routes
useEffect(() => {
  const onPop = () => {
    const listMatch = window.location.pathname.match(/^\/list\/([a-z0-9]+)$/i)
    if (listMatch) {
      setPublicListSlug(listMatch[1])
      setSelected(null)
    } else {
      setPublicListSlug(null)
      const id = window.location.pathname.slice(1)
      setSelected(id ? (musicians.find((m) => m.id === id) ?? null) : null)
    }
  }
  window.addEventListener('popstate', onPop)
  return () => window.removeEventListener('popstate', onPop)
}, [musicians])

// In render, add PublicListView
{publicListSlug && (
  <PublicListView
    slug={publicListSlug}
    musicians={musicians}
    onSelectMusician={(m) => {
      setPublicListSlug(null)
      handleSelect(m)
    }}
    onClose={() => {
      setPublicListSlug(null)
      window.history.pushState(null, '', '/')
    }}
  />
)}
```

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add public list routing, remove old favorites logic"
```

---

### Task 16: Update NavBar - Add Lists Manager Button

**Files:**
- Modify: `src/components/NavBar.tsx`

**Step 1: Read current NavBar**

Read `src/components/NavBar.tsx` if not already read.

**Step 2: Add ListsManager button**

```tsx
import { useState } from 'react'
import { useAtomValue } from 'jotai'
import { userAtom } from '../atoms/auth'
import ListsManager from './lists/ListsManager'

// Inside NavBar component
const user = useAtomValue(userAtom)
const [showListsManager, setShowListsManager] = useState(false)

// Add button near other controls (only shown when logged in)
{user && (
  <button
    onClick={() => setShowListsManager(true)}
    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
    title="My Lists"
  >
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  </button>
)}

{showListsManager && <ListsManager onClose={() => setShowListsManager(false)} />}
```

**Step 3: Commit**

```bash
git add src/components/NavBar.tsx
git commit -m "feat: add lists manager button to NavBar"
```

---

### Task 17: Update InfluenceView and MapView - Heart State

**Files:**
- Modify: `src/components/InfluenceView.tsx`
- Modify: `src/components/MapView.tsx`

**Step 1: Read current views**

Read both `InfluenceView.tsx` and `MapView.tsx` to understand how favorites are displayed.

**Step 2: Update imports in both files**

```tsx
import { useAtomValue } from 'jotai'
import { isMusicianFavoritedAtom } from '../atoms/lists'
```

**Step 3: Use atom for favorite state**

Replace any `favorites.has(musician.id)` checks with:

```tsx
const isFavorited = useAtomValue(isMusicianFavoritedAtom)
// ...
isFavorited(musician.id)
```

**Step 4: Remove favorites props**

Remove `favorites` and `onToggleFavorite` from component props.

**Step 5: Commit**

```bash
git add src/components/InfluenceView.tsx src/components/MapView.tsx
git commit -m "feat: update views to use jotai favorites state"
```

---

## Phase 6: Supabase Setup (Manual)

### Task 18: Create Supabase Project

**Manual steps:**

1. Go to https://supabase.com and create account/sign in
2. Create new project
3. Note the project URL and anon key from Project Settings > API
4. Update `.env.development` and `.env.production` with real values

---

### Task 19: Configure Authentication Providers

**Manual steps in Supabase Dashboard:**

1. Go to Authentication > Providers
2. Enable Email provider (should be enabled by default)
3. Enable Google provider:
   - Go to Google Cloud Console
   - Create OAuth credentials
   - Add authorized redirect URI: `https://your-project.supabase.co/auth/v1/callback`
   - Copy Client ID and Client Secret to Supabase

---

### Task 20: Run Database Schema

**Run in Supabase SQL Editor:**

```sql
-- Create lists table
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

-- Create favorites table
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

---

### Task 21: Run RLS Policies

**Run in Supabase SQL Editor:**

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

---

### Task 22: Configure Netlify Environment Variables

**Manual steps:**

1. Go to Netlify Dashboard > Site settings > Environment variables
2. Add:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key

---

### Task 23: Test and Deploy

**Step 1: Test locally**

```bash
npm run dev
```

- Test Google sign-in
- Test email sign-up/sign-in
- Test creating lists
- Test adding/removing favorites
- Test sharing public lists

**Step 2: Deploy**

```bash
npm run deploy
```

**Step 3: Test production**

Test all flows on the deployed site.

---

## Summary

| Phase | Tasks |
|-------|-------|
| 1. Setup | Dependencies, Supabase client, types |
| 2. Auth | Atoms, hooks, AuthButton, AuthModal, NavBar integration |
| 3. State | Lists atoms, useLists hook |
| 4. UI | ListsDropdown, ListsManager, PublicListView |
| 5. Integration | MusicianPanel, App.tsx, NavBar, Views |
| 6. Supabase | Manual setup in dashboard |

Total: 23 tasks
