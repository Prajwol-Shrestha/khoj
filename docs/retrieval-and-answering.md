# Retrieval and answering

What happens from pressing Send to the last word of the answer.

Code: `app/api/chat/route.ts` (the route and the system prompt), `lib/agent.ts` (the loop), `lib/agent-tools.ts` (the three tools), `lib/summary.ts` (summaries), `lib/gemini.ts` (embeddings).

![Output pipeline](images/retrieval.webp)

The model gets the conversation and a short list of tools. It decides whether to search the document, read a stored summary, or just reply to small talk. Our code runs whatever it asks for and gives the result back. Once the model has what it needs, it writes the answer.

## One question, start to finish

The user uploaded `handbook.pdf` and asks "How long do refunds take?"

Before the model is called, the route does a few checks, loads the last 10 messages and saves the question (see "Before the model is called" below). Then the model is called with the system prompt, the history, the question and the tool list.

**Call 1.** The model replies with a tool call and no text:

```
search_document
  reason: "Find how long refunds take"
  query:  "refund processing time"
```

Our code turns that query into a vector with Gemini and asks the database for the closest chunks of this document. Only chunks scoring 0.5 or more are kept:

```
0.71  "Refunds take 5 to 7 business days to appear."
0.64  "To request a refund, email support..."
0.52  "Refunds are allowed within 30 days of purchase."
```

Three chunks come back for a single document, five for a collection. For a question the document can't answer, the scores might be `0.31, 0.28, 0.22`. All are under 0.5, so the tool returns "no passages matched".

**Call 2.** The passages go back to the model as the tool's result. It reads them and writes the answer, which streams to the browser as it is written:

```
Refunds take 5 to 7 business days.
```

That's two model calls. The first one decides, the second one answers.

## Other kinds of messages

**A follow-up.** The next message is "and if I don't get one?". The model sees the history, so it writes a query that makes sense on its own, something like "what to do if a refund doesn't arrive". There is no separate step that rewrites the question. The model writes the query as the argument of the tool call.

**An overview.** "What are the key points?" looks like no particular passage, so search would return arbitrary chunks. The model calls `read_summary` instead, and gets the stored summary of the document:

```
read_summary
  reason: "The user wants an overview of the document"
result:  - Employee handbook for Acme
         - Refunds take 5 to 7 business days ...
```

Then it writes the answer from that.

**Small talk.** For "thanks" the model calls `no_lookup_needed`. The result tells it to reply briefly and not to answer from its own knowledge, so "what is the capital of France?" gets a polite "I can only help with this document".

**A question that isn't answered.** "Does this person have pets?" The model searches "pets hobbies personal interests", gets passages that don't mention pets, and searches again with "hobbies". Still nothing, so it says "I couldn't find that information in the document." The system prompt makes it search twice before giving up.

**A tool that fails.** Once the summary build hit a rate limit and `read_summary` threw an error. The error text went back to the model like any other result, and the model decided to call `search_document` instead. Nothing in the code says "if the summary fails, search". It's the loop doing its job.

## Before the model is called

- Chat is limited to 20 requests a minute per IP.
- The session says what to search: one document or one collection.
- The session has to belong to the caller. A signed-in user's session needs that user, a guest's needs the matching guest cookie. Anything else gets "Session not found" (404), the same reply as for a session that doesn't exist, so ids can't be probed.
- The last 10 messages are read from the database, not from the browser, so a client can't forge them. This happens before the new question is saved.
- The user's question is saved to `messages`.

## The loop

The model is `openai/gpt-oss-120b` on Groq.

- If the model's reply contains a tool call, the tool runs, its result is added to the conversation, and the model is called again.
- If the reply is plain text, that's the answer and the loop stops.
- After 4 tool rounds, tools are switched off and the model has to answer. So one message costs at most 5 model calls.
- An empty reply counts as "try again".
- If a search finds only passages the model already has, the tool says "nothing new, answer from what you have". Otherwise the model keeps rewording the same search.

Every tool takes a `reason` argument, listed first. The model writes its reason before the rest of the arguments, and the page shows it as the agent's thinking.

| Tool | Used for |
|---|---|
| `search_document` | a specific question or detail |
| `read_summary` | an overview, or basic facts such as names and contact details |
| `no_lookup_needed` | greetings, thanks, small talk, anything unrelated to the document |

Which tool a message gets is the model's choice, based on these descriptions and the system prompt. Our code has no rule for it.

## What the browser gets, and what is saved

The answer arrives over server-sent events:

| Event | Sent | Contains |
|---|---|---|
| `step` | after each tool call | tool, reason, query, outcome (like "found 3 passages") |
| `sources` | after each step | the passages found so far |
| `token` | while the answer is written | a piece of text |
| `done` or `error` | at the end | |

If the model writes text before a tool call, that was thinking out loud and not the answer. The route and the page both throw it away when the `step` event arrives.

The page shows the steps in a "reasoning" panel, open while the answer is pending and collapsible afterwards. When the stream ends, the answer is saved to `messages` together with its sources, its steps and the tokens used. If the stream breaks halfway, the part that arrived is still saved.

## Summaries

A summary is a short saved text about the whole document. It's what `read_summary` returns.

It's built in the background right after upload (`after()` in `lib/ingest.ts`), so the upload doesn't wait for it. It takes one call to `openai/gpt-oss-20b`, over up to 13 chunks spread evenly across the document, first and last included. A document of 13 chunks or fewer uses all of them. A longer one is summarized from excerpts. The summary is under 400 words and keeps names, dates, numbers and contact details.

Excerpts, because the Groq tier this project runs on allows only about 7,000 input tokens a minute. Summarizing a long document in passes didn't fit, and it failed outright on a 60,000 character one. The summary uses a different model from the chat so it doesn't eat the chat model's per-minute budget.

If a document has no summary (uploaded before summaries existed, or the build failed), the first `read_summary` call builds and saves it. In a collection, the missing ones are built one at a time. For a collection, the summaries of all its documents are joined, each under its title.

## Things to watch

- The model can pick the wrong tool. About two dozen messages tried by hand all got sensible ones, but I haven't measured an error rate. The worst case is a real question sent to `no_lookup_needed`, which gets a friendly non-answer.
- The 0.5 cutoff is fixed, picked by hand. If answers go missing too often, it's the first number to tune (`SIMILARITY_THRESHOLD` in `lib/agent-tools.ts`). The top 3 or 5 are picked first and the cutoff is applied after, so a chunk ranked 4th is never considered even if it scores above 0.5.
- Search is weak on names and contact details, because they sit in a header that looks nothing like the question. The model is told to use `read_summary` for those, and the summary keeps them.
- A summary of a long document can miss sections. The prompt tells the model to say so when the summary seems to cover only part.
- It costs at least 2 calls of a large model per message. On this Groq tier that's roughly 3 messages a minute. Going over means the reply waits, and can fail.
- Answers saved before the `steps` column existed have no steps.
- Answers are capped at 2048 tokens, at temperature 0.3.
