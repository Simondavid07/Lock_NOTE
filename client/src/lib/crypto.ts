import { base64urlToBytes, bytesToBase64url, bytesToUtf8, utf8ToBytes, toArrayBuffer } from './encoding'

export const ALG = 'aes-256-gcm'
export const PROTOCOL = 'locknote/v1'
export const PBKDF2_ITERATIONS = 600_000
export const SALT_BYTES = 32
export const IV_BYTES = 12
export const RECEIPT_PROOF_BYTES = 32
export const GUARDIAN_CAPABILITY_BYTES = 32

export type KdfKind = 'hkdf' | 'pbkdf2'

export type PasteFormat = 'text' | 'markdown' | 'code' | 'credentials' | 'file'

export interface KeyParams {
  salt: Uint8Array
  kdf: KdfKind
  iterations: number
}

/** Raised when GCM authentication fails (tampering or a wrong passphrase). */
export class IntegrityError extends Error {
  constructor(message = 'Decryption failed — the paste was tampered with or the passphrase is wrong.') {
    super(message)
    this.name = 'IntegrityError'
  }
}

/** Generate a fresh 32-byte master secret for the URL fragment. */
export function generateSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32))
}

/**
 * Derive the AES-256-GCM key.
 * - `hkdf`:    K = HKDF-SHA256(secret, salt)  — key travels in the URL fragment.
 * - `pbkdf2`:  K = PBKDF2-SHA256(passphrase, salt, 600k) — key lives in the recipient's head.
 * The salt is public and stored server-side; without the secret or passphrase
 * the ciphertext is mathematically unrecoverable.
 */
export async function deriveEncryptionKey(
  secret: Uint8Array | null,
  passphrase: string | null,
  params: KeyParams,
): Promise<CryptoKey> {
  const { salt, kdf, iterations } = params
  if (salt.byteLength !== SALT_BYTES) throw new IntegrityError('The encrypted envelope has an invalid salt.')
  if (kdf === 'hkdf' && iterations !== 0) throw new IntegrityError('The encrypted envelope has an invalid HKDF policy.')
  if (kdf === 'pbkdf2' && iterations !== PBKDF2_ITERATIONS) throw new IntegrityError('The encrypted envelope has an unsupported PBKDF2 policy.')
  if (kdf === 'pbkdf2') {
    if (!passphrase) throw new Error('A passphrase is required for this paste.')
    const material = await crypto.subtle.importKey('raw', toArrayBuffer(utf8ToBytes(passphrase)), 'PBKDF2', false, ['deriveKey'])
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
  }
  if (!secret) throw new Error('The paste key is missing from the URL.')
  const material = await crypto.subtle.importKey('raw', toArrayBuffer(secret), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: toArrayBuffer(salt), info: toArrayBuffer(utf8ToBytes(PROTOCOL)) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Authenticated encryption with the paste id bound as AAD: a valid-looking
 * blob from paste A can never decrypt under paste B.
 */
export async function encrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv), additionalData: toArrayBuffer(aad) },
      key,
      toArrayBuffer(plaintext),
    ),
  )
  return { ciphertext, iv }
}

export async function decrypt(key: CryptoKey, ciphertext: Uint8Array, iv: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv), additionalData: toArrayBuffer(aad) },
        key,
        toArrayBuffer(ciphertext),
      ),
    )
  } catch {
    throw new IntegrityError()
  }
}

/** The Additional Authenticated Data binding a payload to its paste. */
export function aadFor(pasteId: string): Uint8Array {
  return utf8ToBytes(`${pasteId}|${PROTOCOL}`)
}

/** Encrypted JSON envelope shared by every secret type. */
export interface ContentEnvelope {
  /** Version 2 adds a random read proof that is authenticated inside ciphertext. */
  v: 1 | 2
  title?: string
  content?: string
  language?: string
  /** File secrets only — name/mime live here so the server never sees them. */
  name?: string
  mime?: string
  /** Present only on v2 envelopes. Submitted after successful local decryption. */
  receiptProof?: string
}

export async function sealContent(
  key: CryptoKey,
  pasteId: string,
  envelope: ContentEnvelope,
): Promise<{ ciphertextB64: string; ivB64: string }> {
  const { ciphertext, iv } = await encrypt(key, utf8ToBytes(JSON.stringify(envelope)), aadFor(pasteId))
  return { ciphertextB64: bytesToBase64url(ciphertext), ivB64: bytesToBase64url(iv) }
}

export async function openContent(
  key: CryptoKey,
  pasteId: string,
  ciphertextB64: string,
  ivB64: string,
): Promise<ContentEnvelope> {
  const plaintext = await decrypt(key, base64urlToBytes(ciphertextB64), base64urlToBytes(ivB64), aadFor(pasteId))
  const parsed: unknown = JSON.parse(bytesToUtf8(plaintext))
  if (!parsed || typeof parsed !== 'object' || !('v' in parsed)) {
    throw new IntegrityError('Unsupported payload version.')
  }
  const envelope = parsed as ContentEnvelope
  if (envelope.v !== 1 && envelope.v !== 2) throw new IntegrityError('Unsupported payload version.')
  if (envelope.v === 2 && (!envelope.receiptProof || !/^[A-Za-z0-9_-]{43}$/.test(envelope.receiptProof))) {
    throw new IntegrityError('The encrypted envelope is missing its delivery proof.')
  }
  return envelope
}

/** Random 32-byte salt for the KDF (stored server-side; public). */
export function generateSalt(): string {
  return bytesToBase64url(crypto.getRandomValues(new Uint8Array(SALT_BYTES)))
}

/** Random proof embedded only in the encrypted envelope for a verified-open acknowledgement. */
export function generateReceiptProof(): string {
  return bytesToBase64url(crypto.getRandomValues(new Uint8Array(RECEIPT_PROOF_BYTES)))
}

/** Random capability split only for Guardian Wipe; it is never the content key. */
export function generateGuardianCapability(): string {
  return bytesToBase64url(crypto.getRandomValues(new Uint8Array(GUARDIAN_CAPABILITY_BYTES)))
}

/** Browser-side SHA-256 verifier. The raw value never reaches the server. */
export async function sha256Base64url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(utf8ToBytes(value)))
  return bytesToBase64url(new Uint8Array(digest))
}

/** Random 12-byte IV (stored server-side; public). */
export function generateIv(): string {
  return bytesToBase64url(crypto.getRandomValues(new Uint8Array(IV_BYTES)))
}

/** Fresh owner capability token (remote wipe / preview / receipts). */
export function generateOwnerToken(): string {
  return bytesToBase64url(crypto.getRandomValues(new Uint8Array(24)))
}

/**
 * The client generates the paste id *before* encrypting, because the id is
 * bound into the AES-GCM AAD. The server validates and dedupes it.
 */
export function generatePasteId(): string {
  return bytesToBase64url(crypto.getRandomValues(new Uint8Array(8)))
}

/** AAD for the separately-encrypted file blob (distinct domain from content). */
export function aadForFile(pasteId: string): Uint8Array {
  return utf8ToBytes(`${pasteId}|${PROTOCOL}|file`)
}

export interface FragmentParts {
  /** The 32-byte secret for hkdf pastes, or null for passphrase pastes. */
  secret: Uint8Array | null
  /** True when the URL carries a `#p` marker (passphrase required). */
  requiresPassphrase: boolean
}

/** Parse the URL fragment (`#k=<secret>` or `#p`). Never sent to the server. */
export function parseFragment(hash: string): FragmentParts {
  const cleaned = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(cleaned)
  const k = params.get('k')
  if (k) {
    try {
      return { secret: base64urlToBytes(k), requiresPassphrase: false }
    } catch {
      return { secret: null, requiresPassphrase: false }
    }
  }
  return { secret: null, requiresPassphrase: params.has('p') }
}

export function buildFragment(secret: Uint8Array | null, requiresPassphrase: boolean): string {
  if (requiresPassphrase) return '#p'
  return secret ? `#k=${bytesToBase64url(secret)}` : ''
}

/** Full shareable link. The fragment is never transmitted to the server. */
export function buildShareUrl(origin: string, pasteId: string, secret: Uint8Array | null, requiresPassphrase: boolean): string {
  return `${origin}/paste/${pasteId}${buildFragment(secret, requiresPassphrase)}`
}

/** Seal fingerprint: 4 memorable words + a color glyph derived from the secret. */
export function fingerprint(secret: Uint8Array): { words: string; color: string } {
  // Deterministic FNV-1a over the secret — same secret always yields the same seal.
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (const b of secret) {
    h1 = Math.imul(h1 ^ b, 0x01000193)
    h2 = Math.imul(h2 ^ b, 0x01000193)
  }
  const idx = [h1 & 0xff, (h1 >>> 8) & 0xff, (h2 >>> 16) & 0xff, (h2 >>> 24) & 0xff]
  const words = idx.map((i) => WORDLIST[i % WORDLIST.length]!).join(' ')
  const palette = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899']
  const color = palette[(h2 >>> 8) & 0xff] ?? palette[((h2 >>> 8) & 0xff) % palette.length]!
  return { words, color }
}

const WORDLIST = [
  'amber', 'anchor', 'aspen', 'aster', 'atlas', 'aurora', 'avocado', 'azure',
  'bamboo', 'basil', 'beacon', 'birch', 'bloom', 'breeze', 'brindle', 'bronze',
  'cactus', 'candle', 'carbon', 'cedar', 'cinder', 'clover', 'cobalt', 'comet',
  'coral', 'cove', 'cranberry', 'crescent', 'crimson', 'cypress', 'dahlia', 'dawn',
  'dune', 'eagle', 'ember', 'everest', 'falcon', 'fern', 'fiesta', 'flint',
  'foxglove', 'galaxy', 'garnet', 'geyser', 'ginger', 'glacier', 'granite', 'grape',
  'harbor', 'hazel', 'heather', 'heron', 'honey', 'horizon', 'huckle', 'indigo',
  'iris', 'ivory', 'jade', 'jasper', 'juniper', 'kelp', 'kiwi', 'lagoon',
  'larkspur', 'lattice', 'lavender', 'lemon', 'lichen', 'lilac', 'linden', 'lotus',
  'lunar', 'madder', 'magma', 'magnolia', 'malachite', 'maple', 'marble', 'marigold',
  'meadow', 'mica', 'mimosa', 'mint', 'mist', 'mocha', 'moss', 'mural',
  'myrtle', 'nebula', 'nectar', 'nimbus', 'northern', 'oak', 'ocean', 'olive',
  'onyx', 'opal', 'orbit', 'orchid', 'otter', 'owl', 'paddle', 'palm',
  'panther', 'papaya', 'parakeet', 'peach', 'pearl', 'pebble', 'pelican', 'pepper',
  'peridot', 'petal', 'pine', 'pixel', 'plum', 'poppy', 'porpoise', 'prism',
  'puffin', 'quartz', 'quill', 'rain', 'raven', 'reed', 'reef', 'rhino',
  'river', 'robin', 'rose', 'ruby', 'sage', 'sail', 'salmon', 'sand',
  'sapphire', 'scallop', 'seal', 'serpent', 'shadow', 'shell', 'silver', 'snow',
  'sparrow', 'spruce', 'starling', 'stone', 'summit', 'sun', 'swallow', 'sycamore',
  'tamarind', 'tangerine', 'teal', 'thistle', 'tide', 'tiger', 'titan', 'topaz',
  'toucan', 'trout', 'tulip', 'tundra', 'umber', 'violet', 'walnut', 'wave',
  'willow', 'wolf', 'wren', 'yarrow', 'zebra', 'zenith', 'zinc', 'zinnia',
] as const