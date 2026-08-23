import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { cacheAuthenticatedUser, supabase, toAuthenticatedUser, type AuthenticatedUser } from './supabase'

export interface AuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated' | 'unavailable'
  session: Session | null
  user: User | null
  profile: AuthenticatedUser | null
}

const initialAuthState: AuthState = {
  status: 'loading',
  session: null,
  user: null,
  profile: null,
}

const AuthContext = createContext<AuthState>(initialAuthState)

function stateFromSession(session: Session | null): AuthState {
  const user = session?.user ?? null
  return {
    status: user ? 'authenticated' : 'unauthenticated',
    session,
    user,
    profile: user ? toAuthenticatedUser(user) : null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialAuthState)

  useEffect(() => {
    const client = supabase
    if (!client) {
      setState({ status: 'unavailable', session: null, user: null, profile: null })
      return
    }

    let active = true
    const applySession = (session: Session | null) => {
      cacheAuthenticatedUser(session?.user ?? null)
      if (active) setState(stateFromSession(session))
    }

    void client.auth.getSession().then(({ data, error }) => {
      if (error) {
        if (active) setState({ status: 'unauthenticated', session: null, user: null, profile: null })
        return
      }
      applySession(data.session)
    })

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      applySession(session)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(() => state, [state])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
