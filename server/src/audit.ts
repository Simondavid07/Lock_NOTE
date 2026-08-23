import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AuditEvent, AuditEventName, AuditSink } from './types.js'
import { randomId } from './util.js'

/** In-memory audit log used by tests and inspection. */
export class MemoryAuditSink implements AuditSink {
  readonly events: AuditEvent[] = []
  async record(pasteId: string, event: AuditEventName): Promise<void> {
    this.events.push({ id: randomId(), pasteId, event, at: Date.now() })
  }
}

/** Quiet sink for production when no audit table is desired. */
export class NoopAuditSink implements AuditSink {
  async record(): Promise<void> {}
}

/** Logs audit events to stdout (used by the offline/memory backend). */
export class ConsoleAuditSink implements AuditSink {
  async record(pasteId: string, event: AuditEventName): Promise<void> {
    console.log(`[audit] ${event} ${pasteId}`)
  }
}

/** Writes audit events to the `events` table (ids only — never content). */
export class SupabaseAuditSink implements AuditSink {
  private client: SupabaseClient
  constructor(url: string, serviceKey: string) {
    this.client = createClient(url, serviceKey, { auth: { persistSession: false } })
  }
  async record(pasteId: string, event: AuditEventName): Promise<void> {
    try {
      await this.client.from('events').insert({ id: randomId(), paste_id: pasteId, event, created_at: Date.now() })
    } catch {
      // Auditing must never take the service down.
    }
  }
}