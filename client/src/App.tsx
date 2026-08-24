import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { toast } from 'sonner'
import { supabase, takeAuthReturnPath, toAuthenticatedUser } from './lib/supabase'
import { AuthProvider } from './lib/auth'
import { RequireAuth } from './components/RequireAuth'
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
const GuardianWipePage = lazy(() =>
  import('./pages/GuardianWipePage').then((m) => ({ default: m.GuardianWipePage })),
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

      const user = toAuthenticatedUser(data.user)
      toast.success(`Welcome, @${user?.username ?? 'there'}.`, { id: 'gh-auth' })
      navigate(takeAuthReturnPath(), { replace: true })
    }

    void completeOAuthCallback()
  }, [location.pathname, location.search, navigate])

  return (
    <AuthProvider>
      <div className="vault-shell relative min-h-screen bg-ivory text-zinc-900 dark:bg-void dark:text-zinc-100 transition-colors duration-500">
      <a href="#main-content" className="sr-only fixed left-4 top-4 z-[100] rounded-lg bg-white px-4 py-2 text-sm font-bold text-zinc-900 shadow-lg focus:not-sr-only dark:bg-void-card dark:text-zinc-100">Skip to main content</a>
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
              id="main-content"
              tabIndex={-1}
              className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 sm:px-6 focus:outline-none"
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
                <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
                <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/auth/callback" element={<div className="flex min-h-[40vh] items-center justify-center font-mono text-xs tracking-[0.12em] text-zinc-500">COMPLETING SECURE SIGN-IN</div>} />
                <Route path="/paste/:id" element={<ViewPage />} />
                <Route path="/collab/:roomId" element={<CollabPage />} />
                <Route path="/guardian-wipe" element={<GuardianWipePage />} />
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
    </AuthProvider>
  )
}