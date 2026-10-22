# Khoj docs

Khoj lets you upload documents and chat with them. Ask a question, and the answer comes only from what is in your files.

It is a RAG (retrieve, then read) with an agent. Documents are cut into chunks and each chunk becomes a vector. For every message, a model decides what to do: search the chunks, read a stored summary of the document, or just reply to small talk. If the first result isn't enough it can try again, and the steps it took are shown next to the answer.

![Khoj RAG overview](images/overview.webp)

## Guides

Each guide explains one part of the diagram, with small examples.

| Guide | Covers | Code |
|---|---|---|
| [Chunking](chunking.md) | How extracted text is cut into chunks (size, overlap, where cuts land) | `lib/chunker.ts` |
| [Ingestion](ingestion.md) | Upload, extract, embed, store, sessions and collections | `lib/ingest.ts`, `app/api/upload/route.ts` |
| [Retrieval and answering](retrieval-and-answering.md) | The agent loop and its tools, similarity search, summaries, streaming, steps | `app/api/chat/route.ts`, `lib/agent.ts`, `lib/agent-tools.ts` |
| [Database](database.md) | Tables, the `match_chunks` search function, access rules, deletes ([schema.sql](schema.sql)) | `docs/schema.sql` |

## Key numbers

| What | Value | Where |
|---|---|---|
| Chunk size / overlap | 900 / 150 chars | `lib/chunker.ts` |
| Smallest chunk kept | over 20 chars | `lib/chunker.ts` |
| Embedding model | `gemini-embedding-001`, 768 dimensions, 50 chunks per request | `lib/gemini.ts` |
| Chunks per search | top 3 (one document), top 5 (collection) | `lib/agent-tools.ts` |
| Similarity cutoff | cosine similarity of at least 0.5 | `lib/agent-tools.ts` |
| History given to the model | last 10 messages, read from the database | `app/api/chat/route.ts` |
| Agent model | `openai/gpt-oss-120b` (Groq), up to 4 tool rounds, so at most 5 calls per message | `lib/agent.ts` |
| Document summary | built after upload by `openai/gpt-oss-20b`, one call over up to 13 chunks spread across the document, under 400 words | `lib/summary.ts` |
| Upload limits | 3 files per upload, 20 MB per file | `lib/files.ts` |
| Rate limits | chat 20/min, upload 5/min, per IP | `lib/rate-limit.ts` |
