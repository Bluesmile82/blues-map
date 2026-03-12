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