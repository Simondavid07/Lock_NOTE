import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'

/** Fixed cryptographic policy mirrored by the browser client. */
export const CRYPTO_POLICY = {
  protocol: 'locknote/v1',
  pbkdf2Iterations: 600_000,
  saltBytes: 32,
  ivBytes: 12,
  ownerTokenBytes: 24,
  receiptProofBytes: 32,
  guardianCapabilityBytes: 32,
  replyCapabilityBytes: 32,
} as const

/** URL-safe random token (base64url), used for owner capabilities and room ids. */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url')
}

/** Short URL-safe paste id (~11 chars, ~64 bits of entropy). */
export function randomId(): string {
  return randomBytes(8).toString('base64url')
}

export function now(): number {
  return Date.now()
}

/** Constant-time string comparison for owner tokens and proof digests. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/** Stable base64url SHA-256 digest used to store proof/capability verifiers. */
export function sha256Base64url(input: string): string {
  return createHash('sha256').update(input).digest('base64url')
}

export function isBase64url(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value)
}

export function isBase64urlBytes(value: string, expectedBytes: number): boolean {
  if (!isBase64url(value)) return false
  try {
    return Buffer.from(value, 'base64url').byteLength === expectedBytes
  } catch {
    return false
  }
}

export function isCanonicalBase64(value: string): boolean {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false
  try {
    return Buffer.from(value, 'base64').toString('base64') === value
  } catch {
    return false
  }
}

export const MS = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000,
} as const

/** Map TTL seconds to ms. 0 means never expire. Uses the supplied clock. */
export function ttlToExpiry(ttlSeconds: number, from = now()): number | null {
  if (!ttlSeconds || ttlSeconds <= 0) return null
  return from + ttlSeconds * 1000
}

/** Allowed TTL presets offered by the UI, in seconds. 0 = never. */
export const TTL_PRESETS = [300, 3600, 86400, 604800, 2592000, 0] as const

export function isAllowedTtl(ttlSeconds: number): boolean {
  return (TTL_PRESETS as readonly number[]).includes(ttlSeconds)
}

/** JSON body size limits (bytes). File secrets ship base64 (~4/3 the raw size). */
export const LIMITS = {
  contentPayload: 1_400_000, // ~1 MB plaintext equivalent
  fileStoragePayload: 6_700_000, // ~5 MB plaintext file, base64 encoded
  fileRawBytes: 5_000_000,
  replyCiphertext: 8_192,
  replyMaxPerPaste: 20,
} as const
