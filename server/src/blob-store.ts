import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Storage of encrypted file blobs. Blobs are opaque ciphertext — the store
 * must never inspect their contents. Objects are stored flat as `blobs/{id}`.
 */
export interface FileBlobStore {
  kind: 'memory' | 'supabase'
  /** Upload raw ciphertext bytes, keyed by paste id. Returns the object path. */
  upload(id: string, bytes: Uint8Array): Promise<string>
  read(path: string): Promise<Uint8Array | null>
  delete(path: string): Promise<boolean>
  /** List all stored object paths (used by the orphan janitor). */
  list(): Promise<string[]>
}

export const BUCKET = 'secrets'

const pathFor = (id: string): string => `blobs/${id}`

export class MemoryFileStore implements FileBlobStore {
  readonly kind = 'memory' as const
  private blobs = new Map<string, Uint8Array>()

  async upload(id: string, bytes: Uint8Array): Promise<string> {
    const path = pathFor(id)
    this.blobs.set(path, bytes)
    return path
  }

  async read(path: string): Promise<Uint8Array | null> {
    return this.blobs.get(path) ?? null
  }

  async delete(path: string): Promise<boolean> {
    return this.blobs.delete(path)
  }

  async list(): Promise<string[]> {
    return [...this.blobs.keys()]
  }
}

export class SupabaseFileStore implements FileBlobStore {
  readonly kind = 'supabase' as const
  private client: SupabaseClient

  constructor(url: string, serviceKey: string) {
    this.client = createClient(url, serviceKey, { auth: { persistSession: false } })
  }

  async upload(id: string, bytes: Uint8Array): Promise<string> {
    const path = pathFor(id)
    const { error } = await this.client.storage.from(BUCKET).upload(path, bytes, {
      contentType: 'application/octet-stream',
      upsert: true,
    })
    if (error) throw new Error(`storage upload failed: ${error.message}`)
    return path
  }

  async read(path: string): Promise<Uint8Array | null> {
    const { data, error } = await this.client.storage.from(BUCKET).download(path)
    if (error) return null
    const buf = await data.arrayBuffer()
    return new Uint8Array(buf)
  }

  async delete(path: string): Promise<boolean> {
    const { error } = await this.client.storage.from(BUCKET).remove([path])
    if (error) return false
    return true
  }

  async list(): Promise<string[]> {
    const names: string[] = []
    let offset = 0
    for (;;) {
      const { data, error } = await this.client.storage.from(BUCKET).list('blobs', {
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) break
      if (!data || data.length === 0) break
      names.push(...data.map((o) => pathFor(o.name)))
      offset += data.length
      if (data.length < 1000) break
    }
    return names
  }
}