// src/hooks/useAuth.ts
import { useEffect, useCallback } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { supabase } from '../lib/supabase'
import { userAtom, authLoadingAtom, authErrorAtom } from '../atoms/auth'

export function useAuth() {
  const [user, setUser] = useAtom(userAtom)
  const [loading, setLoading] = useAtom(authLoadingAtom)
  const setError = useSetAtom(authErrorAtom)

  // Initialize auth state
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [setUser, setLoading])

  const signInWithGoogle = useCallback(async () => {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
    if (error) setError(error.message)
  }, [setError])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) setError(error.message)
  }, [setError])

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    setError(null)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })
    if (error) setError(error.message)
  }, [setError])

  const signOut = useCallback(async () => {
    setError(null)
    const { error } = await supabase.auth.signOut()
    if (error) setError(error.message)
  }, [setError])

  return {
    user,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  }
}