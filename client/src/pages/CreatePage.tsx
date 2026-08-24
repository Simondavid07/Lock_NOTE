import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { Confetti } from '../components/Confetti'
import { CryptoMatrixModal } from '../components/CryptoMatrixModal'
import { SecurityScoreGauge } from '../components/SecurityScoreGauge'
import { ThreatModelModal } from '../components/ThreatModelModal'
import { HexDumpInspector } from '../components/HexDumpInspector'
import { ComparisonModal } from '../components/ComparisonModal'
import { Editor } from '../components/Editor'
import { saveTrackedPaste } from '../lib/supabase'
import { SealAnimation, type SealPhase } from '../components/SealAnimation'
import { ShareCard, type ShareResult } from '../components/ShareCard'
import { Badge, Button, Card, Switch, TextInput } from '../components/ui'
import { cn } from '../lib/cn'
import {
  deriveEncryptionKey,
  generateOwnerToken,
  generatePasteId,
  generateSalt,
  generateSecret,
  generateReceiptProof,
  generateGuardianCapability,
  sha256Base64url,
  PBKDF2_ITERATIONS,
  sealContent,
  fingerprint,
  buildShareUrl,
  aadForFile,
  encrypt,
  type ContentEnvelope,
  type PasteFormat,
} from '../lib/crypto'
import { base64urlToBytes, bytesToBase64, bytesToBase64url, formatBytes } from '../lib/encoding'
import { api } from '../lib/api'
import { splitGuardianCapability } from '../lib/guardian-wipe'

type SecretType = Exclude<PasteFormat, 'file'> | 'file'

const SECRET_TYPES: Array<{ id: SecretType; label: string; icon: string; hint: string; color: string; bg: string; darkBg: string }> = [
  { id: 'text',        label: 'Text',        icon: '📝', hint: 'Plain text note',      color: 'text-powder-dark',  bg: 'bg-powder/80',  darkBg: 'dark:bg-powder-dark/20' },
  { id: 'markdown',    label: 'Markdown',    icon: '📄', hint: 'Rendered on open',     color: 'text-lilac-dark',   bg: 'bg-lilac/80',   darkBg: 'dark:bg-lilac-dark/20'  },
  { id: 'code',        label: 'Code',        icon: '⌨️',  hint: 'Syntax highlighted',   color: 'text-blush-dark',   bg: 'bg-blush/80',   darkBg: 'dark:bg-blush-dark/20'  },
  { id: 'credentials', label: 'Credentials', icon: '🗝️',  hint: 'Keys & secrets',       color: 'text-butter-dark',  bg: 'bg-butter/80',  darkBg: 'dark:bg-butter-dark/20' },
  { id: 'file',        label: 'File',        icon: '📎', hint: 'Up to 5 MB',           color: 'text-mint-dark',    bg: 'bg-mint/80',    darkBg: 'dark:bg-mint-dark/20'   },
]

const LANGUAGES = [
  'javascript', 'typescript', 'python', 'json', 'html', 'css', 'sql', 'yaml', 'cpp',
] as const

const TTL_PRESETS = [
  { label: '5m',   seconds: 300 },
  { label: '1h',   seconds: 3600 },
  { label: '1d',   seconds: 86400 },
  { label: '1w',   seconds: 604800 },
  { label: '1mo',  seconds: 2592000 },
  { label: 'Never', seconds: 0 },
] as const

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Local Serialization',
    desc: 'Plaintext is wrapped in a versioned envelope inside your browser context.',
    icon: '📝',
    badge: 'Client UTF-8',
  },
  {
    step: '02',
    title: 'Key Derivation',
    desc: '32-byte master secret derives a 256-bit key using HKDF-SHA256 or PBKDF2 600k.',
    icon: '🔑',
    badge: 'Web Crypto',
  },
  {
    step: '03',
    title: 'AES-256-GCM Seal',
    desc: 'Payload is encrypted with a 96-bit random IV and bound to paste ID as AAD.',
    icon: '🛡️',
    badge: 'Authenticated',
  },
  {
    step: '04',
    title: 'Fragment Delivery',
    desc: 'Master key resides in hash fragment (#k=...) which browsers never send to HTTP servers.',
    icon: '🔗',
    badge: 'Zero Network Leak',
  },
]

function passphraseStrength(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (!pw) return { score: 0, label: '' }
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 14) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  const clamped = Math.min(3, score) as 0 | 1 | 2 | 3
  const labels = ['Weak', 'Okay', 'Good', 'Strong']
  return { score: clamped, label: labels[clamped]! }
}

const FILE_MAX = 5 * 1024 * 1024

const DICEWARE_WORDS = [
  'velvet', 'quantum', 'falcon', 'emerald', 'shadow', 'nebula', 'crystal',
  'phoenix', 'cipher', 'horizon', 'solaris', 'aurora', 'vortex', 'titan',
  'monarch', 'infinity', 'starlight', 'radiant', 'eclipse', 'prism',
]

function generateDicewarePassphrase(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => DICEWARE_WORDS[b % DICEWARE_WORDS.length]).join('-')
}

export function CreatePage() {
  const reduceMotion = useReducedMotion()

  const [type, setType] = useState<SecretType>('text')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [language, setLanguage] = useState<string>('javascript')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [ttl, setTtl] = useState<number>(86400)
  const [burn, setBurn] = useState(false)
  const [deadSwitch, setDeadSwitch] = useState<number>(0)
  const [guardianEnabled, setGuardianEnabled] = useState(false)
  const [guardianThreshold, setGuardianThreshold] = useState(2)
  const [guardianTotal, setGuardianTotal] = useState(3)
  const [passphrase, setPassphrase] = useState('')
  const [showPassphrase, setShowPassphrase] = useState(false)
  const [phase, setPhase] = useState<SealPhase>('idle')
  const [result, setResult] = useState<ShareResult | null>(null)
  const [showMatrix, setShowMatrix] = useState(false)
  const [showThreatModel, setShowThreatModel] = useState(false)
  const [showComparison, setShowComparison] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const strength = useMemo(() => passphraseStrength(passphrase), [passphrase])

  const dropzoneLabel =
    type === 'file'
      ? file
        ? `📎 ${file.name} · ${formatBytes(file.size)}`
        : 'Drop an encrypted file here, or click to browse'
      : ''

  async function handleFile(picked: File | null): Promise<void> {
    setFileError(null)
    if (!picked) return
    if (picked.size > FILE_MAX) {
      setFileError(`File exceeds 5 MB limit (${formatBytes(picked.size)})`)
      setFile(null)
      return
    }
    setFile(picked)
  }

  async function handleSeal(): Promise<void> {
    if (type === 'file' && !file) { toast.error('Choose a file to seal'); return }
    if (type !== 'file' && !content.trim()) { toast.error('Write something before sealing'); return }
    if (passphrase && strength.score < 1) { toast.error('Use a stronger passphrase (8+ characters)'); return }

    setPhase('encrypting')
    try {
      const id = generatePasteId()
      const secret = generateSecret()
      const salt = generateSalt()
      const requiresPassphrase = Boolean(passphrase)
      const key = await deriveEncryptionKey(secret, passphrase || null, {
        salt: base64urlToBytes(salt),
        kdf: requiresPassphrase ? 'pbkdf2' : 'hkdf',
        iterations: requiresPassphrase ? PBKDF2_ITERATIONS : 0,
      })

      const receiptProof = generateReceiptProof()
      const receiptProofHash = await sha256Base64url(receiptProof)
      const guardianCapability = guardianEnabled ? generateGuardianCapability() : null
      const guardianShares = guardianCapability
        ? await splitGuardianCapability(guardianCapability, id, guardianThreshold, guardianTotal)
        : null
      const guardian = guardianCapability
        ? { threshold: guardianThreshold, total: guardianTotal, verifier: await sha256Base64url(guardianCapability) }
        : undefined
      let filePayload: { storagePayload: string; size: number; fileIv: string } | undefined
      let envelope: ContentEnvelope
      if (type === 'file' && file) {
        const raw = new Uint8Array(await file.arrayBuffer())
        const { ciphertext: fileCt, iv: fileIvBytes } = await encrypt(key, raw, aadForFile(id))
        envelope = { v: 2, title: title || undefined, name: file.name, mime: file.type || 'application/octet-stream', receiptProof }
        filePayload = { storagePayload: bytesToBase64(fileCt), size: file.size, fileIv: bytesToBase64url(fileIvBytes) }
      } else {
        envelope = { v: 2, title: title || undefined, content, language: type === 'code' ? language : undefined, receiptProof }
      }

      const { ciphertextB64, ivB64 } = await sealContent(key, id, envelope)
      setPhase('uploading')
      const ownerToken = generateOwnerToken()
      const res = await api.createPaste({
        id, ciphertext: ciphertextB64, salt, iv: ivB64,
        iterations: requiresPassphrase ? PBKDF2_ITERATIONS : 0,
        kdf: requiresPassphrase ? 'pbkdf2' : 'hkdf',
        alg: 'aes-256-gcm', format: type,
        language: type === 'code' ? language : null,
        burnAfterRead: burn, deadSwitchDays: deadSwitch || null,
        ttlSeconds: ttl, ownerToken, receiptProofHash, guardian, file: filePayload,
      })

      sessionStorage.setItem(`locknote:owner:${res.id}`, ownerToken)
      setPhase('done')
      const url = buildShareUrl(window.location.origin, res.id, requiresPassphrase ? null : secret, requiresPassphrase)
      
      saveTrackedPaste({
        id: res.id,
        title: title || undefined,
        format: res.format,
        url,
        ownerToken,
        createdAt: res.createdAt,
        expiresAt: res.expiresAt,
        burnAfterRead: burn,
        passphraseProtected: requiresPassphrase,
      })

      setResult({
        id: res.id, url, ownerToken,
        fingerprint: fingerprint(secret),
        format: res.format, burnAfterRead: burn,
        passphraseProtected: requiresPassphrase,
        expiresAt: res.expiresAt, createdAt: res.createdAt,
        guardian: guardianShares ? { threshold: guardianThreshold, total: guardianTotal, shares: guardianShares } : undefined,
      })
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error && err.message.includes('JSON')
        ? 'Sealing failed — server rejected payload'
        : 'Sealing failed — please try again')
      setPhase('idle')
    }
  }

  // Bind Cmd+S / Ctrl+S to trigger sealing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void handleSeal()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [type, file, content, passphrase, strength, title, language, burn, deadSwitch, guardianEnabled, guardianThreshold, guardianTotal, ttl])

  if (result) {
    return (
      <div className="mx-auto max-w-3xl pt-10">
        <SealAnimation phase="done" />
        <ShareCard result={result} onReset={() => setResult(null)} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl pt-6 pb-20 space-y-12">

      {/* Correspondence hero */}
      <motion.section
        initial={{ opacity: 0, y: reduceMotion ? 0 : 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0.01 : 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="correspondence-hero mb-8"
      >
        <div className="relative z-10 grid items-end gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <div>
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="editorial-rule mb-5"
            />
            <p className="hero-overline">A private way to say what matters</p>
            <h1 className="hero-title mt-5">
              Some things<br />deserve to<br /><em>disappear beautifully.</em>
            </h1>
            <p className="hero-led mt-7">
              Say what you need to say, then let the note leave no permanent trace. Locknote encrypts it before it travels and lets you decide when the story ends.
            </p>

            <div className="mt-8 grid max-w-2xl gap-5 sm:grid-cols-3">
              <div className="editorial-stat">
                <strong>YOUR BROWSER</strong>
                <span>Does the locking before anything leaves your hands.</span>
              </div>
              <div className="editorial-stat">
                <strong>ONE LINK</strong>
                <span>Carries the key in its unseen fragment.</span>
              </div>
              <div className="editorial-stat">
                <strong>YOUR TERMS</strong>
                <span>Burn after reading, expire, or take it back.</span>
              </div>
            </div>
          </div>

          <motion.aside
            initial={{ opacity: 0, rotate: reduceMotion ? 0 : 2.5, y: reduceMotion ? 0 : 24 }}
            animate={{ opacity: 1, rotate: 0, y: 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.9, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="note-stage mx-auto w-full max-w-sm lg:mx-0"
          >
            <p className="note-stage-caption">sealed in your browser · delivered on your terms</p>
            <div className="paper-envelope lift-card">
              <div className="envelope-letter">
                <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-[#a54c3c]">PRIVATE NOTE</p>
                <div className="mt-7 space-y-2">
                  <span className="letter-line letter-line-long" />
                  <span className="letter-line letter-line-mid" />
                  <span className="letter-line letter-line-short" />
                </div>
                <p className="mt-7 font-display text-[19px] font-semibold leading-tight tracking-[-0.04em] text-zinc-800">For the words that do not need a permanent address.</p>
                <p className="mt-5 font-mono text-[9px] font-bold tracking-[0.12em] text-zinc-400">OPEN ONCE · OR NOT AT ALL</p>
              </div>
              <div className="envelope-flap" />
              <div className="wax-seal envelope-seal">L</div>
            </div>
            <div className="mt-7 flex items-center justify-between border-t border-zinc-900/12 pt-3 dark:border-white/12">
              <span className="font-mono text-[10px] font-bold tracking-[0.12em] text-zinc-500">MAKE IT PRIVATE</span>
              <a href="#composer" className="font-mono text-[10px] font-bold tracking-[0.12em] text-[#a54c3c] transition-colors hover:text-zinc-900 dark:hover:text-white">BEGIN A NOTE ↘</a>
            </div>
          </motion.aside>
        </div>
      </motion.section>

      {/* Asymmetric Studio Layout */}
      <div id="composer" className="grid gap-8 lg:grid-cols-[1fr_350px] items-start scroll-mt-24">

        {/* LEFT COLUMN: Composer Studio */}
        <motion.div
          initial={{ opacity: 0, x: reduceMotion ? 0 : -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45 }}
          className="space-y-4"
        >
          <Card className="composer-card relative overflow-hidden p-6">

            {/* Secret Type Selector Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-4 border-b border-lilac-deep/20 dark:border-void-line">
              <div className="flex flex-wrap gap-1 bg-white/40 dark:bg-void-soft/40 p-1 rounded-2xl border border-lilac-deep/20" role="tablist" aria-label="Secret type">
                {SECRET_TYPES.map((t) => {
                  const isSelected = type === t.id
                  return (
                    <button
                      key={t.id}
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => { setType(t.id); setFileError(null) }}
                      className={cn(
                        'relative flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200 select-none cursor-pointer',
                        isSelected ? t.color : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200',
                      )}
                      title={t.hint}
                    >
                      {isSelected && (
                        <motion.div
                          layoutId="secretTypeTab"
                          className={cn('absolute inset-0 rounded-xl shadow-xs border border-current/30', t.bg, t.darkBg)}
                          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                        />
                      )}
                      <span className="relative z-10">{t.icon}</span>
                      <span className="relative z-10">{t.label}</span>
                    </button>
                  )
                })}
              </div>

              {type === 'code' && (
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="h-8 rounded-xl border border-lilac-deep/30 bg-white/80 dark:bg-void/80 backdrop-blur px-3 text-xs font-semibold dark:border-void-line dark:text-zinc-200 focus:outline-none cursor-pointer shadow-xs"
                  aria-label="Syntax language"
                >
                  {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              )}
            </div>

            {/* Document Title Input */}
            <div className="mb-4">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled Secret Document (optional, encrypted)"
                maxLength={120}
                aria-label="Secret title"
                className="w-full bg-transparent font-display text-xl font-bold text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 focus:outline-none transition-colors"
              />
            </div>

            {/* Editor Area */}
            {type === 'file' ? (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
                  aria-label="Choose file to encrypt"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); void handleFile(e.dataTransfer.files?.[0] ?? null) }}
                  className={cn(
                    'flex h-64 w-full flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed text-sm transition-all cursor-pointer',
                    file
                      ? 'border-mint-deep/70 bg-mint/40 text-mint-dark dark:text-mint-deep'
                      : 'border-lilac-deep/30 bg-white/30 dark:bg-void/30 text-zinc-400 hover:border-lilac-deep hover:bg-lilac/15',
                  )}
                >
                  <span className="text-4xl">{file ? '📎' : '⬆️'}</span>
                  <span className="font-semibold text-base">{dropzoneLabel || 'Drop a file here, or click to browse'}</span>
                  {file && <span className="text-xs opacity-75 font-mono">AES-256-GCM client encrypted</span>}
                </button>
                {fileError && <p className="mt-2 text-xs text-rose-500 font-medium">{fileError}</p>}
              </div>
            ) : (
              <div
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                className={cn(
                  'overflow-hidden rounded-2xl border transition-all duration-300 shadow-md',
                  isFocused
                    ? 'border-lilac-deep bg-white/80 dark:bg-void-soft/80 shadow-[0_0_25px_rgba(155,114,207,0.3)] ring-2 ring-lilac-dark/40'
                    : 'border-lilac-deep/20 dark:border-void-line bg-white/60 dark:bg-void-soft/60 backdrop-blur-md',
                )}
              >
                {/* Window Control Header Bar */}
                <div className="flex items-center justify-between border-b border-lilac-deep/20 dark:border-void-line bg-white/40 dark:bg-void/40 px-3.5 py-2 text-[11px] backdrop-blur-md select-none">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-rose-400/80 shadow-xs" />
                    <span className="size-2.5 rounded-full bg-amber-400/80 shadow-xs" />
                    <span className="size-2.5 rounded-full bg-emerald-400/80 shadow-xs" />
                    <span className="ml-2 font-mono font-semibold text-zinc-400 dark:text-zinc-500">
                      {type === 'code' ? `${language}.enc` : `${type}.enc`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-lilac/50 dark:bg-lilac-dark/30 border border-lilac-deep/30 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-lilac-dark dark:text-lilac-deep">
                      <span className="size-1.5 rounded-full bg-mint-dark animate-pulse" />
                      Zero-Knowledge Caret
                    </span>
                  </div>
                </div>

                <div className="h-72">
                  <Editor
                    value={content}
                    onChange={setContent}
                    language={type === 'code' ? language : type === 'markdown' ? 'markdown' : null}
                    placeholder={
                      type === 'code' ? 'Paste your code snippet here…'
                      : type === 'markdown' ? 'Write markdown… (# heading, **bold**, `code`)'
                      : type === 'credentials' ? 'API_KEY=sk-…\nDATABASE_URL=postgres://…'
                      : 'Write or paste secret text…'
                    }
                    ariaLabel="Secret content"
                  />
                </div>
              </div>
            )}

            {/* Live Realtime Encrypted Hex Dump Stream Visualizer */}
            {type !== 'file' && content.length > 0 && (
              <div className="mt-4">
                <HexDumpInspector content={content} />
              </div>
            )}

            <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
              <span className="text-[11px]">Press <kbd className="rounded bg-zinc-200 dark:bg-void-muted px-1.5 py-0.5 font-mono text-[10px]">⌘S</kbd> to seal</span>
              {content.length > 0 && <span className="font-mono text-[11px] font-semibold bg-white/80 dark:bg-void/80 px-2.5 py-0.5 rounded-md border border-lilac-deep/20">{content.length.toLocaleString()} chars</span>}
            </div>

          </Card>
        </motion.div>

        {/* RIGHT COLUMN: Security Inspector Panel */}
        <motion.div
          initial={{ opacity: 0, x: reduceMotion ? 0 : 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="space-y-4 lg:sticky lg:top-20"
        >
          <Card className="security-card relative overflow-hidden p-5">

            <div className="flex items-center justify-between pb-3 border-b border-lilac-deep/20 dark:border-void-line mb-4">
              <h2 className="font-display text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <span>⚙️</span> Security Controls
              </h2>
              <Badge tone="lilac" className="text-[10px]">Zero-Knowledge</Badge>
            </div>

            {/* Lifetime Preset Tiles */}
            <div className="space-y-2 mb-4">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <span>⏱️</span> Expiration Lifetime
              </label>
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Expiration">
                {TTL_PRESETS.map((t) => (
                  <button
                    key={t.seconds}
                    type="button"
                    role="radio"
                    aria-checked={ttl === t.seconds}
                    onClick={() => setTtl(t.seconds)}
                    className={cn(
                      'rounded-xl border py-2 text-xs font-semibold transition-all text-center cursor-pointer select-none',
                      ttl === t.seconds
                        ? 'border-lilac-deep bg-lilac/70 text-lilac-dark dark:bg-lilac-dark/30 dark:text-lilac-deep shadow-xs'
                        : 'border-zinc-200/70 dark:border-void-line text-zinc-500 dark:text-zinc-400 hover:border-lilac-deep/40 hover:bg-lilac/20 bg-white/40 dark:bg-transparent',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Passphrase Gate Vault */}
            <div className="mb-4 rounded-2xl border border-lilac-deep/25 dark:border-void-line bg-lilac/15 dark:bg-lilac-dark/10 p-3.5">
              <Switch
                id="passphrase-switch"
                checked={showPassphrase}
                onCheckedChange={setShowPassphrase}
                label="🔑 Passphrase Gate"
                description="Require recipient passphrase"
              />
              <AnimatePresence>
                {showPassphrase && (
                  <motion.div
                    key="passphrase-input"
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 10 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <TextInput
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder="Enter passphrase"
                      aria-label="Passphrase"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const generated = generateDicewarePassphrase()
                        setPassphrase(generated)
                        navigator.clipboard.writeText(generated)
                        toast.success(`Generated & copied: ${generated}`)
                      }}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-lilac-deep/30 bg-white/60 dark:bg-void/60 py-1 text-[11px] font-semibold text-lilac-dark dark:text-lilac-deep hover:bg-lilac/30 transition-colors cursor-pointer select-none"
                    >
                      <span>🎲</span> Generate Secure Passphrase
                    </button>
                    {passphrase && (
                      <div className="mt-2 flex items-center gap-2" aria-live="polite">
                        <div className="flex h-1.5 flex-1 gap-1" aria-hidden>
                          {[0, 1, 2, 3].map((i) => (
                            <motion.span
                              key={i}
                              className="flex-1 rounded-full"
                              animate={{
                                backgroundColor: i < strength.score + 1
                                  ? strength.score >= 3 ? '#1e6b47'
                                  : strength.score === 2 ? '#8a6200'
                                  : '#9d3057'
                                  : '#e5e7eb',
                              }}
                              transition={{ duration: 0.3 }}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold w-10">{strength.label}</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Toggles */}
            <div className="space-y-1.5 mb-4">
              <Switch
                id="burn-switch"
                checked={burn}
                onCheckedChange={setBurn}
                label="🔥 Burn after reading"
                description="Self-destruct on first open"
              />
              <Switch
                id="dead-switch-ui"
                checked={deadSwitch > 0}
                onCheckedChange={(v) => setDeadSwitch(v ? 7 : 0)}
                label="🪦 Dead switch (7 days)"
                description="Auto-destroy if no verified opens"
              />
              <Switch
                id="guardian-wipe-ui"
                checked={guardianEnabled}
                onCheckedChange={setGuardianEnabled}
                label="🧩 Emergency Guardian Wipe"
                description="A trustee quorum may withdraw, never decrypt"
              />
              {guardianEnabled && (
                <div className="ml-9 rounded-xl border border-amber-600/25 bg-amber-50/60 p-3 dark:bg-amber-500/5 dark:border-amber-400/20">
                  <p className="text-[11px] leading-5 text-amber-900 dark:text-amber-100">The browser splits a separate revocation capability. Guardian cards cannot open the note or reveal the delivery key.</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">Required guardians
                      <select value={guardianThreshold} onChange={(event) => setGuardianThreshold(Number(event.target.value))} className="mt-1 h-8 w-full rounded-lg border border-amber-700/25 bg-white px-2 text-xs dark:border-void-line dark:bg-void">
                        {[2, 3, 4, 5].filter((value) => value <= guardianTotal).map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">Total cards
                      <select value={guardianTotal} onChange={(event) => { const total = Number(event.target.value); setGuardianTotal(total); setGuardianThreshold((current) => Math.min(current, total)) }} className="mt-1 h-8 w-full rounded-lg border border-amber-700/25 bg-white px-2 text-xs dark:border-void-line dark:bg-void">
                        {[2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Live Security Rating Gauge */}
            <div className="mb-4">
              <SecurityScoreGauge
                burn={burn}
                deadSwitch={deadSwitch}
                hasPassphrase={showPassphrase}
                passphraseStrengthScore={strength.score}
                ttlSeconds={ttl}
              />
            </div>

            {/* Main Action Button */}
            <Button
              size="lg"
              loading={phase === 'encrypting' || phase === 'uploading'}
              onClick={() => void handleSeal()}
              className="w-full text-base font-bold tracking-wide shadow-md"
            >
              {phase === 'encrypting' || phase === 'uploading' ? 'Sealing Secret…' : '🔒 Seal & Create Share Link'}
            </Button>

            <div className="grid grid-cols-3 gap-1.5 mt-2.5">
              <button
                type="button"
                onClick={() => setShowMatrix(true)}
                className="flex items-center justify-center gap-1 rounded-xl border border-lilac-deep/30 bg-lilac/20 dark:bg-lilac-dark/15 py-1.5 text-[10px] font-semibold text-lilac-dark dark:text-lilac-deep hover:bg-lilac/40 transition-colors cursor-pointer select-none"
              >
                <span>🔬</span> Spec
              </button>
              <button
                type="button"
                onClick={() => setShowThreatModel(true)}
                className="flex items-center justify-center gap-1 rounded-xl border border-lilac-deep/30 bg-lilac/20 dark:bg-lilac-dark/15 py-1.5 text-[10px] font-semibold text-lilac-dark dark:text-lilac-deep hover:bg-lilac/40 transition-colors cursor-pointer select-none"
              >
                <span>🛡️</span> Threats
              </button>
              <button
                type="button"
                onClick={() => setShowComparison(true)}
                className="flex items-center justify-center gap-1 rounded-xl border border-lilac-deep/30 bg-lilac/20 dark:bg-lilac-dark/15 py-1.5 text-[10px] font-semibold text-lilac-dark dark:text-lilac-deep hover:bg-lilac/40 transition-colors cursor-pointer select-none"
              >
                <span>📊</span> Benchmark
              </button>
            </div>

            <p className="mt-3 text-center text-[10px] text-zinc-400 font-medium">
              AES-256-GCM · {showPassphrase ? 'PBKDF2 600k' : 'HKDF-SHA256'} · Client Encrypted
            </p>

          </Card>
        </motion.div>

      </div>

      {/* Scroll-led product story */}
      <section className="product-story space-y-20 pt-8 sm:space-y-28 sm:pt-14">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="story-intro grid gap-8 border-y border-zinc-900/12 py-10 dark:border-white/12 lg:grid-cols-[0.82fr_1.18fr] lg:items-end lg:py-14"
        >
          <div>
            <p className="hero-overline">The feeling of privacy, made visible</p>
            <p className="mt-4 font-display text-2xl font-semibold tracking-[-0.055em] text-zinc-900 dark:text-zinc-100 sm:text-3xl">Not a vault full of noise. A calm place to leave something behind.</p>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-300 sm:text-[15px]">
            Locknote gives a sensitive message a beginning, a recipient, and an ending. No profile is required to make a note private; the useful part happens before the message leaves your browser.
          </p>
        </motion.div>

        <div className="grid gap-5 lg:grid-cols-12">
          <motion.article
            initial={{ opacity: 0, x: reduceMotion ? 0 : -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="morphism-card morphism-card-large lift-card lg:col-span-7"
          >
            <div className="morphism-reflection" />
            <div className="morphism-card-content">
              <p className="hero-overline">01 · Write without residue</p>
              <h2 className="mt-5 max-w-md font-display text-4xl font-semibold leading-[0.92] tracking-[-0.075em] text-zinc-900 dark:text-zinc-100 sm:text-5xl">The note begins with you.</h2>
              <p className="mt-5 max-w-md text-sm leading-7 text-zinc-600 dark:text-zinc-300">Your words are turned into ciphertext here, not somewhere behind a login screen. The original stays between you and this device.</p>
              <div className="morphism-document" aria-hidden>
                <span className="morphism-document-label">DRAFT / PRIVATE</span>
                <span className="morphism-document-line line-one" />
                <span className="morphism-document-line line-two" />
                <span className="morphism-document-line line-three" />
                <span className="morphism-document-seal">L</span>
              </div>
            </div>
          </motion.article>

          <motion.article
            initial={{ opacity: 0, y: reduceMotion ? 0 : 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="morphism-card morphism-card-small lift-card lg:col-span-5"
          >
            <div className="morphism-card-content">
              <p className="hero-overline">02 · Carry the key differently</p>
              <h2 className="mt-5 max-w-xs font-display text-3xl font-semibold leading-[0.95] tracking-[-0.065em] text-zinc-900 dark:text-zinc-100 sm:text-4xl">A link with a private side.</h2>
              <p className="mt-4 max-w-sm text-sm leading-7 text-zinc-600 dark:text-zinc-300">The key lives after the <code className="rounded bg-zinc-900/5 px-1.5 py-0.5 font-mono text-[11px] dark:bg-white/8">#</code>. Browsers do not send that part to the server.</p>
              <div className="morphism-link" aria-hidden>
                <span>locknote.app/p/…</span><b>#</b><i>••••••</i>
              </div>
            </div>
          </motion.article>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.28 }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          className="morphism-band"
        >
          <div className="morphism-band-orb morphism-band-orb-one" />
          <div className="morphism-band-orb morphism-band-orb-two" />
          <div className="relative z-10 grid gap-8 p-7 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="hero-overline">03 · Choose the ending</p>
              <h2 className="mt-4 max-w-2xl font-display text-3xl font-semibold leading-[0.94] tracking-[-0.065em] text-zinc-900 dark:text-zinc-100 sm:text-5xl">A message can be useful without becoming permanent.</h2>
            </div>
            <div className="flex flex-wrap gap-2 font-mono text-[10px] font-bold tracking-[0.1em] text-zinc-600 dark:text-zinc-300">
              <span className="rounded-full border border-zinc-900/12 bg-white/45 px-3 py-2 dark:border-white/12 dark:bg-white/7">BURN AFTER READ</span>
              <span className="rounded-full border border-zinc-900/12 bg-white/45 px-3 py-2 dark:border-white/12 dark:bg-white/7">SET AN EXPIRY</span>
              <span className="rounded-full border border-zinc-900/12 bg-white/45 px-3 py-2 dark:border-white/12 dark:bg-white/7">WITHDRAW ANYTIME</span>
            </div>
          </div>
        </motion.div>

        <div className="story-steps">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-xl"
          >
            <p className="hero-overline">How a note moves</p>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-[0.93] tracking-[-0.07em] text-zinc-900 dark:text-zinc-100 sm:text-5xl">A small private journey.</h2>
          </motion.div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-[1.6rem] border border-zinc-900/12 bg-zinc-900/12 dark:border-white/12 dark:bg-white/12 sm:grid-cols-2 lg:grid-cols-4">
            {WORKFLOW_STEPS.map((s, idx) => (
              <motion.article
                key={s.step}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.45 }}
                transition={{ duration: 0.55, delay: idx * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="story-step bg-[#f7f2ea]/90 p-6 dark:bg-[#1b1618]/90"
              >
                <span className="font-mono text-[10px] font-bold tracking-[0.15em] text-[#a54c3c]">{s.step}</span>
                <h3 className="mt-8 font-display text-xl font-semibold tracking-[-0.045em] text-zinc-900 dark:text-zinc-100">{s.title}</h3>
                <p className="mt-3 text-xs leading-6 text-zinc-600 dark:text-zinc-300">{s.desc}</p>
                <div className="mt-6 h-px w-10 bg-[#a54c3c]/45" />
                <p className="mt-4 font-mono text-[9px] font-bold tracking-[0.1em] text-zinc-400">{s.badge}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <Confetti active={phase === 'done'} />
      <CryptoMatrixModal open={showMatrix} onOpenChange={setShowMatrix} />
      <ThreatModelModal open={showThreatModel} onOpenChange={setShowThreatModel} />
      <ComparisonModal open={showComparison} onOpenChange={setShowComparison} />

      {(phase === 'encrypting' || phase === 'uploading') && (
        <SealAnimation phase={phase} />
      )}

    </div>
  )
}