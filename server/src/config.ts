import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dotenv from 'dotenv'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
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

export function isSupabaseConfigured(): boolean {
  return Boolean(
    env.supabaseUrl &&
      env.supabaseServiceKey &&
      env.supabaseUrl.startsWith('http') &&
      !env.supabaseUrl.includes('xxxx.supabase.co'),
  )
}