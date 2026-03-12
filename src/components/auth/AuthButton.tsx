// src/components/auth/AuthButton.tsx
import { useState } from 'react'
import { useAtomValue } from 'jotai'
import { userAtom, authLoadingAtom } from '../../atoms/auth'
import { useAuth } from '../../hooks/useAuth'
import AuthModal from './AuthModal.tsx'

export default function AuthButton() {
  const user = useAtomValue(userAtom)
  const loading = useAtomValue(authLoadingAtom)
  const { signOut } = useAuth()
  const [showModal, setShowModal] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  if (loading) {
    return (
      <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
    )
  }

  if (user) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-amber-600 flex items-center justify-center text-sm font-medium">
            {user.email?.[0].toUpperCase() ?? '?'}
          </div>
        </button>
        
        {showMenu && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setShowMenu(false)} 
            />
            <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-800 rounded-lg shadow-xl border border-white/10 z-50 py-1">
              <div className="px-3 py-2 text-sm text-zinc-400 border-b border-white/10 truncate">
                {user.email}
              </div>
              <button
                onClick={() => {
                  signOut()
                  setShowMenu(false)
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition-colors"
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 transition-colors text-sm font-medium"
      >
        Sign in
      </button>
      
      {showModal && <AuthModal onClose={() => setShowModal(false)} />}
    </>
  )
}