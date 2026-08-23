import { describe, expect, it } from 'vitest'
import { api, makeTestApp } from './helpers.js'

describe('API observability', () => {
  it('returns a generated request ID and an app timing metric', async () => {
    const ctx = makeTestApp()
    const response = await api(ctx.app).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.headers['x-request-id']).toMatch(/^[a-zA-Z0-9._-]{8,128}$/)
    expect(response.headers['server-timing']).toMatch(/^app;dur=\d+$/)
  })

  it('honors a syntactically safe caller request ID without accepting malformed values', async () => {
    const ctx = makeTestApp()
    const accepted = await api(ctx.app).get('/api/health').set('X-Request-ID', 'evaluator-check-0001')
    const rejected = await api(ctx.app).get('/api/health').set('X-Request-ID', 'bad value with spaces')

    expect(accepted.headers['x-request-id']).toBe('evaluator-check-0001')
    expect(rejected.headers['x-request-id']).not.toBe('bad value with spaces')
    expect(rejected.headers['x-request-id']).toMatch(/^[a-zA-Z0-9._-]{8,128}$/)
  })

  it('reports safe readiness metadata without exposing configuration values', async () => {
    const ctx = makeTestApp()
    const response = await api(ctx.app).get('/api/health')

    expect(response.body).toMatchObject({
      ok: true,
      service: 'locknote-api',
      version: 'local',
      store: 'memory',
    })
    expect(JSON.stringify(response.body)).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })
})
