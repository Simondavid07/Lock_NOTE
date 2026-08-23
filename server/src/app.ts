import express, { type Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { ZodError } from 'zod'
import type { AuditSink } from './types.js'
import type { DraftStore, PasteStore } from './store.js'
import type { FileBlobStore } from './blob-store.js'
import { pastesRouter } from './routes/pastes.js'
import { draftsRouter } from './routes/drafts.js'
import { healthRouter } from './routes/health.js'

export interface AppDeps {
  store: PasteStore
  drafts: DraftStore
  files: FileBlobStore
  audit: AuditSink
  corsOrigins: string[]
  startedAt?: number
}

export function createApp(deps: AppDeps): Express {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' || deps.corsOrigins.includes('*') || deps.corsOrigins.includes(origin)) return cb(null, true)
        cb(null, false)
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
    }),
  )
  app.use(express.json({ limit: '8mb' }))

  const globalLimiter = rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded' },
  })
  app.use('/api', globalLimiter)

  const startedAt = deps.startedAt ?? Date.now()

  app.get('/api', (_req, res) => {
    res.json({
      name: 'locknote-api',
      version: '1.0.0',
      endpoints: [
        'POST /api/pastes',
        'GET /api/pastes/:id',
        'POST /api/pastes/:id/consume',
        'POST /api/pastes/:id/viewed',
        'POST /api/pastes/:id/receipt',
        'DELETE /api/pastes/:id',
        'GET /api/pastes/:id/status',
        'POST /api/drafts',
        'GET /api/drafts/:roomId',
        'DELETE /api/drafts/:roomId/seal',
        'GET /api/health',
      ],
    })
  })

  app.use('/api/pastes', pastesRouter({ store: deps.store, files: deps.files, audit: deps.audit }))
  app.use('/api/drafts', draftsRouter({ drafts: deps.drafts, audit: deps.audit }))
  app.use('/api/health', healthRouter({ store: deps.store, startedAt }))

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found' })
  })

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Invalid payload', details: err.flatten().fieldErrors })
      return
    }
    const status = err instanceof SyntaxError ? 400 : 500
    res.status(status).json({ error: status === 500 ? 'internal_error' : 'bad_request' })
  })

  return app
}