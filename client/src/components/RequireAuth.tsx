import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { status, user } = useAuth()

  if (status === 'loading') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3" role="status" aria-live="polite">
        <span className="size-5 rounded-full border-2 border-lilac-deep border-t-lilac-dark animate-spin" aria-hidden />
        <span className="text-sm text-zinc-500">Restoring your secure session…</span>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }

  return <>{children}</>
}
