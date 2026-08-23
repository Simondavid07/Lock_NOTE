# 🛡️ Locknote Security & Threat Model

Locknote adheres to strict cryptographic principles to ensure zero-knowledge data privacy.

---

## 1. Cryptographic Primitive Specs

| Layer | Algorithm / Standard | Specification |
|---|---|---|
| **Symmetric Cipher** | AES-256-GCM | 256-bit key, 96-bit random IV per payload, 128-bit authentication tag |
| **URL Key Derivation** | HKDF-SHA256 | `PROTOCOL = "locknote/v1"`, 256-bit output key |
| **Passphrase KDF** | PBKDF2-HMAC-SHA256 | 600,000 iterations, 256-bit salt |
| **AAD Binding** | Authenticated Additional Data | `${pasteId}\|locknote/v1` bound to GCM tag |
| **Seal Fingerprint** | FNV-1a Hashing | 4-word mnemonic + color glyph derived from master secret |

---

## 2. Threat Model Analysis

### Threat Scenario 1: Malicious or Compromised Server / Database Leak
- **Risk**: An attacker gains full root access to the database or storage bucket.
- **Mitigation**: The database stores **only ciphertext, public salts, and public IVs**. Without the URL fragment `#k=...` (which never reaches HTTP headers or logs), recovery of plaintext is mathematically infeasible.

### Threat Scenario 2: Ciphertext Swap Attack
- **Risk**: A compromised server attempts to swap ciphertext from Paste A into Paste B to trick a recipient.
- **Mitigation**: AES-256-GCM uses **Authenticated Additional Data (AAD)** containing the Paste ID (`${pasteId}|locknote/v1`). Attempting to decrypt swapped ciphertext causes GCM authentication failure (`IntegrityError`).

### Threat Scenario 3: Wrong Passphrase Brute-Force
- **Risk**: An attacker guesses passphrases trying to burn a burn-after-read paste.
- **Mitigation**: Decryption happens strictly in the client's browser. Failed decryption throws `IntegrityError` locally and **never** sends a view report to the server. The paste remains unburned until a valid decryption succeeds.

### Threat Scenario 4: Shoulder Surfing / Out-of-Band Substitution
- **Risk**: An intermediary modifies a link sent over chat/email.
- **Mitigation**: Locknote generates a **Seal Fingerprint** (4-word mnemonic + color glyph). Senders can verify the fingerprint with recipients over another channel (voice/signal).

---

## 3. Server Hardening Measures

- **No Content Logging**: Request logs strictly exclude response bodies and payloads.
- **Zod Strict Validation**: All REST routes sanitize inputs with Zod schemas.
- **Strict Size Limits**: Text payloads capped at ~1 MB; file payloads capped at 5 MB.
- **Rate Limiting**: Sliding window per-IP buckets on paste creation (20/min) and consumption (120/min).
- **Constant-Time Comparison**: Owner capability tokens use `crypto.timingSafeEqual`.
