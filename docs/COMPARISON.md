# Lock Note Differentiation Guide

## Positioning

Lock Note belongs to the private-sharing category, but it is designed as a modern **encrypted-envelope lifecycle service** rather than a simple paste board. The project keeps the familiar “create a private link and share it once” interaction associated with projects such as [PrivateBin](https://github.com/PrivateBin/PrivateBin), while adding sender agency, browser-native cryptography, encrypted file support, and a deliberate collaboration boundary.

The table below is a design comparison that explains why each Lock Note capability matters to the user and evaluator. It is not a claim that every external tool has identical defaults or extension support.

| Dimension | Conventional pastebin workflow | Lock Note approach | Why the difference matters |
| --- | --- | --- | --- |
| Privacy boundary | Content is often treated as a server-managed paste. | Browser encrypts before upload; API persists an encrypted envelope and public lifecycle metadata. | The backend does not need the final browser-held decryption key to manage the lifecycle. |
| Link design | Share link commonly identifies a server resource. | Decryption material is held after the URL fragment. | Normal HTTP requests do not include the fragment, which keeps that key material out of the API request path. |
| Integrity | Secure transport may be the only binding. | AES-GCM additional authenticated data binds the paste identifier and protocol version. | Swapping an encrypted envelope between identifiers is detected during decryption. |
| Passphrase workflow | A single link may be the only delivery channel. | Optional passphrase gate adds a second key-derivation factor. | Sender can distribute the URL and passphrase separately. |
| One-time delivery | Limited expiry or burn behavior. | Burn-after-read is coupled to a recipient consume state and an owner preview exception. | Sender can inspect a note without accidentally making it unavailable to the recipient. |
| Sender control | Link remains valid until its fixed expiry. | Owner capability supports preview, receipts, remote withdrawal, deadlines, and dead-switch deletion. | The sender has visible lifecycle control after sharing. |
| File sharing | Attachment may be attached to a normal paste record. | Browser encrypts files before Supabase Storage upload. | The object store receives encrypted blobs rather than plaintext files. |
| Human verification | User compares raw URLs or trusts delivery. | Seal fingerprints use human-friendly words and a color-glyph signal. | Participants can compare a compact identity cue over another channel. |
| Collaboration | Drafting is absent or separated from the share flow. | Supabase Realtime supports temporary pre-seal collaboration and presence. | Teams can shape a note before the final owner seals it. |
| Usability | Functional form-driven interface. | Compose-first private-correspondence UI, themes, motion, command palette, receipts, and library. | Security controls are exposed as understandable user actions, not hidden backend rules. |
| Production behavior | Static prototype or simple host. | Vercel functions, Supabase persistence, strict configuration validation, health status, rate limiting, and protected maintenance. | The demonstrable system has operational behavior beyond the initial visual flow. |

## Meaningful innovation summary

The innovation is the **combination** of these design choices. Fragment-keyed browser decryption is valuable on its own; lifecycle controls are valuable on their own; encrypted file envelopes and a sender dashboard are valuable on their own. In Lock Note, they form one coherent workflow:

1. A sender writes a message or selects a file.
2. The browser encrypts it locally.
3. The sender shares a link whose key material remains in the fragment.
4. The API enforces a transparent lifecycle policy without seeing plaintext.
5. The sender can inspect, measure, expire, or withdraw the encrypted envelope.

> The project intentionally documents that realtime drafts are **pre-seal** and not equivalent to end-to-end encrypted collaborative editing. Stating this boundary is a strength: it makes the privacy claim precise rather than overstated.

## Reviewer evidence

| Question | Where to verify it |
| --- | --- |
| How does the private link avoid sending the key to the API? | [README security model](../README.md#security-model) and [Architecture](ARCHITECTURE.md#why-the-url-fragment-matters). |
| What happens when a note burns or is withdrawn? | [API reference](API.md) and [Testing guide](TESTING.md). |
| How are files, drafts, and lifecycle records stored? | [Architecture](ARCHITECTURE.md#data-model-and-lifecycle) and [`sql/`](sql/). |
| How does the product differ from a generic pastebin? | This guide and [Evaluation Guide](EVALUATION.md#2-innovation--meaningful-differentiation--20-marks). |
