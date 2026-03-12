// src/atoms/auth.ts
import { atom } from 'jotai'
import type { User } from '@supabase/supabase-js'

export const userAtom = atom<User | null>(null)
export const authLoadingAtom = atom(true)
export const authErrorAtom = atom<string | null>(null)