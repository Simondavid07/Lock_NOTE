export type PasteFormat = 'text' | 'markdown' | 'code' | 'credentials' | 'file'

export type KdfKind = 'hkdf' | 'pbkdf2'

export type PasteStatus = 'alive' | 'burned' | 'expired' | 'dead' | 'gone'

/**
 * File secrets: raw file bytes are encrypted separately and stored server-side.
 * File name and MIME type remain inside the encrypted content envelope.
 */
export interface FileMeta {
  /** Size of the plaintext file in bytes. */
  size: number
  /** Base64url IV used to encrypt the file bytes in Storage. */
  iv: string
}

/** Public, non-secret policy metadata for a Guardian Wipe quorum. */
export interface GuardianPolicy {
  threshold: number
  total: number
}

/**
 * A stored paste. The service only sees opaque ciphertext and hash-only
 * verifiers; it never holds the decryption key, plaintext, raw read proof, or
 * guardian capability.
 */
export interface PasteRecord {
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
  createdAt: number
  expiresAt: number | null
  /** A verified envelope-open acknowledgement count, not an unauditable request count. */
  viewCount: number
  firstViewedAt: number | null
  lastViewedAt: number | null
  ownerToken: string
  /** SHA-256 base64url digest of an encrypted envelope proof; null only for legacy v1 records. */
  receiptProofHash: string | null
  /** First successful proof acknowledgement only; raw proof is never retained. */
  receiptAcknowledgedAt: number | null
  /** SHA-256 base64url digest of an optional K-of-N Guardian Wipe capability. */
  guardianVerifier: string | null
  guardianPolicy: GuardianPolicy | null
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
  receiptProofHash: string
  guardianVerifier: string | null
  guardianPolicy: GuardianPolicy | null
}

/** Public metadata needed before decrypting. Never includes a capability, proof, or file location. */
export interface PasteMetadata {
  id: string
  status: PasteStatus
  format: PasteFormat
  language: string | null
  burnAfterRead: boolean
  deadSwitchDays: number | null
  hasFile: boolean
  createdAt: number
  expiresAt: number | null
  requiresPassphrase: boolean
  kdf: KdfKind
  iterations: number
  salt: string
  iv: string
  guardianPolicy: GuardianPolicy | null
}

export interface FileLease {
  /** Ephemeral delivery capability returned only by a successful consume. */
  token: string
  expiresAt: number
}

export type ConsumeOutcome =
  | { ok: true; record: PasteRecord; preview: boolean; status: 'alive'; fileLease: FileLease | null }
  | { ok: false; status: Exclude<PasteStatus, 'alive'> }

export interface ReceiptInfo {
  id: string
  createdAt: number
  /** Count of successful cryptographic acknowledgements. */
  viewCount: number
  firstViewedAt: number | null
  lastViewedAt: number | null
  receiptAcknowledgedAt: number | null
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
  | 'paste:acknowledged'
  | 'paste:destroyed'
  | 'paste:guardian_destroyed'
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
