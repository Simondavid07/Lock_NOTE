import type {
  ConsumeOutcome,
  CreatePasteInput,
  DraftRecord,
  EncryptedReply,
  PasteRecord,
  PasteStatus,
  ReceiptInfo,
} from './types.js'
import type { DraftStore, PasteStore, StoreHealth } from './store.js'
import { computeStatus, isDead } from './store.js'
import { LIMITS, randomToken, safeEqual, sha256Base64url } from './util.js'
import { toMetadata, toReceipt } from './helpers.js'

/**
 * In-process implementation used by tests and local development. Node executes
 * each mutation below synchronously, so every method is atomic with respect to
 * concurrent awaits in the test harness.
 */
export class MemoryStore implements PasteStore, DraftStore {
  readonly kind = 'memory' as const
  private pastes = new Map<string, PasteRecord>()
  private drafts = new Map<string, DraftRecord>()
  private repliesByPaste = new Map<string, EncryptedReply[]>()
  private fileLeases = new Map<string, { id: string; path: string; expiresAt: number }>()
  private readonly clock: () => number

  constructor(clock: () => number = Date.now) {
    this.clock = clock
  }

  async health(): Promise<StoreHealth> {
    return { ok: true, detail: `memory (${this.pastes.size} pastes)` }
  }

  now(): number {
    return this.clock()
  }

  async create(input: CreatePasteInput): Promise<PasteRecord> {
    const record: PasteRecord = {
      ...input,
      viewCount: 0,
      firstViewedAt: null,
      lastViewedAt: null,
      receiptAcknowledgedAt: null,
      burned: false,
      createdAt: this.clock(),
    }
    this.pastes.set(record.id, record)
    return record
  }

  async get(id: string): Promise<PasteRecord | null> {
    return this.pastes.get(id) ?? null
  }

  async consume(id: string, previewToken?: string | null): Promise<ConsumeOutcome> {
    const record = this.pastes.get(id)
    if (!record) return { ok: false, status: 'gone' }
    const nowMs = this.clock()
    const status = computeStatus(record, nowMs)
    if (status !== 'alive') return { ok: false, status }

    if (previewToken && safeEqual(previewToken, record.ownerToken)) {
      return { ok: true, record, preview: true, status: 'alive', fileLease: null }
    }

    let fileLease: { token: string; expiresAt: number } | null = null
    if (record.burnAfterRead) {
      // Keep the test/local implementation equivalent to the production
      // conditional update: a burned file already has a one-use lease.
      if (record.storagePath) {
        const token = randomToken(24)
        const expiresAt = this.clock() + 60_000
        this.fileLeases.set(token, { id, path: record.storagePath, expiresAt })
        fileLease = { token, expiresAt }
      }
      record.burned = true
    }
    return { ok: true, record, preview: false, status: 'alive', fileLease }
  }

  async issueFileLease(id: string): Promise<{ token: string; expiresAt: number } | null> {
    const record = this.pastes.get(id)
    if (!record?.storagePath) return null
    const token = randomToken(24)
    const expiresAt = this.clock() + 60_000
    this.fileLeases.set(token, { id, path: record.storagePath, expiresAt })
    return { token, expiresAt }
  }

  async redeemFileLease(id: string, token: string): Promise<string | null> {
    const lease = this.fileLeases.get(token)
    this.fileLeases.delete(token)
    if (!lease || lease.id !== id || lease.expiresAt < this.clock()) return null
    return lease.path
  }

  async acknowledge(id: string, proof: string): Promise<{ acknowledgedAt: number } | null> {
    const record = this.pastes.get(id)
    if (!record || !record.receiptProofHash || record.receiptAcknowledgedAt !== null) return null
    if (!safeEqual(sha256Base64url(proof), record.receiptProofHash)) return null

    const nowMs = this.clock()
    record.viewCount = 1
    record.firstViewedAt = nowMs
    record.lastViewedAt = nowMs
    record.receiptAcknowledgedAt = nowMs
    return { acknowledgedAt: nowMs }
  }

  async addReply(id: string, capability: string, reply: Omit<EncryptedReply, 'createdAt'>): Promise<EncryptedReply | null> {
    const record = this.pastes.get(id)
    if (!record || computeStatus(record, this.clock()) !== 'alive' || !record.allowReplies || !record.replyVerifier) return null
    if (!safeEqual(sha256Base64url(capability), record.replyVerifier)) return null
    const existing = this.repliesByPaste.get(id) ?? []
    if (existing.length >= LIMITS.replyMaxPerPaste) return null
    const stored: EncryptedReply = { ...reply, createdAt: this.clock() }
    existing.push(stored)
    this.repliesByPaste.set(id, existing)
    return stored
  }

  async replies(id: string, ownerToken: string): Promise<EncryptedReply[] | null> {
    const record = this.pastes.get(id)
    if (!record || computeStatus(record, this.clock()) !== 'alive' || !safeEqual(ownerToken, record.ownerToken)) return null
    return [...(this.repliesByPaste.get(id) ?? [])]
  }

  async destroy(id: string, ownerToken: string): Promise<boolean> {
    const record = this.pastes.get(id)
    if (!record || !safeEqual(ownerToken, record.ownerToken)) return false
    const removed = this.pastes.delete(id)
    this.repliesByPaste.delete(id)
    for (const [token, lease] of this.fileLeases) if (lease.id === id) this.fileLeases.delete(token)
    return removed
  }

  async guardianDestroy(id: string, capability: string): Promise<boolean> {
    const record = this.pastes.get(id)
    if (!record?.guardianVerifier || !safeEqual(sha256Base64url(capability), record.guardianVerifier)) return false
    const removed = this.pastes.delete(id)
    this.repliesByPaste.delete(id)
    for (const [token, lease] of this.fileLeases) if (lease.id === id) this.fileLeases.delete(token)
    return removed
  }

  async receipt(id: string, ownerToken: string): Promise<ReceiptInfo | null> {
    const record = this.pastes.get(id)
    if (!record || !safeEqual(ownerToken, record.ownerToken)) return null
    return toReceipt(record, this.clock())
  }

  async status(id: string): Promise<PasteStatus> {
    return computeStatus(this.pastes.get(id) ?? null, this.clock())
  }

  async purgeExpired(): Promise<number> {
    const nowMs = this.clock()
    let purged = 0
    for (const [id, record] of this.pastes) {
      if ((record.expiresAt !== null && record.expiresAt <= nowMs) || isDead(record, nowMs)) {
        this.pastes.delete(id)
        this.repliesByPaste.delete(id)
        purged += 1
      }
    }
    for (const [id, draft] of this.drafts) {
      if (nowMs - draft.updatedAt > 86_400_000) {
        this.drafts.delete(id)
        purged += 1
      }
    }
    return purged
  }

  async createDraft(roomId: string, ownerToken: string, content = ''): Promise<DraftRecord> {
    const nowMs = this.clock()
    const draft: DraftRecord = { roomId, content, createdAt: nowMs, updatedAt: nowMs, ownerToken }
    this.drafts.set(roomId, draft)
    return draft
  }

  async getDraft(roomId: string): Promise<DraftRecord | null> {
    return this.drafts.get(roomId) ?? null
  }

  async touchDraft(roomId: string, content: string): Promise<DraftRecord | null> {
    const draft = this.drafts.get(roomId)
    if (!draft) return null
    draft.content = content
    draft.updatedAt = this.clock()
    return draft
  }

  async sealDraft(roomId: string, ownerToken: string): Promise<boolean> {
    const draft = this.drafts.get(roomId)
    if (!draft || !safeEqual(ownerToken, draft.ownerToken)) return false
    return this.drafts.delete(roomId)
  }

  async purgeOldDrafts(maxAgeMs: number): Promise<number> {
    const cutoff = this.clock() - maxAgeMs
    let purged = 0
    for (const [id, draft] of this.drafts) {
      if (draft.updatedAt < cutoff) {
        this.drafts.delete(id)
        purged += 1
      }
    }
    return purged
  }
}

export interface MemoryBackend {
  pastes: PasteStore
  drafts: DraftStore
}

export function createMemoryBackend(): MemoryBackend {
  const store = new MemoryStore()
  return { pastes: store, drafts: store }
}

export { toMetadata }
