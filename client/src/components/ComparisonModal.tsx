import { AnimatePresence, motion } from 'motion/react'
import { Card, Kbd } from './ui'

const FEATURES = [
  { name: 'Zero-Knowledge Encryption', locknote: '✅ AES-256-GCM', privatebin: '✅ AES-256-CBC', pastebin: '❌ Plaintext' },
  { name: 'Key Derivation Protocol', locknote: '✅ PBKDF2 600,000 / HKDF', privatebin: '⚠️ PBKDF2 10,000', pastebin: '❌ None' },
  { name: 'Encrypted File Pastes', locknote: '✅ 5 MB Browser Encrypted', privatebin: '⚠️ Limited Attachment', pastebin: '❌ Premium Only' },
  { name: 'Realtime Team Collaboration', locknote: '✅ Built-in Collab Rooms', privatebin: '❌ None', pastebin: '❌ None' },
  { name: 'Burn-on-Read Auto Purge', locknote: '✅ Server Disintegration', privatebin: '✅ Supported', pastebin: '❌ None' },
  { name: 'Custom Pastel Glassmorphism UI', locknote: '🎨 Modern Glass Studio', privatebin: '📄 Legacy Web UI', pastebin: '📄 Basic UI' },
]

interface ComparisonModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ComparisonModal({ open, onOpenChange }: ComparisonModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md p-4"
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="w-full max-w-3xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <Card className="p-6 border-lilac-deep/40 shadow-2xl space-y-5">
              
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-lilac-deep/20 dark:border-void-line">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl" aria-hidden>📊</span>
                  <div>
                    <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">
                      Locknote vs Traditional Secret Sharers
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans">
                      Side-by-side feature and security capability benchmark
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onOpenChange(false)}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-lilac/30 dark:hover:bg-white/10"
                >
                  <Kbd>esc</Kbd>
                </button>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-lilac-deep/20">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-lilac-deep/20 dark:border-void-line bg-lilac/10 dark:bg-void-soft/60">
                      <th className="p-3 font-display font-extrabold text-zinc-900 dark:text-zinc-100">Capability</th>
                      <th className="p-3 font-display font-black text-lilac-dark dark:text-lilac-deep bg-lilac/30 dark:bg-lilac-dark/30">
                        ⚡ LOCKNOTE STUDIO
                      </th>
                      <th className="p-3 font-display font-bold text-zinc-500">PrivateBin</th>
                      <th className="p-3 font-display font-bold text-zinc-500">Pastebin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-lilac-deep/15 dark:divide-void-line font-sans">
                    {FEATURES.map((f, i) => (
                      <tr key={i} className="hover:bg-lilac/10 transition-colors">
                        <td className="p-3 font-bold text-zinc-800 dark:text-zinc-200">{f.name}</td>
                        <td className="p-3 font-semibold text-lilac-dark dark:text-lilac-deep bg-lilac/15 dark:bg-lilac-dark/15">
                          {f.locknote}
                        </td>
                        <td className="p-3 text-zinc-500">{f.privatebin}</td>
                        <td className="p-3 text-zinc-400">{f.pastebin}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
