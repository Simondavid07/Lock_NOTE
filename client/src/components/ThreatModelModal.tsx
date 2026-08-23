import { AnimatePresence, motion } from 'motion/react'
import { Badge, Button, Card, Kbd } from './ui'

interface ThreatModelModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const THREATS = [
  {
    threat: 'Server Compromise / Malicious Admin',
    mitigation: 'The server stores only opaque AES-256-GCM ciphertext. The master key #k=... is in the URL hash and never transmitted.',
    status: 'Mitigated by E2E Design',
    tone: 'emerald' as const,
  },
  {
    threat: 'Network Eavesdropping / Man-in-the-Middle',
    mitigation: 'All HTTP traffic is TLS encrypted. Even if captured, ciphertext cannot be decrypted without the fragment key.',
    status: 'Protected by Web Crypto',
    tone: 'emerald' as const,
  },
  {
    threat: 'Database Leaks / Backups',
    mitigation: 'Pastes feature exact-once burn purges and automated dead-switch cleanup. Expired ciphertext is unrecoverable.',
    status: 'Zero Storage Footprint',
    tone: 'lilac' as const,
  },
  {
    threat: 'Passphrase Brute-Force Attacks',
    mitigation: 'Passphrases use PBKDF2-HMAC-SHA256 with 600,000 iterations to make offline key guessing computationally prohibitive.',
    status: 'Hardened PBKDF2 600k',
    tone: 'powder' as const,
  },
]

export function ThreatModelModal({ open, onOpenChange }: ThreatModelModalProps) {
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
            className="w-full max-w-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <Card className="p-6 border-lilac-deep/40 shadow-2xl space-y-5">
              
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-lilac-deep/20 dark:border-void-line">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl" aria-hidden>🛡️</span>
                  <div>
                    <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      Zero-Knowledge Threat Model & Boundaries
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans">
                      Cryptographic Guarantees & Attack Mitigations
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

              {/* Threat Grid */}
              <div className="space-y-3">
                {THREATS.map((t) => (
                  <div
                    key={t.threat}
                    className="rounded-xl border border-lilac-deep/20 bg-white/40 dark:bg-void-soft/40 p-3.5 space-y-1 backdrop-blur-md"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-xs font-bold text-zinc-900 dark:text-zinc-100">{t.threat}</h3>
                      <Badge tone={t.tone} className="text-[10px]">{t.status}</Badge>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-sans">{t.mitigation}</p>
                  </div>
                ))}
              </div>

              {/* Action */}
              <div className="flex justify-end pt-2">
                <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
                  Close Threat Model
                </Button>
              </div>

            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
