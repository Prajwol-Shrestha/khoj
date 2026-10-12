# Retrieval and answering

What happens between "user presses Send" and "the answer finishes streaming".

Code: `app/api/chat/route.ts`. Embedding: `lib/gemini.ts`. Summaries: `lib/summary.ts`.

![Output pipeline](images/retrieval.webp)

The diagram shows the router and its three paths: question, overview and chat. It leaves out a few details, all covered below:

- When no chunk reaches 0.5, the answer can still come from the summary alone, or be the fixed "couldn't find it" reply (step 4).
- A question also gets the summary next to its chunks (step 5).
- The answer LLM also gets the last 10 messages (step 5).
- If the summary cannot be read or built, an overview uses the 8 closest chunks instead ("Overview questions").

## The flow in one line

```
message -> route (what is it? rewrite it) -> find what to read -> ask the LLM -> stream the answer -> save
```

## Step by step

### 0. Checks and history

- Chat is limited to **20 requests per minute** per IP.
- The session says what to search: one document or one collection.
- The session must belong to the caller. A signed-in user's session needs that user. A guest's session needs the matching guest cookie. Otherwise the reply is "Session not found" (404), the same as for a session that does not exist.
- The **last 10 messages** of the conversation are loaded **from the database**, not from the browser. This happens before the new question is saved, so the question is not in its own history.
- The user's message is saved to `messages`.

### 1. Route the message (small LLM)

Not every message is a question about a passage, and search treats them all the same. So one small, fast LLM call (`openai/gpt-oss-20b`) first decides what the message is. It looks at the **last 4 messages**, each cut to **500 characters**, and returns an **intent** and a **search query**.

| Intent | Meaning | Example | What happens |
|---|---|---|---|
| `question` | a specific question about the document | "what experience does he have?" | Search for passages, then answer from them (steps 2 to 5). |
| `overview` | a request for a summary, key points, or what the whole document is about | "What are the key points?" | Read the document's summary instead of searching (see "Overview questions"). |
| `chat` | small talk or an acknowledgement | "ok", "hi", "thanks!" | No search. A short friendly reply. |

For a `question`, the router also rewrites the message so it stands alone, because search works on meaning and "and the second one?" means nothing alone:

```
History:
  User:      What experience does he have?
  Assistant: ... Peace Nepal Dot Com (August 2025 - Present) ...
New message: his latest employer?

intent: question
query:  What is the individual's latest employer?
```

- The first message of a conversation has no history. It is still routed, so "hi" or "summarize this" work from the very start.
- **If the router call fails,** the message is treated as a plain question with its original wording. A router problem never blocks an answer.
- The rewrite is used **only for searching.** The answer LLM later gets the user's original wording.

### 2. Embed (questions only)

The rewritten query is turned into a vector by Gemini, marked `RETRIEVAL_QUERY`. It is the same kind of 768-number vector the chunks have (see [Ingestion](ingestion.md)).

### 3. Similarity search (questions only)

The `match_chunks` function in Supabase compares the question vector with the chunk vectors and returns the closest ones, with a **cosine similarity** score from 0 to 1 (1 means the same meaning, near 0 means unrelated). The SQL is in [schema.sql](schema.sql), explained in [Database](database.md).

- It only looks inside the current **document or collection**.
- It returns the **top 3** chunks for a single document, or the **top 5** for a collection.
- Then chunks scoring **below 0.5 are thrown away.**

Example scores for the question "How long do refunds take?" in one document:

```
0.71  "Refunds take 5 to 7 business days to appear."     kept
0.64  "To request a refund, email support..."             kept
0.52  "Refunds are allowed within 30 days of purchase."   kept
0.48  "Our office is open Monday to Friday."              dropped (top 3 was already full)
```

Three chunks go forward. A question about something not in the document might score `0.31, 0.28, 0.22`: all below 0.5, so nothing goes forward.

### 4. Nothing found (questions only)

If no chunk reaches 0.5, there are two outcomes:

- **The document has a summary.** The LLM is still called, with the summary alone (see step 5). Search misses some plain facts, and the summary usually has them. For example, "what's his name?" barely resembles a CV's header line, so no chunk scores 0.5, but the summary says "Resume of Prajwol Shrestha".
- **No summary yet.** The LLM is **not called.** The reply is a fixed message, saved and streamed like a normal answer:

> I couldn't find that information in the document.

This saves a call and stops the model from making something up.

### 5. Ask the LLM

The answer model (`qwen/qwen3.8-27b`, on Groq) gets:

1. **A system prompt.** For a question: answer strictly from the context, say "couldn't find" if it is not there, do not invent anything. For an overview: the same, plus "the user wants an overview". For chat: be brief and friendly, and do not state facts about the document.
2. **The material.** For a question, the document summary (if one exists) plus the kept chunks, labelled `[Chunk 1]`, `[Chunk 2]`, and so on. For an overview, the summary. For chat, nothing. The prompt says to use the summary for basic facts (what the document is, who it is about, names) and the chunks for details.
3. **The last 10 messages** of history.
4. **The user's original message** (not the rewritten query).

```
system:  You answer only from this material.
         Document summary: - Employee handbook for Acme ... refund policy ...
         Passages:
         [Chunk 1]: Refunds take 5 to 7 business days to appear.
         [Chunk 2]: To request a refund, email support...
history: (previous messages)
user:    And what if I don't get one?
```

The original wording goes here because the LLM also sees the history and can read "it" and "that" itself. The rewrite exists only to help the search.

### 6. Stream and save

The answer arrives token by token over server-sent events:

1. First a `sources` event with the chunks used, so the page can show them while the text is still typing. It is empty for overview and chat replies, and when an answer came from the summary alone, so no source box appears.
2. Then `token` events, one per piece of text.
3. Then `done`.

When the stream ends, the answer is saved to `messages` with its source chunks and the tokens used. If the stream breaks halfway, the part that arrived is still saved. A partial answer is better than an empty turn.

## Overview questions

"What are the key points?" has a problem for search. It resembles no particular passage, so every chunk scores low and nothing would pass the 0.5 cutoff. Picking the closest few chunks would be arbitrary, and on a long document most of it would be missing.

So an overview reads a **document summary** instead. It is built once and saved in `documents.summary`:

- **When:** in the background right after upload (`after()` in `lib/ingest.ts`), so the upload does not wait for it.
- **How:** the document's chunks are read in order and handed to `qwen/qwen3.8-27b`.
  - A short document (up to about 24,000 characters) takes **one call**.
  - A longer one is cut into sections of about 24,000 characters. Each section is summarized (3 at a time), and those summaries are then summarized together. This repeats until one summary is left.
- **What it contains:** what kind of document it is, who or what it is about, the main points in order, and important names, dates, numbers and contact details (emails, phone numbers, addresses, links). Under 400 words.
- **Collections:** the summaries of all documents in the collection are joined, each under its title.
- **Questions use it too.** An ordinary question gets the summary next to its passages. A question never waits for a summary to be built: if there is none yet, it is simply left out.
- **If a summary is missing** (a document uploaded before summaries existed, or a failed build), the first overview question builds it, saves it, and answers from it.
- **If even that fails,** the router's `overview` falls back to the 8 closest chunks with no cutoff. It always gives an answer.

Example, from a CV:

```
User:   What are the key points?
Router: intent = overview
Reads:  - Frontend-focused full-stack engineer, 3+ years
        - Peace Nepal Dot Com (Aug 2025 - present), Frontend Developer
        - Samsara Social (Dec 2022 - Aug 2023), Associate FullStack Developer
        - React, React Native, Next.js, TypeScript, Node.js/NestJS, Python/Django
Answer: streamed from that summary
```

## Things to know

- **Small talk is answered, not searched.** "ok" no longer hits the "couldn't find" message.
- **The 0.5 cutoff only applies to questions.** It is fixed, picked by hand. If answers are missing too often, or wrong chunks get through, it is the first number to tune (`SIMILARITY_THRESHOLD`).
- **Search is weak on identity and contact facts.** A name, email or phone number sits in a header that looks nothing like the question. The summary is the safety net for these, which is why it keeps names and contact details. Summaries built before contact details were added lack them. To rebuild, run `update public.documents set summary = null;`; the next overview question for each document builds a new one.
- **Top-k first, cutoff second.** A chunk ranked 4th is never considered, even if it scores above 0.5.
- **The router can mislabel.** "What's the summary of the refund policy?" is a question about one topic, and could be mistaken for an overview. If a message is routed to the wrong path, the answer is weaker, not wrong: an overview of the whole document still contains the policy, and small talk never reaches the document.
- **Every message costs one extra small call** (about 0.5 seconds) for the routing.
- **Old "couldn't find" replies stay in history.** They are included like any other message.
- **Max answer length is 2048 tokens**, at temperature 0.3.
