# Lock Note API Reference

Base endpoint: `/api`. All JSON requests require `Content-Type: application/json`. The API accepts **ciphertext, public cryptographic parameters, and hash-only verifiers**. It never accepts a note key, a raw receipt proof for storage, a guardian share, or plaintext.

## Paste creation

### `POST /api/pastes`

Creates a sealed encrypted envelope. New records use fixed crypto policy: a 32-byte base64url salt, 12-byte base64url IV, HKDF with `iterations: 0`, or PBKDF2-SHA256 with `iterations: 600000`.

```json
{
  "id": "optional_client_generated_id",
  "ciphertext": "base64url_aes_gcm_ciphertext",
  "salt": "32_byte_base64url_salt",
  "iv": "12_byte_base64url_iv",
  "iterations": 0,
  "kdf": "hkdf",
  "alg": "aes-256-gcm",
  "format": "text",
  "language": null,
  "burnAfterRead": false,
  "deadSwitchDays": null,
  "ttlSeconds": 86400,
  "ownerToken": "24_byte_base64url_owner_capability",
  "receiptProofHash": "sha256_base64url_of_encrypted_receipt_proof",
  "replies": {
    "verifier": "sha256_base64url_of_encrypted_reply_capability"
  },
  "guardian": {
    "threshold": 2,
    "total": 3,
    "verifier": "sha256_base64url_of_guardian_wipe_capability"
  }
}
```

`guardian` is optional. Its verifier represents a browser-generated revocation capability, **not** a note key. `replies` is optional and may not be combined with `burnAfterRead: true`; its raw 32-byte capability remains inside authenticated content ciphertext and never reaches the API at creation. File records additionally supply canonical base64 ciphertext with an AES-GCM-tag-adjusted size and a separate 12-byte file IV.

The response returns the created ID, lifecycle state, timestamps, and the submitted owner capability. The owner capability is intentionally returned once; it must not be logged or stored in an account profile.

## Public metadata and consume

### `GET /api/pastes/:id`

Returns pre-decryption metadata. It never returns ciphertext, owner capability, receipt proof/verifier, Guardian Wipe verifier, lease, or storage path.

### `POST /api/pastes/:id/consume`

Returns the encrypted envelope. A non-owner consume burns a burn-after-read record atomically. Owner preview uses the owner capability and remains non-destructive.

For a file, the response contains only:

```json
{
  "fileMeta": { "size": 123, "iv": "12_byte_base64url_file_iv" },
  "fileLease": { "token": "24_byte_base64url_token", "expiresAt": 1787309392000 }
}
```

`storagePath` is never returned. The lease is short-lived (60 seconds), valid once, and is not a decryption key.

### `POST /api/pastes/:id/file`

Redeems a consumed file lease and streams encrypted file bytes with `Cache-Control: no-store`.

```json
{ "token": "24_byte_base64url_file_lease" }
```

A replay, expiration, withdrawal, or unknown token returns `404`; the endpoint does not distinguish these cases.

## Verified delivery receipt

### `POST /api/pastes/:id/acknowledge`

A recipient browser calls this only after it decrypts a version-two envelope and recovers its random receipt proof.

```json
{ "proof": "32_byte_base64url_raw_proof" }
```

The API hashes the proof and atomically matches it against the stored verifier. The first correct acknowledgement returns `201`; guessed, legacy, and replayed values return `404` without changing receipt state or dead-switch activity.

### `POST /api/pastes/:id/receipt`

The owner retrieves verified lifecycle evidence with its owner capability.

```json
{ "ownerToken": "24_byte_base64url_owner_capability" }
```

The result reports `viewCount`, first/last verified timestamps, and `receiptAcknowledgedAt`. It proves an encrypted-envelope acknowledgement, not human comprehension.

## Encrypted recipient replies

### `POST /api/pastes/:id/replies`

A recipient browser calls this only after local envelope decryption reveals the opt-in reply capability. It first encrypts the reply JSON in-browser with the existing content key and reply-specific AAD `${pasteId}|locknote/v1|reply`.

```json
{
  "capability": "32_byte_base64url_raw_reply_capability",
  "ciphertext": "base64url_aes_gcm_reply_ciphertext",
  "iv": "12_byte_base64url_reply_iv"
}
```

The server stores only opaque ciphertext, public IV, server timestamp, and a parent reference. It hashes the submitted capability and uses a locked server-role-only database operation to check the verifier, active parent lifecycle, and 20-reply cap. It returns `201` on success and a non-distinguishing `404` for unavailable parents, disabled replies, exhausted lifecycle, invalid capability, or a full reply limit. Replies never update verified-open timestamps or dead-switch activity.

### `POST /api/pastes/:id/replies/owner`

The sender retrieves opaque reply envelopes using the existing owner capability:

```json
{ "ownerToken": "24_byte_base64url_owner_capability" }
```

The endpoint returns `Cache-Control: no-store` and an ordered reply envelope list only for an active parent and matching owner capability. The sender browser decrypts each reply locally. A reply is voluntary and **does not authenticate the recipient’s identity**; anyone holding the full share link may be able to submit or decrypt a reply.

## Revocation

### `DELETE /api/pastes/:id`

The owner capability deletes the active record, cascades encrypted-reply envelope deletion, and attempts encrypted-file cleanup.

### `POST /api/pastes/:id/guardian-wipe`

A Guardian Wipe quorum reconstructs a separate browser-only capability and submits it here:

```json
{ "capability": "32_byte_base64url_reconstructed_wipe_capability" }
```

The API compares only its SHA-256 verifier and deletes the record on a match. Parent deletion cascades to opaque encrypted replies. It does not receive guardian shares, a delivery link, a note key, or plaintext.

## Drafts and health

| Route | Purpose |
| --- | --- |
| `POST /api/drafts` | Create a temporary pre-seal collaboration room. |
| `GET /api/drafts/:roomId` | Read current draft content. Treat room IDs as capabilities. |
| `PUT /api/drafts/:roomId` | Update temporary draft content. |
| `DELETE /api/drafts/:roomId/seal` | Delete a room using its owner capability after sealing. |
| `GET /api/health` | Read safe store/readiness state, build version, and uptime. |

## Error behavior

The API returns controlled `400` validation responses for malformed crypto envelopes, `403` for invalid owner/guardian capabilities where appropriate, `404` for unavailable file leases or invalid proof acknowledgements, `410` for unavailable lifecycle states, `429` for rate limits, and `503` for unavailable file-delivery initialization. Error responses never echo ciphertext, raw capabilities, or user content.
