import { describe, expect, it } from 'vitest'
import { isSupabaseProjectUrl } from './config.js'

describe('isSupabaseProjectUrl', () => {
  it('accepts a canonical Supabase project API origin', () => {
    expect(isSupabaseProjectUrl('https://abc123.supabase.co')).toBe(true)
  })

  it('rejects the Supabase Studio dashboard URL that caused the production outage', () => {
    expect(isSupabaseProjectUrl('https://supabase.com/dashboard/project/abc123')).toBe(false)
  })

  it('rejects non-HTTPS URLs and URLs with a non-root path', () => {
    expect(isSupabaseProjectUrl('http://abc123.supabase.co')).toBe(false)
    expect(isSupabaseProjectUrl('https://abc123.supabase.co/rest/v1')).toBe(false)
  })
})
