import type {
  ConsumeOutcome,
  CreatePasteInput,
  DraftRecord,
  PasteRecord,
  PasteStatus,
  ReceiptInfo,
} from './types.js'

export interface StoreHealth {
  ok: boolean
  detail?: string
}

/**
 * Persistence contract for the zero-knowledge warehouse.
 *
 * Every implementation must treat the records as opaque ciphertext — the
 * store is never allowed to inspect, log, or transform the payload bytes.
 * `MemoryStore` and `SupabaseStore` both satisfy this contract and are
 * exercised by the same test suite (dependency inversion).
 */
export interface PasteStore {
  readonly kind: 'memory' | 'supabase'
  /** The store's authoritative clock (testable via injected time). */
  now(): number
  health(): Promise<StoreHealth>
  create(input: CreatePasteInput): Promise<PasteRecord>
  get(id: string): Promise<PasteRecord | null>
  /**
   * Deliver the payload exactly once for burn-after-read pastes.
   * A concurrent race is resolved atomically by the underlying store.
   * Passing the owner token delivers a non-destructive preview.
   */
  consume(id: string, previewToken?: string | null): Promise<ConsumeOutcome>
  /** Register a successful reveal (used for read receipts). */
  viewed(id: string): Promise<{ viewCount: number } | null>
  destroy(id: string, ownerToken: string): Promise<boolean>
  receipt(id: string, ownerToken: string): Promise<ReceiptInfo | null>
  status(id: string): Promise<PasteStatus>
  purgeExpired(): Promise<number>
}

/** Ephemeral pre-seal scratchpads. Wiped on seal or by the TTL janitor. */
export interface DraftStore {
  kind: 'memory' | 'supabase'
  createDraft(roomId: string, ownerToken: string, content?: string): Promise<DraftRecord>
  getDraft(roomId: string): Promise<DraftRecord | null>
  touchDraft(roomId: string, content: string): Promise<DraftRecord | null>
  sealDraft(roomId: string, ownerToken: string): Promise<boolean>
  purgeOldDrafts(maxAgeMs: number): Promise<number>
}

/** Compute the effective "last activity" used by the dead switch. */
export function lastActiveMs(r: Pick<PasteRecord, 'lastViewedAt' | 'createdAt'>): number {
  return r.lastViewedAt ?? r.createdAt
}

/** A paste is dead if it sat untouched for `deadSwitchDays` days. */
export function isDead(r: PasteRecord, nowMs: number): boolean {
  if (!r.deadSwitchDays) return false
  return nowMs - lastActiveMs(r) > r.deadSwitchDays * 86_400_000
}

/** Compute the public status of a record at a point in time. */
export function computeStatus(r: PasteRecord | null, nowMs: number): PasteStatus {
  if (!r) return 'gone'
  if (r.burned) return 'burned'
  if (r.expiresAt !== null && r.expiresAt <= nowMs) return 'expired'
  if (isDead(r, nowMs)) return 'dead'
  return 'alive'
}