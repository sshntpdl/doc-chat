# DocChat — AI Document Q&A System

Full-stack AI application: upload PDFs → chat with them → get cited answers.

---

## ARCHITECTURE OVERVIEW

```
╔══════════════════════════════════════════════════════════════════════════╗
║                        CLIENT LAYER                                      ║
║                                                                          ║
║   ┌─────────────────────────┐    ┌─────────────────────────────────┐    ║
║   │   Next.js Web Browser   │    │  React Native (Expo SDK 51)     │    ║
║   │   /apps/web             │    │  /apps/mobile                   │    ║
║   │                         │    │                                 │    ║
║   │  Server Components      │    │  Expo Router v3                 │    ║
║   │  Client Components      │    │  NativeWind v4 (Tailwind→RN)   │    ║
║   │  Tailwind CSS v4        │    │  react-native-sse (EventSource) │    ║
║   │  shadcn/ui              │    │  expo-secure-store (tokens)     │    ║
║   └────────────┬────────────┘    └───────────────┬─────────────────┘    ║
║                │                                 │                       ║
║         ┌──────▼─────────────────────────────────▼──────┐               ║
║         │           /packages (shared workspace)         │               ║
║         │                                                │               ║
║         │  @docchat/types    — AppError, Document,       │               ║
║         │                      ChatMessage, SSEEvent     │               ║
║         │  @docchat/supabase — createBrowserClient()     │               ║
║         │                      createServerClient()      │               ║
║         │  @docchat/stores   — useAuthStore (Zustand)    │               ║
║         │                      useDocumentStore          │               ║
║         │                      useChatStore              │               ║
║         │                      useUIStore                │               ║
║         └──────────────────────────────────────────────-─┘               ║
╚══════════════════════════════════════════════════════════════════════════╝
                    │                           │
         HTTP REST  │                      SSE / REST
       (cookies/JWT)│                   (Authorization: Bearer)
                    │                           │
╔══════════════════▼═══════════════════════════▼═════════════════════════╗
║                  NEXT.JS ROUTE HANDLERS (the backend)                   ║
║                  /apps/web/app/api/**                                   ║
║                                                                         ║
║   POST /api/ingest          ←── multipart/form-data (PDF/MD file)      ║
║   GET  /api/documents       ←── bearer token / cookie                  ║
║   GET  /api/documents/:id   ←── bearer token / cookie                  ║
║   DELETE /api/documents/:id ←── bearer token / cookie                  ║
║   POST /api/chat            ←── JSON body → SSE stream (tokens)        ║
║   GET  /api/chat/history/:id ←── bearer token / cookie                 ║
║   GET  /api/auth/callback   ←── Supabase OAuth redirect                ║
║                                                                         ║
║   ┌────────────────────────────────────────────────────────────────┐    ║
║   │              _lib/ (shared Route Handler utilities)            │    ║
║   │                                                                │    ║
║   │  auth.ts       — getAuthenticatedUser() cookie+header dual     │    ║
║   │  response.ts   — successResponse / errorResponse / SSE stream  │    ║
║   │  ratelimit.ts  — token bucket Map (30/min chat, 10/hr ingest)  │    ║
║   │  langchain.ts  — Groq + HuggingFace singletons, retrieveChunks │    ║
║   └────────────────────────────────────────────────────────────────┘    ║
║                                                                         ║
║   ┌────────────────────── LangChain.js ────────────────────────────┐    ║
║   │                                                                │    ║
║   │  INGEST PIPELINE:                                              │    ║
║   │  File Buffer → pdf-parse/toString → RecursiveCharacterSplitter │    ║
║   │  (chunkSize:800, overlap:150) → HF Embeddings (batch/10) →     │    ║
║   │  pgvector INSERT                                               │    ║
║   │                                                                │    ║
║   │  QUERY PIPELINE:                                               │    ║
║   │  question → embedQuery → match_chunks RPC → buildSystemPrompt  │    ║
║   │  → ChatPromptTemplate → ChatGroq.stream() → SSE tokens →       │    ║
║   │  buildSourceCitations → SSE sources event                      │    ║
║   └────────────────────────────────────────────────────────────────┘    ║
╚═══════════════════╤══════════════════════════════╤═══════════════════════╝
                    │                              │
         ┌──────────▼──────────┐        ┌─────────▼──────────────┐
         │   SUPABASE          │        │  EXTERNAL AI APIS      │
         │                     │        │                        │
         │  Auth (JWT/Magic)   │        │  HuggingFace API       │
         │  PostgreSQL         │        │  sentence-transformers │
         │  pgvector (384 dim) │        │  /all-MiniLM-L6-v2    │
         │                     │        │  → 384-dim embeddings  │
         │  Tables:            │        │                        │
         │  profiles           │        │  Groq API              │
         │  documents          │        │  llama-3.3-70b-        │
         │  document_chunks    │        │  versatile             │
         │  chat_sessions      │        │  → streaming tokens    │
         │  chat_messages      │        │                        │
         │                     │        │  (Both free tier)      │
         │  RLS on every table │        └────────────────────────┘
         └─────────────────────┘
```

---

## FLOW A — DOCUMENT INGEST

```
User uploads PDF
      │
      ▼ (1) multipart/form-data POST /api/ingest
Route Handler: getAuthenticatedUser()   ← validates JWT from cookie or header
      │
      ▼ (2) rateLimiter(userId, 'ingest', 10, 3600000)
      │
      ▼ (3) Validate: MIME type, size ≤10MB, not empty
      │
      ▼ (4) INSERT documents row (status: 'processing')
      │
      ▼ (5) pdf-parse(buffer) → text + page count
      │         OR buffer.toString() for .txt/.md
      │
      ▼ (6) RecursiveCharacterTextSplitter
      │         chunkSize: 800 chars (~200 tokens)
      │         overlap:   150 chars
      │         → string[] of ~N chunks
      │
      ▼ (7) FOR each batch of 10 chunks:
      │         HuggingFaceInferenceEmbeddings.embedDocuments(batch)
      │         → number[][] (384-dim vectors)
      │         await 500ms  ← respect HF free tier rate limit
      │
      ▼ (8) INSERT document_chunks (content, metadata, embedding)
      │
      ▼ (9) UPDATE documents SET status='ready', chunk_count=N
      │
      ▼ (10) return { documentId, status, chunkCount }
      │
Client polls GET /api/documents/:id every 2s until status='ready'
```

---

## FLOW B — RAG QUERY (STREAMING)

```
User types question → clicks Send
      │
      ▼ (1) useChatStore.sendMessage() adds optimistic messages to UI
      │
      ▼ (2) POST /api/chat  { sessionId, content, documentId }
      │
Route Handler:
      ▼ (3) getAuthenticatedUser()
      ▼ (4) rateLimiter(userId, 'chat', 30, 60000)
      ▼ (5) Parse + validate body with Zod
      ▼ (6) Load/create chat_session in DB
      ▼ (7) INSERT user chat_message (persisted before streaming starts)
      ▼ (8) INSERT empty assistant chat_message (filled in after stream)
      │
      ▼ (9) streamResponse(generateStream(...))
      │         → headers: text/event-stream, X-Accel-Buffering: no
      │
Inside generateStream():
      ▼ (10) yield { type: 'start', messageId, sessionId }
      ▼ (11) embedQuery(content) → 384-dim vector (HF API)
      ▼ (12) match_chunks RPC (Supabase pgvector, cosine similarity, top-4)
      ▼ (13) buildSystemPrompt(chunks) → injects context into prompt
      ▼ (14) ChatGroq.stream({ history, question }) → AsyncIterator<chunks>
      ▼ (15) FOR each chunk: yield { type: 'token', content: token }
      ▼ (16) yield { type: 'sources', sources: [...] }
      ▼ (17) UPDATE chat_messages SET content=fullText, sources=[...]
      ▼ (18) yield { type: 'done', totalTokens }
      │
Client-side (chatStore.sendMessage):
      - ReadableStream reader parses each "data: {...}\n\n" line
      - 'token' → appendToken() → immer mutates single message.content
      - 'sources' → attachSources()
      - 'done' → finalizeStreaming()
      - React renders ONLY the streaming message (memo + useShallow)
```

---

## WHY NEXT.JS AS THE BACKEND

Using Next.js Route Handlers as the only backend gives us:

1. **Single deployment**: Everything deploys to Vercel as one unit. No separate
   Node.js server, no Docker, no infra. `vercel deploy` is the entire CI/CD.

2. **Route Handlers vs Server Actions**: We use Route Handlers (not Server Actions)
   for the AI endpoints because Route Handlers can return streaming responses
   (ReadableStream with SSE). Server Actions are for form mutations that return
   React state — not appropriate for long-running streams.

3. **Mobile as just another client**: React Native calls the same `/api/**`
   endpoints as the web app. It sends `Authorization: Bearer <token>` instead
   of cookies, and `getAuthenticatedUser()` handles both transparently.

4. **SSE streaming works in Vercel**: The key is `X-Accel-Buffering: no`.
   Without it, Vercel's nginx proxy buffers the response and delivers all
   tokens at once (negating the streaming UX). With it, each token flushes
   immediately.

5. **Trade-off**: This approach limits you to Vercel/Node.js runtime.
   A FastAPI backend would be easier to scale independently and could use
   Python's ML ecosystem. For a portfolio project, the simplicity wins.

---

## ZUSTAND STATE DESIGN

```
┌─────────────────────────────────────────────────────────┐
│                    Zustand Stores                       │
│                                                         │
│  useAuthStore    — session, user, isInitialized         │
│  ┌─ persisted: session tokens in localStorage           │
│  └─ action: signOut() calls clearAllStores()            │
│                                                         │
│  useDocumentStore — documents[], uploadQueue{}          │
│  ┌─ NOT persisted (re-fetched on mount)                 │
│  └─ uploadQueue keyed by tempId (O(1) progress updates) │
│                                                         │
│  useChatStore — sessions{}, activeSessionId             │
│  ┌─ NOT persisted (history loaded from DB on demand)    │
│  ├─ appendToken() uses immer to mutate only one node    │
│  └─ useCurrentMessages uses useShallow (no excess renders)│
│                                                         │
│  useUIStore — theme, toasts[], sidebarCollapsed         │
│  └─ persisted: theme + sidebar state                    │
└─────────────────────────────────────────────────────────┘

WHAT GOES WHERE:
  Zustand:          User data that survives component unmounts
  Server Components: Initial page data (avoids client fetch on load)
  URL state:         Active document/session ID (shareable links)
  Local useState:    Ephemeral UI (hover state, input value, open/closed)
```

---

## DESIGN SYSTEM TOKENS

```
COLOR PALETTE:
  Primary:      #4F46E5 (indigo-600)   dark: #6366F1 (indigo-500)
  Background:   #FFFFFF                dark: #0F172A (slate-900)
  Surface:      #F9FAFB (gray-50)      dark: #1E293B (slate-800)
  Border:       #E5E7EB (gray-200)     dark: #334155 (slate-700)
  Foreground:   #111827 (gray-900)     dark: #F1F5F9 (slate-100)
  Muted:        #6B7280 (gray-500)     dark: #94A3B8 (slate-400)
  Success:      #16A34A                dark: #4ADE80
  Warning:      #D97706                dark: #FCD34D
  Destructive:  #DC2626                dark: #F87171

SPACING: 4px base grid (4, 8, 12, 16, 20, 24, 32, 40, 48, 64)

BORDER RADIUS:
  sm: 4px   md: 8px   lg: 16px   xl: 24px   full: 9999px

SHADOWS:
  subtle:   0 1px 2px rgb(0 0 0 / 0.05)
  default:  0 1px 3px rgb(0 0 0 / 0.1)
  elevated: 0 4px 6px rgb(0 0 0 / 0.1)

ANIMATION:
  instant: 0ms   fast: 150ms   normal: 300ms   slow: 500ms

TYPOGRAPHY:
  xs: 12px   sm: 14px   base: 16px   lg: 18px
  xl: 20px   2xl: 24px  3xl: 30px   4xl: 36px
  Weights used: 400 (regular), 600 (semibold)
  Font: Inter (system fallback: system-ui, sans-serif)
```

---

## COMPLETE FOLDER STRUCTURE

```
docchat/
├── package.json              # Workspace root (npm workspaces)
├── turbo.json                # Turborepo pipeline config
├── tsconfig.base.json        # Shared TS config
│
├── packages/
│   ├── types/                # Shared TypeScript types
│   │   └── src/index.ts      # AppError, Document, ChatMessage, SSEEvent
│   │
│   ├── supabase/             # Supabase client factories
│   │   ├── src/client.ts     # createBrowserClient / createServerClient
│   │   ├── src/middleware.ts # updateSession() for Next.js middleware
│   │   └── schema.sql        # Complete DB schema + RLS + pgvector function
│   │
│   └── stores/               # Zustand stores (shared web + mobile)
│       └── src/
│           ├── authStore.ts  # Session, sign in/out, onAuthStateChange
│           ├── documentStore.ts # Upload queue, XHR progress, polling
│           ├── chatStore.ts  # SSE streaming, appendToken, useShallow
│           ├── uiStore.ts    # Theme, toasts, sidebar, modals
│           └── index.ts      # Barrel export
│
├── apps/
│   ├── web/                  # Next.js 15 application
│   │   ├── next.config.ts
│   │   ├── middleware.ts     # Route protection + session refresh
│   │   ├── .env.example
│   │   └── app/
│   │       ├── layout.tsx    # Root layout: StoreInitializer + ToastContainer
│   │       ├── globals.css   # CSS custom properties (design tokens)
│   │       │
│   │       ├── auth/
│   │       │   ├── login/page.tsx      # Email/password + magic link
│   │       │   └── callback/page.tsx   # Supabase auth redirect handler
│   │       │
│   │       ├── dashboard/
│   │       │   └── page.tsx  # Server Component: fetch docs server-side
│   │       │
│   │       ├── chat/[documentId]/
│   │       │   └── page.tsx  # Two-column chat: sidebar + streaming chat
│   │       │
│   │       └── api/
│   │           ├── _lib/
│   │           │   ├── auth.ts      # getAuthenticatedUser (cookie+header)
│   │           │   ├── response.ts  # successResponse/errorResponse/streamResponse
│   │           │   ├── ratelimit.ts # Token bucket Map-based rate limiter
│   │           │   └── langchain.ts # Groq + HF singletons, retrieveChunks
│   │           │
│   │           ├── ingest/route.ts          # POST: PDF→chunk→embed→store
│   │           ├── documents/route.ts       # GET: list documents
│   │           ├── documents/[id]/route.ts  # GET/DELETE: single document
│   │           ├── chat/route.ts            # POST: SSE RAG streaming
│   │           └── chat/history/[id]/route.ts # GET/DELETE: session history
│   │
│   │   └── components/
│   │       ├── providers/StoreInitializer.tsx  # Bootstraps auth on mount
│   │       ├── dashboard/
│   │       │   ├── DashboardNav.tsx    # Top nav: logo, ⌘K, theme, avatar
│   │       │   ├── DocumentGrid.tsx    # Search + grid + upload trigger
│   │       │   └── DocumentCard.tsx    # Hover actions, status badge, confirm delete
│   │       ├── upload/UploadZone.tsx   # react-dropzone + XHR progress
│   │       ├── chat/
│   │       │   ├── MessageBubble.tsx   # User/AI bubbles, react-markdown, copy
│   │       │   └── SourceCitation.tsx  # Collapsible citations, similarity meter
│   │       └── ui/ToastContainer.tsx   # Global toast system, auto-dismiss
│   │
│   └── mobile/               # Expo SDK 51 + React Native
│       ├── app.json          # Expo config: deep links, permissions
│       ├── .env.example
│       └── app/
│           ├── _layout.tsx       # Root: auth init, deep links, offline banner
│           ├── auth/
│           │   ├── _layout.tsx   # Auth group stack
│           │   └── login.tsx     # Email/password + magic link (KeyboardAvoidingView)
│           ├── documents/
│           │   ├── _layout.tsx   # Tab layout
│           │   └── index.tsx     # FlatList + swipe + long-press multi-select
│           └── chat/
│               └── [documentId].tsx  # SSE chat (react-native-sse) + haptics
```

---

## STEP-BY-STEP SETUP GUIDE

### Prerequisites
- Node.js 20+
- npm 10+
- A Supabase account (free)
- A Groq account (free)
- A HuggingFace account (free)

---

### Step 1 — Clone and install

```bash
git clone <your-repo>
cd docchat
npm install
```

---

### Step 2 — Create a Supabase project

1. Go to https://supabase.com → New project
2. Copy your **Project URL** and **anon key** from:
   Settings → API → Project URL / anon public

---

### Step 3 — Run the SQL schema

1. In Supabase Dashboard → SQL Editor → New Query
2. Paste the contents of `/packages/supabase/schema.sql`
3. Click **Run**
4. Verify: Table Editor should show 5 tables

---

### Step 4 — Configure Supabase Auth

In Supabase Dashboard → Authentication → URL Configuration:
- **Site URL**: `http://localhost:3000`
- **Redirect URLs**: Add `http://localhost:3000/auth/callback`

For magic links to work (Email provider is on by default).

---

### Step 5 — Get API keys

**Groq (LLM)**:
1. https://console.groq.com → Sign up (free)
2. API Keys → Create API Key
3. Copy the `gsk_...` key

**HuggingFace (Embeddings)**:
1. https://huggingface.co/settings/tokens
2. New token → Type: **Inference**
3. Copy the `hf_...` key

---

### Step 6 — Create environment files

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

Fill in all values in both files.

---

### Step 7 — Run the web app

```bash
# From repo root:
npm run dev

# Or just the web app:
cd apps/web && npm run dev
```

Open http://localhost:3000

---

### Step 8 — Run the mobile app

```bash
cd apps/mobile

# Install Expo CLI if needed
npm install -g expo-cli

# Start Expo
npx expo start

# Press 'i' for iOS simulator, 'a' for Android
# For device: scan the QR code with Expo Go
```

**Note for physical devices**: Change `EXPO_PUBLIC_API_URL` in `.env`
from `localhost:3000` to your machine's LAN IP (e.g. `192.168.1.5:3000`).

---

### Step 9 — Deploy to Vercel

```bash
npm install -g vercel

# From repo root:
vercel

# Set environment variables in Vercel Dashboard → Settings → Environment Variables
# Add all variables from apps/web/.env.example
```

---

## KEY CODE EXPLANATIONS

### Why immer in chatStore.appendToken()?
```typescript
// WITHOUT immer — spreads entire messages array on every token:
set((s) => ({
  ...s,
  sessions: {
    ...s.sessions,
    [sessionId]: {
      ...s.sessions[sessionId],
      messages: s.sessions[sessionId].messages.map((m) =>
        m.id === messageId ? { ...m, content: m.content + token } : m
      ),
    },
  },
}));
// ↑ Creates new arrays/objects for EVERYTHING on every token (~50×/sec)

// WITH immer — mutates only the leaf node:
set((s) => {
  const msg = s.sessions[sessionId]?.messages.find((m) => m.id === messageId);
  if (msg) msg.content += token;
});
// ↑ Immer tracks which nodes changed; Zustand only notifies subscribers
//   of the specific path that changed. 50× cheaper per token.
```

### Why XHR not fetch for uploads?
```typescript
// fetch() has NO upload progress events:
const res = await fetch('/api/ingest', { method: 'POST', body: formData });
// ↑ You get 0% → 100% instantly when upload completes. No real progress.

// XHR exposes upload.onprogress:
const xhr = new XMLHttpRequest();
xhr.upload.onprogress = (event) => {
  const pct = Math.round((event.loaded / event.total) * 100);
  // ↑ Real percentage, fires ~20× during a large upload
};
```

### Why pgvector uses cosine distance not dot product?
Cosine similarity is unit-vector-agnostic: two identical texts will always
score 1.0 regardless of vector magnitude. Dot product is sensitive to
vector length, which varies by text length. For semantic similarity in
RAG, cosine is the standard choice. The `<=>` operator in pgvector is
cosine distance (0=identical, 2=opposite); we convert with `1 - distance`.

### Why 384 dimensions (not 1536)?
OpenAI's ada-002 uses 1536 dimensions. all-MiniLM-L6-v2 uses 384.
Fewer dimensions means:
- 75% less storage per chunk
- 75% faster vector comparisons
- Comparable retrieval quality for short-text similarity tasks
- Free (vs ~$0.0001/1K tokens for ada-002)
