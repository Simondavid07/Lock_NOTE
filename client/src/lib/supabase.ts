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

export interface AccountProfile extends AuthenticatedUser {
  bio: string
}

export interface VaultContact {
  id: string
  username: string
  createdAt: string
}

interface ProfileRow {
  id: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  bio: string | null
}

interface ContactRow {
  id: string
  username: string
  created_at: string
}

/**
 * Only maps identity values that the signed-in Supabase provider already
 * returned. Browser-local storage is a presentation cache, never an identity
 * authority.
 */
export function toAuthenticatedUser(user: User): AuthenticatedUser {
  const metadata = user.user_metadata ?? {}
  const appMetadata = user.app_metadata ?? {}
  const username = metadata.user_name || metadata.preferred_username || user.email?.split('@')[0] || 'locknote-user'
  const name = metadata.full_name || metadata.name || username
  const avatarUrl = metadata.avatar_url || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`

  return {
    username,
    name,
    avatarUrl,
    email: user.email || '',
    provider: appMetadata.provider === 'github' || metadata.user_name ? 'github' : 'email',
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

function requireAuthenticatedClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(configurationError ?? 'Supabase is not configured for authenticated account data.')
  }
  return supabase
}

function profileFromRow(user: User, row: ProfileRow | null): AccountProfile {
  const provider = toAuthenticatedUser(user)
  return {
    ...provider,
    name: row?.display_name?.trim() || provider.name,
    username: row?.username?.trim() || provider.username,
    avatarUrl: row?.avatar_url?.trim() || provider.avatarUrl,
    bio: row?.bio ?? '',
  }
}

/**
 * Creates an account metadata row on first use and returns only signed-in
 * user's opt-in display data. It never stores notes, share URLs, key material,
 * passphrases, or owner capabilities.
 */
export async function loadAccountProfile(user: User): Promise<AccountProfile> {
  const client = requireAuthenticatedClient()
  const provider = toAuthenticatedUser(user)
  const initialRow = {
    id: user.id,
    display_name: provider.name,
    username: provider.username,
    avatar_url: provider.avatarUrl,
    bio: '',
  }

  const { error: seedError } = await client
    .from('profiles')
    .upsert(initialRow, { onConflict: 'id', ignoreDuplicates: true })
  if (seedError) throw new Error('Your encrypted account profile could not be initialized.')

  const { data, error } = await client
    .from('profiles')
    .select('id, display_name, username, avatar_url, bio')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw new Error('Your account profile could not be loaded.')
  return profileFromRow(user, data as ProfileRow | null)
}

export async function saveAccountBio(userId: string, bio: string): Promise<void> {
  const client = requireAuthenticatedClient()
  const trimmedBio = bio.trim()
  if (trimmedBio.length > 160) throw new Error('Profile bios can contain at most 160 characters.')

  const { error } = await client
    .from('profiles')
    .update({ bio: trimmedBio })
    .eq('id', userId)
  if (error) throw new Error('Your profile bio could not be saved.')
}

export async function listVaultContacts(): Promise<VaultContact[]> {
  const client = requireAuthenticatedClient()
  const { data, error } = await client
    .from('vault_contacts')
    .select('id, username, created_at')
    .order('created_at', { ascending: true })
  if (error) throw new Error('Your vault contacts could not be loaded.')
  return ((data ?? []) as ContactRow[]).map((row) => ({
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
  }))
}

function normaliseContactUsername(value: string): string {
  const username = value.trim().replace(/^@/, '').toLowerCase()
  if (!/^[a-z\d](?:[a-z\d-]{0,37})$/i.test(username)) {
    throw new Error('Enter a valid GitHub username (letters, numbers, or hyphens).')
  }
  return username
}

export async function addVaultContact(usernameInput: string): Promise<VaultContact> {
  const client = requireAuthenticatedClient()
  const username = normaliseContactUsername(usernameInput)
  const { data, error } = await client
    .from('vault_contacts')
    .insert({ username })
    .select('id, username, created_at')
    .single()
  if (error?.code === '23505') throw new Error('That contact is already in your list.')
  if (error) throw new Error('Your vault contact could not be saved.')
  const row = data as ContactRow
  return { id: row.id, username: row.username, createdAt: row.created_at }
}

export async function removeVaultContact(id: string): Promise<void> {
  const client = requireAuthenticatedClient()
  const { error } = await client.from('vault_contacts').delete().eq('id', id)
  if (error) throw new Error('Your vault contact could not be removed.')
}

export function isSupabaseRealtimeAvailable(): boolean {
  return supabase !== null
}


function safeLocalPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  return value
}

export function takeAuthReturnPath(): string {
  const value = sessionStorage.getItem('locknote:auth:return-to')
  sessionStorage.removeItem('locknote:auth:return-to')
  return safeLocalPath(value)
}

export async function signInWithGithub(returnTo = '/dashboard') {
  if (!supabase) {
    throw new Error(configurationError ?? 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before enabling GitHub sign-in.')
  }

  sessionStorage.setItem('locknote:auth:return-to', safeLocalPath(returnTo))

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

/**
 * Tracked paste capabilities intentionally remain browser-local. They contain
 * owner tokens and share URLs, so storing them in account profiles would break
 * Lock Note's zero-knowledge capability model.
 */
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
