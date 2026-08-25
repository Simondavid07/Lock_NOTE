import type {
  ConsumeOutcome,
  CreatePasteInput,
  EncryptedReply,
  FileLease,
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
 * Every implementation must treat ciphertext as opaque. Proof and guardian
 * capability inputs are compared only through hash-only verifiers; neither
 * implementation may log, persist, or return the raw values.
 */
export interface PasteStore {
  readonly kind: 'memory' | 'supabase'
  now(): number
  health(): Promise<StoreHealth>
  create(input: CreatePasteInput): Promise<PasteRecord>
  get(id: string): Promise<PasteRecord | null>
  /** Deliver exactly once for burn-after-read records; owner token yields a non-destructive preview. */
  consume(id: string, previewToken?: string | null): Promise<ConsumeOutcome>
  /** Issue a short-lived one-use lease for encrypted file bytes after a successful consume. */
  issueFileLease(id: string): Promise<FileLease | null>
  /** Redeem a lease once; returns the private storage path only to server code. */
  redeemFileLease(id: string, token: string): Promise<string | null>
  /** Atomically acknowledge a successfully decrypted envelope exactly once. */
  acknowledge(id: string, proof: string): Promise<{ acknowledgedAt: number } | null>
  /** Store one opaque reply after verifying the reply capability carried inside decrypted content. */
  addReply(id: string, capability: string, reply: Omit<EncryptedReply, 'createdAt'>): Promise<EncryptedReply | null>
  /** Return opaque replies only to a sender holding the owner capability. */
  replies(id: string, ownerToken: string): Promise<EncryptedReply[] | null>
  /** Destroy a record with the sender's owner capability. */
  destroy(id: string, ownerToken: string): Promise<boolean>
  /** Destroy a record with a reconstructed Guardian Wipe capability. */
  guardianDestroy(id: string, capability: string): Promise<boolean>
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

/** Compute the effective “last verified activity” used by the dead switch. */
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
