import { z } from 'zod'
import { LIMITS, isAllowedTtl } from './util.js'

export const createPasteSchema = z.object({
  /**
   * Optional client-generated id (the client must know the id *before*
   * encrypting — it is bound into the AES-GCM AAD). Falls back to a
   * server-generated id when absent.
   */
  id: z.string().regex(/^[A-Za-z0-9_-]{8,32}$/).optional(),
  /** Base64url AES-256-GCM ciphertext of the encrypted content payload. */
  ciphertext: z.string().min(8).max(LIMITS.contentPayload),
  /** Base64url KDF salt (public; needed by clients to derive the key). */
  salt: z.string().min(8).max(256),
  /** Base64url IV used for the content payload. */
  iv: z.string().min(4).max(64),
  /** PBKDF2 iteration count (0 when kdf === 'hkdf'). */
  iterations: z.number().int().min(0).max(2_000_000).default(0),
  kdf: z.enum(['hkdf', 'pbkdf2']),
  alg: z.literal('aes-256-gcm').default('aes-256-gcm'),
  format: z.enum(['text', 'markdown', 'code', 'credentials', 'file']),
  language: z.string().max(50).nullable().optional().default(null),
  burnAfterRead: z.boolean().default(false),
  deadSwitchDays: z.number().int().min(1).max(365).nullable().optional().default(null),
  ttlSeconds: z.number().int().min(0).max(31_536_000).default(0),
  /** Owner capability for remote wipe / preview / receipts. Returned once. */
  ownerToken: z.string().min(16).max(256),
  file: z
    .object({
      storagePayload: z.string().min(16).max(LIMITS.fileStoragePayload),
      size: z.number().int().min(1).max(LIMITS.fileRawBytes),
      fileIv: z.string().min(4).max(64),
    })
    .optional(),
})
  .refine((v) => isAllowedTtl(v.ttlSeconds), { message: 'ttlSeconds must be a supported preset' })
  .refine((v) => (v.format === 'file') === Boolean(v.file), { message: 'file payload required for file secrets' })
  .refine((v) => (v.format === 'file' ? v.ciphertext.length <= 64_000 : true), {
    message: 'file content payload is unexpectedly large',
  })

export type CreatePasteBody = z.infer<typeof createPasteSchema>

export const consumeSchema = z.object({
  ownerToken: z.string().min(16).max(256).optional(),
})

export const ownerSchema = z.object({
  ownerToken: z.string().min(16).max(256),
})

export const draftSchema = z.object({
  content: z.string().max(2_000_000).optional(),
})