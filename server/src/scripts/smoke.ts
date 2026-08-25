import { createHash } from 'node:crypto'

/**
 * Live smoke test against a running Locknote API. It uses only fresh synthetic
 * ciphertext and ephemeral capabilities; no human secret or deployment
 * credential is required.
 *
 * Requires migrations 005 and 007 before this release is deployed.
 * Usage: API_URL=https://lock-note-sigma.vercel.app npm run test:live -w server
 */

const BASE = process.env.API_URL ?? 'http://localhost:3001'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SMOKE FAIL: ${message}`)
}

function b64url(bytes: Buffer): string {
  return bytes.toString('base64url')
}

function proofHash(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

const OWNER = b64url(Buffer.alloc(24, 0x31))
const PROOF = b64url(Buffer.alloc(32, 0x32))
const CAPABILITY = b64url(Buffer.alloc(32, 0x33))
const REPLY_CAPABILITY = b64url(Buffer.alloc(32, 0x34))

function createBody(overrides: Record<string, unknown> = {}) {
  return {
    ciphertext: b64url(Buffer.from('synthetic-smoke-ciphertext')),
    salt: b64url(Buffer.alloc(32, 0x07)),
    iv: b64url(Buffer.alloc(12, 0x09)),
    iterations: 0,
    kdf: 'hkdf',
    alg: 'aes-256-gcm',
    format: 'text',
    language: null,
    burnAfterRead: false,
    deadSwitchDays: null,
    ttlSeconds: 300,
    ownerToken: OWNER,
    receiptProofHash: proofHash(PROOF),
    ...overrides,
  }
}

async function request(path: string, init?: RequestInit): Promise<{ status: number; body: unknown; headers: Headers }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* binary or empty response */
  }
  return { status: res.status, body, headers: res.headers }
}

async function binary(path: string, body: unknown): Promise<{ status: number; bytes: Uint8Array; headers: Headers }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, bytes: new Uint8Array(await res.arrayBuffer()), headers: res.headers }
}

async function main(): Promise<void> {
  console.log(`Locknote live smoke test → ${BASE}`)

  const health = await request('/api/health')
  assert(health.status === 200, `health should be 200, got ${health.status}`)
  const healthBody = health.body as { store?: string; storeDetail?: string }
  console.log(`  ✓ health ok (store=${healthBody.store}, detail=${healthBody.storeDetail})`)

  const created = await request('/api/pastes', { method: 'POST', body: JSON.stringify(createBody({ burnAfterRead: true })) })
  assert(created.status === 201, `create should be 201, got ${created.status}`)
  const createdBody = created.body as { id: string }
  const id = createdBody.id
  console.log(`  ✓ created v2 proof-enabled paste ${id}`)

  const meta = await request(`/api/pastes/${id}`)
  assert(meta.status === 200, `metadata should be 200, got ${meta.status}`)
  const metaBody = meta.body as Record<string, unknown>
  assert(metaBody.status === 'alive', `metadata status should be alive, got ${String(metaBody.status)}`)
  assert(!('ciphertext' in metaBody) && !('ownerToken' in metaBody) && !('storagePath' in metaBody), 'metadata must expose no ciphertext, owner capability, or storage path')
  console.log('  ✓ metadata is safe')

  const preview = await request(`/api/pastes/${id}/consume`, { method: 'POST', body: JSON.stringify({ ownerToken: OWNER }) })
  assert(preview.status === 200 && (preview.body as { preview?: boolean }).preview === true, 'owner preview should succeed')
  console.log('  ✓ owner preview delivered without burn')

  const consume = await request(`/api/pastes/${id}/consume`, { method: 'POST', body: '{}' })
  assert(consume.status === 200 && (consume.body as { preview?: boolean }).preview === false, 'real consume should succeed')
  const acknowledged = await request(`/api/pastes/${id}/acknowledge`, { method: 'POST', body: JSON.stringify({ proof: PROOF }) })
  assert(acknowledged.status === 201, 'verified proof acknowledgement should succeed')
  const replay = await request(`/api/pastes/${id}/acknowledge`, { method: 'POST', body: JSON.stringify({ proof: PROOF }) })
  assert(replay.status === 404, 'proof replay must be rejected')
  console.log('  ✓ burn paste consumed and cryptographically acknowledged once')

  const second = await request(`/api/pastes/${id}/consume`, { method: 'POST', body: '{}' })
  assert(second.status === 410 && (second.body as { status?: string }).status === 'burned', 'second consume must be rejected as burned')

  const receipt = await request(`/api/pastes/${id}/receipt`, { method: 'POST', body: JSON.stringify({ ownerToken: OWNER }) })
  const receiptBody = receipt.body as { viewCount?: number; receiptAcknowledgedAt?: number | null }
  assert(receipt.status === 200 && receiptBody.viewCount === 1 && Boolean(receiptBody.receiptAcknowledgedAt), 'receipt must show one verified acknowledgement')
  console.log('  ✓ owner receipt reflects one verified encrypted-envelope open')

  const fileCreated = await request('/api/pastes', {
    method: 'POST',
    body: JSON.stringify(createBody({
      format: 'file',
      file: { storagePayload: Buffer.alloc(26).toString('base64'), size: 10, fileIv: b64url(Buffer.alloc(12, 0x0a)) },
    })),
  })
  assert(fileCreated.status === 201, 'file paste should be created')
  const fileId = (fileCreated.body as { id: string }).id
  const fileConsume = await request(`/api/pastes/${fileId}/consume`, { method: 'POST', body: '{}' })
  const fileLease = (fileConsume.body as { fileLease?: { token?: string } }).fileLease
  assert(fileConsume.status === 200 && fileLease?.token, 'file consume should issue a private lease')
  assert(!('storagePath' in (fileConsume.body as Record<string, unknown>)), 'file consume must not expose storage path')
  const downloaded = await binary(`/api/pastes/${fileId}/file`, { token: fileLease.token })
  assert(downloaded.status === 200 && downloaded.bytes.byteLength === 26 && downloaded.headers.get('cache-control')?.includes('no-store'), 'private file lease should deliver ciphertext once')
  const fileReplay = await request(`/api/pastes/${fileId}/file`, { method: 'POST', body: JSON.stringify({ token: fileLease.token }) })
  assert(fileReplay.status === 404, 'file lease replay must be rejected')
  console.log('  ✓ private encrypted file lease is one-use and pathless')

  const guardianCreated = await request('/api/pastes', {
    method: 'POST',
    body: JSON.stringify(createBody({ guardian: { threshold: 2, total: 3, verifier: proofHash(CAPABILITY) } })),
  })
  assert(guardianCreated.status === 201, 'guardian-enabled paste should be created')
  const guardianId = (guardianCreated.body as { id: string }).id
  const guardianWipe = await request(`/api/pastes/${guardianId}/guardian-wipe`, { method: 'POST', body: JSON.stringify({ capability: CAPABILITY }) })
  assert(guardianWipe.status === 204, 'guardian verifier-matched wipe should succeed')
  assert((await request(`/api/pastes/${guardianId}`)).status === 404, 'guardian-wiped paste should be gone')
  console.log('  ✓ Guardian Wipe revokes a verifier-matched server copy')

  const replyCreated = await request('/api/pastes', {
    method: 'POST',
    body: JSON.stringify(createBody({ replies: { verifier: proofHash(REPLY_CAPABILITY) } })),
  })
  assert(replyCreated.status === 201, 'reply-enabled paste should be created')
  const replyId = (replyCreated.body as { id: string }).id
  const replyEnvelope = { capability: REPLY_CAPABILITY, ciphertext: b64url(Buffer.from('synthetic-encrypted-reply')), iv: b64url(Buffer.alloc(12, 0x0b)) }
  const rejectedReply = await request(`/api/pastes/${replyId}/replies`, { method: 'POST', body: JSON.stringify({ ...replyEnvelope, capability: PROOF }) })
  assert(rejectedReply.status === 404, 'wrong reply capability must be rejected')
  const acceptedReply = await request(`/api/pastes/${replyId}/replies`, { method: 'POST', body: JSON.stringify(replyEnvelope) })
  assert(acceptedReply.status === 201, 'verifier-matched opaque reply should be accepted')
  const ownerReplies = await request(`/api/pastes/${replyId}/replies/owner`, { method: 'POST', body: JSON.stringify({ ownerToken: OWNER }) })
  const ownerReplyBody = ownerReplies.body as { replies?: Array<{ ciphertext?: string }> }
  assert(ownerReplies.status === 200 && ownerReplies.headers.get('cache-control')?.includes('no-store') && ownerReplyBody.replies?.length === 1, 'owner should retrieve one no-store opaque reply')
  assert(ownerReplyBody.replies?.[0]?.ciphertext === replyEnvelope.ciphertext, 'owner reply retrieval should preserve ciphertext only')
  const replyWipe = await request(`/api/pastes/${replyId}`, { method: 'DELETE', body: JSON.stringify({ ownerToken: OWNER }) })
  assert(replyWipe.status === 204 && (await request(`/api/pastes/${replyId}/replies/owner`, { method: 'POST', body: JSON.stringify({ ownerToken: OWNER }) })).status === 404, 'owner wipe must remove reply access')
  console.log('  ✓ opaque encrypted reply capability, owner access, and wipe cleanup verified')

  const draft = await request('/api/drafts', { method: 'POST', body: JSON.stringify({ content: 'synthetic draft' }) })
  assert(draft.status === 201, 'draft create should succeed')
  const draftBody = draft.body as { roomId: string; ownerToken: string }
  const sealed = await request(`/api/drafts/${draftBody.roomId}/seal`, { method: 'DELETE', body: JSON.stringify({ ownerToken: draftBody.ownerToken }) })
  assert(sealed.status === 204, 'draft seal should succeed')
  console.log('  ✓ draft room created and sealed')

  const wiper = await request('/api/pastes', { method: 'POST', body: JSON.stringify(createBody({ ttlSeconds: 0 })) })
  assert(wiper.status === 201, 'wipe test paste should be created')
  const wipeId = (wiper.body as { id: string }).id
  const wipe = await request(`/api/pastes/${wipeId}`, { method: 'DELETE', body: JSON.stringify({ ownerToken: OWNER }) })
  assert(wipe.status === 204 && (await request(`/api/pastes/${wipeId}`)).status === 404, 'owner remote wipe should succeed')
  console.log('  ✓ owner remote wipe destroys the paste')

  console.log('\n✅ ALL SMOKE TESTS PASSED')
}

main().catch((error) => {
  console.error(error)
  console.error('\nHint: is the API running, have migrations 005 and 007 been applied, and is the deployment READY?')
  process.exit(1)
})
