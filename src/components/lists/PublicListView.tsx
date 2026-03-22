// src/components/lists/PublicListView.tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const [list, setList] = useState<DbList | null>(null)
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchList() {
      setLoading(true)
      setError(null)

      const { data: listData, error: listError } = await supabase
        .from('lists')
        .select('*')
        .eq('share_slug', slug)
        .eq('is_public', true)
        .single()

      if (listError || !listData) {
        setError(t('lists.listNotFound'))
        setLoading(false)
        return
      }

      setList(listData as DbList)

      const { data: favoritesData, error: favoritesError } = await supabase
        .from('favorites')
        .select('musician_id')
        .eq('list_id', listData.id)

      if (favoritesError) {
        setError(t('lists.failedToLoad'))
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

      <div className="relative w-full max-w-lg mx-4 bg-bg border border-border-subtle rounded-xl shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <div>
            <h3 className="font-semibold text-lg text-ink">
              {loading ? t('auth.loading') : list?.name ?? t('lists.list')}
            </h3>
            {!loading && !error && (
              <p className="text-sm text-ink3">
                {listMusicians.length} {listMusicians.length !== 1 ? t('filters.musicians') : t('filters.musician')}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-ink3 hover:bg-bg-hover hover:text-ink transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <svg className="w-12 h-12 text-ink3 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p className="text-ink3">{error}</p>
            </div>
          )}

          {!loading && !error && listMusicians.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <p className="text-ink3">{t('lists.emptyList')}</p>
            </div>
          )}

          {!loading && !error && listMusicians.map((musician) => (
            <button
              key={musician.id}
              onClick={() => {
                onSelectMusician(musician)
                onClose()
              }}
              className="w-full flex items-center gap-3 px-4 py-3 border-b border-border-subtle/40 hover:bg-bg-hover transition-colors text-left"
            >
              <img
                src={musician.image}
                alt={musician.name}
                className="w-12 h-12 rounded-lg object-cover bg-bg-elevated"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-ink">{musician.name}</div>
                <div className="text-sm text-ink3 truncate">
                  {t(`styles.${musician.bluesStyle}`, musician.bluesStyle)} • {[musician.instrument, ...(musician.secondaryInstruments ?? [])].map(i => t(`instruments.${i}`, i)).join(', ')}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
