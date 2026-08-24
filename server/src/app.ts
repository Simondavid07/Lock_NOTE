import { randomUUID } from 'node:crypto'
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
  buildVersion?: string
}

function requestIdFromHeader(value: string | undefined): string {
  return value && /^[a-zA-Z0-9._-]{8,128}$/.test(value) ? value : randomUUID()
}

function normalizedApiRoute(path: string): string {
  if (path === '/api' || path === '/api/health' || path === '/api/pastes' || path === '/api/drafts') return path
  if (/^\/api\/pastes\/[^/]+$/.test(path)) return '/api/pastes/:id'
  if (/^\/api\/pastes\/[^/]+\/(consume|file|acknowledge|receipt|guardian-wipe|status)$/.test(path)) return '/api/pastes/:id/:operation'
  if (/^\/api\/drafts\/[^/]+$/.test(path)) return '/api/drafts/:roomId'
  if (/^\/api\/drafts\/[^/]+\/seal$/.test(path)) return '/api/drafts/:roomId/seal'
  if (path === '/api/maintenance/purge') return '/api/maintenance/purge'
  return '/api/unknown'
}

function safeErrorClass(error: unknown): string {
  if (error instanceof ZodError) return 'validation_error'
  if (error instanceof SyntaxError) return 'syntax_error'
  return 'internal_error'
}

export function createApp(deps: AppDeps): Express {
  const app = express()
  // Vercel places exactly one trusted proxy in front of each serverless function.
  // Do not use `true`: that would trust arbitrary client-provided forwarding chains.
  app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || deps.corsOrigins.includes('*') || deps.corsOrigins.includes(origin)) return cb(null, true)
        cb(null, false)
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
    }),
  )
  app.use(express.json({ limit: '8mb' }))

  app.use((req, res, next) => {
    const startedAt = performance.now()
    const route = normalizedApiRoute(req.path)
    const requestId = requestIdFromHeader(req.get('x-request-id'))
    res.locals.requestId = requestId
    res.setHeader('X-Request-ID', requestId)
    const originalWriteHead = res.writeHead
    res.writeHead = ((...args: Parameters<typeof res.writeHead>) => {
      if (!res.headersSent) {
        res.setHeader('Server-Timing', `app;dur=${Math.max(0, Math.round(performance.now() - startedAt))}`)
      }
      return originalWriteHead.apply(res, args)
    }) as typeof res.writeHead
    res.on('finish', () => {
      console.info(JSON.stringify({
        event: 'api_request_complete',
        requestId,
        method: req.method,
        route,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      }))
    })
    next()
  })

  const globalLimiter = rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: { trustProxy: false },
    message: { error: 'Rate limit exceeded' },
  })
  app.use('/api', globalLimiter)

  const startedAt = deps.startedAt ?? Date.now()

  app.get('/api', (_req, res) => {
    res.json({
      name: 'locknote-api',
      version: deps.buildVersion ?? 'local',
      endpoints: [
        'POST /api/pastes',
        'GET /api/pastes/:id',
        'POST /api/pastes/:id/consume',
        'POST /api/pastes/:id/file',
        'POST /api/pastes/:id/acknowledge',
        'POST /api/pastes/:id/receipt',
        'POST /api/pastes/:id/guardian-wipe',
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
  app.use('/api/health', healthRouter({ store: deps.store, startedAt, buildVersion: deps.buildVersion }))

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found' })
  })

  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err instanceof ZodError || err instanceof SyntaxError ? 400 : 500
    if (status === 500) {
      console.error(JSON.stringify({
        event: 'api_unhandled_error',
        requestId: res.locals.requestId ?? 'unknown',
        method: req.method,
        route: normalizedApiRoute(req.path),
        status,
        errorClass: safeErrorClass(err),
      }))
    }
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Invalid payload', details: err.flatten().fieldErrors })
      return
    }
    res.status(status).json({ error: status === 500 ? 'internal_error' : 'bad_request' })
  })

  return app
}