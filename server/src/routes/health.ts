import { Router } from 'express'
import type { PasteStore } from '../store.js'

export function healthRouter(deps: { store: PasteStore; startedAt: number }): Router {
  const router = Router()

  router.get('/', async (_req, res) => {
    const storeHealth = await deps.store.health()
    const ok = storeHealth.ok
    res.status(ok ? 200 : 503).json({
      ok,
      service: 'locknote-api',
      store: deps.store.kind,
      storeDetail: storeHealth.detail ?? null,
      uptimeSeconds: Math.round((Date.now() - deps.startedAt) / 1000),
      time: new Date().toISOString(),
    })
  })

  return router
}