# Cookieless Analytics Design

## Overview

Privacy-friendly analytics for Blues Map. Track page views, musician views, song plays, and time spent — without cookies or PII. All data stored in Supabase.

## Approach

Custom lightweight tracker (no external analytics service). One Supabase table, one React hook, zero new dependencies.

## Architecture

### Client: `useAnalytics` hook

- Generate `sessionId` via `crypto.randomUUID()` on mount (in-memory only, dies with tab)
- Listen to URL changes via `popstate` + pushState monkey-patch
- Track 4 event types (see below)
- Batch events: flush every 10s or on `visibilitychange` (tab hide/close)
- Send to Supabase via `supabase.from('analytics_events').insert()`

### Supabase table: `analytics_events`

| Column        | Type               | Description                          |
|---------------|--------------------|--------------------------------------|
| `id`          | uuid (PK)          | Auto-generated                       |
| `session_id`  | uuid               | Random, per-tab                      |
| `event`       | text               | Event type name                      |
| `path`        | text               | URL path                             |
| `musician_id` | text (nullable)    | Musician slug                        |
| `metadata`    | jsonb (nullable)   | Extra data (song title, duration)    |
| `referrer`    | text (nullable)    | document.referrer                    |
| `screen_size` | text               | `${w}x${h}`                          |
| `created_at`  | timestamptz        | Default now()                        |

### RLS

- Insert-only for anon key (no select/update/delete)
- Data stays safe from client-side reads

## Events

| Event           | When                            | Metadata                     |
|-----------------|---------------------------------|------------------------------|
| `page_view`     | URL change (view switch)        | path                         |
| `musician_view` | Musician panel/card opens       | musician_id                  |
| `song_play`     | Video starts playing            | musician_id, video_url       |
| `time_spent`    | On visibilitychange (tab hide)  | seconds, musician_id         |

## Privacy

- No cookies
- No IP storage
- No user accounts linked
- Session ID is ephemeral (in-memory, random)
- No PII collected

## Future (not in scope)

- Admin dashboard at `/admin` with charts
- Aggregated materialized views for fast queries
- Top musicians, average session duration, etc.
