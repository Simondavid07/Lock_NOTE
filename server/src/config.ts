import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dotenv from 'dotenv'

let rootDir = process.cwd()
try {
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  }
} catch {
  rootDir = process.cwd()
}
dotenv.config({ path: path.join(rootDir, '.env') })

export const env = {
  port: Number(process.env.PORT ?? 3001),
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
} as const

/**
 * Locknote talks to a Supabase project API origin, never the Supabase Studio
 * dashboard. Keeping this check explicit prevents a dashboard URL from making
 * a deployment look configured while every storage request actually fails.
 */
export function isSupabaseProjectUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      /^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname) &&
      (url.pathname === '' || url.pathname === '/') &&
      !url.search &&
      !url.hash
    )
  } catch {
    return false
  }
}

export function getSupabaseConfigurationError(): string | null {
  if (!env.supabaseUrl) return 'SUPABASE_URL is not set.'
  if (!isSupabaseProjectUrl(env.supabaseUrl)) {
    return 'SUPABASE_URL must be the project API origin, for example https://your-project-ref.supabase.co. Do not use a Supabase dashboard URL.'
  }
  if (!env.supabaseServiceKey) return 'SUPABASE_SERVICE_ROLE_KEY is not set.'
  return null
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigurationError() === null
}
