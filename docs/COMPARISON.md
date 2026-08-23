# ⚖️ Locknote vs. PrivateBin Comparison

| Feature | PrivateBin (Classic) | Locknote (Modern Innovation) |
|---|---|---|
| **Tech Stack** | PHP + HTML/JS (jQuery/Bootstrap) | React 19 + TypeScript 5.8 + Vite 7 + Express 5 |
| **Styling & Theme** | Generic Bootstrap | Custom Pastel Luxury Palette (*Blush*, *Powder*, *Mint*, *Buttercream*, *Lilac*, *Ivory*) + Glassmorphic UI |
| **Cipher Algorithm** | SJCL (Subtle Crypto legacy wrapper) | Native Browser `crypto.subtle` (AES-256-GCM + PBKDF2 600k / HKDF-SHA256) |
| **AAD Binding** | Partial / V2 format | Strict Paste ID + Protocol domain separation bound to GCM tag |
| **Collaboration** | Basic asynchronous drafts | Real-time presence, multi-cursor collaborative rooms via Supabase Realtime |
| **File Secrets** | Inline Base64 attachment | Separately encrypted file blobs streamed into Supabase Storage |
| **Verification** | Raw URL comparison | 4-word mnemonic + color glyph Seal Fingerprints |
| **Dead-Switch** | Not supported | Automatic wipe after $N$ days of visitor silence |
| **UX & Micro-animations**| Static forms | Motion animations, Command Palette (⌘K), PWA support |
