import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { AuditSink } from '../types.js'
import type { DraftStore } from '../store.js'
import { draftSchema, ownerSchema } from '../schemas.js'
import { randomToken } from '../util.js'

export function draftsRouter(deps: { drafts: DraftStore; audit: AuditSink }): Router {
  const router = Router()

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Slow down.' },
  })

  router.post('/', limiter, async (req, res, next) => {
    try {
      const { content } = draftSchema.parse(req.body ?? {})
      const roomId = randomToken(16)
      const ownerToken = randomToken(24)
      const draft = await deps.drafts.createDraft(roomId, ownerToken, content)
      void deps.audit.record(roomId, 'draft:created')
      res.status(201).json({ roomId: draft.roomId, ownerToken, createdAt: draft.createdAt })
    } catch (err) {
      next(err)
    }
  })

  router.get('/:roomId', limiter, async (req, res, next) => {
    try {
      const roomId = String(req.params.roomId ?? '')
      const draft = await deps.drafts.getDraft(roomId)
      if (!draft) {
        res.status(404).json({ error: 'not_found' })
        return
      }
      // Owner token is never disclosed on read.
      res.json({ roomId: draft.roomId, content: draft.content, updatedAt: draft.updatedAt })
    } catch (err) {
      next(err)
    }
  })

  // Any participant may persist content — the room id is the capability.
  router.put('/:roomId', limiter, async (req, res, next) => {
    try {
      const roomId = String(req.params.roomId ?? '')
      const { content } = draftSchema.parse(req.body ?? {})
      const draft = await deps.drafts.touchDraft(roomId, content ?? '')
      if (!draft) {
        res.status(404).json({ error: 'not_found' })
        return
      }
      void deps.audit.record(roomId, 'draft:updated')
      res.json({ roomId: draft.roomId, updatedAt: draft.updatedAt })
    } catch (err) {
      next(err)
    }
  })

  router.delete('/:roomId/seal', limiter, async (req, res, next) => {
    try {
      const roomId = String(req.params.roomId ?? '')
      const { ownerToken } = ownerSchema.parse(req.body ?? {})
      const sealed = await deps.drafts.sealDraft(roomId, ownerToken)
      if (!sealed) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      void deps.audit.record(roomId, 'draft:sealed')
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  })

  return router
}