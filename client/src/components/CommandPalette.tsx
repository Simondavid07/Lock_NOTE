import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { useAppStore } from '../lib/app-store'
import { bindCommandPaletteHotkey } from '../lib/command-palette'
import { cn } from '../lib/cn'
import { Kbd } from './ui'

interface Command {
  id: string
  label: string
  hint?: string
  icon: string
  run: () => void
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate()
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  useEffect(bindCommandPaletteHotkey, [])
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: 'new',
        label: 'Create a new sealed paste',
        hint: 'Compose + encrypt + share',
        icon: '🔒',
        run: () => navigate('/'),
      },
      {
        id: 'how',
        label: 'How Locknote works',
        hint: 'Zero-knowledge explainer',
        icon: '📖',
        run: () => navigate('/how-it-works'),
      },
      {
        id: 'theme-dark',
        label: 'Switch to dark theme',
        icon: '🌙',
        run: () => setTheme('dark'),
      },
      {
        id: 'theme-light',
        label: 'Switch to light theme',
        icon: '☀️',
        run: () => setTheme('light'),
      },
      {
        id: 'theme-system',
        label: 'Follow system theme',
        icon: '🖥️',
        run: () => setTheme('system'),
      },
      {
        id: 'copy-url',
        label: 'Copy current page URL',
        icon: '🔗',
        run: () => {
          void navigator.clipboard.writeText(window.location.href)
          toast.success('URL copied to clipboard')
        },
      },
    ]
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q))
  }, [query, navigate, setTheme])

  useEffect(() => {
    setActive(0)
  }, [query, commands.length])

  function run(cmd: Command): void {
    onOpenChange(false)
    cmd.run()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm pt-[18vh] px-4"
          onClick={() => onOpenChange(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ type: 'spring', duration: 0.25, bounce: 0.15 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-void-line dark:bg-void-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-zinc-200 px-4 dark:border-void-line">
              <span aria-hidden>⌕</span>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setActive((a) => Math.min(a + 1, commands.length - 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setActive((a) => Math.max(a - 1, 0))
                  } else if (e.key === 'Enter' && commands[active]) {
                    run(commands[active]!)
                  }
                }}
                placeholder="Type a command…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                aria-label="Search commands"
              />
              <Kbd>esc</Kbd>
            </div>
            <ul role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto p-2">
              {commands.length === 0 && <li className="px-3 py-6 text-center text-sm text-zinc-400">No matching commands.</li>}
              {commands.map((cmd, i) => (
                <li key={cmd.id} role="option" aria-selected={i === active}>
                  <button
                    onClick={() => run(cmd)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                      i === active ? 'bg-indigo-50 dark:bg-indigo-500/15' : 'hover:bg-zinc-100 dark:hover:bg-white/5',
                    )}
                  >
                    <span aria-hidden className="text-base">{cmd.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-medium">{cmd.label}</span>
                      {cmd.hint && <span className="block text-xs text-zinc-500 dark:text-zinc-400">{cmd.hint}</span>}
                    </span>
                    {theme && <span className="text-[10px] text-zinc-400">{cmd.id.includes('theme') ? `current: ${theme}` : ''}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}