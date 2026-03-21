// src/components/auth/AuthButton.tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAtomValue } from 'jotai'
import { userAtom, authLoadingAtom } from '../../atoms/auth'
import { useAuth } from '../../hooks/useAuth'
import AuthModal from './AuthModal.tsx'
import ListsManager from '../lists/ListsManager.tsx'

export default function AuthButton() {
  const { t } = useTranslation()
  const user = useAtomValue(userAtom)
  const loading = useAtomValue(authLoadingAtom)
  const { signOut } = useAuth()
  const [showModal, setShowModal] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showListsManager, setShowListsManager] = useState(false)

  if (loading) {
    return <div className="w-8 h-8 rounded-full bg-bg-hover animate-pulse" />
  }

  if (user) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-bg-hover transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-sm font-medium text-ink">
            {user.email?.[0].toUpperCase() ?? '?'}
          </div>
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-1 w-48 bg-bg-elevated rounded-lg shadow-xl border border-border-subtle z-50 py-1">
              <div className="px-3 py-2 text-sm text-ink3 border-b border-border-subtle truncate">
                {user.email}
              </div>
              <button
                onClick={() => { setShowListsManager(true); setShowMenu(false) }}
                className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-bg-hover transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {t('auth.myLists')}
              </button>
              <button
                onClick={() => { signOut(); setShowMenu(false) }}
                className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-bg-hover transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                {t('auth.signOut')}
              </button>
            </div>
          </>
        )}

        {showListsManager && <ListsManager onClose={() => setShowListsManager(false)} />}
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary2 transition-colors text-sm font-medium text-ink"
      >
        {t('auth.signIn')}
      </button>

      {showModal && <AuthModal onClose={() => setShowModal(false)} />}
    </>
  )
}
