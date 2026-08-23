# 📐 Locknote Architecture

Locknote is designed around a strict **Zero-Knowledge Invariant**: the backend server stores and manages ciphertext blobs and metadata, but never receives, generates, logs, or stores decryption keys.

---

## High-Level System Architecture

```mermaid
flowchart TD
    subgraph Browser ["Browser (React 19 + Vite)"]
        UI["UI Layer / Motion"]
        Crypto["Web Crypto API (AES-256-GCM / PBKDF2 / HKDF)"]
        CM["CodeMirror 6 / Shiki"]
    end

    subgraph Server ["Express 5 API Server (Port 3001)"]
        AuthZ["Zod Validation & Rate Limiter"]
        StoreIf["PasteStore Interface"]
    end

    subgraph Supabase ["Supabase Backend"]
        PG[(Postgres Database)]
        Storage[(Storage Bucket: secrets)]
        Realtime["Realtime Engine (Presence & Cursors)"]
    end

    UI --> Crypto
    Crypto -->|Encrypted Ciphertext Only| AuthZ
    AuthZ --> StoreIf
    StoreIf --> PG
    StoreIf --> Storage
    UI <-->|WebSocket Cursors & Presence| Realtime
```

---

## Zero-Knowledge Encryption Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Sender (Browser)
    participant Server as Express API
    participant DB as Supabase DB
    actor Bob as Recipient (Browser)

    Alice->>Alice: 1. Generate 32-byte Master Secret S
    Alice->>Alice: 2. Derive Key K = HKDF-SHA256(S, Salt) [or PBKDF2 if passphrase]
    Alice->>Alice: 3. C = AES-256-GCM(K, Payload, AAD=ID|locknote/v1)
    Alice->>Server: 4. POST /api/pastes (Ciphertext C, Salt, IV, Metadata)
    Server->>DB: 5. Store Ciphertext & Public Metadata
    Server-->>Alice: 6. Return Paste ID & Owner Token
    Alice->>Bob: 7. Share URL (https://locknote.app/paste/ID#k=S)

    Note over Bob: Hash fragment #k=S is NEVER sent to server over HTTP
    Bob->>Server: 8. GET /api/pastes/ID (Metadata) & POST /consume
    Server-->>Bob: 9. Return Ciphertext C, Salt, IV
    Bob->>Bob: 10. Extract S from #k=S
    Bob->>Bob: 11. Derive Key K and Decrypt C locally
```

---

## Database Schema (Postgres)

### `pastes` Table
- `id`: `text primary key` (Client-generated or server fallback)
- `ciphertext`: `text` (Base64url AES-256-GCM payload)
- `salt`: `text` (Public Base64url KDF salt)
- `iv`: `text` (Public Base64url AES IV)
- `iterations`: `integer` (600,000 for PBKDF2, 0 for HKDF)
- `kdf`: `text` (`hkdf` | `pbkdf2`)
- `alg`: `text` (`aes-256-gcm`)
- `format`: `text` (`text` | `markdown` | `code` | `credentials` | `file`)
- `language`: `text` (Optional syntax language)
- `burn_after_read`: `boolean`
- `dead_switch_days`: `integer`
- `storage_path`: `text` (Path in Supabase Storage for files)
- `file_meta`: `jsonb` (`{ size, iv }`)
- `created_at`: `bigint` (Epoch milliseconds)
- `expires_at`: `bigint` (Epoch milliseconds or null)
- `view_count`: `integer`
- `first_viewed_at`: `bigint`
- `last_viewed_at`: `bigint`
- `owner_token`: `text` (Constant-time compared capability token)
- `burned`: `boolean`

### `drafts` Table (Ephemeral Collaboration)
- `room_id`: `text primary key`
- `content`: `text`
- `created_at`: `bigint`
- `updated_at`: `bigint`
- `owner_token`: `text`

---

## Purge & Cleanup Engine (Janitor)

The server runs an automated background janitor every 60 seconds to purge expired secrets and dead-switch triggered pastes:
1. **Time Expiration**: `expires_at <= current_timestamp`
2. **Dead-Switch Inactivity**: `now - max(last_viewed_at, created_at) > dead_switch_days * 86400000`
3. **Draft Cleanup**: Ephemeral rooms older than 24 hours are removed automatically.
