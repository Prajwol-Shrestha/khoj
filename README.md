# Khoj

Upload documents and chat with them. Ask a question, and the answer comes only from what is in your files, with the source passages shown next to it.

Supports PDF, DOCX, TXT and Markdown. Upload one file to chat with it, or up to three to chat across all of them.

Built with Next.js, Supabase (Postgres, Storage, Google sign-in), Gemini embeddings and a Groq-hosted LLM.

## How it works

Khoj is a RAG with an agent. Documents are cut into chunks and each chunk becomes a vector. For every message, a model decides what to do: search the chunks, read a stored summary of the document, or just reply to small talk. If the first result isn't enough it can try again, and the steps it took are shown next to the answer.

![Khoj RAG overview](docs/images/overview.webp)

**Read the docs to understand the system: [docs/](docs/README.md)**

- [Chunking](docs/chunking.md): how text is cut into chunks, with examples
- [Ingestion](docs/ingestion.md): upload to vectors in the database
- [Retrieval and answering](docs/retrieval-and-answering.md): question to streamed answer
- [Database](docs/database.md): tables, the search function, access rules

## Run locally

```bash
pnpm install
pnpm dev
```

Then open http://localhost:3000.

Create `.env.local` first:

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (used in the browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only, never expose it) |
| `GEMINI_API_KEY` | Google Gemini, for embeddings |
| `GROQ_API_KEY` | Groq, for the LLM |
| `NEXT_PUBLIC_SITE_URL` | Public site URL, used for metadata, robots and sitemap (optional) |

The Supabase project also needs a Storage bucket named `documents`, Google sign-in enabled, and the database tables and `match_chunks` function. The SQL is in [docs/schema.sql](docs/schema.sql).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm start` | Run the production build |
| `pnpm lint` | Run ESLint |
