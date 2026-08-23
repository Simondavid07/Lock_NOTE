import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { CopyButton } from './CopyButton'
import { FingerprintBadge, type SealFingerprint } from './FingerprintBadge'
import { Badge, Button, Card } from './ui'
import { formatRelative } from '../lib/encoding'

export interface ShareResult {
  id: string
  url: string
  ownerToken: string
  fingerprint: SealFingerprint
  format: string
  burnAfterRead: boolean
  passphraseProtected: boolean
  expiresAt: number | null
  createdAt: number
}

async function qrDataUrl(text: string): Promise<string> {
  const { default: QRCode } = await import('qrcode')
  return QRCode.toDataURL(text, {
    margin: 1,
    width: 280,
    color: { dark: '#0a0e17ff', light: '#ffffffff' },
  })
}

export function ShareCard({ result, onReset }: { result: ShareResult; onReset: () => void }) {
  const [qr, setQr] = useState<string | null>(null)
  const [qrFailed, setQrFailed] = useState(false)
  const [wiping, setWiping] = useState(false)
  const reduceMotion = useReducedMotion()
  const ownerTokenSaved = useRef(false)

  useEffect(() => {
    if (ownerTokenSaved.current) return
    ownerTokenSaved.current = true
    // Owner capability for this tab: enables non-burning previews + wipe.
    sessionStorage.setItem(`locknote:owner:${result.id}`, result.ownerToken)
    void qrDataUrl(result.url)
      .then(setQr)
      .catch(() => setQrFailed(true))
  }, [result])

  async function shareNative(): Promise<void> {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Locknote secret', url: result.url })
      } catch {
        /* user cancelled */
      }
    } else {
      toast.info('Native sharing is not available on this browser')
    }
  }

  async function wipe(): Promise<void> {
    setWiping(true)
    try {
      await api.destroy(result.id, result.ownerToken)
      sessionStorage.removeItem(`locknote:owner:${result.id}`)
      toast.success('Paste destroyed remotely')
      onReset()
    } catch {
      toast.error('Wipe failed — try again')
    } finally {
      setWiping(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="vault-panel overflow-hidden rounded-[1.7rem]">
        <div className="relative border-b border-lilac-deep/15 p-5 sm:p-6 dark:border-void-line">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="vault-kicker mb-1">Seal complete</p>
              <h2 className="font-display text-xl font-bold tracking-tight">Your note is sealed for delivery.</h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {result.burnAfterRead && <Badge tone="rose">burn after read</Badge>}
              {result.passphraseProtected && <Badge tone="amber">passphrase protected</Badge>}
              {result.expiresAt !== null && <Badge tone="indigo">expires {formatRelative(result.expiresAt - Date.now())}</Badge>}
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            This link contains the path to open the note; its key remains in the fragment, never in the server request. Share it with intent.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400" htmlFor="share-url">
                Private delivery link
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="share-url"
                  readOnly
                  value={result.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-lilac-deep/25 bg-white/68 px-3 font-mono text-xs text-zinc-700 shadow-inner backdrop-blur-md dark:border-void-line dark:bg-void/70 dark:text-zinc-300"
                  aria-label="Secret share link"
                />
                <CopyButton text={result.url} label="Copy link" autoClearSeconds={120} />
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                The part after <code className="font-mono">#</code> is the decryption key. It is carried by the link, not stored by Locknote.
              </p>
            </div>

            <FingerprintBadge fp={result.fingerprint} />

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {typeof navigator.share === 'function' && (
                <Button variant="secondary" size="sm" onClick={() => void shareNative()}>
                  Send privately <span aria-hidden>↗</span>
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onReset}>
                Write another note
              </Button>
              <Button variant="ghost" size="sm" loading={wiping} onClick={() => void wipe()} className="text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                Withdraw this note
              </Button>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-2">
            {qr && !qrFailed && (
              <>
                <img
                  src={qr}
                  alt={`QR code linking to the sealed paste ${result.id}`}
                  className="size-36 rounded-2xl border border-lilac-deep/25 bg-white p-2 shadow-lg shadow-lilac-deep/10 dark:border-void-line"
                  width={144}
                  height={144}
                />
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Open this note on another device</span>
              </>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  )
}