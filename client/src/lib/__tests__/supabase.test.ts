import { describe, expect, it } from 'vitest'
import { profileStorageUsername } from '../supabase'

describe('profileStorageUsername', () => {
  const userId = '12345678-1234-1234-1234-123456789abc'

  it('normalizes a mixed-case GitHub username for the constrained private profile row', () => {
    expect(profileStorageUsername('Simondavid07', userId)).toBe('simondavid07')
  })

  it('normalizes provider metadata to the permitted lowercase label grammar', () => {
    expect(profileStorageUsername('  Alice Example!  ', userId)).toBe('alice-example')
  })

  it('uses a stable private fallback when provider metadata cannot form a valid label', () => {
    expect(profileStorageUsername('---', userId)).toBe('user-123456781234')
  })
})
