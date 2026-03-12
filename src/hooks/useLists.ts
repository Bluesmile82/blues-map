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
import { dbListToList } from '../types/database'
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

      // Check current state
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