import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Badge, Button, Card } from '../components/ui'
import { CopyButton } from '../components/CopyButton'
import { getAuthenticatedUser, getTrackedPastes, removeTrackedPaste, signOut, supabase, type TrackedPaste } from '../lib/supabase'
import { api } from '../lib/api'
import { formatRelative } from '../lib/encoding'

export function DashboardPage() {
  const [pastes, setPastes] = useState<TrackedPaste[]>([])
  const [wipingId, setWipingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'burned'>('all')
  const [user, setUser] = useState<{ username: string; name: string; avatarUrl: string } | null>(null)

  useEffect(() => {
    setPastes(getTrackedPastes())

    void (async () => {
      const authenticated = await getAuthenticatedUser()
      if (authenticated) {
        setUser(authenticated)
        return
      }

      if (!supabase) {
        const demo = localStorage.getItem('locknote:demo_user')
        if (demo) {
          try {
            const parsed = JSON.parse(demo) as { email: string; name: string }
            setUser({
              username: parsed.name,
              name: parsed.name,
              avatarUrl: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(parsed.name)}`,
            })
          } catch { setUser(null) }
        }
      }
    })()
  }, [])

  async function handleWipe(p: TrackedPaste) {
    if (!p.ownerToken) return
    setWipingId(p.id)
    try {
      await api.destroy(p.id, p.ownerToken)
      removeTrackedPaste(p.id)
      setPastes((prev) => prev.filter((item) => item.id !== p.id))
      toast.success('Note withdrawn from the server')
    } catch {
      toast.error('Could not withdraw this note — it may already be gone')
    } finally {
      setWipingId(null)
    }
  }

  const filteredPastes = pastes.filter((p) => {
    if (filter === 'burned') return p.burnAfterRead || p.isBurned
    if (filter === 'active') return !p.isBurned
    return true
  })

  const totalViews = pastes.reduce((acc, p) => acc + (p.viewCount || 1), 0)
  const activeCount = pastes.filter((p) => !p.isBurned).length
  const burnCount = pastes.filter((p) => p.burnAfterRead).length

  return (
    <div className="dashboard-page mx-auto max-w-6xl space-y-8 pb-20 pt-8 sm:space-y-10">
      <motion.header
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        className="library-header"
      >
        <div className="max-w-2xl">
          <p className="hero-overline">Your private library</p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-[0.9] tracking-[-0.075em] text-zinc-900 dark:text-zinc-100 sm:text-6xl">Notes you have sealed.</h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">Keep an eye on the private links you created in this browser. Share them, read their receipts, or withdraw them when the moment has passed.</p>
          {user && (
            <div className="library-user mt-5">
              <img src={user.avatarUrl} alt={user.username} className="size-6 rounded-full object-cover" />
              <span>@{user.username}</span>
              <span className="library-user-rule" />
              <span>{user.name}</span>
              <span className="library-verified">SIGNED IN</span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {user && (
            <button
              onClick={() => {
                void (async () => {
                  try {
                    await signOut()
                    localStorage.removeItem('locknote:demo_user')
                    setUser(null)
                    toast.success('Signed out of your private library')
                  } catch {
                    toast.error('Could not sign out. Please try again.')
                  }
                })()
              }}
              className="hidden px-2 py-1 font-mono text-[10px] font-bold tracking-[0.1em] text-zinc-400 transition-colors hover:text-[#a54c3c] sm:block"
            >
              SIGN OUT
            </button>
          )}
          <Link to="/">
            <Button size="sm" className="library-new-note">NEW PRIVATE NOTE <span aria-hidden>↗</span></Button>
          </Link>
        </div>
      </motion.header>

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        className="library-stats"
        aria-label="Library overview"
      >
        {[
          { value: pastes.length, label: 'Notes sealed' },
          { value: activeCount, label: 'Still active' },
          { value: burnCount, label: 'Burn on read' },
          { value: totalViews, label: 'Openings recorded' },
        ].map((stat, index) => (
          <div key={stat.label} className="library-stat">
            <span className="font-mono text-[10px] font-bold tracking-[0.12em] text-[#a54c3c]">0{index + 1}</span>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </motion.section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="library-filters" role="tablist" aria-label="Filter library">
            {([
              ['all', `All notes · ${pastes.length}`],
              ['active', 'Active'],
              ['burned', 'Burned'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={filter === id}
                onClick={() => setFilter(id)}
                className={filter === id ? 'is-active' : ''}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="font-mono text-[10px] font-bold tracking-[0.11em] text-zinc-400">LOCAL LIBRARY · THIS BROWSER</p>
        </div>

        {filteredPastes.length === 0 ? (
          <Card className="library-empty p-10 text-center sm:p-14">
            <span className="library-empty-mark" aria-hidden>L</span>
            <h2 className="mt-5 font-display text-2xl font-semibold tracking-[-0.05em]">Nothing filed here yet.</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-zinc-500 dark:text-zinc-400">When you seal a note, it appears here so you can keep its link close and decide when it should disappear.</p>
            <Link to="/" className="mt-6 inline-flex"><Button size="sm">WRITE YOUR FIRST NOTE <span aria-hidden>↗</span></Button></Link>
          </Card>
        ) : (
          <div className="library-list">
            {filteredPastes.map((p, index) => (
              <motion.article
                key={p.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: index * 0.045, ease: [0.22, 1, 0.36, 1] }}
                className="library-entry"
              >
                <div className="library-entry-index">{String(index + 1).padStart(2, '0')}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg font-semibold tracking-[-0.045em] text-zinc-900 dark:text-zinc-100">{p.title || `Private note ${p.id.slice(0, 5)}`}</h2>
                    <Badge tone={p.format === 'file' ? 'emerald' : 'lilac'} className="text-[10px] uppercase">{p.format}</Badge>
                    {p.burnAfterRead && <Badge tone="rose" className="text-[10px]">burn on read</Badge>}
                    {p.passphraseProtected && <Badge tone="amber" className="text-[10px]">passphrase protected</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] font-semibold text-zinc-400">
                    <span>SEALED {formatRelative(p.createdAt)}</span>
                    <span className="text-zinc-300 dark:text-zinc-600">/</span>
                    <span>NOTE {p.id}</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <CopyButton text={p.url} label="Copy link" />
                  {p.ownerToken && (
                    <Button
                      variant="danger"
                      size="sm"
                      loading={wipingId === p.id}
                      onClick={() => void handleWipe(p)}
                      className="text-[11px]"
                    >
                      WITHDRAW
                    </Button>
                  )}
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
