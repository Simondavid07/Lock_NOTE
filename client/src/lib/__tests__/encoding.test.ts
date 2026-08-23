import { describe, it, expect } from 'vitest'
import {
  base64ToBytes,
  base64urlToBytes,
  bytesToBase64,
  bytesToBase64url,
  bytesToHex,
  bytesToUtf8,
  toArrayBuffer,
  utf8ToBytes,
} from '../encoding'

describe('utf8ToBytes / bytesToUtf8', () => {
  it('round-trips ASCII', () => {
    const text = 'Hello, Locknote!'
    expect(bytesToUtf8(utf8ToBytes(text))).toBe(text)
  })

  it('round-trips multibyte unicode and emoji', () => {
    const text = 'héllo wörld — 🔐🔑 ünïcode'
    expect(bytesToUtf8(utf8ToBytes(text))).toBe(text)
  })

  it('round-trips empty string', () => {
    expect(bytesToUtf8(utf8ToBytes(''))).toBe('')
  })
})

describe('bytesToBase64url / base64urlToBytes', () => {
  const lengths = [0, 1, 2, 3, 5, 12, 24, 31, 32, 33, 64, 100, 1024]

  for (const n of lengths) {
    it(`round-trips ${n} random bytes`, () => {
      const bytes = crypto.getRandomValues(new Uint8Array(n))
      const b64 = bytesToBase64url(bytes)
      expect(b64).toMatch(/^[A-Za-z0-9_-]*$/)
      expect(b64).not.toContain('=')
      expect(base64urlToBytes(b64)).toEqual(bytes)
    })
  }

  it('rejects nothing and tolerates padded input', () => {
    const bytes = utf8ToBytes('padded')
    expect(base64urlToBytes('cGFkZGVk')).toEqual(bytes)
  })

  it('distinguishes zero from one byte', () => {
    expect(bytesToBase64url(new Uint8Array(0))).toBe('')
    expect(bytesToBase64url(new Uint8Array([0]))).toBe('AA')
  })
})

describe('bytesToHex', () => {
  it('hex-encodes bytes', () => {
    expect(bytesToHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe('deadbeef')
    expect(bytesToHex(new Uint8Array([0x0f, 0xab, 0x00]))).toBe('0fab00')
  })
})

describe('toArrayBuffer', () => {
  it('copies exactly the view, not the parent buffer', () => {
    const parent = new Uint8Array([9, 9, 1, 2, 3, 9, 9])
    const view = parent.subarray(2, 5)
    const copy = new Uint8Array(toArrayBuffer(view))
    expect(copy).toEqual(new Uint8Array([1, 2, 3]))
    expect(copy.byteLength).toBe(3)
    expect(copy.byteOffset).toBe(0)
  })

  it('is passable to WebCrypto as BufferSource', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes))
    expect(digest.byteLength).toBe(32)
  })
})

describe('standard base64 (file payloads)', () => {
  it('round-trips random bytes with padding', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(300))
    const b64 = bytesToBase64(bytes)
    expect(b64).toMatch(/=*$/)
    expect(base64ToBytes(b64)).toEqual(bytes)
  })

  it('differs from base64url encoding', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    expect(bytesToBase64(bytes)).not.toBe(bytesToBase64url(bytes))
  })
})
