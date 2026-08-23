# 📡 Locknote API Reference

Base Endpoint: `/api`

All JSON requests require `Content-Type: application/json`.

---

## 1. Pastes Endpoints

### `POST /api/pastes`
Create a new sealed secret.

**Request Body:**
```json
{
  "id": "optional_client_generated_id",
  "ciphertext": "base64url_aes_gcm_ciphertext",
  "salt": "base64url_kdf_salt",
  "iv": "base64url_iv",
  "iterations": 0,
  "kdf": "hkdf",
  "alg": "aes-256-gcm",
  "format": "text",
  "language": null,
  "burnAfterRead": false,
  "deadSwitchDays": null,
  "ttlSeconds": 86400,
  "ownerToken": "owner_capability_token_24_bytes"
}
```

**Response (201 Created):**
```json
{
  "id": "aB3_k9xQ12A",
  "status": "alive",
  "format": "text",
  "createdAt": 1787222992000,
  "expiresAt": 1787309392000,
  "ownerToken": "owner_capability_token_24_bytes"
}
```

---

### `GET /api/pastes/:id`
Fetch public paste metadata prior to decryption.

**Response (200 OK):**
```json
{
  "id": "aB3_k9xQ12A",
  "status": "alive",
  "format": "text",
  "language": null,
  "burnAfterRead": false,
  "deadSwitchDays": null,
  "hasFile": false,
  "createdAt": 1787222992000,
  "expiresAt": 1787309392000,
  "requiresPassphrase": false,
  "kdf": "hkdf",
  "iterations": 0,
  "salt": "...",
  "iv": "..."
}
```

---

### `POST /api/pastes/:id/consume`
Fetch the encrypted payload to decrypt locally. If `burnAfterRead` is enabled and no `ownerToken` is provided, this burns the paste.

**Request Body:**
```json
{
  "ownerToken": "optional_owner_token"
}
```

**Response (200 OK):**
```json
{
  "id": "aB3_k9xQ12A",
  "status": "alive",
  "preview": false,
  "format": "text",
  "ciphertext": "...",
  "salt": "...",
  "iv": "..."
}
```

---

### `POST /api/pastes/:id/receipt`
Fetch view receipt (Owner capability required).

**Request Body:**
```json
{
  "ownerToken": "owner_capability_token_24_bytes"
}
```

**Response (200 OK):**
```json
{
  "id": "aB3_k9xQ12A",
  "createdAt": 1787222992000,
  "viewCount": 3,
  "firstViewedAt": 1787223000000,
  "lastViewedAt": 1787223500000,
  "status": "alive"
}
```

---

### `DELETE /api/pastes/:id`
Remotely wipe a paste (Owner capability required).

**Request Body:**
```json
{
  "ownerToken": "owner_capability_token_24_bytes"
}
```

**Response (204 No Content)**

---

## 2. Drafts Endpoints (Sealed Rooms)

- `POST /api/drafts` — Create a room
- `GET /api/drafts/:roomId` — Get draft content
- `PUT /api/drafts/:roomId` — Update draft content
- `DELETE /api/drafts/:roomId/seal` — Seal and delete room

---

## 3. System Health

- `GET /api/health` — Returns status of backend store connection & uptime.
