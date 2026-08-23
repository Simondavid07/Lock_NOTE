import request from 'supertest'
import type { Express } from 'express'
import { createApp } from '../app.js'
import { MemoryStore } from '../memory-store.js'
import { MemoryFileStore } from '../blob-store.js'
import { MemoryAuditSink } from '../audit.js'

export interface TestContext {
  app: Express
  audit: MemoryAuditSink
  store: MemoryStore
  /** Advance the fake clock used by the memory store. */
  advance(ms: number): void
}

export function makeTestApp(): TestContext {
  let fakeNow = Date.now()
  const store = new MemoryStore(() => fakeNow)
  const audit = new MemoryAuditSink()
  const app = createApp({
    store,
    drafts: store,
    files: new MemoryFileStore(),
    audit,
    corsOrigins: ['http://localhost:5173'],
  })
  return {
    app,
    audit,
    store,
    advance: (ms) => {
      fakeNow += ms
    },
  }
}

export const api = request

/** Build a valid create payload for the API tests. */
export function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    ciphertext: 'bXktY2lwaGVydGV4dC1wYXlsb2FkLW9mLXplcm8ta25vd2xlZGdl',
    salt: 'c2FsdC1ieXRlcy1mb3Ita2RmLXNhbHQtb25seQ',
    iv: 'aXYtZGF0YS1mb3ItYWVzLWdj',
    iterations: 0,
    kdf: 'hkdf',
    alg: 'aes-256-gcm',
    format: 'text',
    language: null,
    burnAfterRead: false,
    deadSwitchDays: null,
    ttlSeconds: 0,
    ownerToken: 'owner-token-for-testing-purposes-123456',
    ...overrides,
  }
}