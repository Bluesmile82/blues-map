// src/types/database.ts
export interface DbList {
  id: string
  user_id: string
  name: string
  is_default: boolean
  is_public: boolean
  share_slug: string | null
  created_at: string
  updated_at: string
}

export interface DbFavorite {
  id: string
  list_id: string
  musician_id: string
  added_at: string
}

// Frontend-friendly types
export interface List {
  id: string
  userId: string
  name: string
  isDefault: boolean
  isPublic: boolean
  shareSlug: string | null
  createdAt: Date
  updatedAt: Date
}

export interface Favorite {
  id: string
  listId: string
  musicianId: string
  addedAt: Date
}

// Converters
export function dbListToList(db: DbList): List {
  return {
    id: db.id,
    userId: db.user_id,
    name: db.name,
    isDefault: db.is_default,
    isPublic: db.is_public,
    shareSlug: db.share_slug,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  }
}

export function dbFavoriteToFavorite(db: DbFavorite): Favorite {
  return {
    id: db.id,
    listId: db.list_id,
    musicianId: db.musician_id,
    addedAt: new Date(db.added_at),
  }
}