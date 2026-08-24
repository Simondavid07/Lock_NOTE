import { z } from 'zod'
import { CRYPTO_POLICY, LIMITS, isAllowedTtl, isBase64urlBytes, isCanonicalBase64 } from './util.js'

const base64urlOf = (bytes: number, label: string) =>
  z.string().refine((value) => isBase64urlBytes(value, bytes), { message: `${label} must be a canonical ${bytes}-byte base64url value` })

const ownerTokenSchema = base64urlOf(CRYPTO_POLICY.ownerTokenBytes, 'ownerToken')
const receiptProofHashSchema = base64urlOf(CRYPTO_POLICY.receiptProofBytes, 'receiptProofHash')
const guardianVerifierSchema = base64urlOf(CRYPTO_POLICY.guardianCapabilityBytes, 'guardianVerifier')

export const guardianSchema = z
  .object({
    threshold: z.number().int().min(2).max(5),
    total: z.number().int().min(2).max(5),
    verifier: guardianVerifierSchema,
  })
  .refine((value) => value.threshold <= value.total, { message: 'guardian threshold cannot exceed total guardians' })

export const createPasteSchema = z
  .object({
    /**
     * Optional client-generated id (the client must know the id *before*
     * encrypting — it is bound into the AES-GCM AAD). Falls back to a
     * server-generated id when absent.
     */
    id: z.string().regex(/^[A-Za-z0-9_-]{8,32}$/).optional(),
    /** Base64url AES-256-GCM ciphertext of the encrypted content payload. */
    ciphertext: z.string().min(8).max(LIMITS.contentPayload).regex(/^[A-Za-z0-9_-]+$/, 'ciphertext must be base64url'),
    /** Base64url KDF salt (public; needed by clients to derive the key). */
    salt: base64urlOf(CRYPTO_POLICY.saltBytes, 'salt'),
    /** Base64url IV used for the content payload. */
    iv: base64urlOf(CRYPTO_POLICY.ivBytes, 'iv'),
    /** PBKDF2 iteration count (0 when kdf === 'hkdf'). */
    iterations: z.number().int().min(0).max(CRYPTO_POLICY.pbkdf2Iterations).default(0),
    kdf: z.enum(['hkdf', 'pbkdf2']),
    alg: z.literal('aes-256-gcm').default('aes-256-gcm'),
    format: z.enum(['text', 'markdown', 'code', 'credentials', 'file']),
    language: z.string().max(50).nullable().optional().default(null),
    burnAfterRead: z.boolean().default(false),
    deadSwitchDays: z.number().int().min(1).max(365).nullable().optional().default(null),
    ttlSeconds: z.number().int().min(0).max(31_536_000).default(0),
    /** Owner capability for remote wipe / preview / receipt. Returned once. */
    ownerToken: ownerTokenSchema,
    /** Only a SHA-256 verifier reaches the server; the raw proof is encrypted in the envelope. */
    receiptProofHash: receiptProofHashSchema,
    /** Optional K-of-N emergency revocation verifier; it never grants decryption. */
    guardian: guardianSchema.optional(),
    file: z
      .object({
        storagePayload: z.string().min(16).max(LIMITS.fileStoragePayload).refine(isCanonicalBase64, { message: 'storagePayload must be canonical base64' }),
        size: z.number().int().min(1).max(LIMITS.fileRawBytes),
        fileIv: base64urlOf(CRYPTO_POLICY.ivBytes, 'fileIv'),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (!isAllowedTtl(value.ttlSeconds)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ttlSeconds'], message: 'ttlSeconds must be a supported preset' })
    }
    if ((value.format === 'file') !== Boolean(value.file)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['file'], message: 'file payload required for file secrets' })
    }
    if (value.format === 'file' && value.ciphertext.length > 64_000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ciphertext'], message: 'file content payload is unexpectedly large' })
    }
    if (value.kdf === 'hkdf' && value.iterations !== 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['iterations'], message: 'HKDF records must use zero iterations' })
    }
    if (value.kdf === 'pbkdf2' && value.iterations !== CRYPTO_POLICY.pbkdf2Iterations) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['iterations'], message: `PBKDF2 records must use ${CRYPTO_POLICY.pbkdf2Iterations} iterations` })
    }
    if (value.file) {
      const encryptedBytes = Buffer.from(value.file.storagePayload, 'base64').byteLength
      if (encryptedBytes !== value.file.size + 16) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['file', 'storagePayload'], message: 'file ciphertext length does not match AES-GCM plaintext length' })
      }
    }
  })

export type CreatePasteBody = z.infer<typeof createPasteSchema>

export const consumeSchema = z.object({
  ownerToken: ownerTokenSchema.optional(),
})

export const acknowledgeSchema = z.object({
  proof: base64urlOf(CRYPTO_POLICY.receiptProofBytes, 'proof'),
})

export const guardianWipeSchema = z.object({
  capability: base64urlOf(CRYPTO_POLICY.guardianCapabilityBytes, 'capability'),
})

export const fileLeaseSchema = z.object({
  token: base64urlOf(CRYPTO_POLICY.ownerTokenBytes, 'file lease token'),
})

export const ownerSchema = z.object({
  ownerToken: ownerTokenSchema,
})

export const draftSchema = z.object({
  content: z.string().max(2_000_000).optional(),
})
