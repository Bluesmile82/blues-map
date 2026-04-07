import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface AnalyticsEvent {
  event: string
  path: string | null
  musician_id: string | null
  country: string | null
  created_at: string
  metadata: Record<string, unknown> | null
  session_id: string
}

interface DailyCount { date: string; count: number }
interface MusicianCount { musician_id: string; count: number }
interface CountryCount { country: string; count: number }

function BarChart({ data, maxCount, label }: { data: { label: string; count: number }[]; maxCount: number; label: string }) {
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</h4>
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 text-xs">
          <span className="w-28 truncate text-right text-gray-600 dark:text-gray-400">{d.label}</span>
          <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden h-5">
            <div
              className="bg-blue-500 h-full rounded transition-all"
              style={{ width: `${maxCount > 0 ? (d.count / maxCount) * 100 : 0}%` }}
            />
          </div>
          <span className="w-10 text-right text-gray-600 dark:text-gray-400">{d.count}</span>
        </div>
      ))}
    </div>
  )
}

export default function AnalyticsDashboard({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<AnalyticsEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase
        .from('analytics_events')
        .select('event, path, musician_id, country, created_at, metadata, session_id')
        .order('created_at', { ascending: false })
        .limit(10000)
      if (err) setError(err.message)
      if (data) setEvents(data as AnalyticsEvent[])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">{error ? `Error: ${error}` : 'Loading analytics...'}</p>
      </div>
    )
  }

  const pageViews = events.filter((e) => e.event === 'page_view')
  const musicianViews = events.filter((e) => e.event === 'musician_view')
  const songPlays = events.filter((e) => e.event === 'song_play')
  const timeSpent = events.filter((e) => e.event === 'time_spent')
  const uniqueSessions = new Set(events.map((e) => e.session_id)).size
  const uniqueCountries = new Set(events.filter((e) => e.country).map((e) => e.country)).size

  const avgTimeSpent = timeSpent.length > 0
    ? Math.round(timeSpent.reduce((sum, e) => sum + ((e.metadata?.seconds as number) || 0), 0) / timeSpent.length)
    : 0

  const dailyCounts: DailyCount[] = Object.entries(
    pageViews.reduce<Record<string, number>>((acc, e) => {
      const day = e.created_at.slice(0, 10)
      acc[day] = (acc[day] || 0) + 1
      return acc
    }, {})
  )
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)

  const topMusicians: MusicianCount[] = Object.entries(
    musicianViews.reduce<Record<string, number>>((acc, e) => {
      if (e.musician_id) acc[e.musician_id] = (acc[e.musician_id] || 0) + 1
      return acc
    }, {})
  )
    .map(([musician_id, count]) => ({ musician_id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const topCountries: CountryCount[] = Object.entries(
    events.reduce<Record<string, number>>((acc, e) => {
      if (e.country) acc[e.country] = (acc[e.country] || 0) + 1
      return acc
    }, {})
  )
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const dailyMax = Math.max(...dailyCounts.map((d) => d.count), 1)
  const musicianMax = Math.max(...topMusicians.map((m) => m.count), 1)
  const countryMax = Math.max(...topCountries.map((c) => c.count), 1)

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 overflow-auto">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 mb-8">
          {[
            { label: 'Total Events', value: events.length },
            { label: 'Page Views', value: pageViews.length },
            { label: 'Sessions', value: uniqueSessions },
            { label: 'Musician Views', value: musicianViews.length },
            { label: 'Song Plays', value: songPlays.length },
            { label: 'Countries', value: uniqueCountries },
          ].map((s) => (
            <div key={s.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{avgTimeSpent}s</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Avg Time on Page</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {pageViews.length > 0 ? (pageViews.length / uniqueSessions).toFixed(1) : '0'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Pages per Session</div>
          </div>
        </div>

        <div className="space-y-8">
          <BarChart
            label="Page Views (last 14 days)"
            data={dailyCounts.map((d) => ({ label: d.date.slice(5), count: d.count }))}
            maxCount={dailyMax}
          />
          <BarChart
            label="Top Musicians"
            data={topMusicians.map((m) => ({ label: m.musician_id.replace(/-/g, ' '), count: m.count }))}
            maxCount={musicianMax}
          />
          <BarChart
            label="Top Countries"
            data={topCountries.map((c) => ({ label: c.country, count: c.count }))}
            maxCount={countryMax}
          />
        </div>

        <div className="mt-8">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Recent Events</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                  <th className="pb-2 pr-4">Time</th>
                  <th className="pb-2 pr-4">Event</th>
                  <th className="pb-2 pr-4">Path</th>
                  <th className="pb-2 pr-4">Musician</th>
                  <th className="pb-2 pr-4">Country</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 50).map((e, i) => (
                  <tr key={i} className="border-b dark:border-gray-800 text-gray-600 dark:text-gray-400">
                    <td className="py-1 pr-4 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="py-1 pr-4">{e.event}</td>
                    <td className="py-1 pr-4 truncate max-w-32">{e.path}</td>
                    <td className="py-1 pr-4 truncate max-w-32">{e.musician_id}</td>
                    <td className="py-1 pr-4">{e.country || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
