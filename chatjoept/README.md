# ChatJoePT 🤖

> **The Official ChatGPT-Style Assistant of the Joe Universe (`Joelib`)**  
> Powered by Cloudflare Workers & Cloudflare D1 with React Router v8, Tailwind CSS, and KaTeX.  
> **Domain**: [https://chat.joe-univer.se](https://chat.joe-univer.se)

---

## 🌟 Highlights & Features

- **ChatGPT-Fidelity User Experience**:
  - Dark-mode interface with collapsible sidebar, search, model selector (`JPT-6.1 Sol`, `JPT-6.1 Terra`), and copy buttons.
  - Streaming Server-Sent Events (SSE) responses with token-by-token rendering and collapsible reasoning disclosures (`<think>...</think>`).
  - Mathematical formula rendering with KaTeX (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`).
  - Subtle, natural Joeglish persona with zero forced suffix mangling or intrusive trivia spam.

- **On-Demand Knowledge & Live Web Tools**:
  - **Joelib Reference Tools (`search_joelib`, `read_joelib_document`)**: Fetches exact repository files from `N0TD3R3K/Joelib` on demand (Joeriodic Table, Joekemons, JoeLang, J++, etc.) without polluting normal conversation prompts.
  - **DeepSeek Search & Fetch APIs (`deepseek_search`, `deepseek_fetch`)**: Enabled when Web Search is toggled on, performing live search via DeepSeek `POST /v1/tools/search` and page reading via `POST /v1/tools/fetch`.

- **Cloudflare D1 Relational Persistence & Storage Credit Accounting**:
  - Relational SQLite schema (`users`, `dialogs`, `shared_links`, `usage_records`) stored in Cloudflare D1 (`CHATJOEPT_DB`).
  - **16,384 Storage Credit Pool** (no 200-dialog cap):
    - Each visible chat (`is_hidden = 0`): `256 + ceil(bytes / 1024)` credits.
    - Each immutable shared snapshot (`is_hidden = 1`): `32 + ceil(bytes / 1024)` credits (rounded up individually).
  - **Soft Limit (`16,000`)**: Blocks new chats, sending new prompts, and creating new shared links; in-flight streaming completions may still save up to the hard limit.
  - **Hard Limit (`16,384`)**: Stops excessive live output and truncates saved content cleanly so stored credits never exceed `16,384`.
  - **Memory Usage Stacked Bar**: Settings displays only clean percentages (`% Used by Chats`, `% Used by Shared Links`, `% Available`) alongside 24h Usage Quota `%`.

- **Immutable Public Shared Snapshots (`/share/:shareId`)**:
  - Sharing creates a frozen hidden snapshot row in `dialogs` (`is_hidden = 1`) referenced by `shared_links`.
  - Subsequent edits or deletions on the source conversation do **not** alter existing shared links.
  - Includes a **Shared Links** management tab inside Settings to open, copy, inspect percentage footprint, or delete shared snapshots individually or all at once to reclaim storage.

- **JoeAuth OIDC Authentication (`https://auth.joe-univer.se`)**:
  - Authorization Code flow with **PKCE (`S256`)**, `state`, `nonce`, and **`Ed25519` JWKS ID token signature verification** (`/.well-known/jwks.json`).
  - Supports confidential client credentials (`JOEAUTH_CLIENT_ID` + `JOEAUTH_CLIENT_SECRET`) with graceful PKCE fallback when `JOEAUTH_CLIENT_SECRET` is omitted.
  - Local-only ChatJoePT session cookie (`chatjoept_session`, HMAC-SHA256) so signing out of ChatJoePT does not terminate your global JoeAuth session.

---

## 🏗️ Architecture

```
chatjoept/
├── migrations/
│   └── 0001_init.sql          # Cloudflare D1 SQLite schema (users, dialogs, shared_links, usage_records)
├── app/
│   ├── components/
│   │   ├── AuthGate.tsx       # JoeAuth sign-in screen & auth_error display
│   │   ├── ChatInput.tsx      # Input dock, attachments, web search toggle, soft-limit guard
│   │   ├── ChatMessage.tsx    # Markdown/KaTeX cards, reasoning toggle, tool badges
│   │   ├── MarkdownRenderer.tsx
│   │   ├── ModelSelector.tsx  # JPT-6.1 Sol / JPT-6.1 Terra
│   │   ├── SettingsModal.tsx  # General, Account & Memory stacked bar, Shared Links manager, About
│   │   ├── ShareModal.tsx     # Immutable snapshot link creator
│   │   └── Sidebar.tsx        # Conversation list, search, JoeAuth avatar/name, soft-limit guard
│   ├── routes/
│   │   ├── home.tsx           # Primary chat interface & SSE stream consumer
│   │   ├── auth.login.ts      # JoeAuth PKCE S256 redirect generator
│   │   ├── auth.callback.ts   # Token exchange, JWKS Ed25519 verification, user upsert
│   │   ├── api.auth.logout.ts # Local ChatJoePT cookie clear
│   │   ├── api.chat.ts        # Multi-round tool loop + SSE streaming + hard-limit byte guard
│   │   ├── api.dialogs.ts     # Dialog CRUD + soft/hard limit enforcement
│   │   ├── api.dialogs.share.ts # Immutable snapshot share CRUD
│   │   ├── api.user.quotas.ts # Aggregated percentage quotas
│   │   └── share.$shareId.tsx # Public unauthenticated frozen snapshot viewer
│   ├── utils/
│   │   ├── auth.server.ts     # JoeAuth OIDC + PKCE + Ed25519 JWKS + HMAC session cookies
│   │   ├── db.server.ts       # D1 queries, credit math, hard-limit truncation, share snapshots
│   │   ├── joeglish.ts        # Refined Joeglish system prompt
│   │   └── tools.server.ts    # DeepSeek Search/Fetch & N0TD3R3K/Joelib lookup tools
│   └── types/chat.ts
├── workers/
│   └── app.ts                 # Cloudflare Worker entrypoint
└── wrangler.jsonc             # D1 binding (CHATJOEPT_DB) & runtime variables
```

---

## ⚙️ Environment Variables & Cloudflare Bindings

### 1. Cloudflare D1 Binding (`wrangler.jsonc`)
```jsonc
"d1_databases": [
  {
    "binding": "CHATJOEPT_DB",
    "database_name": "chatjoept-db",
    "database_id": "1ca84d39-9bb3-4c78-98c2-e7e506310955",
    "migrations_dir": "migrations"
  }
]
```

### 2. Runtime Variables (`wrangler.jsonc` / Secrets)

| Variable | Type | Description |
|---|---|---|
| `JOEAUTH_ISSUER` | Var | JoeAuth issuer URL (`https://auth.joe-univer.se`) |
| `LLM_API_URL` | Var | DeepSeek base URL (`https://api.deepseek.com`) |
| `LLM_BASE_MODEL` | Var | Upstream base model (`deepseek-chat`) |
| `JOEAUTH_CLIENT_ID` | Var / Secret | OAuth client ID registered in JoeAuth |
| `JOEAUTH_CLIENT_SECRET` | Secret | Confidential client secret from JoeAuth |
| `LLM_API_KEY` | Secret | DeepSeek API key (used for completions + `/v1/tools/search` & `/v1/tools/fetch`) |
| `SESSION_SECRET` | Secret | Cryptographic secret for signing `chatjoept_session` and OAuth PKCE cookies |

#### Registering ChatJoePT in JoeAuth
When registering the OAuth application in [JoeAuth](https://auth.joe-univer.se):
- **Redirect URIs**:
  - `https://chat.joe-univer.se/auth/callback`
  - `https://chatjoept.waynexu2020.workers.dev/auth/callback` (optional during staging)
  - `http://127.0.0.1:8787/auth/callback` (for local development)
- **Scopes**: `openid profile email`

Configure Cloudflare secrets with Wrangler:
```bash
npx wrangler secret put JOEAUTH_CLIENT_ID
npx wrangler secret put JOEAUTH_CLIENT_SECRET
npx wrangler secret put LLM_API_KEY
npx wrangler secret put SESSION_SECRET
```

For local development, place these keys in `.dev.vars` (git-ignored).

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Apply D1 Migrations
```bash
# Local D1 SQLite database
npx wrangler d1 migrations apply chatjoept-db --local

# Remote Cloudflare D1 database
npx wrangler d1 migrations apply chatjoept-db --remote
```

### 3. Type Checking & Build
```bash
npm run typecheck
npm run build
```

### 4. Local Development with D1
```bash
npm run dev:wrangler
```

### 5. Deploy to Cloudflare Workers
```bash
npm run deploy
```

---

## 📜 License & Attribution

Part of the **[Joelib](https://github.com/N0TD3R3K/Joelib)** project.
