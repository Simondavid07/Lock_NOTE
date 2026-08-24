import { describe, expect, it, beforeEach } from 'vitest'
import { makeTestApp, createPayload, api, TEST_RECEIPT_PROOF, type TestContext } from './helpers.js'
import { sha256Base64url } from '../util.js'

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

    const res = await api(ctx.app).delete(`/api/pastes/${id}`).send({ ownerToken: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })
    expect(res.status).toBe(403)

    const meta = await api(ctx.app).get(`/api/pastes/${id}`)
    expect(meta.status).toBe(200)
  })
})

describe('private encrypted-file delivery', () => {
  let ctx: TestContext

  beforeEach(() => {
    ctx = makeTestApp()
  })

  it('returns a one-use private file lease after consume without exposing storagePath', async () => {
    const created = await api(ctx.app).post('/api/pastes').send(createPayload({
      format: 'file',
      file: { storagePayload: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', size: 10, fileIv: 'CQkJCQkJCQkJCQkJ' },
    }))
    const id = created.body.id as string

    const consumed = await api(ctx.app).post(`/api/pastes/${id}/consume`).send({})
    expect(consumed.status).toBe(200)
    expect(consumed.body.storagePath).toBeUndefined()
    expect(consumed.body.fileLease?.token).toMatch(/^[A-Za-z0-9_-]{32}$/)

    const downloaded = await api(ctx.app).post(`/api/pastes/${id}/file`).send({ token: consumed.body.fileLease.token })
    expect(downloaded.status).toBe(200)
    expect(downloaded.headers['cache-control']).toContain('no-store')
    expect(downloaded.body).toHaveLength(26)

    const replay = await api(ctx.app).post(`/api/pastes/${id}/file`).send({ token: consumed.body.fileLease.token })
    expect(replay.status).toBe(404)
  })

  it('issues a burn-after-read file lease with the burn transition', async () => {
    const created = await api(ctx.app).post('/api/pastes').send(createPayload({
      format: 'file',
      burnAfterRead: true,
      file: { storagePayload: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', size: 10, fileIv: 'CQkJCQkJCQkJCQkJ' },
    }))
    const id = created.body.id as string
    const consumed = await api(ctx.app).post(`/api/pastes/${id}/consume`).send({})
    expect(consumed.status).toBe(200)
    expect(consumed.body.fileLease?.token).toBeTruthy()
    expect((await api(ctx.app).post(`/api/pastes/${id}/consume`).send({})).status).toBe(410)

    const downloaded = await api(ctx.app).post(`/api/pastes/${id}/file`).send({ token: consumed.body.fileLease.token })
    expect(downloaded.status).toBe(200)
  })

  it('rejects an expired file lease without exposing a replacement capability', async () => {
    const created = await api(ctx.app).post('/api/pastes').send(createPayload({
      format: 'file',
      file: { storagePayload: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', size: 10, fileIv: 'CQkJCQkJCQkJCQkJ' },
    }))
    const id = created.body.id as string
    const consumed = await api(ctx.app).post(`/api/pastes/${id}/consume`).send({})

    ctx.advance(61_000)
    const expired = await api(ctx.app).post(`/api/pastes/${id}/file`).send({ token: consumed.body.fileLease.token })
    expect(expired.status).toBe(404)
    expect(expired.body.token).toBeUndefined()
  })
})

describe('Guardian Wipe', () => {
  let ctx: TestContext

  beforeEach(() => {
    ctx = makeTestApp()
  })

  it('destroys only when the verifier-matched guardian capability is supplied', async () => {
    const capability = 'DQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0'
    const created = await api(ctx.app).post('/api/pastes').send(createPayload({
      guardian: { threshold: 2, total: 3, verifier: sha256Base64url(capability) },
    }))
    const id = created.body.id as string

    const denied = await api(ctx.app).post(`/api/pastes/${id}/guardian-wipe`).send({ capability: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })
    expect(denied.status).toBe(403)
    const removed = await api(ctx.app).post(`/api/pastes/${id}/guardian-wipe`).send({ capability })
    expect(removed.status).toBe(204)
    expect((await api(ctx.app).get(`/api/pastes/${id}`)).status).toBe(404)
  })
})

describe('read receipts', () => {
  let ctx: TestContext

  beforeEach(() => {
    ctx = makeTestApp()
  })

  it('records one verified acknowledgement and rejects guessed or replayed proofs', async () => {
    const created = await api(ctx.app).post('/api/pastes').send(createPayload())
    const id = created.body.id as string

    await api(ctx.app).post(`/api/pastes/${id}/consume`).send({})
    const guessed = await api(ctx.app).post(`/api/pastes/${id}/acknowledge`).send({ proof: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })
    expect(guessed.status).toBe(404)

    const acknowledged = await api(ctx.app).post(`/api/pastes/${id}/acknowledge`).send({ proof: TEST_RECEIPT_PROOF })
    expect(acknowledged.status).toBe(201)
    const replay = await api(ctx.app).post(`/api/pastes/${id}/acknowledge`).send({ proof: TEST_RECEIPT_PROOF })
    expect(replay.status).toBe(404)

    const denied = await api(ctx.app)
      .post(`/api/pastes/${id}/receipt`)
      .send({ ownerToken: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })
    expect(denied.status).toBe(404)

    const receipt = await api(ctx.app)
      .post(`/api/pastes/${id}/receipt`)
      .send({ ownerToken: created.body.ownerToken })
    expect(receipt.status).toBe(200)
    expect(receipt.body.viewCount).toBe(1)
    expect(receipt.body.receiptAcknowledgedAt).toBeGreaterThan(0)
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

    // Only a successful decrypted-proof acknowledgement resets the clock.
    await api(ctx.app).post(`/api/pastes/${id}/consume`).send({})
    await api(ctx.app).post(`/api/pastes/${id}/acknowledge`).send({ proof: TEST_RECEIPT_PROOF })
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
      .send({ ownerToken: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })
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