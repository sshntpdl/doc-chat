-- FILE: /packages/supabase/schema.sql
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Execute in order — later sections depend on earlier ones.

-- ─────────────────────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- pgvector: adds the vector data type and similarity operators (<=> cosine)
CREATE EXTENSION IF NOT EXISTS vector;

-- pg_trgm: enables trigram-based text search (used for snippet search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────────────────────────────────────
-- UTILITY: updated_at TRIGGER
-- ─────────────────────────────────────────────────────────────────────────────
-- Reused across all tables that track updates. A trigger is more reliable
-- than application-layer timestamps because DB writes bypass the app.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: profiles
-- ─────────────────────────────────────────────────────────────────────────────
-- Extends Supabase's built-in auth.users table.
-- We never store auth data here — only display preferences.

CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create a profile row when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: documents
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.documents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  size          BIGINT      NOT NULL,              -- bytes
  type          TEXT        NOT NULL               -- 'pdf' | 'text' | 'markdown'
                            CHECK (type IN ('pdf', 'text', 'markdown')),
  status        TEXT        NOT NULL DEFAULT 'processing'
                            CHECK (status IN ('processing', 'ready', 'error', 'partial')),
  chunk_count   INTEGER     NOT NULL DEFAULT 0,
  error_message TEXT,                              -- set when status = 'error'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Most queries filter by user_id; secondary filter on status
CREATE INDEX IF NOT EXISTS documents_user_id_idx  ON public.documents (user_id);
CREATE INDEX IF NOT EXISTS documents_status_idx   ON public.documents (user_id, status);

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: document_chunks
-- ─────────────────────────────────────────────────────────────────────────────
-- Each row is one 800-character text chunk from a document.
-- The `embedding` column stores the 384-dim MiniLM vector.
-- 384 dims (not 1536!) — all-MiniLM-L6-v2 outputs 384-dimensional vectors.

CREATE TABLE IF NOT EXISTS public.document_chunks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content       TEXT        NOT NULL,
  -- metadata: { page: number, chunk_index: number, total_chunks: number }
  metadata      JSONB       NOT NULL DEFAULT '{}',
  embedding     vector(384) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast user-scoped vector similarity searches
CREATE INDEX IF NOT EXISTS chunks_user_id_idx      ON public.document_chunks (user_id);
CREATE INDEX IF NOT EXISTS chunks_document_id_idx  ON public.document_chunks (document_id);

-- IVFFlat index for approximate nearest-neighbor vector search.
-- lists=100 is appropriate for up to ~1M rows. Rebuild with more lists
-- as the dataset grows. IMPORTANT: build AFTER initial data load.
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON public.document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: chat_sessions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL means the session queries ALL user documents (global chat)
  document_id  UUID        REFERENCES public.documents(id) ON DELETE SET NULL,
  title        TEXT        NOT NULL DEFAULT 'New Chat',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx      ON public.chat_sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_document_id_idx  ON public.chat_sessions (document_id);
-- Order sessions newest-first efficiently
CREATE INDEX IF NOT EXISTS sessions_created_at_idx   ON public.chat_sessions (user_id, created_at DESC);

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: chat_messages
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL,
  -- sources: SourceCitation[] JSON array (only on assistant messages)
  -- Example: [{ documentId, documentName, pageNumber, snippet, similarity }]
  sources     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_session_id_idx  ON public.chat_messages (session_id);
CREATE INDEX IF NOT EXISTS messages_user_id_idx     ON public.chat_messages (user_id);
-- Fetch messages in chronological order efficiently
CREATE INDEX IF NOT EXISTS messages_created_at_idx  ON public.chat_messages (session_id, created_at ASC);

-- ─────────────────────────────────────────────────────────────────────────────
-- PGVECTOR FUNCTION: match_chunks
-- ─────────────────────────────────────────────────────────────────────────────
-- Called by the Route Handler after embedding the user's question.
-- Returns the K nearest chunks ordered by cosine similarity (highest first).
--
-- Parameters:
--   query_embedding    — the embedded user question (384 dims)
--   match_user_id      — RLS equivalent at function level (defense in depth)
--   match_count        — how many chunks to return (default 4 in app code)
--   filter_document_id — pass a UUID to scope search to one document,
--                        pass NULL to search all user documents

CREATE OR REPLACE FUNCTION public.match_chunks(
  query_embedding    vector(384),
  match_user_id      uuid,
  match_count        int     DEFAULT 4,
  filter_document_id uuid    DEFAULT NULL
)
RETURNS TABLE (
  id           uuid,
  document_id  uuid,
  content      text,
  metadata     jsonb,
  similarity   float
)
LANGUAGE plpgsql
SECURITY DEFINER   -- runs as the function owner, bypasses RLS for this query
                   -- but we add our own user_id check for defense in depth
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.metadata,
    -- 1 - cosine_distance converts distance to similarity (1 = identical)
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks dc
  WHERE
    dc.user_id = match_user_id
    AND (
      filter_document_id IS NULL
      OR dc.document_id = filter_document_id
    )
  ORDER BY dc.embedding <=> query_embedding   -- ascending distance = descending similarity
  LIMIT match_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS is the primary data isolation guard. Even if application code has a bug
-- that passes the wrong user_id, Supabase will block the query at the DB level.

-- Enable RLS on every table
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages  ENABLE ROW LEVEL SECURITY;

-- ── profiles ──────────────────────────────────────────────────────────────────
CREATE POLICY "profiles: own row only"
  ON public.profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── documents ─────────────────────────────────────────────────────────────────
CREATE POLICY "documents: own rows only"
  ON public.documents FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── document_chunks ───────────────────────────────────────────────────────────
CREATE POLICY "chunks: own rows only"
  ON public.document_chunks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── chat_sessions ─────────────────────────────────────────────────────────────
CREATE POLICY "sessions: own rows only"
  ON public.chat_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── chat_messages ─────────────────────────────────────────────────────────────
CREATE POLICY "messages: own rows only"
  ON public.chat_messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
