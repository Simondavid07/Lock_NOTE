import type { PasteMetadata, PasteRecord, ReceiptInfo } from './types.js'
import { computeStatus } from './store.js'

/** Build the minimal pre-decryption metadata object. No proof, capability, ciphertext, or file location is public. */
export function toMetadata(record: PasteRecord, nowMs: number): PasteMetadata {
  return {
    id: record.id,
    status: computeStatus(record, nowMs),
    format: record.format,
    language: record.language,
    burnAfterRead: record.burnAfterRead,
    deadSwitchDays: record.deadSwitchDays,
    hasFile: record.format === 'file',
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    requiresPassphrase: record.kdf === 'pbkdf2',
    kdf: record.kdf,
    iterations: record.iterations,
    salt: record.salt,
    iv: record.iv,
    guardianPolicy: record.guardianPolicy,
  }
}

/** Owner-only delivery evidence; this proves an encrypted-envelope acknowledgement, not human comprehension. */
export function toReceipt(record: PasteRecord, nowMs: number): ReceiptInfo {
  return {
    id: record.id,
    createdAt: record.createdAt,
    viewCount: record.viewCount,
    firstViewedAt: record.firstViewedAt,
    lastViewedAt: record.lastViewedAt,
    receiptAcknowledgedAt: record.receiptAcknowledgedAt,
    status: computeStatus(record, nowMs),
  }
}
