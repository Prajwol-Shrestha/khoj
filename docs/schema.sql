-- Khoj database schema (Supabase Postgres + pgvector 0.8.0).
--
-- Rebuilt by hand from the live database's catalog, not produced by pg_dump,
-- and not yet run against an empty database. Check it before relying on it.
-- Explained in docs/database.md.
--
-- Applying this to a database created before summaries existed? Run only:
--   alter table public.documents add column if not exists summary text;

create extension if not exists vector;
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- One row per signed-in user, created by a trigger on auth.users (see the end).
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  name        text,
  avatar_url  text,
  created_at  timestamptz default now()
);

-- An uploaded file. Owned by a user OR by a guest session_token.
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles (id) on delete cascade,
  session_token text,
  title         text not null,
  file_name     text not null,
  file_url      text,
  status        text default 'processing'
                check (status in ('processing', 'ready', 'error')),
  page_count    integer,
  chunk_count   integer,
  summary       text,  -- reference summary used for overview questions (lib/summary.ts)
  created_at    timestamptz default now(),
  pinned        boolean default false
);

-- One row per ~900-char chunk of a document, with its embedding.
create table public.chunks (
  id           bigserial primary key,
  document_id  uuid not null references public.documents (id) on delete cascade,
  content      text not null,
  chunk_index  integer not null,
  embedding    vector(768)  -- must match DIMENSIONS in lib/gemini.ts
);

-- A group of 2-3 documents chatted with together.
create table public.collections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles (id) on delete cascade,
  session_token text,
  title         text not null,
  created_at    timestamptz default now(),
  pinned        boolean default false
);

create table public.collection_documents (
  collection_id uuid not null references public.collections (id) on delete cascade,
  document_id   uuid not null references public.documents (id) on delete cascade,
  primary key (collection_id, document_id)
);

-- A conversation about ONE document or ONE collection (the app sets exactly one).
create table public.chat_sessions (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid references public.documents (id) on delete cascade,
  collection_id uuid references public.collections (id) on delete cascade,
  user_id       uuid references public.profiles (id) on delete cascade,
  session_token text,
  title         text,
  created_at    timestamptz default now()
);

create table public.messages (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.chat_sessions (id) on delete cascade,
  role          text not null check (role in ('user', 'assistant')),
  content       text not null,
  source_chunks jsonb,
  tokens_used   integer,
  created_at    timestamptz default now()
);

-- No vector index, on purpose: search compares every chunk (exact). An ivfflat
-- index (lists = 100, default probes = 1) was dropped because it returned only a
-- few candidates before the document filter, so most searches missed the right
-- chunk (on a test of 18 questions, the right chunk was in the top 3 for 22% of
-- them with the index and 100% without). At tens of thousands of chunks, add an
-- hnsw index (vector_cosine_ops) with hnsw.iterative_scan on, and check with a
-- test set that it does not lose results.

-- Row level security. Signed-in users match on auth.uid(); guests match on the
-- x-session-token header the browser client sends (lib/supabase/client.ts).
-- The server uses the service-role key, which bypasses all of this.
alter table public.profiles             enable row level security;
alter table public.documents            enable row level security;
alter table public.chunks               enable row level security;
alter table public.collections          enable row level security;
alter table public.collection_documents enable row level security;
alter table public.chat_sessions        enable row level security;
alter table public.messages             enable row level security;

create policy "profile access" on public.profiles
  for all using (id = auth.uid());

create policy "document access" on public.documents
  for all using (
    user_id = auth.uid()
    or session_token = (current_setting('request.headers', true)::json ->> 'x-session-token')
  );

create policy "collection access" on public.collections
  for all using (
    user_id = auth.uid()
    or session_token = (current_setting('request.headers', true)::json ->> 'x-session-token')
  );

create policy "session access" on public.chat_sessions
  for all using (
    user_id = auth.uid()
    or session_token = (current_setting('request.headers', true)::json ->> 'x-session-token')
  );

create policy "chunk access" on public.chunks
  for all using (
    document_id in (
      select id from public.documents
      where user_id = auth.uid()
         or session_token = (current_setting('request.headers', true)::json ->> 'x-session-token')
    )
  );

create policy "message access" on public.messages
  for all using (
    session_id in (
      select id from public.chat_sessions
      where user_id = auth.uid()
         or session_token = (current_setting('request.headers', true)::json ->> 'x-session-token')
    )
  );

create policy "collection_documents access" on public.collection_documents
  for all using (
    collection_id in (
      select id from public.collections
      where user_id = auth.uid()
         or session_token = (current_setting('request.headers', true)::json ->> 'x-session-token')
    )
  );

-- Search: the closest chunks to a question, inside one document or one collection.
-- similarity = 1 - cosine distance (1 = same meaning). Called from app/api/chat/route.ts.
create or replace function public.match_chunks(
  query_embedding     vector,
  match_document_id   uuid default null,
  match_collection_id uuid default null,
  match_count         integer default 5
)
returns table (
  id          bigint,
  content     text,
  chunk_index integer,
  similarity  double precision,
  document_id uuid
)
language sql
stable
as $$
  select
    c.id,
    c.content,
    c.chunk_index,
    1 - (c.embedding <=> query_embedding) as similarity,
    c.document_id
  from public.chunks c
  where
    case
      when match_collection_id is not null then
        c.document_id = any(
          select document_id from public.collection_documents
          where collection_id = match_collection_id
        )
      else
        c.document_id = match_document_id
    end
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Copies a new auth user into public.profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

-- Runs handle_new_user whenever someone signs up. (Not part of the public-schema
-- catalog dump; confirmed separately against the live project.)
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage bucket for the original uploads. Private; the server reads and writes it
-- with the service-role key.
insert into storage.buckets (id, name, public, allowed_mime_types)
values (
  'documents', 'documents', false,
  array[
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;
