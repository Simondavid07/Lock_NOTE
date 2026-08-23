# 🧪 Locknote Testing Strategy

Locknote implements unit, integration, and end-to-end testing suites.

---

## 1. Test Architecture

| Test Level | Scope | Environment | Command |
|---|---|---|---|
| **Client Unit** | Web Crypto roundtrips, PBKDF2 iterations, AAD tamper checks, fingerprinting | Vitest + jsdom | `npm run test -w client` |
| **Server Integration** | REST endpoints, rate limiters, Zod validation | Supertest + MemoryStore | `npm run test -w server` |
| **Live Smoke** | Verification against real Supabase instance | Node.js + Supabase | `npm run test:live -w server` |
| **End-to-End** | Full browser workflow (Create → Share → Decrypt → Burn) | Playwright | `npm run test:e2e` |

---

## 2. Key Test Cases Covered

1. **Crypto Integrity**:
   - Encrypt text with `deriveEncryptionKey` -> decrypt -> matching plaintext.
   - Tamper with 1 byte of ciphertext -> throws `IntegrityError`.
   - Swap paste ID in AAD -> throws `IntegrityError`.
   - Wrong passphrase -> throws `IntegrityError` without sending view event.

2. **Server Lifecycle**:
   - Create paste -> returns 201 + valid ID.
   - Consume burn-after-read paste -> 1st call 200 OK -> 2nd call 410 Gone.
   - Owner preview consume -> call with `ownerToken` does not trigger burn.
   - Remote wipe -> `DELETE /api/pastes/:id` -> subsequent reads return 410.

---

## 3. Running Tests Locally

```bash
# Run all workspace unit/integration tests
npm run test

# Run client tests specifically
npm run test -w client

# Run server tests specifically
npm run test -w server
```
