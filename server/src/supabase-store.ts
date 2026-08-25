import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  ConsumeOutcome,
  CreatePasteInput,
  DraftRecord,
  EncryptedReply,
  GuardianPolicy,
  PasteRecord,
  PasteStatus,
  ReceiptInfo,
} from './types.js'
import type { DraftStore, PasteStore, StoreHealth } from './store.js'
import { computeStatus, isDead } from './store.js'
import { randomToken, safeEqual, sha256Base64url } from './util.js'
import { toReceipt } from './helpers.js'

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
  receipt_proof_hash: string | null
  receipt_acknowledged_at: number | null
  guardian_verifier: string | null
  guardian_threshold: number | null
  guardian_total: number | null
  allow_replies: boolean
  reply_verifier: string | null
  file_lease_hash: string | null
  file_lease_expires_at: number | null
  burned: boolean
}

function toRow(input: CreatePasteInput): Omit<PasteRow, 'view_count' | 'first_viewed_at' | 'last_viewed_at' | 'receipt_acknowledged_at' | 'burned'> {
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
    receipt_proof_hash: input.receiptProofHash,
    guardian_verifier: input.guardianVerifier,
    guardian_threshold: input.guardianPolicy?.threshold ?? null,
    guardian_total: input.guardianPolicy?.total ?? null,
    allow_replies: input.allowReplies,
    reply_verifier: input.replyVerifier,
    file_lease_hash: null,
    file_lease_expires_at: null,
  }
}

function guardianPolicyFromRow(row: PasteRow): GuardianPolicy | null {
  if (!row.guardian_verifier || !row.guardian_threshold || !row.guardian_total) return null
  return { threshold: row.guardian_threshold, total: row.guardian_total }
}

interface ReplyRow {
  id: string
  ciphertext: string
  iv: string
  created_at: number
}

function replyFromRow(row: ReplyRow): EncryptedReply {
  return { id: row.id, ciphertext: row.ciphertext, iv: row.iv, createdAt: row.created_at }
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
    receiptProofHash: row.receipt_proof_hash,
    receiptAcknowledgedAt: row.receipt_acknowledged_at,
    guardianVerifier: row.guardian_verifier,
    guardianPolicy: guardianPolicyFromRow(row),
    allowReplies: row.allow_replies,
    replyVerifier: row.reply_verifier,
    burned: row.burned,
  }
}

/** Production persistence backed by Supabase Postgres. Service-role access stays server-only. */
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
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) }
    }
  }

  now(): number {
    return Date.now()
  }

  async create(input: CreatePasteInput): Promise<PasteRecord> {
    const { data, error } = await this.client.from('pastes').insert(toRow(input)).select('*').single()
    if (error) throw new Error(`supabase create failed: ${error.message}`)
    return fromRow(data as PasteRow)
  }

  async get(id: string): Promise<PasteRecord | null> {
    const { data, error } = await this.client.from('pastes').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(`supabase get failed: ${error.message}`)
    return data ? fromRow(data as PasteRow) : null
  }

  async consume(id: string, previewToken?: string | null): Promise<ConsumeOutcome> {
    const record = await this.get(id)
    if (!record) return { ok: false, status: 'gone' }
    const status = computeStatus(record, Date.now())
    if (status !== 'alive') return { ok: false, status }

    if (previewToken && safeEqual(previewToken, record.ownerToken)) {
      return { ok: true, record, preview: true, status: 'alive', fileLease: null }
    }

    if (!record.burnAfterRead) return { ok: true, record, preview: false, status: 'alive', fileLease: null }

    // A burn-after-read file must not be marked burned before the recipient has
    // a redeemable lease. Persist burn + hash-only lease in one conditional row
    // update; if it loses the race, no lease is leaked and the record remains
    // unavailable to the loser.
    const fileLease = record.storagePath
      ? { token: randomToken(24), expiresAt: Date.now() + 60_000 }
      : null
    const patch = {
      burned: true,
      ...(fileLease
        ? { file_lease_hash: sha256Base64url(fileLease.token), file_lease_expires_at: fileLease.expiresAt }
        : {}),
    }
    const { data, error } = await this.client
      .from('pastes')
      .update(patch)
      .eq('id', id)
      .eq('burned', false)
      .select('*')
      .maybeSingle()
    if (error) throw new Error(`supabase consume failed: ${error.message}`)
    if (!data) return { ok: false, status: 'burned' }
    return { ok: true, record: fromRow(data as PasteRow), preview: false, status: 'alive', fileLease }
  }

  async issueFileLease(id: string): Promise<{ token: string; expiresAt: number } | null> {
    const record = await this.get(id)
    if (!record?.storagePath) return null
    const token = randomToken(24)
    const expiresAt = Date.now() + 60_000
    const { data, error } = await this.client
      .from('pastes')
      .update({ file_lease_hash: sha256Base64url(token), file_lease_expires_at: expiresAt })
      .eq('id', id)
      .eq('storage_path', record.storagePath)
      .select('id')
      .maybeSingle()
    if (error) throw new Error(`supabase file lease issue failed: ${error.message}`)
    if (!data) return null
    return { token, expiresAt }
  }

  async redeemFileLease(id: string, token: string): Promise<string | null> {
    const nowMs = Date.now()
    const { data, error } = await this.client
      .from('pastes')
      .update({ file_lease_hash: null, file_lease_expires_at: null })
      .eq('id', id)
      .eq('file_lease_hash', sha256Base64url(token))
      .gte('file_lease_expires_at', nowMs)
      .select('storage_path')
      .maybeSingle()
    if (error) throw new Error(`supabase file lease redemption failed: ${error.message}`)
    return (data as { storage_path: string | null } | null)?.storage_path ?? null
  }

  /**
   * Acknowledgement is deliberately idempotent: the first browser holding the
   * decrypted proof wins; a replay, guessed proof, or second acknowledgement
   * cannot alter the receipt or dead-switch activity.
   */
  async acknowledge(id: string, proof: string): Promise<{ acknowledgedAt: number } | null> {
    const nowMs = Date.now()
    const verifier = sha256Base64url(proof)
    const { data, error } = await this.client
      .from('pastes')
      .update({
        view_count: 1,
        first_viewed_at: nowMs,
        last_viewed_at: nowMs,
        receipt_acknowledged_at: nowMs,
      })
      .eq('id', id)
      .eq('receipt_proof_hash', verifier)
      .is('receipt_acknowledged_at', null)
      .select('receipt_acknowledged_at')
      .maybeSingle()
    if (error) throw new Error(`supabase acknowledgement failed: ${error.message}`)
    if (!data) return null
    return { acknowledgedAt: (data as { receipt_acknowledged_at: number }).receipt_acknowledged_at }
  }

  async addReply(id: string, capability: string, reply: Omit<EncryptedReply, 'createdAt'>): Promise<EncryptedReply | null> {
    const { data, error } = await this.client
      .rpc('locknote_add_encrypted_reply', {
        p_paste_id: id,
        p_reply_verifier: sha256Base64url(capability),
        p_reply_id: reply.id,
        p_ciphertext: reply.ciphertext,
        p_iv: reply.iv,
      })
      .maybeSingle()
    if (error) throw new Error(`supabase encrypted reply failed: ${error.message}`)
    return data ? replyFromRow(data as ReplyRow) : null
  }

  async replies(id: string, ownerToken: string): Promise<EncryptedReply[] | null> {
    const record = await this.get(id)
    if (!record || computeStatus(record, Date.now()) !== 'alive' || !safeEqual(ownerToken, record.ownerToken)) return null
    const { data, error } = await this.client.from('paste_replies').select('id,ciphertext,iv,created_at').eq('paste_id', id).order('created_at', { ascending: true })
    if (error) throw new Error(`supabase encrypted replies failed: ${error.message}`)
    return (data ?? []).map((row) => replyFromRow(row as ReplyRow))
  }

  async destroy(id: string, ownerToken: string): Promise<boolean> {
    const record = await this.get(id)
    if (!record || !safeEqual(ownerToken, record.ownerToken)) return false
    const { data, error } = await this.client.from('pastes').delete().eq('id', id).eq('owner_token', ownerToken).select('id').maybeSingle()
    if (error) throw new Error(`supabase destroy failed: ${error.message}`)
    return Boolean(data)
  }

  async guardianDestroy(id: string, capability: string): Promise<boolean> {
    const verifier = sha256Base64url(capability)
    const { data, error } = await this.client
      .from('pastes')
      .delete()
      .eq('id', id)
      .eq('guardian_verifier', verifier)
      .select('id')
      .maybeSingle()
    if (error) throw new Error(`supabase guardian destroy failed: ${error.message}`)
    return Boolean(data)
  }

  async receipt(id: string, ownerToken: string): Promise<ReceiptInfo | null> {
    const record = await this.get(id)
    if (!record || !safeEqual(ownerToken, record.ownerToken)) return null
    return toReceipt(record, Date.now())
  }

  async status(id: string): Promise<PasteStatus> {
    return computeStatus(await this.get(id), Date.now())
  }

  async purgeExpired(): Promise<number> {
    const nowMs = Date.now()
    const { data: expired, error: expErr } = await this.client.from('pastes').select('id').not('expires_at', 'is', null).lte('expires_at', nowMs)
    if (expErr) throw new Error(`supabase purge select (expired) failed: ${expErr.message}`)

    const { data: switchers, error: switchErr } = await this.client
      .from('pastes')
      .select('id,dead_switch_days,last_viewed_at,created_at')
      .not('dead_switch_days', 'is', null)
    if (switchErr) throw new Error(`supabase purge select (dead) failed: ${switchErr.message}`)

    const ids = new Set<string>((expired ?? []).map((row) => (row as { id: string }).id))
    for (const row of (switchers ?? []) as Array<{ id: string; dead_switch_days: number; last_viewed_at: number | null; created_at: number }>) {
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

/** Ephemeral draft rooms backed by Supabase through server-only service-role access. */
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
    const draft = await this.getDraft(roomId)
    if (!draft || !safeEqual(ownerToken, draft.ownerToken)) return false
    const { error } = await this.client.from('drafts').delete().eq('room_id', roomId)
    if (error) throw new Error(`supabase draft seal failed: ${error.message}`)
    return true
  }

  async purgeOldDrafts(maxAgeMs: number): Promise<number> {
    const cutoff = Date.now() - maxAgeMs
    const { data, error } = await this.client.from('drafts').select('room_id').lt('updated_at', cutoff)
    if (error) throw new Error(`supabase draft purge select failed: ${error.message}`)
    const ids = (data ?? []).map((draft) => (draft as { room_id: string }).room_id)
    if (ids.length === 0) return 0
    const { error: deleteError } = await this.client.from('drafts').delete().in('room_id', ids)
    if (deleteError) throw new Error(`supabase draft purge delete failed: ${deleteError.message}`)
    return ids.length
  }
}
