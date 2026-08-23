import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  ConsumeOutcome,
  CreatePasteInput,
  DraftRecord,
  PasteRecord,
  PasteStatus,
  ReceiptInfo,
} from './types.js'
import type { DraftStore, PasteStore, StoreHealth } from './store.js'
import { computeStatus, isDead, lastActiveMs } from './store.js'
import { safeEqual } from './util.js'
import { toMetadata, toReceipt } from './helpers.js'

interface PasteRow {
  id: string
  ciphertext: string
  salt: string
  iv: string
  iterations: number
  kdf: 'hkdf' | 'pbkdf2'
  alg: string
  format: string
  language: string | null
  burn_after_read: boolean
  dead_switch_days: number | null
  storage_path: string | null
  file_meta: { size: number; iv: string } | null
  created_at: number
  expires_at: number | null
  view_count: number
  first_viewed_at: number | null
  last_viewed_at: number | null
  owner_token: string
  burned: boolean
}

function toRow(input: CreatePasteInput): Omit<PasteRow, 'view_count' | 'first_viewed_at' | 'last_viewed_at' | 'burned'> {
  return {
    id: input.id,
    ciphertext: input.ciphertext,
    salt: input.salt,
    iv: input.iv,
    iterations: input.iterations,
    kdf: input.kdf,
    alg: input.alg,
    format: input.format,
    language: input.language,
    burn_after_read: input.burnAfterRead,
    dead_switch_days: input.deadSwitchDays,
    storage_path: input.storagePath,
    file_meta: input.fileMeta,
    created_at: Date.now(),
    expires_at: input.expiresAt,
    owner_token: input.ownerToken,
  }
}

function fromRow(row: PasteRow): PasteRecord {
  return {
    id: row.id,
    ciphertext: row.ciphertext,
    salt: row.salt,
    iv: row.iv,
    iterations: row.iterations,
    kdf: row.kdf,
    alg: row.alg,
    format: row.format as PasteRecord['format'],
    language: row.language,
    burnAfterRead: row.burn_after_read,
    deadSwitchDays: row.dead_switch_days,
    storagePath: row.storage_path,
    fileMeta: row.file_meta,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    viewCount: row.view_count,
    firstViewedAt: row.first_viewed_at,
    lastViewedAt: row.last_viewed_at,
    ownerToken: row.owner_token,
    burned: row.burned,
  }
}

/**
 * Production persistence backed by Supabase Postgres.
 * The server uses the service_role key — never exposed to browsers.
 */
export class SupabaseStore implements PasteStore {
  readonly kind = 'supabase' as const
  private client: SupabaseClient

  constructor(url: string, serviceKey: string) {
    this.client = createClient(url, serviceKey, { auth: { persistSession: false } })
  }

  async health(): Promise<StoreHealth> {
    try {
      const { error } = await this.client.from('pastes').select('id').limit(1)
      if (error) return { ok: false, detail: error.message }
      return { ok: true, detail: 'supabase reachable' }
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) }
    }
  }

  now(): number {
    return Date.now()
  }

  async create(input: CreatePasteInput): Promise<PasteRecord> {
    const { data, error } = await this.client
      .from('pastes')
      .insert(toRow(input))
      .select('*')
      .single()
    if (error) throw new Error(`supabase create failed: ${error.message}`)
    const record = fromRow(data as PasteRow)
    return record
  }

  async get(id: string): Promise<PasteRecord | null> {
    const { data, error } = await this.client.from('pastes').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(`supabase get failed: ${error.message}`)
    return data ? fromRow(data as PasteRow) : null
  }

  async consume(id: string, previewToken?: string | null): Promise<ConsumeOutcome> {
    const row = await this.get(id)
    if (!row) return { ok: false, status: 'gone' }

    const nowMs = Date.now()
    const status = computeStatus(row, nowMs)
    if (status !== 'alive') return { ok: false, status }

    const next = (record: PasteRecord): PasteRecord => {
      record.viewCount += 1
      record.firstViewedAt = record.firstViewedAt ?? nowMs
      record.lastViewedAt = nowMs
      return record
    }
    const patch = {
      view_count: row.viewCount + 1,
      first_viewed_at: row.firstViewedAt ?? nowMs,
      last_viewed_at: nowMs,
    }

    if (previewToken && safeEqual(previewToken, row.ownerToken)) {
      const { error } = await this.client.from('pastes').update(patch).eq('id', id)
      if (error) throw new Error(`supabase preview failed: ${error.message}`)
      return { ok: true, record: next(row), preview: true, status: 'alive' }
    }

    if (row.burnAfterRead) {
      // Atomic exactly-once burn: only one concurrent consumer can win.
      const { data, error } = await this.client
        .from('pastes')
        .update({ ...patch, burned: true })
        .eq('id', id)
        .eq('burned', false)
        .select('*')
        .maybeSingle()
      if (error) throw new Error(`supabase consume failed: ${error.message}`)
      if (!data) return { ok: false, status: 'burned' }
      row.burned = true
      return { ok: true, record: next(row), preview: false, status: 'alive' }
    }

    const { error } = await this.client.from('pastes').update(patch).eq('id', id)
    if (error) throw new Error(`supabase consume failed: ${error.message}`)
    return { ok: true, record: next(row), preview: false, status: 'alive' }
  }

  async viewed(id: string): Promise<{ viewCount: number } | null> {
    const row = await this.get(id)
    if (!row) return null
    if (computeStatus(row, Date.now()) !== 'alive') return null
    const { data, error } = await this.client
      .from('pastes')
      .update({ view_count: row.viewCount + 1, first_viewed_at: row.firstViewedAt ?? Date.now(), last_viewed_at: Date.now() })
      .eq('id', id)
      .select('view_count')
      .single()
    if (error) throw new Error(`supabase viewed failed: ${error.message}`)
    return { viewCount: (data as { view_count: number }).view_count }
  }

  async destroy(id: string, ownerToken: string): Promise<boolean> {
    const row = await this.get(id)
    if (!row) return false
    if (!safeEqual(ownerToken, row.ownerToken)) return false
    const { error } = await this.client.from('pastes').delete().eq('id', id).eq('owner_token', ownerToken)
    if (error) throw new Error(`supabase destroy failed: ${error.message}`)
    return true
  }

  async receipt(id: string, ownerToken: string): Promise<ReceiptInfo | null> {
    const row = await this.get(id)
    if (!row) return null
    if (!safeEqual(ownerToken, row.ownerToken)) return null
    return toReceipt(row, Date.now())
  }

  async status(id: string): Promise<PasteStatus> {
    return computeStatus(await this.get(id), Date.now())
  }

  async purgeExpired(): Promise<number> {
    const nowMs = Date.now()

    // 1. Time-based expiry (simple range filters).
    const { data: expired, error: expErr } = await this.client
      .from('pastes')
      .select('id')
      .not('expires_at', 'is', null)
      .lte('expires_at', nowMs)
    if (expErr) throw new Error(`supabase purge select (expired) failed: ${expErr.message}`)

    // 2. Dead-switch: compute per-row cutoffs in JS (PostgREST cannot
    //    express `coalesce(last_viewed_at, created_at) + days * 86400000`).
    const { data: switchers, error: swErr } = await this.client
      .from('pastes')
      .select('id,dead_switch_days,last_viewed_at,created_at')
      .not('dead_switch_days', 'is', null)
    if (swErr) throw new Error(`supabase purge select (dead) failed: ${swErr.message}`)

    const ids = new Set<string>((expired ?? []).map((r) => (r as { id: string }).id))
    for (const row of (switchers ?? []) as Array<{
      id: string
      dead_switch_days: number
      last_viewed_at: number | null
      created_at: number
    }>) {
      const lastActive = row.last_viewed_at ?? row.created_at
      if (nowMs - lastActive > row.dead_switch_days * 86_400_000) ids.add(row.id)
    }

    if (ids.size === 0) return 0
    const { error } = await this.client.from('pastes').delete().in('id', [...ids])
    if (error) throw new Error(`supabase purge delete failed: ${error.message}`)
    return ids.size
  }
}

interface DraftRow {
  room_id: string
  content: string
  created_at: number
  updated_at: number
  owner_token: string
}

function draftFromRow(row: DraftRow): DraftRecord {
  return {
    roomId: row.room_id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ownerToken: row.owner_token,
  }
}

/** Ephemeral draft rooms backed by Supabase (RLS allows anon reads/writes). */
export class SupabaseDraftStore implements DraftStore {
  readonly kind = 'supabase' as const
  private client: SupabaseClient

  constructor(url: string, serviceKey: string) {
    this.client = createClient(url, serviceKey, { auth: { persistSession: false } })
  }

  async createDraft(roomId: string, ownerToken: string, content = ''): Promise<DraftRecord> {
    const nowMs = Date.now()
    const { data, error } = await this.client
      .from('drafts')
      .insert({ room_id: roomId, content, created_at: nowMs, updated_at: nowMs, owner_token: ownerToken })
      .select('*')
      .single()
    if (error) throw new Error(`supabase draft create failed: ${error.message}`)
    return draftFromRow(data as DraftRow)
  }

  async getDraft(roomId: string): Promise<DraftRecord | null> {
    const { data, error } = await this.client.from('drafts').select('*').eq('room_id', roomId).maybeSingle()
    if (error) throw new Error(`supabase draft get failed: ${error.message}`)
    return data ? draftFromRow(data as DraftRow) : null
  }

  async touchDraft(roomId: string, content: string): Promise<DraftRecord | null> {
    const { data, error } = await this.client
      .from('drafts')
      .update({ content, updated_at: Date.now() })
      .eq('room_id', roomId)
      .select('*')
      .maybeSingle()
    if (error) throw new Error(`supabase draft touch failed: ${error.message}`)
    return data ? draftFromRow(data as DraftRow) : null
  }

  async sealDraft(roomId: string, ownerToken: string): Promise<boolean> {
    const d = await this.getDraft(roomId)
    if (!d) return false
    if (!safeEqual(ownerToken, d.ownerToken)) return false
    const { error } = await this.client.from('drafts').delete().eq('room_id', roomId)
    if (error) throw new Error(`supabase draft seal failed: ${error.message}`)
    return true
  }

  async purgeOldDrafts(maxAgeMs: number): Promise<number> {
    const cutoff = Date.now() - maxAgeMs
    const { data, error } = await this.client.from('drafts').select('room_id').lt('updated_at', cutoff)
    if (error) throw new Error(`supabase draft purge select failed: ${error.message}`)
    const ids = (data ?? []).map((d) => (d as { room_id: string }).room_id)
    if (ids.length === 0) return 0
    const { error: delErr } = await this.client.from('drafts').delete().in('room_id', ids)
    if (delErr) throw new Error(`supabase draft purge delete failed: ${delErr.message}`)
    return ids.length
  }
}