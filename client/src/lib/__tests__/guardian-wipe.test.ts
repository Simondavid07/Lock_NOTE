import { describe, expect, it } from 'vitest'
import { generateGuardianCapability } from '../crypto'
import { combineGuardianShares, guardianCardText, guardianShareProtocol, splitGuardianCapability } from '../guardian-wipe'

describe('Guardian Wipe threshold revocation shares', () => {
  it('reconstructs the revocation capability from a valid 2-of-3 quorum', async () => {
    const capability = generateGuardianCapability()
    const shares = await splitGuardianCapability(capability, 'pasteId123', 2, 3)
    const combined = await combineGuardianShares([shares[2]!, shares[0]!])
    expect(combined).toEqual({ pasteId: 'pasteId123', capability, threshold: 2, total: 3 })
  })

  it('rejects fewer than the configured threshold', async () => {
    const shares = await splitGuardianCapability(generateGuardianCapability(), 'pasteId123', 3, 4)
    await expect(combineGuardianShares([shares[0]!, shares[1]!])).rejects.toThrow('requires 3 guardian shares')
  })

  it('rejects duplicate guardian coordinates', async () => {
    const shares = await splitGuardianCapability(generateGuardianCapability(), 'pasteId123', 2, 3)
    await expect(combineGuardianShares([shares[0]!, shares[0]!])).rejects.toThrow('Duplicate guardian share coordinates')
  })

  it('rejects shares from a different paste or guardian set', async () => {
    const first = await splitGuardianCapability(generateGuardianCapability(), 'pasteId123', 2, 3)
    const second = await splitGuardianCapability(generateGuardianCapability(), 'pasteId456', 2, 3)
    await expect(combineGuardianShares([first[0]!, second[1]!])).rejects.toThrow('different notes')
  })

  it('rejects a tampered share checksum before reconstruction', async () => {
    const shares = await splitGuardianCapability(generateGuardianCapability(), 'pasteId123', 2, 3)
    const tampered = `${shares[0]!.slice(0, -1)}${shares[0]!.endsWith('A') ? 'B' : 'A'}`
    await expect(combineGuardianShares([tampered, shares[1]!])).rejects.toThrow('checksum')
  })

  it('formats a trustee card without a delivery key or content claim', async () => {
    const [share] = await splitGuardianCapability(generateGuardianCapability(), 'pasteId123', 2, 2)
    const card = guardianCardText(1, 2, share!)
    expect(card).toContain('cannot decrypt the note')
    expect(card).toContain(share!)
    expect(guardianShareProtocol()).toBe('LNGW1')
  })
})
