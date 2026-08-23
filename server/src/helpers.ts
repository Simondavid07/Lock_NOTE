import type { PasteMetadata, PasteRecord, ReceiptInfo } from './types.js'
import { computeStatus } from './store.js'

/** Build the public metadata object a viewer needs before decrypting. */
export function toMetadata(r: PasteRecord, nowMs: number): PasteMetadata {
  return {
    id: r.id,
    status: computeStatus(r, nowMs),
    format: r.format,
    language: r.language,
    burnAfterRead: r.burnAfterRead,
    deadSwitchDays: r.deadSwitchDays,
    hasFile: r.format === 'file',
    storagePath: r.storagePath,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    requiresPassphrase: r.kdf === 'pbkdf2',
    kdf: r.kdf,
    iterations: r.iterations,
    salt: r.salt,
    iv: r.iv,
  }
}

export function toReceipt(r: PasteRecord, nowMs: number): ReceiptInfo {
  return {
    id: r.id,
    createdAt: r.createdAt,
    viewCount: r.viewCount,
    firstViewedAt: r.firstViewedAt,
    lastViewedAt: r.lastViewedAt,
    status: computeStatus(r, nowMs),
  }
}