import { describe, expect, it, beforeEach } from 'vitest'
import { makeTestApp, createPayload, api, type TestContext } from './helpers.js'

describe('consume / burn-after-read', () => {
  let ctx: TestContext

  beforeEach(() => {
    ctx = makeTestApp()
  })

  it('delivers a burn paste exactly once, then reports burned', async () => {
    const created = await api(ctx.app).post('/api/pastes').send(createPayload({ burnAfterRead: true }))
    const id = created.body.id as string

    const first = await api(ctx.app).post(`/api/pastes/${id}/consume`).send({})
    expect(first.status).toBe(200)
    expect(first.body.ciphertext).toBeTruthy()
    expect(first.body.preview).toBe(false)
    expect(first.body.ownerToken).toBeUndefined()

    const second = await api(ctx.app).post(`/api/pastes/${id}/consume`).send({})
    expect(second.status).toBe(410)
    expect(second.body.status).toBe('burned')

    const meta = await api(ctx.app).get(`/api/pastes/${id}`)
    expect(meta.body.status).toBe('burned')
  })

  it('owner preview does not burn, but a later real consume does', async () => {
    const created = await api(ctx.app).post('/api/pastes').send(createPayload({ burnAfterRead: true }))
    const id = created.body.id as string
    const ownerToken = created.body.ownerToken as string

    const preview = await api(ctx.app).post(`/api/pastes/${id}/consume`).send({ ownerToken })
    expect(preview.status).toBe(200)
    expect(preview.body.preview).toBe(true)

    const real = await api(ctx.app).post(`/api/pastes/${id}/consume`).send({})
    expect(real.status).toBe(200)
    expect(real.body.preview).toBe(false)

    const after = await api(ctx.app).post(`/api/pastes/${id}/consume`).send({})
    expect(after.status).toBe(410)
  })

  it('normal pastes can be consumed repeatedly', async () => {
    const created = await api(ctx.app).post('/api/pastes').send(createPayload())
    const id = created.body.id as string

    for (let i = 0; i < 3; i++) {
      const res = await api(ctx.app).post(`/api/pastes/${id}/consume`).send({})
      expect(res.status).toBe(200)
    }
  })

  it('reports gone for unknown ids', async () => {
    const res = await api(ctx.app).post('/api/pastes/doesnotexist/consume').send({})
    expect(res.status).toBe(410)
    expect(res.body.status).toBe('gone')
  })
})

describe('remote wipe (DELETE)', () => {
  let ctx: TestContext

  beforeEach(() => {
    ctx = makeTestApp()
  })

  it('destroys a paste with the owner token', async () => {
    const created = await api(ctx.app).post('/api/pastes').send(createPayload())
    const id = created.body.id as string

    const res = await api(ctx.app).delete(`/api/pastes/${id}`).send({ ownerToken: created.body.ownerToken })
    expect(res.status).toBe(204)

    const meta = await api(ctx.app).get(`/api/pastes/${id}`)
    expect(meta.status).toBe(404)
  })

  it('rejects a wrong owner token', async () => {
    const created = await api(ctx.app).post('/api/pastes').send(createPayload())
    const id = created.body.id as string

    const res = await api(ctx.app).delete(`/api/pastes/${id}`).send({ ownerToken: 'wrong-token-for-testing-0000' })
    expect(res.status).toBe(403)

    const meta = await api(ctx.app).get(`/api/pastes/${id}`)
    expect(meta.status).toBe(200)
  })
})

describe('read receipts', () => {
  let ctx: TestContext

  beforeEach(() => {
    ctx = makeTestApp()
  })

  it('tracks views and only reveals them to the owner', async () => {
    const created = await api(ctx.app).post('/api/pastes').send(createPayload())
    const id = created.body.id as string

    await api(ctx.app).post(`/api/pastes/${id}/consume`).send({})
    await api(ctx.app).post(`/api/pastes/${id}/viewed`).send({})

    const denied = await api(ctx.app)
      .post(`/api/pastes/${id}/receipt`)
      .send({ ownerToken: 'wrong-token-for-testing-0000' })
    expect(denied.status).toBe(404)

    const receipt = await api(ctx.app)
      .post(`/api/pastes/${id}/receipt`)
      .send({ ownerToken: created.body.ownerToken })
    expect(receipt.status).toBe(200)
    expect(receipt.body.viewCount).toBe(2)
    expect(receipt.body.firstViewedAt).toBeGreaterThan(0)
  })
})

describe('expiry & dead switch', () => {
  let ctx: TestContext

  beforeEach(() => {
    ctx = makeTestApp()
  })

  it('expired pastes report expired and refuse consume', async () => {
    const created = await api(ctx.app).post('/api/pastes').send(createPayload({ ttlSeconds: 300 }))
    const id = created.body.id as string

    ctx.advance(301_000)

    const meta = await api(ctx.app).get(`/api/pastes/${id}`)
    expect(meta.body.status).toBe('expired')

    const consumed = await api(ctx.app).post(`/api/pastes/${id}/consume`).send({})
    expect(consumed.status).toBe(410)
    expect(consumed.body.status).toBe('expired')
  })

  it('expired pastes are physically purged by the janitor', async () => {
    const created = await api(ctx.app).post('/api/pastes').send(createPayload({ ttlSeconds: 300 }))
    const id = created.body.id as string
    ctx.advance(301_000)

    const purged = await ctx.store.purgeExpired()
    expect(purged).toBe(1)

    const meta = await api(ctx.app).get(`/api/pastes/${id}`)
    expect(meta.status).toBe(404)
  })

  it('dead-switch pastes auto-destroy after the inactivity window', async () => {
    const created = await api(ctx.app).post('/api/pastes').send(createPayload({ deadSwitchDays: 1 }))
    const id = created.body.id as string

    // A view resets the clock...
    await api(ctx.app).post(`/api/pastes/${id}/consume`).send({})
    ctx.advance(23 * 3_600_000) // 23h later — still alive
    const alive = await api(ctx.app).get(`/api/pastes/${id}`)
    expect(alive.body.status).toBe('alive')

    ctx.advance(2 * 3_600_000) // 25h after the view — dead
    const dead = await api(ctx.app).get(`/api/pastes/${id}`)
    expect(dead.body.status).toBe('dead')

    const consumed = await api(ctx.app).post(`/api/pastes/${id}/consume`).send({})
    expect(consumed.status).toBe(410)
    expect(consumed.body.status).toBe('dead')
  })

  it('never-expiring pastes survive the janitor', async () => {
    const created = await api(ctx.app).post('/api/pastes').send(createPayload())
    const id = created.body.id as string
    ctx.advance(400 * 86_400_000)
    expect(await ctx.store.purgeExpired()).toBe(0)
    const meta = await api(ctx.app).get(`/api/pastes/${id}`)
    expect(meta.body.status).toBe('alive')
  })
})

describe('draft rooms', () => {
  let ctx: TestContext

  beforeEach(() => {
    ctx = makeTestApp()
  })

  it('creates, reads and seals a draft', async () => {
    const created = await api(ctx.app).post('/api/drafts').send({ content: 'hello' })
    expect(created.status).toBe(201)
    const roomId = created.body.roomId as string

    const read = await api(ctx.app).get(`/api/drafts/${roomId}`)
    expect(read.status).toBe(200)
    expect(read.body.content).toBe('hello')
    expect(read.body.ownerToken).toBeUndefined()

    const sealed = await api(ctx.app)
      .delete(`/api/drafts/${roomId}/seal`)
      .send({ ownerToken: created.body.ownerToken })
    expect(sealed.status).toBe(204)

    const after = await api(ctx.app).get(`/api/drafts/${roomId}`)
    expect(after.status).toBe(404)
  })

  it('refuses to seal with a wrong owner token', async () => {
    const created = await api(ctx.app).post('/api/drafts').send({})
    const res = await api(ctx.app)
      .delete(`/api/drafts/${created.body.roomId}/seal`)
      .send({ ownerToken: 'wrong-token-for-testing-0000' })
    expect(res.status).toBe(403)
  })
})

describe('health', () => {
  it('reports ok for the memory backend', async () => {
    const ctx = makeTestApp()
    const res = await api(ctx.app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.store).toBe('memory')
  })
})