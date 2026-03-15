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

      <div className="relative w-full max-w-xs mx-4 bg-bg border border-border-subtle rounded-xl shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <h3 className="font-semibold text-ink">Add to list</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-ink3 hover:bg-bg-hover hover:text-ink transition-colors"
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
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors"
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                isMusicianInList(list.id, musicianId)
                  ? 'bg-primary border-primary'
                  : 'border-border text-ink3'
              }`}>
                {isMusicianInList(list.id, musicianId) && (
                  <svg className="w-3 h-3 text-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="flex-1 text-left truncate text-ink">{list.name}</span>
              {list.isDefault && (
                <span className="text-2xs text-ink3">Default</span>
              )}
            </button>
          ))}
        </div>

        <form onSubmit={handleCreate} className="p-3 border-t border-border-subtle">
          <div className="flex gap-2">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="New list name..."
              maxLength={100}
              className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-bg-elevated border border-border-subtle focus:border-accent focus:outline-none transition-colors text-ink placeholder-ink3"
            />
            <button
              type="submit"
              disabled={creating || !newListName.trim()}
              className="px-3 py-1.5 text-sm rounded-lg bg-primary hover:bg-primary2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-ink font-medium"
            >
              {creating ? '...' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
