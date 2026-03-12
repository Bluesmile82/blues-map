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