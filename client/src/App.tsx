import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { toast } from 'sonner'
import { cacheAuthenticatedUser, supabase } from './lib/supabase'
import { ViewPage } from './pages/ViewPage'
import { AboutPage } from './pages/AboutPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { CommandPalette } from './components/CommandPalette'
import { useCommandPalette } from './lib/command-palette'

const CreatePage = lazy(() =>
  import('./pages/CreatePage').then((m) => ({ default: m.CreatePage })),
)
const CollabPage = lazy(() =>
  import('./pages/CollabPage').then((m) => ({ default: m.CollabPage })),
)
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)

import { VaultBackdrop } from './components/VaultBackdrop'
import { CustomCursor } from './components/CustomCursor'

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const { open, setOpen } = useCommandPalette()

  useEffect(() => {
    const supabaseClient = supabase
    if (!supabaseClient) return

    const completeOAuthCallback = async () => {
      if (location.pathname !== '/auth/callback') return
      const code = new URLSearchParams(window.location.search).get('code')
      if (!code) {
        toast.error('The GitHub sign-in callback did not include a session code.')
        navigate('/login', { replace: true })
        return
      }

      toast.loading('Completing GitHub sign-in…', { id: 'gh-auth' })
      const { data, error } = await supabaseClient.auth.exchangeCodeForSession(code)
      if (error || !data.user) {
        toast.error(error?.message || 'GitHub sign-in could not be completed.', { id: 'gh-auth' })
        navigate('/login', { replace: true })
        return
      }

      const user = cacheAuthenticatedUser(data.user)
      toast.success(`Welcome, @${user?.username ?? 'there'}.`, { id: 'gh-auth' })
      navigate('/dashboard', { replace: true })
    }

    void completeOAuthCallback()
    const { data: listener } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      cacheAuthenticatedUser(session?.user ?? null)
    })

    return () => listener.subscription.unsubscribe()
  }, [location.pathname, location.search, navigate])

  return (
    <div className="vault-shell relative min-h-screen bg-ivory text-zinc-900 dark:bg-void dark:text-zinc-100 transition-colors duration-500">
      <VaultBackdrop />
      <CustomCursor />

      {/* ── Content layer ── */}
      <div className="vault-content relative flex min-h-screen flex-col">
        <Header />
        <CommandPalette open={open} onOpenChange={setOpen} />
        <AnimatePresence mode="wait">
          <motion.main
            key={location.pathname}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 14, filter: reduceMotion ? 'blur(0px)' : 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -8, filter: reduceMotion ? 'blur(0px)' : 'blur(2px)' }}
            transition={{ duration: reduceMotion ? 0.01 : 0.48, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 sm:px-6"
          >
            <Suspense
              fallback={
                <div className="flex min-h-[40vh] items-center justify-center gap-3">
                  <div className="size-5 rounded-full border-2 border-lilac-deep border-t-lilac-dark animate-spin" aria-hidden />
                  <span className="text-sm text-zinc-400">Loading…</span>
                </div>
              }
            >
              <Routes location={location}>
                <Route path="/" element={<CreatePage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/auth/callback" element={<div className="flex min-h-[40vh] items-center justify-center font-mono text-xs tracking-[0.12em] text-zinc-500">COMPLETING SECURE SIGN-IN</div>} />
                <Route path="/paste/:id" element={<ViewPage />} />
                <Route path="/collab/:roomId" element={<CollabPage />} />
                <Route path="/how-it-works" element={<AboutPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </motion.main>
        </AnimatePresence>
        <Footer />
        <Link to="/how-it-works" className="sr-only">
          How it works
        </Link>
      </div>
    </div>
  )
}