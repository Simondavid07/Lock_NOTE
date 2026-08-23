import type { Request, Response } from 'express'
import { runJanitor } from '../../server/dist/cleanup.js'
import { createLocknoteRuntime } from '../../server/dist/runtime.js'
import { safeEqual } from '../../server/dist/util.js'

const runtime = createLocknoteRuntime({ requireSupabase: false })

/**
 * Vercel invokes this route daily. It is deliberately not part of the public
 * API and requires CRON_SECRET, which Vercel forwards as a Bearer token.
 */
export default async function purge(request: Request, response: Response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const secret = process.env.CRON_SECRET
  const authorization = request.headers.authorization
  if (!secret || !authorization || !safeEqual(authorization, `Bearer ${secret}`)) {
    response.status(401).json({ error: 'unauthorized' })
    return
  }

  try {
    const result = await runJanitor(runtime.backend)
    response.setHeader('Cache-Control', 'no-store, max-age=0')
    response.status(200).json({ ok: true, ...result })
  } catch (error) {
    console.error('[maintenance] cleanup failed:', error)
    response.status(500).json({ ok: false, error: 'cleanup_failed' })
  }
}
