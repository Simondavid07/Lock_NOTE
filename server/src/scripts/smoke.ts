/**
 * Live smoke test against a running Locknote API.
 *
 * Requires:
 *   1. The migration applied to your Supabase project (docs/sql/001_init.sql)
 *   2. `npm run dev` (or `npm run start -w server`) running on :3001
 *
 * Usage: npm run test:live -w server
 */

const BASE = process.env.API_URL ?? 'http://localhost:3001'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`SMOKE FAIL: ${msg}`)
}

async function request(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  let body: any = null
  try {
    body = await res.json()
  } catch {
    /* empty body */
  }
  return { status: res.status, body }
}

async function main(): Promise<void> {
  console.log(`Locknote live smoke test → ${BASE}`)

  const health = await request('/api/health')
  assert(health.status === 200, `health should be 200, got ${health.status}`)
  console.log(`  ✓ health ok (store=${health.body.store}, detail=${health.body.storeDetail})`)

  const created = await request('/api/pastes', {
    method: 'POST',
    body: JSON.stringify({
      ciphertext: Buffer.from('smoke-test-ciphertext-payload').toString('base64'),
      salt: Buffer.from('smoke-test-salt-bytes-for-kdf').toString('base64'),
      iv: Buffer.from('smoke-test-iv').toString('base64'),
      iterations: 0,
      kdf: 'hkdf',
      alg: 'aes-256-gcm',
      format: 'text',
      language: null,
      burnAfterRead: true,
      deadSwitchDays: null,
      ttlSeconds: 300,
      ownerToken: 'smoke-owner-token-0123456789abcdef',
    }),
  })
  assert(created.status === 201, `create should be 201, got ${created.status}`)
  const id = created.body.id as string
  console.log(`  ✓ created paste ${id}`)

  const meta = await request(`/api/pastes/${id}`)
  assert(meta.status === 200, `metadata should be 200, got ${meta.status}`)
  assert(meta.body.status === 'alive', `metadata status should be alive, got ${meta.body.status}`)
  assert(!('ciphertext' in meta.body), 'metadata must not leak ciphertext')
  assert(!('ownerToken' in meta.body), 'metadata must not leak owner token')
  console.log(`  ✓ metadata safe (${meta.body.format}, requiresPassphrase=${meta.body.requiresPassphrase})`)

  const preview = await request(`/api/pastes/${id}/consume`, {
    method: 'POST',
    body: JSON.stringify({ ownerToken: 'smoke-owner-token-0123456789abcdef' }),
  })
  assert(preview.status === 200 && preview.body.preview === true, 'owner preview should succeed')
  console.log('  ✓ owner preview delivered (paste not burned)')

  const consume = await request(`/api/pastes/${id}/consume`, { method: 'POST', body: '{}' })
  assert(consume.status === 200 && consume.body.preview === false, 'real consume should succeed')
  console.log('  ✓ burn paste consumed exactly once')

  const second = await request(`/api/pastes/${id}/consume`, { method: 'POST', body: '{}' })
  assert(second.status === 410 && second.body.status === 'burned', 'second consume must be rejected (410 burned)')
  console.log('  ✓ second consume rejected → 410 burned')

  const receipt = await request(`/api/pastes/${id}/receipt`, {
    method: 'POST',
    body: JSON.stringify({ ownerToken: 'smoke-owner-token-0123456789abcdef' }),
  })
  assert(receipt.status === 200 && receipt.body.viewCount >= 2, 'receipt should show view count')
  console.log(`  ✓ receipt viewCount=${receipt.body.viewCount}`)

  const draft = await request('/api/drafts', { method: 'POST', body: JSON.stringify({ content: 'hello' }) })
  assert(draft.status === 201, `draft create should be 201, got ${draft.status}`)
  const sealed = await request(`/api/drafts/${draft.body.roomId}/seal`, {
    method: 'DELETE',
    body: JSON.stringify({ ownerToken: draft.body.ownerToken }),
  })
  assert(sealed.status === 204, 'draft seal should succeed')
  console.log('  ✓ draft room created and sealed')

  const wiper = await request('/api/pastes', {
    method: 'POST',
    body: JSON.stringify({
      ciphertext: Buffer.from('wipe-test').toString('base64'),
      salt: Buffer.from('wipe-test-salt').toString('base64'),
      iv: Buffer.from('wipe-test-iv').toString('base64'),
      iterations: 0,
      kdf: 'hkdf',
      alg: 'aes-256-gcm',
      format: 'text',
      language: null,
      burnAfterRead: false,
      deadSwitchDays: null,
      ttlSeconds: 0,
      ownerToken: 'smoke-owner-token-0123456789abcdef',
    }),
  })
  const wipe = await request(`/api/pastes/${wiper.body.id}`, {
    method: 'DELETE',
    body: JSON.stringify({ ownerToken: 'smoke-owner-token-0123456789abcdef' }),
  })
  assert(wipe.status === 204, 'remote wipe should succeed')
  const gone = await request(`/api/pastes/${wiper.body.id}`)
  assert(gone.status === 404, 'wiped paste should be gone')
  console.log('  ✓ remote wipe destroys the paste')

  console.log('\n✅ ALL SMOKE TESTS PASSED')
}

main().catch((err) => {
  console.error(err)
  console.error('\nHint: is the API running? `npm run dev` — and did you run the SQL migration?')
  process.exit(1)
})