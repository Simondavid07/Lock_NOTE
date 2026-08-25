import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { FileBlobStore } from '../blob-store.js'
import { toMetadata } from '../helpers.js'
import type { AuditSink, PasteRecord } from '../types.js'
import type { PasteStore } from '../store.js'
import { acknowledgeSchema, consumeSchema, createPasteSchema, fileLeaseSchema, guardianWipeSchema, ownerSchema, replySchema } from '../schemas.js'
import { randomId, ttlToExpiry } from '../util.js'

const bytesFromBase64 = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64'))

function publicConsumeBody(record: PasteRecord, preview: boolean, fileLease: { token: string; expiresAt: number } | null) {
  return {
    id: record.id,
    status: 'alive' as const,
    preview,
    format: record.format,
    language: record.language,
    alg: record.alg,
    kdf: record.kdf,
    iterations: record.iterations,
    salt: record.salt,
    iv: record.iv,
    ciphertext: record.ciphertext,
    fileMeta: record.fileMeta,
    fileLease: fileLease ? { token: fileLease.token, expiresAt: fileLease.expiresAt } : null,
    expiresAt: record.expiresAt,
    burnAfterRead: record.burnAfterRead,
  }
}

export function pastesRouter(deps: { store: PasteStore; files: FileBlobStore; audit: AuditSink }): Router {
  const router = Router()
  const createLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many paste creations. Slow down.' },
  })
  const consumeLimiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Slow down.' },
  })
  const replyLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many encrypted replies. Slow down.' },
  })

  router.post('/', createLimiter, async (req, res, next) => {
    let storagePath: string | null = null
    try {
      const parsed = createPasteSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors })
        return
      }
      const body = parsed.data
      const id = body.id ?? randomId()
      const createdAt = deps.store.now()
      const expiresAt = ttlToExpiry(body.ttlSeconds, createdAt)
      if (await deps.store.get(id)) {
        res.status(409).json({ error: 'id_collision', message: 'That paste id is already taken — try again.' })
        return
      }

      if (body.file) storagePath = await deps.files.upload(id, bytesFromBase64(body.file.storagePayload))
      const record = await deps.store.create({
        id,
        ciphertext: body.ciphertext,
        salt: body.salt,
        iv: body.iv,
        iterations: body.iterations,
        kdf: body.kdf,
        alg: body.alg,
        format: body.format,
        language: body.language,
        burnAfterRead: body.burnAfterRead,
        deadSwitchDays: body.deadSwitchDays,
        storagePath,
        fileMeta: body.file ? { size: body.file.size, iv: body.file.fileIv } : null,
        expiresAt,
        ownerToken: body.ownerToken,
        receiptProofHash: body.receiptProofHash,
        allowReplies: Boolean(body.replies),
        replyVerifier: body.replies?.verifier ?? null,
        guardianVerifier: body.guardian?.verifier ?? null,
        guardianPolicy: body.guardian ? { threshold: body.guardian.threshold, total: body.guardian.total } : null,
      })
      void deps.audit.record(id, 'paste:created')
      res.status(201).json({
        id: record.id,
        status: 'alive',
        format: record.format,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        ownerToken: body.ownerToken,
      })
    } catch (error) {
      if (storagePath) await deps.files.delete(storagePath).catch(() => undefined)
      next(error)
    }
  })

  router.get('/:id', async (req, res, next) => {
    try {
      const record = await deps.store.get(String(req.params.id ?? ''))
      if (!record) {
        res.status(404).json({ error: 'not_found', status: 'gone' })
        return
      }
      res.json(toMetadata(record, deps.store.now()))
    } catch (error) {
      next(error)
    }
  })

  router.post('/:id/consume', consumeLimiter, async (req, res, next) => {
    try {
      const id = String(req.params.id ?? '')
      const { ownerToken } = consumeSchema.parse(req.body ?? {})
      const outcome = await deps.store.consume(id, ownerToken)
      if (!outcome.ok) {
        res.status(410).json({ error: 'not_available', status: outcome.status })
        return
      }
      // Burn-after-read files receive their lease atomically with the burn
      // transition. Non-burning reads and owner previews can safely request a
      // fresh lease afterward because a transient issuance failure is retryable.
      const fileLease = outcome.fileLease ?? (outcome.record.storagePath ? await deps.store.issueFileLease(id) : null)
      if (outcome.record.storagePath && !fileLease) {
        res.status(503).json({ error: 'file_delivery_unavailable' })
        return
      }
      void deps.audit.record(id, outcome.preview ? 'paste:previewed' : outcome.record.burned ? 'paste:burned' : 'paste:consumed')
      res.json(publicConsumeBody(outcome.record, outcome.preview, fileLease))
    } catch (error) {
      next(error)
    }
  })

  /** Redeem a short-lived encrypted-file lease. The storage object itself is never publicly addressable. */
  router.post('/:id/file', consumeLimiter, async (req, res, next) => {
    try {
      const id = String(req.params.id ?? '')
      const { token } = fileLeaseSchema.parse(req.body ?? {})
      const storagePath = await deps.store.redeemFileLease(id, token)
      if (!storagePath) {
        res.status(404).json({ error: 'not_found_or_invalid_lease' })
        return
      }
      const bytes = await deps.files.read(storagePath)
      if (!bytes) {
        res.status(410).json({ error: 'file_unavailable' })
        return
      }
      res.setHeader('Cache-Control', 'no-store, max-age=0')
      res.type('application/octet-stream').send(Buffer.from(bytes))
    } catch (error) {
      next(error)
    }
  })

  /**
   * The raw proof is authenticated inside the ciphertext envelope. This route
   * records a one-time verified-open acknowledgement only after local decrypt.
   */
  router.post('/:id/acknowledge', consumeLimiter, async (req, res, next) => {
    try {
      const id = String(req.params.id ?? '')
      const { proof } = acknowledgeSchema.parse(req.body ?? {})
      const result = await deps.store.acknowledge(id, proof)
      if (!result) {
        res.status(404).json({ error: 'not_found_or_invalid_proof' })
        return
      }
      void deps.audit.record(id, 'paste:acknowledged')
      res.status(201).json({ acknowledgedAt: result.acknowledgedAt })
    } catch (error) {
      next(error)
    }
  })

  /** Submit a bounded opaque encrypted reply. The capability is revealed only after local envelope decryption. */
  router.post('/:id/replies', replyLimiter, async (req, res, next) => {
    try {
      const id = String(req.params.id ?? '')
      const body = replySchema.parse(req.body ?? {})
      const reply = await deps.store.addReply(id, body.capability, { id: randomId(), ciphertext: body.ciphertext, iv: body.iv })
      if (!reply) {
        res.status(404).json({ error: 'not_available_or_invalid_reply_capability' })
        return
      }
      void deps.audit.record(id, 'paste:reply_added')
      res.status(201).json(reply)
    } catch (error) {
      next(error)
    }
  })

  /** The sender’s owner capability is required to retrieve opaque replies for local decryption. */
  router.post('/:id/replies/owner', consumeLimiter, async (req, res, next) => {
    try {
      const id = String(req.params.id ?? '')
      const replies = await deps.store.replies(id, ownerSchema.parse(req.body ?? {}).ownerToken)
      if (!replies) {
        res.status(404).json({ error: 'not_found_or_forbidden' })
        return
      }
      res.setHeader('Cache-Control', 'no-store, max-age=0')
      res.json({ replies })
    } catch (error) {
      next(error)
    }
  })

  router.post('/:id/receipt', consumeLimiter, async (req, res, next) => {
    try {
      const receipt = await deps.store.receipt(String(req.params.id ?? ''), ownerSchema.parse(req.body ?? {}).ownerToken)
      if (!receipt) {
        res.status(404).json({ error: 'not_found_or_forbidden' })
        return
      }
      res.json(receipt)
    } catch (error) {
      next(error)
    }
  })

  async function removeWithOwner(id: string, ownerToken: string): Promise<{ removed: boolean; storagePath: string | null }> {
    const record = await deps.store.get(id)
    if (!record) return { removed: false, storagePath: null }
    const removed = await deps.store.destroy(id, ownerToken)
    return { removed, storagePath: removed ? record.storagePath : null }
  }

  router.delete('/:id', consumeLimiter, async (req, res, next) => {
    try {
      const id = String(req.params.id ?? '')
      const { removed, storagePath } = await removeWithOwner(id, ownerSchema.parse(req.body ?? {}).ownerToken)
      if (!removed) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      if (storagePath) await deps.files.delete(storagePath).catch(() => undefined)
      void deps.audit.record(id, 'paste:destroyed')
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  router.post('/:id/guardian-wipe', consumeLimiter, async (req, res, next) => {
    try {
      const id = String(req.params.id ?? '')
      const record = await deps.store.get(id)
      if (!record) {
        res.status(404).json({ error: 'not_found' })
        return
      }
      const { capability } = guardianWipeSchema.parse(req.body ?? {})
      const removed = await deps.store.guardianDestroy(id, capability)
      if (!removed) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      if (record.storagePath) await deps.files.delete(record.storagePath).catch(() => undefined)
      void deps.audit.record(id, 'paste:guardian_destroyed')
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  router.get('/:id/status', async (req, res, next) => {
    try {
      const id = String(req.params.id ?? '')
      res.json({ id, status: await deps.store.status(id) })
    } catch (error) {
      next(error)
    }
  })

  return router
}
