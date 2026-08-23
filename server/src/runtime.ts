import { env, getSupabaseConfigurationError, isSupabaseConfigured } from './config.js'
import { MemoryFileStore, SupabaseFileStore } from './blob-store.js'
import { createMemoryBackend } from './memory-store.js'
import { ConsoleAuditSink, SupabaseAuditSink } from './audit.js'
import { SupabaseDraftStore, SupabaseStore } from './supabase-store.js'
import { createApp } from './app.js'
import type { AuditSink } from './types.js'
import type { DraftStore, PasteStore } from './store.js'
import type { FileBlobStore } from './blob-store.js'

export interface LocknoteRuntime {
  app: ReturnType<typeof createApp>
  backend: {
    store: PasteStore
    drafts: DraftStore
    files: FileBlobStore
    audit: AuditSink
  }
  persistence: 'supabase' | 'memory'
}

/**
 * Builds the application with the correct persistence layer for its runtime.
 * Production and Vercel functions must use Supabase so user data is never kept
 * in ephemeral function memory.
 */
export function createLocknoteRuntime(options: { requireSupabase?: boolean } = {}): LocknoteRuntime {
  const supabaseReady = isSupabaseConfigured()
  const productionLike = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
  const configError = getSupabaseConfigurationError()

  if (!supabaseReady && (productionLike || options.requireSupabase)) {
    throw new Error(`Locknote persistence is unavailable: ${configError ?? 'Supabase is not configured.'}`)
  }

  if (!supabaseReady) {
    console.warn(
      `[Locknote] ${configError ?? 'Supabase credentials not found.'} Falling back to in-memory storage for local development only.`,
    )
  }

  if (supabaseReady) {
    const backend = {
      store: new SupabaseStore(env.supabaseUrl, env.supabaseServiceKey),
      drafts: new SupabaseDraftStore(env.supabaseUrl, env.supabaseServiceKey),
      files: new SupabaseFileStore(env.supabaseUrl, env.supabaseServiceKey),
      audit: new SupabaseAuditSink(env.supabaseUrl, env.supabaseServiceKey),
    }

    return {
      app: createApp({ ...backend, corsOrigins: env.corsOrigins }),
      backend,
      persistence: 'supabase',
    }
  }

  const memory = createMemoryBackend()
  const backend = {
    store: memory.pastes,
    drafts: memory.drafts,
    files: new MemoryFileStore(),
    audit: new ConsoleAuditSink(),
  }

  return {
    app: createApp({ ...backend, corsOrigins: env.corsOrigins }),
    backend,
    persistence: 'memory',
  }
}
