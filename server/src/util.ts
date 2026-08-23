import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'

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

/** Constant-time string comparison for owner tokens. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
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
} as const