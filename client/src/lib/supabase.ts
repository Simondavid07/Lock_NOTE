import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function isSupabaseProjectUrl(value: string | undefined): value is string {
  if (!value) return false

  try {
    const parsed = new URL(value)
    return (
      parsed.protocol === 'https:' &&
      /^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname) &&
      (parsed.pathname === '' || parsed.pathname === '/') &&
      !parsed.search &&
      !parsed.hash
    )
  } catch {
    return false
  }
}

export function getSupabaseConfigurationError(): string | null {
  if (!url && !anonKey) return null
  if (!isSupabaseProjectUrl(url)) {
    return 'Supabase is configured with an invalid URL. Use the project API URL (https://your-project-ref.supabase.co), not a Supabase dashboard URL.'
  }
  if (!anonKey) return 'Supabase is missing its browser anon key.'
  return null
}

const configurationError = getSupabaseConfigurationError()

export const supabase: SupabaseClient | null =
  url && anonKey && !configurationError
    ? createClient(url, anonKey, {
        auth: {
          flowType: 'pkce',
          detectSessionInUrl: false,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null

export interface AuthenticatedUser {
  username: string
  name: string
  avatarUrl: string
  email: string
  provider: 'github' | 'email'
}

function toAuthenticatedUser(user: User): AuthenticatedUser {
  const metadata = user.user_metadata ?? {}
  const username = metadata.user_name || metadata.preferred_username || user.email?.split('@')[0] || 'locknote-user'
  const name = metadata.full_name || metadata.name || username
  const avatarUrl = metadata.avatar_url || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`

  return {
    username,
    name,
    avatarUrl,
    email: user.email || '',
    provider: metadata.provider === 'github' || metadata.user_name ? 'github' : 'email',
  }
}

export function cacheAuthenticatedUser(user: User | null): AuthenticatedUser | null {
  if (!user) {
    localStorage.removeItem('locknote:auth_user')
    return null
  }

  const profile = toAuthenticatedUser(user)
  localStorage.setItem('locknote:auth_user', JSON.stringify(profile))
  return profile
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return cacheAuthenticatedUser(data.user)
}

export function isSupabaseRealtimeAvailable(): boolean {
  return supabase !== null
}

export function storageObjectUrl(storagePath: string): string {
  if (!url || configurationError) throw new Error(configurationError ?? 'Supabase Storage is not configured.')
  return `${url}/storage/v1/object/public/secrets/${storagePath}`
}

export async function signInWithGithub() {
  if (!supabase) {
    throw new Error(configurationError ?? 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before enabling GitHub sign-in.')
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  })

  if (error) throw error
}

export async function signOut() {
  if (!supabase) {
    localStorage.removeItem('locknote:auth_user')
    return
  }
  const { error } = await supabase.auth.signOut()
  if (error) throw error
  cacheAuthenticatedUser(null)
}

export interface TrackedPaste {
  id: string
  title?: string
  format: string
  url: string
  ownerToken: string
  createdAt: number
  expiresAt: number | null
  burnAfterRead: boolean
  passphraseProtected: boolean
  viewCount?: number
  isBurned?: boolean
}

export function getTrackedPastes(): TrackedPaste[] {
  try {
    const raw = localStorage.getItem('locknote:user_pastes')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveTrackedPaste(paste: TrackedPaste) {
  try {
    const existing = getTrackedPastes()
    const updated = [paste, ...existing.filter((p) => p.id !== paste.id)]
    localStorage.setItem('locknote:user_pastes', JSON.stringify(updated))
  } catch (err) {
    console.error('Failed to save tracked paste:', err)
  }
}

export function removeTrackedPaste(id: string) {
  try {
    const existing = getTrackedPastes()
    const updated = existing.filter((p) => p.id !== id)
    localStorage.setItem('locknote:user_pastes', JSON.stringify(updated))
  } catch (err) {
    console.error('Failed to remove tracked paste:', err)
  }
}
