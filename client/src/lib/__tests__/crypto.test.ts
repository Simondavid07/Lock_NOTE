import { describe, it, expect } from 'vitest'
import {
  IntegrityError,
  aadFor,
  aadForFile,
  aadForReply,
  buildFragment,
  buildShareUrl,
  deriveEncryptionKey,
  decrypt,
  encrypt,
  fingerprint,
  generateOwnerToken,
  generateReplyCapability,
  generatePasteId,
  generateSalt,
  generateSecret,
  openContent,
  parseFragment,
  sealContent,
} from '../crypto'
import { base64urlToBytes, utf8ToBytes } from '../encoding'

describe('deriveEncryptionKey + encrypt/decrypt (HKDF path)', () => {
  it('round-trips a payload with the same key and AAD', async () => {
    const secret = generateSecret()
    const salt = base64urlToBytes(generateSalt())
    const key = await deriveEncryptionKey(secret, null, { salt, kdf: 'hkdf', iterations: 0 })
    const { ciphertext, iv } = await encrypt(key, utf8ToBytes('top secret'), aadFor('pasteId123'))
    expect(ciphertext).not.toEqual(utf8ToBytes('top secret'))
    const plain = await decrypt(key, ciphertext, iv, aadFor('pasteId123'))
    expect(new TextDecoder().decode(plain)).toBe('top secret')
  })

  it('derives the same key deterministically', async () => {
    const secret = generateSecret()
    const salt = base64urlToBytes(generateSalt())
    const k1 = await deriveEncryptionKey(secret, null, { salt, kdf: 'hkdf', iterations: 0 })
    const k2 = await deriveEncryptionKey(secret, null, { salt, kdf: 'hkdf', iterations: 0 })
    const { ciphertext, iv } = await encrypt(k1, utf8ToBytes('x'), aadFor('id'))
    // A key derived from the same secret+salt must decrypt a payload sealed under
    // the other derivation, even though each encrypt() rolls a fresh IV.
    expect(new TextDecoder().decode(await decrypt(k2, ciphertext, iv, aadFor('id')))).toBe('x')
  })

  it('throws when the secret is missing on the hkdf path', async () => {
    await expect(
      deriveEncryptionKey(null, null, { salt: base64urlToBytes(generateSalt()), kdf: 'hkdf', iterations: 0 }),
    ).rejects.toThrow('The paste key is missing from the URL.')
  })

  it('rejects a tampered ciphertext with IntegrityError', async () => {
    const key = await deriveEncryptionKey(generateSecret(), null, { salt: base64urlToBytes(generateSalt()), kdf: 'hkdf', iterations: 0 })
    const { ciphertext, iv } = await encrypt(key, utf8ToBytes('secret'), aadFor('id'))
    const tampered = ciphertext.slice()
    tampered[tampered.length - 1]! ^= 0xff
    await expect(decrypt(key, tampered, iv, aadFor('id'))).rejects.toBeInstanceOf(IntegrityError)
  })

  it('rejects decryption under a different AAD (paste id swap)', async () => {
    const key = await deriveEncryptionKey(generateSecret(), null, { salt: base64urlToBytes(generateSalt()), kdf: 'hkdf', iterations: 0 })
    const { ciphertext, iv } = await encrypt(key, utf8ToBytes('secret'), aadFor('pasteA'))
    await expect(decrypt(key, ciphertext, iv, aadFor('pasteB'))).rejects.toBeInstanceOf(IntegrityError)
  })

  it('rejects decryption with the wrong IV', async () => {
    const key = await deriveEncryptionKey(generateSecret(), null, { salt: base64urlToBytes(generateSalt()), kdf: 'hkdf', iterations: 0 })
    const { ciphertext } = await encrypt(key, utf8ToBytes('secret'), aadFor('id'))
    const wrongIv = new Uint8Array(12)
    await expect(decrypt(key, ciphertext, wrongIv, aadFor('id'))).rejects.toBeInstanceOf(IntegrityError)
  })

  it('content, file, and reply AAD domains are distinct', () => {
    const a = aadFor('pasteId123')
    const b = aadForFile('pasteId123')
    const c = aadForReply('pasteId123')
    expect(new TextDecoder().decode(a)).toBe('pasteId123|locknote/v1')
    expect(new TextDecoder().decode(b)).toBe('pasteId123|locknote/v1|file')
    expect(new TextDecoder().decode(c)).toBe('pasteId123|locknote/v1|reply')
    expect(a).not.toEqual(b)
    expect(b).not.toEqual(c)
  })

  it('rejects a reply ciphertext under the content AAD domain', async () => {
    const key = await deriveEncryptionKey(generateSecret(), null, { salt: base64urlToBytes(generateSalt()), kdf: 'hkdf', iterations: 0 })
    const { ciphertext, iv } = await encrypt(key, utf8ToBytes('encrypted reply'), aadForReply('pasteId123'))
    await expect(decrypt(key, ciphertext, iv, aadFor('pasteId123'))).rejects.toBeInstanceOf(IntegrityError)
  })
})

describe('passphrase path (PBKDF2)', () => {
  it('round-trips with the correct passphrase', async () => {
    const salt = base64urlToBytes(generateSalt())
    const key = await deriveEncryptionKey(null, 'correct horse battery staple', {
      salt,
      kdf: 'pbkdf2',
      iterations: 600_000,
    })
    const { ciphertext, iv } = await encrypt(key, utf8ToBytes('secret'), aadFor('id'))
    const plain = await decrypt(key, ciphertext, iv, aadFor('id'))
    expect(new TextDecoder().decode(plain)).toBe('secret')
  })

  it('fails with IntegrityError on a wrong passphrase', async () => {
    const salt = base64urlToBytes(generateSalt())
    const good = await deriveEncryptionKey(null, 'correct passphrase', { salt, kdf: 'pbkdf2', iterations: 600_000 })
    const bad = await deriveEncryptionKey(null, 'wrong passphrase', { salt, kdf: 'pbkdf2', iterations: 600_000 })
    const { ciphertext, iv } = await encrypt(good, utf8ToBytes('secret'), aadFor('id'))
    await expect(decrypt(bad, ciphertext, iv, aadFor('id'))).rejects.toBeInstanceOf(IntegrityError)
  })

  it('throws when no passphrase is provided', async () => {
    await expect(
      deriveEncryptionKey(null, null, { salt: base64urlToBytes(generateSalt()), kdf: 'pbkdf2', iterations: 600_000 }),
    ).rejects.toThrow('A passphrase is required for this paste.')
  })
})

describe('sealContent / openContent', () => {
  it('round-trips a text envelope', async () => {
    const id = generatePasteId()
    const key = await deriveEncryptionKey(generateSecret(), null, { salt: base64urlToBytes(generateSalt()), kdf: 'hkdf', iterations: 0 })
    const sealed = await sealContent(key, id, { v: 1, title: 'My secret', content: 'hello', language: 'markdown' })
    const opened = await openContent(key, id, sealed.ciphertextB64, sealed.ivB64)
    expect(opened).toEqual({ v: 1, title: 'My secret', content: 'hello', language: 'markdown' })
  })

  it('round-trips a credentials envelope', async () => {
    const id = generatePasteId()
    const key = await deriveEncryptionKey(generateSecret(), null, { salt: base64urlToBytes(generateSalt()), kdf: 'hkdf', iterations: 0 })
    const envelope = { v: 1, title: 'prod db', content: 'postgres://u:p@host:5432/db' } as const
    const sealed = await sealContent(key, id, envelope)
    expect(await openContent(key, id, sealed.ciphertextB64, sealed.ivB64)).toEqual(envelope)
  })

  it('rejects opening under a different paste id (AAD binding)', async () => {
    const idA = generatePasteId()
    const idB = generatePasteId()
    const key = await deriveEncryptionKey(generateSecret(), null, { salt: base64urlToBytes(generateSalt()), kdf: 'hkdf', iterations: 0 })
    const sealed = await sealContent(key, idA, { v: 1, content: 'secret' })
    await expect(openContent(key, idB, sealed.ciphertextB64, sealed.ivB64)).rejects.toBeInstanceOf(IntegrityError)
  })

  it('rejects tampered ciphertext', async () => {
    const id = generatePasteId()
    const key = await deriveEncryptionKey(generateSecret(), null, { salt: base64urlToBytes(generateSalt()), kdf: 'hkdf', iterations: 0 })
    const sealed = await sealContent(key, id, { v: 1, content: 'secret' })
    const bytes = new TextEncoder().encode(sealed.ciphertextB64)
    bytes[bytes.length - 1] = bytes[bytes.length - 1] === 65 ? 66 : 65
    const tampered = new TextDecoder().decode(bytes)
    await expect(openContent(key, id, tampered, sealed.ivB64)).rejects.toBeInstanceOf(IntegrityError)
  })

  it('round-trips a version-two envelope with an authenticated receipt proof', async () => {
    const id = generatePasteId()
    const key = await deriveEncryptionKey(generateSecret(), null, { salt: base64urlToBytes(generateSalt()), kdf: 'hkdf', iterations: 0 })
    const envelope = { v: 2, content: 'secret', receiptProof: 'CwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCws' } as const
    const sealed = await sealContent(key, id, envelope)
    expect(await openContent(key, id, sealed.ciphertextB64, sealed.ivB64)).toEqual(envelope)
  })

  it('rejects a version-two envelope without a valid receipt proof', async () => {
    const id = generatePasteId()
    const key = await deriveEncryptionKey(generateSecret(), null, { salt: base64urlToBytes(generateSalt()), kdf: 'hkdf', iterations: 0 })
    const sealed = await sealContent(key, id, { v: 2 } as never)
    await expect(openContent(key, id, sealed.ciphertextB64, sealed.ivB64)).rejects.toBeInstanceOf(IntegrityError)
  })
})

describe('URL fragment', () => {
  it('parses a #k fragment back to the secret', () => {
    const secret = generateSecret()
    const fragment = buildFragment(secret, false)
    expect(fragment.startsWith('#k=')).toBe(true)
    const parsed = parseFragment(fragment)
    expect(parsed.requiresPassphrase).toBe(false)
    expect(parsed.secret).toEqual(secret)
  })

  it('parses the passphrase marker', () => {
    expect(parseFragment('#p')).toEqual({ secret: null, requiresPassphrase: true })
    expect(parseFragment('p')).toEqual({ secret: null, requiresPassphrase: true })
  })

  it('treats empty and garbage fragments as keyless, non-passphrase', () => {
    expect(parseFragment('')).toEqual({ secret: null, requiresPassphrase: false })
    expect(parseFragment('#k=!!not-base64url!!')).toEqual({ secret: null, requiresPassphrase: false })
    expect(parseFragment('#foo=bar')).toEqual({ secret: null, requiresPassphrase: false })
  })

  it('builds a full share URL with a fragment', () => {
    const secret = generateSecret()
    const url = buildShareUrl('https://locknote.example', 'pasteId123', secret, false)
    expect(url).toBe(`https://locknote.example/paste/pasteId123${buildFragment(secret, false)}`)
    expect(url).toMatch(/^https:\/\/locknote\.example\/paste\/pasteId123#k=[A-Za-z0-9_-]+$/)
  })

  it('builds a passphrase share URL', () => {
    expect(buildShareUrl('https://locknote.example', 'id', null, true)).toBe('https://locknote.example/paste/id#p')
  })

  it('generated ids match the server validation regex', () => {
    const id = generatePasteId()
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,32}$/)
  })
})

describe('randomness helpers', () => {
  it('generateSecret is 32 bytes', () => {
    expect(generateSecret()).toHaveLength(32)
  })

  it('generateSalt, owner token, and reply capability are non-empty base64url', () => {
    expect(generateSalt()).toMatch(/^[A-Za-z0-9_-]{20,}$/)
    expect(generateOwnerToken()).toMatch(/^[A-Za-z0-9_-]{20,}$/)
    expect(generateReplyCapability()).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(generateSalt()).not.toBe(generateSalt())
    expect(generateReplyCapability()).not.toBe(generateReplyCapability())
  })
})

describe('fingerprint', () => {
  it('is deterministic for the same secret', () => {
    const secret = new Uint8Array(32).fill(7)
    expect(fingerprint(secret)).toEqual(fingerprint(secret))
  })

  it('differs across secrets', () => {
    const a = new Uint8Array(32).fill(7)
    const b = new Uint8Array(32).fill(8)
    expect(fingerprint(a)).not.toEqual(fingerprint(b))
  })

  it('produces four lowercase words and a color', () => {
    const { words, color } = fingerprint(generateSecret())
    expect(words.split(' ')).toHaveLength(4)
    for (const w of words.split(' ')) expect(w).toMatch(/^[a-z]+$/)
    expect(color).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('varies words across random secrets', () => {
    const a = fingerprint(generateSecret()).words
    const b = fingerprint(generateSecret()).words
    // Astronomically unlikely to collide across two fresh 256-bit secrets.
    expect(a).not.toBe(b)
  })
})

describe('IntegrityError', () => {
  it('carries a helpful default message', () => {
    const err = new IntegrityError()
    expect(err.name).toBe('IntegrityError')
    expect(err.message).toContain('passphrase')
  })
})
