import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { FileBlobStore } from '../blob-store.js'
import { toMetadata } from '../helpers.js'
import type { AuditSink, PasteRecord } from '../types.js'
import type { PasteStore } from '../store.js'
import { consumeSchema, createPasteSchema, ownerSchema } from '../schemas.js'
import { randomId, ttlToExpiry } from '../util.js'

const bytesFromBase64 = (b64: string): Uint8Array => {
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

function publicConsumeBody(record: PasteRecord, preview: boolean) {
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
    storagePath: record.storagePath,
    fileMeta: record.fileMeta,
    expiresAt: record.expiresAt,
    burnAfterRead: record.burnAfterRead,
  }
}

export function pastesRouter(deps: {
  store: PasteStore
  files: FileBlobStore
  audit: AuditSink
}): Router {
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

      if (body.file) {
        storagePath = await deps.files.upload(id, bytesFromBase64(body.file.storagePayload))
      }

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
    } catch (err) {
      if (storagePath) await deps.files.delete(storagePath).catch(() => undefined)
      next(err)
    }
  })

  router.get('/:id', async (req, res, next) => {
    try {
      const id = String(req.params.id ?? '')
      const record = await deps.store.get(id)
      if (!record) {
        res.status(404).json({ error: 'not_found', status: 'gone' })
        return
      }
      res.json(toMetadata(record, deps.store.now()))
    } catch (err) {
      next(err)
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
      void deps.audit.record(
        id,
        outcome.preview ? 'paste:previewed' : outcome.record.burned ? 'paste:burned' : 'paste:consumed',
      )
      res.json(publicConsumeBody(outcome.record, outcome.preview))
    } catch (err) {
      next(err)
    }
  })

  router.post('/:id/viewed', consumeLimiter, async (req, res, next) => {
    try {
      const id = String(req.params.id ?? '')
      const result = await deps.store.viewed(id)
      if (!result) {
        res.status(404).json({ error: 'not_found' })
        return
      }
      res.json(result)
    } catch (err) {
      next(err)
    }
  })

  router.post('/:id/receipt', consumeLimiter, async (req, res, next) => {
    try {
      const id = String(req.params.id ?? '')
      const { ownerToken } = ownerSchema.parse(req.body ?? {})
      const receipt = await deps.store.receipt(id, ownerToken)
      if (!receipt) {
        res.status(404).json({ error: 'not_found_or_forbidden' })
        return
      }
      res.json(receipt)
    } catch (err) {
      next(err)
    }
  })

  router.delete('/:id', consumeLimiter, async (req, res, next) => {
    try {
      const id = String(req.params.id ?? '')
      const { ownerToken } = ownerSchema.parse(req.body ?? {})
      const record = await deps.store.get(id)
      if (!record) {
        res.status(404).json({ error: 'not_found' })
        return
      }
      const destroyed = await deps.store.destroy(id, ownerToken)
      if (!destroyed) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      if (record.storagePath) await deps.files.delete(record.storagePath).catch(() => undefined)
      void deps.audit.record(id, 'paste:destroyed')
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  })

  router.get('/:id/status', async (req, res, next) => {
    try {
      const id = String(req.params.id ?? '')
      const status = await deps.store.status(id)
      res.json({ id, status })
    } catch (err) {
      next(err)
    }
  })

  return router
}