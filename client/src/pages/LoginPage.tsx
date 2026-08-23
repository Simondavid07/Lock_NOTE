import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Button, Card, TextInput } from '../components/ui'
import { getSupabaseConfigurationError, signInWithGithub, supabase } from '../lib/supabase'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const requestedPath = typeof location.state?.from === 'string' && location.state.from.startsWith('/') && !location.state.from.startsWith('//')
    ? location.state.from
    : '/dashboard'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)

  async function handleGithubAuth() {
    try {
      setLoading(true)
      await signInWithGithub(requestedPath)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'GitHub authentication failed — try email login')
      setLoading(false)
    }
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) { toast.error('Enter email and password'); return }
    if (!supabase) {
      const configurationError = getSupabaseConfigurationError()
      if (configurationError) {
        toast.error(configurationError)
        return
      }
      toast.error('Secure sign-in is unavailable until Supabase is configured.')
      return
    }

    setLoading(true)
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        toast.success('Account created. Check your email to confirm it.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        toast.success('Welcome back.')
        navigate(requestedPath, { replace: true })
      }
    } catch (err: any) {
      toast.error(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page mx-auto flex min-h-[calc(100vh-12rem)] max-w-md items-center py-12">
      <motion.div
        initial={{ opacity: 0, y: 22, rotate: 1.5 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        className="w-full"
      >
        <Card className="login-entry relative overflow-hidden p-7 sm:p-9">
          <div className="login-entry-wash" aria-hidden />
          <div className="relative z-10">
            <div className="text-center">
              <span className="login-mark" aria-hidden>L</span>
              <p className="hero-overline mt-6">Your private library</p>
              <h1 className="mt-4 font-display text-4xl font-semibold leading-[0.91] tracking-[-0.075em] text-zinc-900 dark:text-zinc-100">{isSignUp ? 'Make a place for your notes.' : 'Come back to what you sealed.'}</h1>
              <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-zinc-600 dark:text-zinc-300">{isSignUp ? 'Create an account to keep your private links and their read receipts close.' : 'Sign in to revisit the notes this browser has trusted you with.'}</p>
            </div>

            <div className="mt-8 space-y-5">
              <Button
                type="button"
                variant="secondary"
                loading={loading}
                onClick={() => void handleGithubAuth()}
                className="w-full gap-2.5 font-semibold"
              >
                <svg className="size-4 fill-current" viewBox="0 0 24 24" aria-hidden>
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                Continue with GitHub
              </Button>

              <div className="login-divider"><span>OR WITH EMAIL</span></div>

              <form onSubmit={(e) => void handleEmailAuth(e)} className="space-y-3">
                <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" aria-label="Email address" />
                <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" aria-label="Password" />
                <Button type="submit" loading={loading} className="w-full font-bold">
                  {isSignUp ? 'CREATE PRIVATE LIBRARY' : 'ENTER YOUR LIBRARY'}
                </Button>
              </form>

              <div className="border-t border-zinc-900/10 pt-5 text-center dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="font-mono text-[10px] font-bold tracking-[0.1em] text-zinc-500 transition-colors hover:text-[#a54c3c] dark:text-zinc-400 dark:hover:text-[#e49380]"
                >
                  {isSignUp ? 'ALREADY HAVE AN ACCOUNT? SIGN IN' : 'NEW TO LOCKNOTE? CREATE AN ACCOUNT'}
                </button>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}
