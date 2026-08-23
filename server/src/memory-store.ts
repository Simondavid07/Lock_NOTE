import type {
  ConsumeOutcome,
  CreatePasteInput,
  DraftRecord,
  PasteRecord,
  PasteStatus,
  ReceiptInfo,
} from './types.js'
import type { DraftStore, PasteStore, StoreHealth } from './store.js'
import { computeStatus, isDead } from './store.js'
import { safeEqual } from './util.js'
import { toMetadata, toReceipt } from './helpers.js'

/**
 * In-process implementation used by tests and as an offline fallback.
 * Node is single-threaded and every mutation below is synchronous, so each
 * method is atomic with respect to concurrent awaits.
 *
 * The clock is injectable so expiry and dead-switch behaviour can be tested
 * deterministically.
 */
export class MemoryStore implements PasteStore, DraftStore {
  readonly kind = 'memory' as const
  private pastes = new Map<string, PasteRecord>()
  private drafts = new Map<string, DraftRecord>()
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
    const r = this.pastes.get(id)
    if (!r) return { ok: false, status: 'gone' }
    const nowMs = this.clock()
    const status = computeStatus(r, nowMs)
    if (status !== 'alive') return { ok: false, status }

    if (previewToken && safeEqual(previewToken, r.ownerToken)) {
      // Owner preview: deliver without burning, but still register the view.
      r.viewCount += 1
      r.firstViewedAt = r.firstViewedAt ?? nowMs
      r.lastViewedAt = nowMs
      return { ok: true, record: r, preview: true, status: 'alive' }
    }

    if (r.burnAfterRead) {
      r.burned = true
    }
    r.viewCount += 1
    r.firstViewedAt = r.firstViewedAt ?? nowMs
    r.lastViewedAt = nowMs
    return { ok: true, record: r, preview: false, status: 'alive' }
  }

  async viewed(id: string): Promise<{ viewCount: number } | null> {
    const r = this.pastes.get(id)
    if (!r) return null
    const nowMs = this.clock()
    if (computeStatus(r, nowMs) !== 'alive') return null
    r.viewCount += 1
    r.firstViewedAt = r.firstViewedAt ?? nowMs
    r.lastViewedAt = nowMs
    return { viewCount: r.viewCount }
  }

  async destroy(id: string, ownerToken: string): Promise<boolean> {
    const r = this.pastes.get(id)
    if (!r) return false
    if (!safeEqual(ownerToken, r.ownerToken)) return false
    return this.pastes.delete(id)
  }

  async receipt(id: string, ownerToken: string): Promise<ReceiptInfo | null> {
    const r = this.pastes.get(id)
    if (!r) return null
    if (!safeEqual(ownerToken, r.ownerToken)) return null
    return toReceipt(r, this.clock())
  }

  async status(id: string): Promise<PasteStatus> {
    return computeStatus(this.pastes.get(id) ?? null, this.clock())
  }

  async purgeExpired(): Promise<number> {
    const nowMs = this.clock()
    let purged = 0
    for (const [id, r] of this.pastes) {
      if (r.expiresAt !== null && r.expiresAt <= nowMs) {
        this.pastes.delete(id)
        purged += 1
      } else if (isDead(r, nowMs)) {
        this.pastes.delete(id)
        purged += 1
      }
    }
    for (const [id, d] of this.drafts) {
      if (nowMs - d.updatedAt > 86_400_000) {
        this.drafts.delete(id)
        purged += 1
      }
    }
    return purged
  }

  async createDraft(roomId: string, ownerToken: string, content = ''): Promise<DraftRecord> {
    const nowMs = this.clock()
    const d: DraftRecord = { roomId, content, createdAt: nowMs, updatedAt: nowMs, ownerToken }
    this.drafts.set(roomId, d)
    return d
  }

  async getDraft(roomId: string): Promise<DraftRecord | null> {
    return this.drafts.get(roomId) ?? null
  }

  async touchDraft(roomId: string, content: string): Promise<DraftRecord | null> {
    const d = this.drafts.get(roomId)
    if (!d) return null
    d.content = content
    d.updatedAt = this.clock()
    return d
  }

  async sealDraft(roomId: string, ownerToken: string): Promise<boolean> {
    const d = this.drafts.get(roomId)
    if (!d) return false
    if (!safeEqual(ownerToken, d.ownerToken)) return false
    return this.drafts.delete(roomId)
  }

  async purgeOldDrafts(maxAgeMs: number): Promise<number> {
    const cutoff = this.clock() - maxAgeMs
    let purged = 0
    for (const [id, d] of this.drafts) {
      if (d.updatedAt < cutoff) {
        this.drafts.delete(id)
        purged += 1
      }
    }
    return purged
  }
}

/** Convenience: a single in-memory backend for the whole app. */
export interface MemoryBackend {
  pastes: PasteStore
  drafts: DraftStore
}

export function createMemoryBackend(): MemoryBackend {
  const store = new MemoryStore()
  return { pastes: store, drafts: store }
}

export { toMetadata }