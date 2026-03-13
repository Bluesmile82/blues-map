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

  // Deduplicate: only show first default list if there are multiple
  const displayLists = lists.filter((list, index, self) => {
    if (!list.isDefault) return true
    // Only show the first default list
    const firstDefaultIndex = self.findIndex(l => l.isDefault)
    return index === firstDefaultIndex
  })

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

      <div className="absolute top-full w-full max-w-md mx-4 bg-zinc-900 rounded-xl shadow-2xl border border-white/10">
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
          {displayLists.map((list) => {
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
                    className={`p-2 rounded-lg transition-colors ${list.isPublic ? 'text-amber-500 bg-amber-500/10' : 'text-zinc-500 hover:bg-white/10'
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