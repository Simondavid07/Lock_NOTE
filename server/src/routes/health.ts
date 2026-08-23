import { Router } from 'express'
import type { PasteStore } from '../store.js'

function safeHealthDetail(detail: string | undefined): string | null {
  if (!detail) return null

  const normalized = detail
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized ? normalized.slice(0, 240) : null
}

export function healthRouter(deps: { store: PasteStore; startedAt: number; buildVersion?: string }): Router {
  const router = Router()

  router.get('/', async (_req, res) => {
    const storeHealth = await deps.store.health()
    const ok = storeHealth.ok
    res.status(ok ? 200 : 503).json({
      ok,
      service: 'locknote-api',
      version: deps.buildVersion ?? 'local',
      store: deps.store.kind,
      storeDetail: safeHealthDetail(storeHealth.detail),
      uptimeSeconds: Math.round((Date.now() - deps.startedAt) / 1000),
      time: new Date().toISOString(),
    })
  })

  return router
}
