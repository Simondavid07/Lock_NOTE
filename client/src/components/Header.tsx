import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { api } from '../lib/api'
import { useAppStore, type Theme } from '../lib/app-store'
import { cn } from '../lib/cn'
import { useAuth } from '../lib/auth'
import { Kbd } from './ui'

function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <path d="M8.5 11.5a7.5 7.5 0 0 1 15 0v2.25" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      <rect x="6" y="13" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="2.25" />
      <path d="M16 18v4.25" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  )
}

function ThemeGlyph({ theme }: { theme: Theme }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-3.5" aria-hidden>
      {theme === 'dark' ? (
        <path d="M14.9 12.9A6.5 6.5 0 0 1 7.1 5.1 6.2 6.2 0 1 0 14.9 12.9Z" fill="currentColor" />
      ) : theme === 'light' ? (
        <>
          <circle cx="10" cy="10" r="3.1" fill="currentColor" />
          <path d="M10 2v2M10 16v2M18 10h-2M4 10H2M15.66 4.34l-1.42 1.42M5.76 14.24l-1.42 1.42M15.66 15.66l-1.42-1.42M5.76 5.76 4.34 4.34" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M10 2.25a7.75 7.75 0 1 0 0 15.5V2.25Z" fill="currentColor" />
          <path d="M10 2.25a7.75 7.75 0 0 1 0 15.5" stroke="currentColor" strokeWidth="1.15" />
        </>
      )}
    </svg>
  )
}

const NAV_ITEMS = [
  { path: '/', label: 'Compose' },
  { path: '/dashboard', label: 'Library' },
  { path: '/how-it-works', label: 'Notes' },
]

const THEMES: Theme[] = ['dark', 'light', 'system']

export function Header() {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const { profile: user } = useAuth()

  const health = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 30_000,
    retry: false,
  })

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', handler, { passive: true })


    return () => window.removeEventListener('scroll', handler)
  }, [location.pathname])

  const nextTheme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!
  const healthClass = health.isError
    ? 'bg-rose-500'
    : health.isSuccess && !health.data.ok
      ? 'bg-amber-500'
      : 'bg-[#a54c3c]'

  return (
    <header className="sticky top-3 z-50 w-full px-3 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          'vault-header relative mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 rounded-2xl px-3 sm:px-4',
          scrolled && 'shadow-lg',
        )}
      >
        <Link to="/" className="group flex min-w-0 items-center gap-2.5" aria-label="Locknote home">
          <motion.span
            whileHover={{ rotate: -6, y: -1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 22 }}
            className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-[#a54c3c]/30 bg-[#a54c3c]/8 text-[#a54c3c]"
          >
            <Mark className="size-4" />
          </motion.span>
          <span className="hidden min-w-0 sm:block">
            <span className="block font-display text-sm font-extrabold tracking-[-0.04em] text-zinc-900 dark:text-zinc-100">LOCKNOTE</span>
            <span className="block font-mono text-[8px] font-bold tracking-[0.16em] text-zinc-400 dark:text-zinc-500">PRIVATE CORRESPONDENCE</span>
          </span>
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 rounded-xl border border-zinc-900/7 bg-zinc-900/[0.025] p-1 dark:border-white/8 dark:bg-white/[0.03] md:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'relative rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors',
                  isActive ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="header-active-underline"
                    className="absolute inset-x-3 bottom-0 h-px bg-[#a54c3c]"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  />
                )}
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-1.5">
          {user ? (
            <Link to="/profile" className="hidden items-center gap-2 rounded-xl border border-zinc-900/8 bg-white/35 py-1 pl-1 pr-2.5 text-[11px] font-bold text-zinc-700 transition-colors hover:bg-white/65 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 sm:flex">
              <img src={user.avatarUrl} alt={user.username} className="size-5 rounded-lg object-cover" />
              <span>{user.username}</span>
            </Link>
          ) : (
            <Link to="/login" className="hidden rounded-xl border border-zinc-900/10 px-2.5 py-1.5 text-[11px] font-bold text-zinc-700 transition-colors hover:border-[#a54c3c]/35 hover:text-[#a54c3c] dark:border-white/10 dark:text-zinc-200 sm:block">
              Sign in
            </Link>
          )}

          <button
            onClick={() => setTheme(nextTheme)}
            className="theme-switch inline-flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            aria-label={`Switch from ${theme} theme`}
            title={`Theme: ${theme}`}
          >
            <ThemeGlyph theme={theme} />
          </button>

          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
            className="hidden items-center gap-1.5 rounded-lg border border-zinc-900/8 bg-white/30 px-2 py-1 text-zinc-500 transition-colors hover:bg-white/65 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 sm:inline-flex"
            aria-label="Open command palette"
          >
            <span className="font-mono text-[9px]">Search</span><Kbd>⌘K</Kbd>
          </button>

          <span role="status" className={cn('size-1.5 rounded-full', healthClass)} title="Service status" aria-label={health.isError ? 'Service status: unavailable' : health.isSuccess && !health.data.ok ? 'Service status: degraded' : 'Service status: operational'} />
        </div>
      </motion.div>
    </header>
  )
}
