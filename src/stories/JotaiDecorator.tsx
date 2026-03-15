import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import { userAtom, authLoadingAtom, authErrorAtom } from '../atoms/auth'
import { listsAtom, favoritesMapAtom, listsLoadingAtom } from '../atoms/lists'
import type { User } from '@supabase/supabase-js'

interface JotaiDecoratorOptions {
  user?: User | null
  favoritedIds?: string[]
}

export function createJotaiStore({ user = null, favoritedIds = [] }: JotaiDecoratorOptions = {}) {
  const store = createStore()
  store.set(userAtom, user)
  store.set(authLoadingAtom, false)
  store.set(authErrorAtom, null)
  store.set(listsAtom, [])
  store.set(listsLoadingAtom, false)

  const favMap = new Map<string, Set<string>>()
  if (favoritedIds.length > 0) {
    favMap.set('default', new Set(favoritedIds))
  }
  store.set(favoritesMapAtom, favMap)

  return store
}

export function JotaiDecorator({ children, options }: { children: ReactNode; options?: JotaiDecoratorOptions }) {
  return (
    <Provider store={createJotaiStore(options)}>
      {children}
    </Provider>
  )
}

export function withJotai(options?: JotaiDecoratorOptions) {
  return (Story: any) => (
    <JotaiDecorator options={options}>
      <Story />
    </JotaiDecorator>
  )
}
