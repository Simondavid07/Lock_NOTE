import { describe, expect, it, beforeEach } from 'vitest'
import { makeTestApp, createPayload, api, type TestContext } from './helpers.js'

describe('POST /api/pastes', () => {
  let ctx: TestContext

  beforeEach(() => {
    ctx = makeTestApp()
  })

  it('creates a paste and returns id + ownerToken', async () => {
    const res = await api(ctx.app).post('/api/pastes').send(createPayload())
    expect(res.status).toBe(201)
    expect(res.body.id).toMatch(/^[A-Za-z0-9_-]{8,}$/)
    expect(res.body.status).toBe('alive')
    expect(res.body.ownerToken).toBe('owner-token-for-testing-purposes-123456')
    expect(res.body.createdAt).toBeGreaterThan(0)
  })

  it('rejects short / malformed ciphertext', async () => {
    const res = await api(ctx.app).post('/api/pastes').send({ ...createPayload(), ciphertext: 'short' })
    expect(res.status).toBe(400)
  })

  it('rejects unsupported TTL presets', async () => {
    const res = await api(ctx.app).post('/api/pastes').send({ ...createPayload(), ttlSeconds: 123 })
    expect(res.status).toBe(400)
  })

  it('accepts file secrets with a storage payload and rejects files without one', async () => {
    const res = await api(ctx.app).post('/api/pastes').send({
      ...createPayload({ format: 'file' }),
      file: { storagePayload: 'c3RvcmluZ2UtcGF5bG9hZC1ieXRlcy4uLi4=', size: 10, fileIv: 'ZmlsZS1pdi1ieXRlcw' },
    })
    expect(res.status).toBe(201)
    expect(res.body.format).toBe('file')

    const res2 = await api(ctx.app).post('/api/pastes').send(createPayload({ format: 'file' }))
    expect(res2.status).toBe(400)
  })

  it('persists burn-after-read and expiry metadata', async () => {
    const res = await api(ctx.app).post('/api/pastes').send({
      ...createPayload(),
      burnAfterRead: true,
      ttlSeconds: 300,
    })
    expect(res.status).toBe(201)
    expect(res.body.expiresAt).toBeGreaterThan(Date.now())

    const meta = await api(ctx.app).get(`/api/pastes/${res.body.id}`)
    expect(meta.status).toBe(200)
    expect(meta.body.burnAfterRead).toBe(true)
    expect(meta.body.expiresAt).toBe(res.body.expiresAt)
    expect(meta.body.salt).toBeTruthy()
    expect(meta.body.iv).toBeTruthy()
    // The server must never expose the owner token or ciphertext via metadata.
    expect(meta.body.ciphertext).toBeUndefined()
    expect(meta.body.ownerToken).toBeUndefined()
  })
})