import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { Editor } from '../components/Editor'
import { SealAnimation, type SealPhase } from '../components/SealAnimation'
import { ShareCard, type ShareResult } from '../components/ShareCard'
import { Badge, Button, Card, TextInput } from '../components/ui'
import { cn } from '../lib/cn'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { participantColors } from '../lib/remote-cursors'
import {
  deriveEncryptionKey,
  generateOwnerToken,
  generatePasteId,
  generateSalt,
  generateSecret,
  generateReceiptProof,
  sha256Base64url,
  sealContent,
  fingerprint,
  buildShareUrl,
} from '../lib/crypto'
import { base64urlToBytes } from '../lib/encoding'
import { EditorView } from '@codemirror/view'

interface Participant {
  clientId: string
  name: string
  color: string
  cursor?: number
}

const SAVE_DEBOUNCE_MS = 1500
const CURSOR_DEBOUNCE_MS = 150

export function CollabPage() {
  const { roomId = '' } = useParams<{ roomId: string }>()

  const [content, setContent] = useState('')
  const [nickname, setNickname] = useState(() => sessionStorage.getItem('locknote:nickname') ?? '')
  const [joined, setJoined] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [sealing, setSealing] = useState(false)
  const [sealPhase, setSealPhase] = useState<SealPhase>('idle')
  const [result, setResult] = useState<ShareResult | null>(null)

  const clientIdRef = useRef<string>(`c_${Math.random().toString(36).slice(2, 10)}`)
  const editorRef = useRef<EditorView | null>(null)
  const saveTimerRef = useRef<number>(0)
  const cursorTimerRef = useRef<number>(0)
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Track presence locally so we can render the roster even without Supabase.
  const self = participants.find((p) => p.clientId === clientIdRef.current)

  const join = useCallback(async () => {
    const name = nickname.trim() || 'Anonymous'
    sessionStorage.setItem('locknote:nickname', name)

    const draft = await api.getDraft(roomId)
    setContent(draft.content)
    setJoined(true)

    if (!supabase) {
      toast.warning('Live sync unavailable (no Supabase client) — edits still save to the room')
      return
    }

    const color = participantColors[Math.floor(Math.random() * participantColors.length)]!
    const channel = supabase.channel(`room:${roomId}`, { config: { presence: { key: clientIdRef.current } } })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ name: string; color: string }>()
        const list: Participant[] = Object.entries(state).map(([clientId, presences]) => ({
          clientId,
          name: presences[0]?.name ?? 'Anonymous',
          color: presences[0]?.color ?? participantColors[0]!,
        }))
        setParticipants(list)
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        setParticipants((prev) => {
          const exists = prev.some((p) => p.clientId === key)
          if (exists) return prev
          const p = newPresences[0] as { name: string; color: string } | undefined
          return [...prev, { clientId: key, name: p?.name ?? 'Anonymous', color: p?.color ?? participantColors[0]! }]
        })
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setParticipants((prev) => prev.filter((p) => p.clientId !== key))
      })
      .on('broadcast', { event: 'content' }, ({ payload }) => {
        if (payload.clientId === clientIdRef.current) return
        if (typeof payload.text === 'string') {
          setContent(payload.text)
          const view = editorRef.current
          if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: payload.text } })
        }
      })
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        if (payload.clientId === clientIdRef.current) return
        const p = payload as { clientId: string; name: string; color: string; pos: number }
        setParticipants((prev) =>
          prev.map((x) => (x.clientId === p.clientId ? { ...x, cursor: p.pos } : x)),
        )
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ name, color })
        }
      })

    channelRef.current = channel
  }, [roomId, nickname])

  // Broadcast our own cursor position.
  const broadcastCursor = useCallback(() => {
    const view = editorRef.current
    if (!view || !channelRef.current || !supabase) return
    const { head } = view.state.selection.main
    void channelRef.current.send({
      type: 'broadcast',
      event: 'cursor',
      payload: { clientId: clientIdRef.current, name: nickname.trim() || 'Anonymous', color: self?.color ?? participantColors[0]!, pos: head },
    })
  }, [nickname, self?.color])

  useEffect(() => {
    void join()
    return () => {
      void channelRef.current?.untrack()
      void channelRef.current?.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  const handleContentChange = useCallback(
    (text: string) => {
      setContent(text)
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = window.setTimeout(() => {
        void api.updateDraft(roomId, text).catch(() => {
          /* autosave is best-effort */
        })
      }, SAVE_DEBOUNCE_MS)

      window.clearTimeout(cursorTimerRef.current)
      cursorTimerRef.current = window.setTimeout(broadcastCursor, CURSOR_DEBOUNCE_MS)
    },
    [roomId, broadcastCursor],
  )

  const seal = useCallback(async () => {
    if (!content.trim()) {
      toast.error('The room is empty — write something first')
      return
    }
    setSealing(true)
    setSealPhase('encrypting')
    try {
      const id = generatePasteId()
      const secret = generateSecret()
      const salt = generateSalt()
      const key = await deriveEncryptionKey(secret, null, {
        salt: base64urlToBytes(salt),
        kdf: 'hkdf',
        iterations: 0,
      })
      const receiptProof = generateReceiptProof()
      const receiptProofHash = await sha256Base64url(receiptProof)
      const { ciphertextB64, ivB64 } = await sealContent(key, id, { v: 2, content, receiptProof })
      setSealPhase('uploading')
      const ownerToken = generateOwnerToken()
      const res = await api.createPaste({
        id,
        ciphertext: ciphertextB64,
        salt,
        iv: ivB64,
        iterations: 0,
        kdf: 'hkdf',
        alg: 'aes-256-gcm',
        format: 'markdown',
        language: null,
        burnAfterRead: false,
        deadSwitchDays: 7,
        ttlSeconds: 86400,
        ownerToken,
        receiptProofHash,
      })
      await api.sealDraft(roomId, ownerToken)
      sessionStorage.setItem(`locknote:owner:${res.id}`, ownerToken)
      setSealPhase('done')
      setResult({
        id: res.id,
        url: buildShareUrl(window.location.origin, res.id, secret, false),
        ownerToken,
        fingerprint: fingerprint(secret),
        format: 'markdown',
        burnAfterRead: false,
        passphraseProtected: false,
        expiresAt: res.expiresAt,
        createdAt: res.createdAt,
      })
    } catch (err) {
      console.error(err)
      toast.error('Sealing failed — please try again')
      setSealPhase('idle')
    } finally {
      setSealing(false)
    }
  }, [content, roomId])

  if (result) {
    return (
      <div className="mx-auto max-w-3xl pt-10">
        <SealAnimation phase="done" />
        <ShareCard result={result} onReset={() => setResult(null)} />
        <div className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          The draft room was sealed — no further edits. Track this paste&apos;s life from the{' '}
          <button
            onClick={() => toast.info('Receipts open after the first read. Check back once it’s been read.')}
            className="text-indigo-500 hover:underline"
          >
            receipts view
          </button>
          .
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl pt-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Badge tone="indigo">👥 Live collaboration room</Badge>
          <h1 className="mt-2 text-xl font-bold tracking-tight">Draft together, seal together</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Everyone with this link edits the same draft in real time. Content stays server-side until you seal it —
            then it becomes a sealed secret.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {joined && (
            <div className="flex items-center gap-1" aria-label="Participants">
              {participants.map((p) => (
                <span
                  key={p.clientId}
                  title={p.name}
                  className={cn('flex size-7 items-center justify-center rounded-full text-[10px] font-bold text-white')}
                  style={{ backgroundColor: p.color }}
                  aria-hidden
                >
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
              {participants.length === 0 && <span className="text-xs text-zinc-400">only you (for now)</span>}
            </div>
          )}
          <Button size="sm" loading={sealing} onClick={() => void seal()}>
            🔒 Seal &amp; share
          </Button>
        </div>
      </div>

      {!joined ? (
        <Card className="p-6">
          <form
            className="mx-auto flex max-w-sm flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void join()
            }}
          >
            <TextInput
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Your nickname (optional)"
              aria-label="Nickname"
              autoFocus
              maxLength={24}
            />
            <Button type="submit">Join the room</Button>
            {!supabase && (
              <p className="text-center text-xs text-amber-600 dark:text-amber-400" role="alert">
                Live sync is disabled — only you can edit, but edits still persist.
              </p>
            )}
          </form>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-300 dark:border-void-line">
          <Editor
            value={content}
            onChange={handleContentChange}
            language="markdown"
            placeholder="Collaborate on a draft… markdown is rendered when sealed"
            ariaLabel="Collaborative draft content"
            onEditorReady={(view) => {
              editorRef.current = view
            }}
            remoteCursors={participants
              .filter((p) => p.clientId !== clientIdRef.current && p.cursor !== undefined)
              .map((p) => ({ clientId: p.clientId, name: p.name, color: p.color, pos: p.cursor! }))}
          />
        </div>
      )}

      {sealing && <SealAnimation phase={sealPhase} />}

      <p className="mt-4 text-center text-[11px] text-zinc-400">
        Room id <code className="font-mono">{roomId}</code> · autosaves every 1.5s · broadcasts are fire-and-forget
      </p>
    </div>
  )
}