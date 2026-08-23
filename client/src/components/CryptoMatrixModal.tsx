import { AnimatePresence, motion } from 'motion/react'
import { Badge, Button, Card, Kbd } from './ui'

interface CryptoMatrixModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CryptoMatrixModal({ open, onOpenChange }: CryptoMatrixModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
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
            <Card className="p-6 border-lilac-deep/40 shadow-2xl">
              
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-lilac-deep/20 dark:border-void-line">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl" aria-hidden>🔬</span>
                  <div>
                    <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      Zero-Knowledge Cryptographic Ceremony Inspector
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Live Web Crypto (AES-256-GCM + PBKDF2 / HKDF) Pipeline
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

              {/* Step Flow */}
              <div className="mt-5 space-y-4 text-xs font-mono">

                {/* Step 1 */}
                <div className="rounded-xl border border-powder-deep/40 bg-powder/30 dark:bg-powder-dark/15 p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-powder-dark dark:text-powder-deep uppercase">Step 1: Client Payload Encoding</span>
                    <Badge tone="powder">UTF-8 JSON</Badge>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans">
                    Plaintext content is wrapped in a versioned envelope <code className="text-powder-dark font-mono">{'{ v: 1, title, content }'}</code> and encoded to raw bytes.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="rounded-xl border border-lilac-deep/40 bg-lilac/30 dark:bg-lilac-dark/15 p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-lilac-dark dark:text-lilac-deep uppercase">Step 2: Key Derivation (HKDF / PBKDF2)</span>
                    <Badge tone="lilac">600,000 Rounds</Badge>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans">
                    32-byte master secret <code className="text-lilac-dark font-mono">#k=...</code> derives 256-bit AES key. Optional passphrase uses PBKDF2-HMAC-SHA256 with 600k iterations.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="rounded-xl border border-mint-deep/40 bg-mint/30 dark:bg-mint-dark/15 p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-mint-dark dark:text-mint-deep uppercase">Step 3: AES-256-GCM + AAD Binding</span>
                    <Badge tone="mint">128-bit Tag</Badge>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans">
                    Payload is encrypted with a fresh 96-bit random IV. Paste ID is bound as Authenticated Additional Data <code className="text-mint-dark font-mono">`${'{pasteId}'}|locknote/v1`</code>.
                  </p>
                </div>

                {/* Step 4 */}
                <div className="rounded-xl border border-blush-deep/40 bg-blush/30 dark:bg-blush-dark/15 p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blush-dark dark:text-blush-deep uppercase">Step 4: URL Fragment Assembly</span>
                    <Badge tone="rose">Zero-Server Leak</Badge>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans">
                    Master secret is appended after <code className="text-blush-dark font-mono">#k=...</code>. HTTP spec guarantees browsers never transmit hash fragments over the network.
                  </p>
                </div>

              </div>

              {/* Action */}
              <div className="mt-6 flex justify-end">
                <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
                  Close Inspector
                </Button>
              </div>

            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
