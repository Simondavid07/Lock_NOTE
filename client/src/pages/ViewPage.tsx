import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, useReducedMotion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { Badge, Button, Card, TextInput } from '../components/ui'
import { CopyButton } from '../components/CopyButton'
import { FingerprintBadge } from '../components/FingerprintBadge'
import { PasteRenderer } from '../components/PasteRenderer'
import { ExpiryCountdown } from '../components/ExpiryCountdown'
import {
  deriveEncryptionKey,
  decrypt,
  openContent,
  parseFragment,
  fingerprint,
  aadForFile,
  IntegrityError,
  type ContentEnvelope,
} from '../lib/crypto'
import { base64urlToBytes, toArrayBuffer, formatRelative } from '../lib/encoding'
import { api, type ConsumeResult, type Receipt } from '../lib/api'

type ViewState =
  | { kind: 'loading' }
  | { kind: 'gone'; reason: PasteGoneReason }
  | { kind: 'dead'; text: string }
  | { kind: 'not-found' }
  | { kind: 'passphrase'; consume: ConsumeResult }
  | { kind: 'revealed'; consume: ConsumeResult; envelope: ContentEnvelope; preview: boolean }

type PasteGoneReason = 'burned' | 'expired' | 'destroyed'

function goneCopy(reason: PasteGoneReason): { title: string; body: string } {
  switch (reason) {
    case 'burned':
      return {
        title: '🔥 Secret Burned',
        body: 'This secret was designed for exactly-once reading. It was successfully decrypted and has been permanently wiped from the server.',
      }
    case 'expired':
      return {
        title: '⏳ Secret Expired',
        body: 'Its specified lifetime ran out. The server has purged all ciphertext — no copies or backups exist.',
      }
    case 'destroyed':
      return {
        title: '🗑️ Secret Wiped',
        body: 'The owner remotely destroyed this secret or the dead switch triggered following days of silence.',
      }
  }
}

export function ViewPage() {
  const { id = '' } = useParams<{ id: string }>()
  const reduceMotion = useReducedMotion()
  const [state, setState] = useState<ViewState>({ kind: 'loading' })
  const [passphrase, setPassphrase] = useState('')
  const [passError, setPassError] = useState(false)
  const [burning, setBurning] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [wiping, setWiping] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const revealedRef = useRef(false)

  const ownerToken = useMemo(() => sessionStorage.getItem(`locknote:owner:${id}`), [id])

  const fetchReceipt = useCallback(async () => {
    if (!ownerToken) return
    try {
      const data = await api.receipt(id, ownerToken)
      setReceipt(data)
    } catch {
      /* ignore */
    }
  }, [id, ownerToken])

  const reveal = useCallback(
    async (consume: ConsumeResult, passphraseGuess?: string) => {
      try {
        const { secret } = parseFragment(window.location.hash)
        const key = await deriveEncryptionKey(secret, passphraseGuess ?? null, {
          salt: base64urlToBytes(consume.salt),
          kdf: consume.kdf,
          iterations: consume.iterations,
        })
        const envelope = await openContent(key, consume.id, consume.ciphertext, consume.iv)
        setState({ kind: 'revealed', consume, envelope, preview: consume.preview })
        setPassError(false)

        if (!consume.preview && envelope.v === 2 && envelope.receiptProof && !revealedRef.current) {
          revealedRef.current = true
          setBurning(true)
          try {
            await api.acknowledge(consume.id, envelope.receiptProof)
          } catch {
            // Receipt acknowledgement is best-effort. It never affects local decryption or burn semantics.
          } finally {
            window.setTimeout(() => setBurning(false), 900)
          }
        }
      } catch (err) {
        if (err instanceof IntegrityError) {
          if (consume.burnAfterRead && !consume.preview) {
            setState({ kind: 'passphrase', consume })
          } else {
            setState({
              kind: 'dead',
              text: 'Decryption failed. Ciphertext or key tampered with — seal broken.',
            })
          }
          setPassError(true)
        } else {
          console.error(err)
          setState({
            kind: 'dead',
            text: 'Something went wrong while decrypting. The secret could not be recovered.',
          })
        }
      }
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    revealedRef.current = false
    api
      .getMetadata(id)
      .then(async (meta) => {
        if (cancelled) return
        if (meta.status === 'burned') {
          setState({ kind: 'gone', reason: 'burned' })
          return
        }
        if (meta.status === 'expired') {
          setState({ kind: 'gone', reason: 'expired' })
          return
        }
        if (meta.status === 'dead') {
          setState({ kind: 'dead', text: 'Dead switch triggered: nobody visited for the specified period.' })
          return
        }
        if (meta.status === 'gone') {
          setState({ kind: 'not-found' })
          return
        }
        const consume = await api.consume(id, ownerToken ?? undefined)
        if (cancelled) return
        const { secret, requiresPassphrase } = parseFragment(window.location.hash)
        if (requiresPassphrase || (consume.kdf === 'pbkdf2' && !secret)) {
          setState({ kind: 'passphrase', consume })
          return
        }
        await reveal(consume)
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'not-found' })
      })
    return () => {
      cancelled = true
    }
  }, [id, ownerToken, reveal])

  const submitPassphrase = useCallback(async () => {
    const consume = state.kind === 'passphrase' ? state.consume : null
    if (!consume) return
    setPassError(false)
    await reveal(consume, passphrase)
  }, [state, passphrase, reveal])

  async function handleWipe(): Promise<void> {
    if (!ownerToken) return
    setWiping(true)
    try {
      await api.destroy(id, ownerToken)
      sessionStorage.removeItem(`locknote:owner:${id}`)
      toast.success('Paste destroyed remotely')
      setState({ kind: 'gone', reason: 'destroyed' })
    } catch {
      toast.error('Wipe failed — try again')
    } finally {
      setWiping(false)
    }
  }

  if (state.kind === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 pt-32 text-zinc-500 dark:text-zinc-400" role="status">
        <div className="size-8 animate-spin rounded-full border-2 border-lilac-deep border-t-lilac-dark" aria-hidden />
        <p className="text-sm">Decrypting payload in browser…</p>
      </div>
    )
  }

  if (state.kind === 'gone') {
    const copy = goneCopy(state.reason)
    return <GoneCard title={copy.title} body={copy.body} />
  }

  if (state.kind === 'dead') {
    return <GoneCard title="🩸 Seal Broken" body={state.text} />
  }

  if (state.kind === 'not-found') {
    return (
      <GoneCard
        title="🔍 Secret Not Found"
        body="This link doesn’t match anything on the server. It may have expired, been burned, or never existed."
      />
    )
  }

  if (state.kind === 'passphrase') {
    return (
      <div className="mx-auto max-w-md pt-24">
        <motion.div
          initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="p-6">
            <div className="text-center">
              <span aria-hidden className="text-4xl">🔑</span>
              <h1 className="mt-3 font-display text-xl font-bold">Passphrase Protected</h1>
              <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                The sender set a passphrase. Enter it below to derive the key and unlock.
              </p>
            </div>
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void submitPassphrase()
              }}
            >
              <TextInput
                type="password"
                value={passphrase}
                onChange={(e) => {
                  setPassphrase(e.target.value)
                  setPassError(false)
                }}
                placeholder="Enter Passphrase"
                aria-label="Passphrase"
                autoFocus
                autoComplete="off"
              />
              {passError && (
                <p className="text-xs text-rose-500 font-medium" role="alert">
                  Wrong passphrase — decryption failed. Try again.
                </p>
              )}
              <Button type="submit" className="w-full" loading={burning}>
                Unlock & Decrypt
              </Button>
            </form>
            <p className="mt-4 text-center text-[11px] text-zinc-400">
              Wrong attempts are free and harmless: failed decryption never burns the secret.
            </p>
          </Card>
        </motion.div>
      </div>
    )
  }

  // revealed
  const { consume, envelope, preview } = state
  const secret = parseFragment(window.location.hash).secret
  const fp = secret ? fingerprint(secret) : null
  const isFile = consume.format === 'file'
  const fileName = isFile && envelope.name ? envelope.name : `${consume.id}.bin`
  const fileMime = isFile && envelope.mime ? envelope.mime : 'application/octet-stream'

  async function downloadFile(): Promise<void> {
    if (!consume.fileLease || !consume.fileMeta) return
    setDownloading(true)
    try {
      const { secret: frag } = parseFragment(window.location.hash)
      const key = await deriveEncryptionKey(frag, passphrase || null, {
        salt: base64urlToBytes(consume.salt),
        kdf: consume.kdf,
        iterations: consume.iterations,
      })
      const ct = await api.downloadEncryptedFile(consume.id, consume.fileLease.token)
      const plain = await decrypt(key, ct, base64urlToBytes(consume.fileMeta.iv), aadForFile(consume.id))
      const blob = new Blob([toArrayBuffer(plain)], { type: fileMime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
      toast.success(`Decrypted ${fileName} in your browser`)
    } catch {
      toast.error('Could not decrypt the file — seal broken')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl pt-8">
      <AnimatePresence mode="wait">
        <motion.div
          key={consume.id}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-6"
        >
          {/* Top Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-lilac-deep/20 dark:border-void-line">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="mint" className="text-xs">🛡️ Decrypted Locally</Badge>
              {consume.burnAfterRead && <Badge tone="rose">🔥 Burn After Read</Badge>}
              {preview && <Badge tone="emerald">👁️ Owner Preview</Badge>}
              {consume.kdf === 'pbkdf2' && <Badge tone="amber">🔑 Passphrase Sealed</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {consume.expiresAt && consume.expiresAt > Date.now() ? <ExpiryCountdown expiresAt={consume.expiresAt} /> : null}
              <CopyButton text={window.location.href} label="Copy Link" autoClearSeconds={120} compact />
            </div>
          </div>

          {/* Asymmetric 2-Column Revealed Layout */}
          <div className="grid gap-8 lg:grid-cols-[1fr_340px] items-start">

            {/* Main Content Viewer */}
            <div className="space-y-4">
              {envelope.title && (
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{envelope.title}</h1>
              )}

              {isFile && consume.fileMeta ? (
                <Card className="p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <span aria-hidden className="text-4xl">📄</span>
                      <div>
                        <p className="text-base font-bold">{fileName}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {fileMime} · {(consume.fileMeta.size / 1024 / 1024).toFixed(2)} MB · Decrypted in browser
                        </p>
                      </div>
                    </div>
                    <Button loading={downloading} onClick={() => void downloadFile()}>
                      ⬇️ Decrypt &amp; Download
                    </Button>
                  </div>
                </Card>
              ) : (
                <Card className="overflow-hidden">
                  <div className="flex items-center justify-between border-b border-lilac-deep/20 dark:border-void-line px-5 py-3 bg-lilac/10 dark:bg-white/5">
                    <span className="text-xs font-bold uppercase tracking-wider text-lilac-dark dark:text-lilac-deep">{consume.format} Payload</span>
                    {consume.format !== 'file' && envelope.content !== undefined && (
                      <CopyButton text={envelope.content} label="Copy Content" autoClearSeconds={120} compact />
                    )}
                  </div>
                  <div className="p-6">
                    <PasteRenderer format={consume.format} content={envelope.content ?? ''} language={consume.language ?? envelope.language} />
                  </div>
                </Card>
              )}

              <div className="flex items-center justify-between text-xs text-zinc-400 pt-2">
                <span className="flex items-center gap-1.5">
                  <span>🛡️</span> Client-side Web Crypto (AES-256-GCM)
                </span>
                {burning && (
                  <span className="animate-pulse text-rose-500 font-bold" role="status">
                    Verifying open…
                  </span>
                )}
              </div>
            </div>

            {/* Sidebar Security & Verification Inspector */}
            <div className="space-y-4">
              {fp && (
                <Card className="p-5 border-lilac-deep/30">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">Out-of-Band Fingerprint</h2>
                  <FingerprintBadge fp={fp} />
                  <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
                    Compare these 4 words with the sender to verify link authenticity.
                  </p>
                </Card>
              )}

              {/* Owner Panel */}
              {ownerToken && (
                <Card className="p-5 border-lilac-deep/40 bg-lilac/20 dark:bg-lilac-dark/15">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-lilac-dark dark:text-lilac-deep flex items-center gap-1.5 mb-3">
                    <span>👑</span> Owner Capabilities
                  </h2>
                  <div className="space-y-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => {
                        if (!showReceipt) void fetchReceipt()
                        setShowReceipt(!showReceipt)
                      }}
                    >
                      📊 {showReceipt ? 'Hide View Receipt' : 'View Read Receipts'}
                    </Button>
                    <Button variant="danger" size="sm" className="w-full justify-start text-xs" loading={wiping} onClick={() => void handleWipe()}>
                      🗑️ Remote Wipe Paste
                    </Button>
                  </div>

                  {showReceipt && receipt && (
                    <div className="mt-3 pt-3 border-t border-lilac-deep/20 text-xs space-y-1.5 text-zinc-600 dark:text-zinc-300">
                      <p><strong>Verified opens:</strong> {receipt.viewCount}</p>
                      <p><strong>Acknowledged:</strong> {receipt.receiptAcknowledgedAt ? formatRelative(receipt.receiptAcknowledgedAt - Date.now()) : 'No verified acknowledgement yet'}</p>
                      <p><strong>First verified:</strong> {receipt.firstViewedAt ? formatRelative(receipt.firstViewedAt - Date.now()) : 'Never'}</p>
                      <p><strong>Last verified:</strong> {receipt.lastViewedAt ? formatRelative(receipt.lastViewedAt - Date.now()) : 'Never'}</p>
                    </div>
                  )}
                </Card>
              )}

              <div className="text-center pt-2">
                <Link to="/">
                  <Button variant="ghost" size="sm" className="w-full">
                    Seal your own secret →
                  </Button>
                </Link>
              </div>
            </div>

          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function GoneCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md pt-24">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <Card className="p-8 text-center">
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{body}</p>
          <div className="mt-6">
            <Link to="/">
              <Button variant="primary" size="lg">Seal a new secret</Button>
            </Link>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}