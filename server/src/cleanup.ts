import type { FileBlobStore } from './blob-store.js'
import type { DraftStore, PasteStore } from './store.js'

const DRAFT_MAX_AGE_MS = 86_400_000 // 24h
const BLOB_PREFIX = 'blobs/'

/**
 * Periodically purges expired/dead pastes, stale drafts and orphaned
 * encrypted blobs. Runs on startup and then on a timer (unref'd so the
 * process can still exit cleanly in tests).
 */
export interface JanitorResult {
  pastesPurged: number
  draftsPurged: number
  blobsPurged: number
}

/** Runs one idempotent cleanup pass; safe for scheduled serverless invocation. */
export async function runJanitor(
  deps: { store: PasteStore; drafts: DraftStore; files: FileBlobStore },
): Promise<JanitorResult> {
  // Delete records before scanning file objects; a fully parallel scan could
  // observe a record just before expiry deletion and delay ciphertext cleanup
  // until the next maintenance pass.
  const [pastesPurged, draftsPurged] = await Promise.all([
    deps.store.purgeExpired(),
    deps.drafts.purgeOldDrafts(DRAFT_MAX_AGE_MS),
  ])
  const blobsPurged = await purgeOrphanBlobs(deps.store, deps.files)

  if (pastesPurged > 0 || draftsPurged > 0 || blobsPurged > 0) {
    console.log(`[janitor] purged ${pastesPurged} pastes, ${draftsPurged} drafts, ${blobsPurged} blobs`)
  }

  return { pastesPurged, draftsPurged, blobsPurged }
}

export function startJanitor(
  deps: { store: PasteStore; drafts: DraftStore; files: FileBlobStore },
  intervalMs = 60_000,
): () => void {
  const run = async (): Promise<void> => {
    try {
      await runJanitor(deps)
    } catch (err) {
      console.error('[janitor] error:', err)
    }
  }

  void run()
  const timer = setInterval(run, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}

/** Delete blobs whose paste no longer exists. Blobs are ciphertext — safe. */
async function purgeOrphanBlobs(store: PasteStore, files: FileBlobStore): Promise<number> {
  if (files.kind === 'memory') return 0
  const paths = await files.list()
  let purged = 0
  for (const path of paths) {
    const id = path.startsWith(BLOB_PREFIX) ? path.slice(BLOB_PREFIX.length) : path
    const exists = await store.get(id)
    if (!exists) {
      const deleted = await files.delete(path)
      if (deleted) purged += 1
    }
  }
  return purged
}