import type { PasteFormat, KdfKind } from './crypto'

export type PasteStatus = 'alive' | 'burned' | 'expired' | 'dead' | 'gone'

export interface PasteMetadata {
  id: string
  status: PasteStatus
  format: PasteFormat
  language: string | null
  burnAfterRead: boolean
  deadSwitchDays: number | null
  hasFile: boolean
  storagePath: string | null
  createdAt: number
  expiresAt: number | null
  requiresPassphrase: boolean
  kdf: KdfKind
  iterations: number
  salt: string
  iv: string
}

export interface ConsumeResult {
  id: string
  status: 'alive'
  preview: boolean
  format: PasteFormat
  language: string | null
  alg: string
  kdf: KdfKind
  iterations: number
  salt: string
  iv: string
  ciphertext: string
  storagePath: string | null
  fileMeta: { size: number; iv: string } | null
  expiresAt: number | null
  burnAfterRead: boolean
}

export interface Receipt {
  id: string
  createdAt: number
  viewCount: number
  firstViewedAt: number | null
  lastViewedAt: number | null
  status: PasteStatus
}

export interface CreatePasteRequest {
  /** Client-generated id — bound into the AES-GCM AAD before encryption. */
  id?: string
  ciphertext: string
  salt: string
  iv: string
  iterations: number
  kdf: KdfKind
  alg: string
  format: PasteFormat
  language: string | null
  burnAfterRead: boolean
  deadSwitchDays: number | null
  ttlSeconds: number
  ownerToken: string
  file?: { storagePayload: string; size: number; fileIv: string }
}

export interface CreatePasteResponse {
  id: string
  status: 'alive'
  format: PasteFormat
  createdAt: number
  expiresAt: number | null
  ownerToken: string
}

const API_BASE = import.meta.env.VITE_API_BASE ?? ''

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusKey?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    throw new ApiError('Could not reach the Locknote service.', 0)
  }
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const key = (body as { error?: string } | null)?.error
    throw new ApiError(describeError(res.status, key), res.status, key)
  }
  return body as T
}

function describeError(status: number, key?: string): string {
  if (key === 'not_found' || key === 'not_available') return 'This paste no longer exists.'
  if (key === 'forbidden') return 'You are not authorized to do that.'
  if (status === 429) return 'Too many requests — please slow down.'
  return 'Something went wrong. Please try again.'
}

export const api = {
  createPaste: (body: CreatePasteRequest) => request<CreatePasteResponse>('/api/pastes', { method: 'POST', body: JSON.stringify(body) }),
  getMetadata: (id: string) => request<PasteMetadata>(`/api/pastes/${encodeURIComponent(id)}`),
  consume: (id: string, ownerToken?: string) =>
    request<ConsumeResult>(`/api/pastes/${encodeURIComponent(id)}/consume`, { method: 'POST', body: JSON.stringify(ownerToken ? { ownerToken } : {}) }),
  viewed: (id: string) => request<{ viewCount: number }>(`/api/pastes/${encodeURIComponent(id)}/viewed`, { method: 'POST', body: '{}' }),
  receipt: (id: string, ownerToken: string) =>
    request<Receipt>(`/api/pastes/${encodeURIComponent(id)}/receipt`, { method: 'POST', body: JSON.stringify({ ownerToken }) }),
  destroy: (id: string, ownerToken: string) =>
    request<undefined>(`/api/pastes/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ ownerToken }) }),
  status: (id: string) => request<{ id: string; status: PasteStatus }>(`/api/pastes/${encodeURIComponent(id)}/status`),
  createDraft: (content?: string) => request<{ roomId: string; ownerToken: string; createdAt: number }>('/api/drafts', { method: 'POST', body: JSON.stringify(content !== undefined ? { content } : {}) }),
  getDraft: (roomId: string) => request<{ roomId: string; content: string; updatedAt: number }>(`/api/drafts/${encodeURIComponent(roomId)}`),
  updateDraft: (roomId: string, content: string) =>
    request<{ roomId: string; updatedAt: number }>(`/api/drafts/${encodeURIComponent(roomId)}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  sealDraft: (roomId: string, ownerToken: string) =>
    request<undefined>(`/api/drafts/${encodeURIComponent(roomId)}/seal`, { method: 'DELETE', body: JSON.stringify({ ownerToken }) }),
  health: () => request<{ ok: boolean; store: string; storeDetail: string | null; uptimeSeconds: number }>('/api/health'),
}