import { useEffect, useState } from 'react'
import { cn } from '../lib/cn'
import { formatRelative } from '../lib/encoding'

/** Live ticking countdown for a paste's expiry (safe for non-expiring pastes). */
export function ExpiryCountdown({ expiresAt, className }: { expiresAt: number; className?: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const remaining = expiresAt - now
  if (remaining <= 0) return null

  const urgent = remaining < 5 * 60 * 1000

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium',
        urgent
          ? 'border-rose-500/40 text-rose-600 dark:text-rose-400'
          : 'border-zinc-300 text-zinc-500 dark:border-void-line dark:text-zinc-400',
        className,
      )}
      role="timer"
      aria-live="polite"
      aria-label={`Expires in ${formatRelative(remaining)}`}
    >
      <span aria-hidden>⏳</span>
      {formatRelative(remaining)}
    </span>
  )
}