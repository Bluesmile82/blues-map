import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const sessionId = crypto.randomUUID()
const screenSize = `${screen.width}x${screen.height}`

interface QueuedEvent {
  event: string
  path: string | null
  musician_id: string | null
  metadata: Record<string, unknown> | null
  referrer: string | null
}

const eventQueue: QueuedEvent[] = []

async function flush() {
  if (eventQueue.length === 0) return
  const events = eventQueue.splice(0)
  const rows = events.map((e) => ({
    session_id: sessionId,
    event: e.event,
    path: e.path,
    musician_id: e.musician_id,
    metadata: e.metadata,
    referrer: e.referrer,
    screen_size: screenSize,
  }))
  const { error } = await supabase.from('analytics_events').insert(rows)
  if (error) {
    eventQueue.unshift(...events)
  }
}

export function trackPageView(path: string) {
  eventQueue.push({
    event: 'page_view',
    path,
    musician_id: null,
    metadata: null,
    referrer: document.referrer || null,
  })
}

export function trackMusicianView(musicianId: string) {
  eventQueue.push({
    event: 'musician_view',
    path: window.location.pathname,
    musician_id: musicianId,
    metadata: null,
    referrer: null,
  })
}

export function trackSongPlay(musicianId: string, videoUrl?: string) {
  eventQueue.push({
    event: 'song_play',
    path: window.location.pathname,
    musician_id: musicianId,
    metadata: videoUrl ? { video_url: videoUrl } : null,
    referrer: null,
  })
}

export function trackTimeSpent(seconds: number, musicianId?: string | null) {
  eventQueue.push({
    event: 'time_spent',
    path: window.location.pathname,
    musician_id: musicianId ?? null,
    metadata: { seconds },
    referrer: null,
  })
}

export function useAnalytics() {
  const currentMusicianRef = useRef<string | null>(null)
  const visibleSinceRef = useRef<number>(Date.now())

  const setCurrentMusician = useCallback((id: string | null) => {
    currentMusicianRef.current = id
  }, [])

  useEffect(() => {
    trackPageView(window.location.pathname)

    const originalPushState = history.pushState.bind(history)
    history.pushState = function (...args: Parameters<typeof originalPushState>) {
      originalPushState(...args)
      trackPageView(window.location.pathname)
    }

    const onPopState = () => {
      trackPageView(window.location.pathname)
    }
    window.addEventListener('popstate', onPopState)

    const flushInterval = setInterval(flush, 10_000)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const elapsed = Math.round((Date.now() - visibleSinceRef.current) / 1000)
        if (elapsed > 0) {
          trackTimeSpent(elapsed, currentMusicianRef.current)
        }
        flush()
      } else {
        visibleSinceRef.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    const onBeforeUnload = () => {
      flush()
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      history.pushState = originalPushState
      window.removeEventListener('popstate', onPopState)
      clearInterval(flushInterval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  return { setCurrentMusician }
}
