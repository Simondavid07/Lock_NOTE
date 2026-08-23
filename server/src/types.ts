export type PasteFormat = 'text' | 'markdown' | 'code' | 'credentials' | 'file'

export type KdfKind = 'hkdf' | 'pbkdf2'

export type PasteStatus = 'alive' | 'burned' | 'expired' | 'dead' | 'gone'

/**
 * File secrets: the raw file bytes are encrypted separately and stored in
 * Supabase Storage. `fileMeta` keeps only the public envelope data.
 * The file name/mime live *inside* the encrypted content payload, so the
 * server never learns them.
 */
export interface FileMeta {
  /** Size of the plaintext file in bytes. */
  size: number
  /** Base64url IV used to encrypt the file bytes in Storage. */
  iv: string
}

/**
 * A stored paste. The server only ever sees opaque ciphertext — it never
 * holds the decryption key or any plaintext.
 */
export interface PasteRecord {
  id: string
  /** Base64url AES-256-GCM ciphertext of the content payload. */
  ciphertext: string
  /** Base64url KDF salt (public; needed by clients to derive the key). */
  salt: string
  /** Base64url IV used for the content payload. */
  iv: string
  /** PBKDF2 iteration count. 0 when kdf === 'hkdf'. */
  iterations: number
  kdf: KdfKind
  alg: string
  format: PasteFormat
  language: string | null
  burnAfterRead: boolean
  /** Auto-destroy after N days of inactivity (null = off). */
  deadSwitchDays: number | null
  /** Storage object path for file secrets (null for text-like pastes). */
  storagePath: string | null
  fileMeta: FileMeta | null
  createdAt: number
  expiresAt: number | null
  viewCount: number
  firstViewedAt: number | null
  lastViewedAt: number | null
  ownerToken: string
  burned: boolean
}

export interface CreatePasteInput {
  id: string
  ciphertext: string
  salt: string
  iv: string
  iterations: number
  kdf: KdfKind
  alg: string
  format: PasteFormat
  language: string | null
  burnAfterRead: boolean
  deadSwitchDays: number | null
  storagePath: string | null
  fileMeta: FileMeta | null
  expiresAt: number | null
  ownerToken: string
}

/** Public metadata a viewer needs before decrypting. Never includes the key. */
export interface PasteMetadata {
  id: string
  status: PasteStatus
  format: PasteFormat
  language: string | null
  burnAfterRead: boolean
  deadSwitchDays: number | null
  hasFile: boolean
  storagePath: string | null
  createdAt: number
  expiresAt: number | null
  requiresPassphrase: boolean
  kdf: KdfKind
  iterations: number
  salt: string
  iv: string
}

export type ConsumeOutcome =
  | { ok: true; record: PasteRecord; preview: boolean; status: 'alive' }
  | { ok: false; status: Exclude<PasteStatus, 'alive'> }

export interface ReceiptInfo {
  id: string
  createdAt: number
  viewCount: number
  firstViewedAt: number | null
  lastViewedAt: number | null
  status: PasteStatus
}

export interface DraftRecord {
  roomId: string
  content: string
  createdAt: number
  updatedAt: number
  ownerToken: string
}

export type AuditEventName =
  | 'paste:created'
  | 'paste:consumed'
  | 'paste:burned'
  | 'paste:previewed'
  | 'paste:destroyed'
  | 'paste:expired'
  | 'paste:dead'
  | 'draft:created'
  | 'draft:updated'
  | 'draft:sealed'

export interface AuditEvent {
  id: string
  pasteId: string
  event: AuditEventName
  at: number
}

export interface AuditSink {
  record(pasteId: string, event: AuditEventName): Promise<void>
}