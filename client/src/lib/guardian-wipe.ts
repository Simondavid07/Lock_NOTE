import { base64urlToBytes, bytesToBase64url, utf8ToBytes } from './encoding'
import { GUARDIAN_CAPABILITY_BYTES, sha256Base64url } from './crypto'

const VERSION = 'LNGW1'
const MAX_GUARDIANS = 5
const SHARE_SET_ID_BYTES = 16

interface ParsedShare {
  pasteId: string
  shareSetId: string
  threshold: number
  total: number
  x: number
  payload: Uint8Array
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function gfMul(a: number, b: number): number {
  let product = 0
  let left = a
  let right = b
  while (right > 0) {
    if (right & 1) product ^= left
    left <<= 1
    if (left & 0x100) left ^= 0x11b
    right >>= 1
  }
  return product & 0xff
}

function gfPow(base: number, exponent: number): number {
  let result = 1
  let value = base
  let power = exponent
  while (power > 0) {
    if (power & 1) result = gfMul(result, value)
    value = gfMul(value, value)
    power >>= 1
  }
  return result
}

function gfInv(value: number): number {
  assert(value !== 0, 'Guardian share coordinates must be distinct.')
  return gfPow(value, 254)
}

function gfDiv(a: number, b: number): number {
  return a === 0 ? 0 : gfMul(a, gfInv(b))
}

function evaluatePolynomial(coefficients: Uint8Array, x: number): number {
  let value = 0
  for (let i = coefficients.length - 1; i >= 0; i--) value = gfMul(value, x) ^ coefficients[i]!
  return value
}

function randomShareSetId(): string {
  return bytesToBase64url(crypto.getRandomValues(new Uint8Array(SHARE_SET_ID_BYTES)))
}

function shareBody(
  pasteId: string,
  shareSetId: string,
  threshold: number,
  total: number,
  x: number,
  payload: string,
): string {
  return [VERSION, pasteId, shareSetId, String(threshold), String(total), String(x), payload].join('.')
}

/**
 * Split a Guardian Wipe capability in the browser. These shares never contain
 * the note key, passphrase, or share URL. They only reconstruct a capability
 * that may revoke a future server copy.
 */
export async function splitGuardianCapability(
  capability: string,
  pasteId: string,
  threshold: number,
  total: number,
): Promise<string[]> {
  assert(/^[A-Za-z0-9_-]{8,32}$/.test(pasteId), 'Guardian shares require a valid paste id.')
  assert(Number.isInteger(threshold) && threshold >= 2 && threshold <= total, 'Choose a valid guardian threshold.')
  assert(Number.isInteger(total) && total <= MAX_GUARDIANS, `A maximum of ${MAX_GUARDIANS} guardians is supported.`)

  const secret = base64urlToBytes(capability)
  assert(secret.byteLength === GUARDIAN_CAPABILITY_BYTES, 'Guardian capability has an invalid length.')
  const shareSetId = randomShareSetId()
  const shares = Array.from({ length: total }, () => new Uint8Array(secret.byteLength))

  for (let byteIndex = 0; byteIndex < secret.byteLength; byteIndex++) {
    const coefficients = crypto.getRandomValues(new Uint8Array(threshold))
    coefficients[0] = secret[byteIndex]!
    for (let index = 0; index < total; index++) {
      shares[index]![byteIndex] = evaluatePolynomial(coefficients, index + 1)
    }
  }

  return Promise.all(shares.map(async (payloadBytes, index) => {
    const x = index + 1
    const payload = bytesToBase64url(payloadBytes)
    const body = shareBody(pasteId, shareSetId, threshold, total, x, payload)
    return `${body}.${await sha256Base64url(body)}`
  }))
}

async function parseShare(input: string): Promise<ParsedShare> {
  const trimmed = input.trim()
  const parts = trimmed.split('.')
  assert(parts.length === 8 && parts[0] === VERSION, 'Guardian share format is invalid.')
  const [, pasteId, shareSetId, thresholdRaw, totalRaw, xRaw, payload, checksum] = parts
  assert(/^[A-Za-z0-9_-]{8,32}$/.test(pasteId!), 'Guardian share paste binding is invalid.')
  assert(/^[A-Za-z0-9_-]{22}$/.test(shareSetId!), 'Guardian share set identifier is invalid.')
  const threshold = Number(thresholdRaw)
  const total = Number(totalRaw)
  const x = Number(xRaw)
  assert(Number.isInteger(threshold) && Number.isInteger(total) && Number.isInteger(x), 'Guardian share quorum values are invalid.')
  assert(threshold >= 2 && total >= threshold && total <= MAX_GUARDIANS && x >= 1 && x <= total, 'Guardian share quorum values are out of range.')
  assert(/^[A-Za-z0-9_-]{43}$/.test(payload!), 'Guardian share payload is invalid.')
  assert(/^[A-Za-z0-9_-]{43}$/.test(checksum!), 'Guardian share checksum is invalid.')
  const body = shareBody(pasteId!, shareSetId!, threshold, total, x, payload!)
  assert((await sha256Base64url(body)) === checksum, 'Guardian share checksum does not match.')
  const bytes = base64urlToBytes(payload!)
  assert(bytes.byteLength === GUARDIAN_CAPABILITY_BYTES, 'Guardian share payload has an invalid length.')
  return { pasteId: pasteId!, shareSetId: shareSetId!, threshold, total, x, payload: bytes }
}

/**
 * Reconstruct a revocation capability from a coherent K-of-N guardian set.
 * Every structural mismatch is rejected locally before the result is sent to
 * the service; the service then checks the reconstructed capability hash.
 */
export async function combineGuardianShares(shares: string[]): Promise<{ pasteId: string; capability: string; threshold: number; total: number }> {
  assert(shares.length >= 2, 'Provide at least two guardian shares.')
  const parsed = await Promise.all(shares.filter((share) => share.trim().length > 0).map(parseShare))
  assert(parsed.length >= 2, 'Provide at least two guardian shares.')
  const first = parsed[0]!
  assert(parsed.every((share) => share.pasteId === first.pasteId), 'Guardian shares belong to different notes.')
  assert(parsed.every((share) => share.shareSetId === first.shareSetId), 'Guardian shares belong to different guardian sets.')
  assert(parsed.every((share) => share.threshold === first.threshold && share.total === first.total), 'Guardian shares disagree on the quorum policy.')
  assert(parsed.every((share) => share.payload.byteLength === GUARDIAN_CAPABILITY_BYTES), 'Guardian shares disagree on capability length.')

  const distinct = new Set(parsed.map((share) => share.x))
  assert(distinct.size === parsed.length, 'Duplicate guardian share coordinates are not allowed.')
  assert(parsed.length >= first.threshold, `This note requires ${first.threshold} guardian shares.`)

  const selected = [...parsed].sort((a, b) => a.x - b.x).slice(0, first.threshold)
  const secret = new Uint8Array(GUARDIAN_CAPABILITY_BYTES)
  for (let byteIndex = 0; byteIndex < secret.byteLength; byteIndex++) {
    let value = 0
    for (let i = 0; i < selected.length; i++) {
      const xi = selected[i]!.x
      let basis = 1
      for (let j = 0; j < selected.length; j++) {
        if (i === j) continue
        const xj = selected[j]!.x
        basis = gfMul(basis, gfDiv(xj, xi ^ xj))
      }
      value ^= gfMul(selected[i]!.payload[byteIndex]!, basis)
    }
    secret[byteIndex] = value
  }

  return {
    pasteId: first.pasteId,
    capability: bytesToBase64url(secret),
    threshold: first.threshold,
    total: first.total,
  }
}

/** Safe plain-text guardian card copy. QR encodes this exact share string. */
export function guardianCardText(index: number, total: number, share: string): string {
  return `LOCK NOTE GUARDIAN WIPE SHARE ${index} OF ${total}\n\nThis share can help a quorum withdraw a note. It cannot decrypt the note or reveal its key. Keep it separate from the delivery link.\n\n${share}`
}

/** Exposed for deterministic test vector derivation. */
export function guardianShareProtocol(): string {
  return new TextDecoder().decode(utf8ToBytes(VERSION))
}
