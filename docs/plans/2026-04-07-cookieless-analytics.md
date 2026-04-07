# Cookieless Analytics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add privacy-friendly analytics to Blues Map using Supabase — track page views, musician views, song plays, and time spent without cookies.

**Architecture:** Single `useAnalytics` hook generates an in-memory session ID, batches events, and flushes to a Supabase `analytics_events` table. Events: `page_view`, `musician_view`, `song_play`, `time_spent`. RLS is insert-only for anon key.

**Tech Stack:** React hooks, Supabase JS client (already in project), TypeScript

---

### Task 1: Create Supabase `analytics_events` table

**Files:**
- None (SQL migration in Supabase dashboard)

**Step 1: Run migration SQL in Supabase SQL Editor**

```sql
CREATE TABLE analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  event text NOT NULL,
  path text NOT NULL,
  musician_id text,
  metadata jsonb,
  referrer text,
  screen_size text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: enable
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Anon key can only insert, never read/update/delete
CREATE POLICY "Anon can insert analytics events"
  ON analytics_events
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- No select/update/delete policies = data is write-only from client

-- Index for common queries
CREATE INDEX idx_analytics_events_event ON analytics_events (event);
CREATE INDEX idx_analytics_events_created_at ON analytics_events (created_at);
CREATE INDEX idx_analytics_events_musician_id ON analytics_events (musician_id);
CREATE INDEX idx_analytics_events_session_id ON analytics_events (session_id);
```

**Step 2: Verify table exists**

Run in Supabase SQL Editor:
```sql
SELECT * FROM analytics_events LIMIT 0;
```
Expected: empty result set, no error.

**Step 3: Commit (document the migration)**

Create `docs/plans/2026-04-07-analytics-migration.sql` with the above SQL.

```bash
git add docs/plans/2026-04-07-analytics-migration.sql
git commit -m "feat: add analytics_events table migration"
```

---

### Task 2: Create `useAnalytics` hook

**Files:**
- Create: `src/hooks/useAnalytics.ts`

**Context:** The app uses manual URL routing via `window.history.pushState` and `popstate` (no router library). See `src/App.tsx:91-94` for `handleViewChange` and `src/App.tsx:212-226` for popstate listener. The Supabase client is at `src/lib/supabase.ts`.

**Step 1: Write `useAnalytics` hook**

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface AnalyticsEvent {
  session_id: string;
  event: string;
  path: string;
  musician_id?: string | null;
  metadata?: Record<string, unknown> | null;
  referrer?: string;
  screen_size: string;
}

const FLUSH_INTERVAL = 10_000;
const SESSION_ID = crypto.randomUUID();
const SCREEN_SIZE = `${screen.width}x${screen.height}`;

let eventQueue: AnalyticsEvent[] = [];

async function flushQueue() {
  if (eventQueue.length === 0) return;
  const batch = eventQueue.splice(0);
  const { error } = await supabase.from('analytics_events').insert(batch);
  if (error) {
    console.error('Analytics flush failed:', error);
    eventQueue = [...batch, ...eventQueue];
  }
}

function enqueue(event: Omit<AnalyticsEvent, 'session_id' | 'screen_size'>) {
  eventQueue.push({
    ...event,
    session_id: SESSION_ID,
    screen_size: SCREEN_SIZE,
  });
}

export function trackPageView(path: string) {
  enqueue({
    event: 'page_view',
    path,
    referrer: document.referrer || undefined,
  });
}

export function trackMusicianView(musicianId: string) {
  enqueue({
    event: 'musician_view',
    path: window.location.pathname,
    musician_id: musicianId,
  });
}

export function trackSongPlay(musicianId: string, videoUrl?: string) {
  enqueue({
    event: 'song_play',
    path: window.location.pathname,
    musician_id: musicianId,
    metadata: videoUrl ? { video_url: videoUrl } : null,
  });
}

export function trackTimeSpent(seconds: number, musicianId?: string | null) {
  enqueue({
    event: 'time_spent',
    path: window.location.pathname,
    musician_id: musicianId ?? undefined,
    metadata: { seconds },
  });
}

export function useAnalytics() {
  const startTimeRef = useRef(Date.now());
  const currentMusicianRef = useRef<string | null>(null);
  const flushRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    trackPageView(window.location.pathname);

    const originalPushState = history.pushState.bind(history);
    history.pushState = (...args: Parameters<typeof history.pushState>) => {
      originalPushState(...args);
      trackPageView(window.location.pathname);
    };

    const onPopState = () => {
      trackPageView(window.location.pathname);
    };
    window.addEventListener('popstate', onPopState);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
        if (elapsed > 0) {
          trackTimeSpent(elapsed, currentMusicianRef.current);
        }
        flushQueue();
      } else {
        startTimeRef.current = Date.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    flushRef.current = setInterval(flushQueue, FLUSH_INTERVAL);

    const beforeUnload = () => {
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      if (elapsed > 0) {
        trackTimeSpent(elapsed, currentMusicianRef.current);
      }
      flushQueue();
    };
    window.addEventListener('beforeunload', beforeUnload);

    return () => {
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', beforeUnload);
      if (flushRef.current) clearInterval(flushRef.current);
      flushQueue();
      history.pushState = originalPushState;
    };
  }, []);

  const setCurrentMusician = useCallback((musicianId: string | null) => {
    currentMusicianRef.current = musicianId;
  }, []);

  return { setCurrentMusician };
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/hooks/useAnalytics.ts
git commit -m "feat: add useAnalytics hook for cookieless tracking"
```

---

### Task 3: Integrate `useAnalytics` into `App.tsx`

**Files:**
- Modify: `src/App.tsx`

**Context:** `App.tsx` manages all view state and musician selection. The `selected` state holds the current musician (or null). View changes happen via `handleViewChange` (line 91). Musician selection happens via `handleSelect` (line 143). Video plays when `showPlayer` is set to true (line 150).

**Step 1: Add import and hook call**

At top of `src/App.tsx`, add:
```typescript
import { useAnalytics, trackMusicianView, trackSongPlay } from './hooks/useAnalytics';
```

Inside `App()` function, add after existing state declarations (around line 89):
```typescript
const { setCurrentMusician } = useAnalytics();
```

**Step 2: Track musician views**

In `handleSelect` callback (line 143), after `setSelected(musician)`:
```typescript
trackMusicianView(musician.id);
setCurrentMusician(musician.id);
```

In `handleClose` callback (line 157), after `setSelected(null)`:
```typescript
setCurrentMusician(null);
```

**Step 3: Track song plays**

In `handleSelect` callback, inside the `if (musician.youtubeLink)` block (line 150-153):
```typescript
trackSongPlay(musician.id, musician.youtubeLink);
```

Also in the `onPlayVideo` handler prop (line 281), add after the existing calls:
```typescript
trackSongPlay(selected.id, url);
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: integrate analytics tracking into App"
```

---

### Task 4: Verify end-to-end in dev

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Open browser, navigate around**

- Visit different views (timeline, map, card)
- Click on a musician
- Play a video

**Step 3: Check Supabase table**

Run in Supabase SQL Editor:
```sql
SELECT * FROM analytics_events ORDER BY created_at DESC LIMIT 20;
```

Expected: See `page_view`, `musician_view`, `song_play` events with correct paths and musician IDs.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: analytics integration adjustments"
```
