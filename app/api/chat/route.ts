import { getUser, jsonError, serverError } from "@/lib/api";
import { embedQuery } from "@/lib/gemini";
import { GUEST_TOKEN_KEY } from "@/lib/guest";
import { rateLimit } from "@/lib/rate-limit";
import { encodeEvent } from "@/lib/sse";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOverview, getSummaryIfReady } from "@/lib/summary";
import type { Role, SourceChunkData } from "@/lib/types";
import Groq from "groq-sdk";
import type { CompletionUsage } from "groq-sdk/resources/completions";
import { NextRequest } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

const SIMILARITY_THRESHOLD = 0.5;
const MAX_HISTORY_MESSAGES = 10;
const NO_ANSWER = "I couldn't find that information in the document.";

// Fallback for an overview when no summary can be had: the closest chunks, with
// no score cutoff, since "key points?" matches no passage in particular.
const OVERVIEW_FALLBACK_CHUNKS = 8;

// small and fast: it only labels and rewrites one line, so it shouldn't add noticeable latency
const ROUTER_MODEL = "openai/gpt-oss-20b";
const ROUTER_CONTEXT_MESSAGES = 4;
const ROUTER_SNIPPET_CHARS = 500;

const ROUTER_PROMPT = `You route messages in a chat about ONE uploaded document.
Reply with JSON only: {"intent": "...", "query": "..."}

intent, pick one:
- "chat": greetings, thanks, acknowledgements or other small talk that needs nothing from the document ("hi", "ok", "thanks!").
- "overview": asks for a summary, key points, main ideas, or what the whole document is about.
- "question": anything else, a specific question about what the document says.

query: the last message rewritten as a standalone search query. Resolve references like "he", "it", "the second one" using the conversation. Keep names and key terms. If it already stands alone, return it unchanged. For "chat" and "overview", copy the message.`;

const CHAT_PROMPT = `You are the assistant in a chat about an uploaded document. The user is making small talk or acknowledging your last reply. Answer in one short, friendly sentence and invite a question about the document. Do not state facts about the document.`;

type Intent = "question" | "overview" | "chat";
const INTENTS: Intent[] = ["question", "overview", "chat"];

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

interface MatchedChunk extends SourceChunkData {
  id: string;
}

interface HistoryMessage {
  role: Role;
  content: string;
}

interface ChatRequestBody {
  question?: string;
  sessionId?: string;
}

// One cheap call decides how to handle a message: look something up, summarize,
// or just chat. For lookups it also rewrites the message into a standalone query,
// because "and the second one?" embeds to nothing useful on its own. The rewrite is
// for retrieval only; the answer prompt still gets the user's original wording.
// Any failure falls back to a plain question, so this can only help, never block a reply.
async function routeMessage(
  question: string,
  history: HistoryMessage[],
): Promise<{ intent: Intent; query: string }> {
  const transcript =
    history
      .slice(-ROUTER_CONTEXT_MESSAGES)
      .map(
        (m) =>
          `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, ROUTER_SNIPPET_CHARS)}`,
      )
      .join("\n") || "(none)";

  try {
    const res = await groq.chat.completions.create({
      model: ROUTER_MODEL,
      temperature: 0,
      max_completion_tokens: 512, // reasoning tokens count against this
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ROUTER_PROMPT },
        {
          role: "user",
          content: `Conversation:\n${transcript}\n\nLast message: ${question}`,
        },
      ],
    });

    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "");
    return {
      intent: INTENTS.includes(parsed.intent) ? parsed.intent : "question",
      query:
        typeof parsed.query === "string" && parsed.query.trim()
          ? parsed.query.trim()
          : question,
    };
  } catch (error) {
    console.error("Routing failed, treating as a question:", error);
    return { intent: "question", query: question };
  }
}

// The admin client skips row level security, so ownership is checked here, by
// the same rule the database applies to the browser: a signed-in user owns a
// session by user_id, a guest by the token in their cookie.
async function ownsSession(
  req: NextRequest,
  session: { user_id: string | null; session_token: string | null },
): Promise<boolean> {
  if (session.user_id) return (await getUser())?.id === session.user_id;

  const token = req.cookies.get(GUEST_TOKEN_KEY)?.value;
  return !!token && token === session.session_token;
}

export async function POST(req: NextRequest) {
  if (!rateLimit(req, 20)) return jsonError("Too many requests", 429);

  try {
    const { question, sessionId } = (await req.json()) as ChatRequestBody;

    if (!question || !sessionId) {
      return jsonError("question and sessionId are required", 400);
    }

    const supabase = createAdminClient();

    const { data: session, error: sessionError } = await supabase
      .from("chat_sessions")
      .select("id, document_id, collection_id, user_id, session_token")
      .eq("id", sessionId)
      .single();

    // someone else's session reads the same as a missing one, so ids can't be probed
    if (sessionError || !session || !(await ownsSession(req, session))) {
      return jsonError("Session not found", 404);
    }

    // history comes from our own table, never the request body — a client could
    // forge assistant turns or stuff the prompt. Read it before saving the new
    // question so the question isn't in its own history.
    const { data: past, error: historyError } = await supabase
      .from("messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY_MESSAGES);
    if (historyError) throw new Error(`History error: ${historyError.message}`);
    const history = ((past ?? []) as HistoryMessage[]).reverse();

    await supabase.from("messages").insert({
      session_id: sessionId,
      role: "user",
      content: question,
    });

    const { intent, query } = await routeMessage(question, history);

    // small talk ("ok", "thanks") needs no passages at all
    let relevantChunks: MatchedChunk[] = [];

    // an overview reads the document's summary, not search hits: the closest
    // chunks to "key points?" are arbitrary, and on a long document most of it
    // would be missing
    let overview: string | null = null;
    if (intent === "overview") {
      try {
        overview = await getOverview(session);
      } catch (error) {
        console.error("Overview failed, falling back to the closest chunks:", error);
      }
    }

    // ordinary questions also get the summary, read while the search runs
    const summaryRead =
      intent === "question"
        ? getSummaryIfReady(session).catch((error) => {
            console.error("Summary read failed, answering from passages only:", error);
            return null;
          })
        : Promise.resolve(null);

    let summary: string | null = null;

    if (intent === "question" || (intent === "overview" && !overview)) {
      const { data: chunks, error: searchError } = await supabase.rpc(
        "match_chunks",
        {
          query_embedding: await embedQuery(query),
          match_document_id: session.document_id,
          match_collection_id: session.collection_id,
          match_count:
            intent === "overview"
              ? OVERVIEW_FALLBACK_CHUNKS
              : session.collection_id
                ? 5
                : 3,
        },
      );
      if (searchError) throw new Error(`Search error: ${searchError.message}`);

      relevantChunks = ((chunks as MatchedChunk[]) ?? []).filter(
        (c) => intent === "overview" || c.similarity >= SIMILARITY_THRESHOLD,
      );

      summary = await summaryRead;

      // nothing matched, but the summary may still hold the answer, so the model
      // gets to look; only with neither is there nothing to say
      if (relevantChunks.length === 0 && !summary) {
        await supabase.from("messages").insert({
          session_id: sessionId,
          role: "assistant",
          content: NO_ANSWER,
          source_chunks: [],
        });

        return new Response(
          Buffer.concat([
            encodeEvent({ type: "sources", sources: [] }),
            encodeEvent({ type: "token", content: NO_ANSWER }),
            encodeEvent({ type: "done" }),
          ]),
          { headers: SSE_HEADERS },
        );
      }
    }

    const passages = relevantChunks
      .map((c, i) => `[Chunk ${i + 1}]:\n${c.content}`)
      .join("\n\n");

    const material =
      overview ??
      [
        summary && `Document summary:\n${summary}`,
        passages && `Passages:\n${passages}`,
      ]
        .filter(Boolean)
        .join("\n\n");

    const answerPrompt = `You are a helpful assistant that answers questions based strictly on the provided document material.
The material may include a summary of the whole document and passages from it. Use the summary for basic facts about the document (what it is, who or what it is about, names) and the passages for details.
If the answer is not in the material, say "${NO_ANSWER}"
Do not make up information. Be concise and clear.
${intent === "overview" ? "The user wants an overview of the document. Answer from the material below; if it seems to cover only part of the document, say so.\n" : ""}
Document material:
${material}`;

    const messages = [
      {
        role: "system" as const,
        content: intent === "chat" ? CHAT_PROMPT : answerPrompt,
      },
      ...history,
      { role: "user" as const, content: question },
    ];

    const sources: SourceChunkData[] = relevantChunks.map((c) => ({
      content: c.content,
      similarity: Math.round(c.similarity * 100) / 100,
      document_id: c.document_id,
    }));

    const stream = new ReadableStream({
      async start(controller) {
        // sources go out first so the UI can show them while tokens arrive
        controller.enqueue(encodeEvent({ type: "sources", sources }));

        let answer = "";
        let tokensUsed = 0;

        try {
          // groq doesn't support stream_options: { include_usage: true } yet,
          // it puts usage on the last chunk instead
          const completion = await groq.chat.completions.create({
            model: "qwen/qwen3.8-27b",
            messages,
            max_completion_tokens: 2048,
            temperature: 0.3,
            stream: true,
            reasoning_effort: "default",
          });

          for await (const chunk of completion) {
            const token = chunk.choices[0]?.delta?.content ?? "";
            if (token) {
              answer += token;
              controller.enqueue(
                encodeEvent({ type: "token", content: token }),
              );
            }

            if ("usage" in chunk && chunk.usage) {
              tokensUsed = (chunk.usage as CompletionUsage).total_tokens;
            }
          }

          controller.enqueue(encodeEvent({ type: "done" }));
        } catch (error) {
          console.error("Chat stream error:", error);
          controller.enqueue(
            encodeEvent({
              type: "error",
              message:
                error instanceof Error ? error.message : "Streaming failed",
            }),
          );
        }

        // save whatever arrived — a partial answer still beats an empty turn.
        // has to finish before close(), which ends the response: the host is
        // free to tear the function down once that happens.
        if (answer) {
          try {
            await supabase.from("messages").insert({
              session_id: sessionId,
              role: "assistant",
              content: answer,
              source_chunks: relevantChunks.map((c) => ({
                id: c.id,
                content: c.content,
                similarity: c.similarity,
              })),
              tokens_used: tokensUsed,
            });
          } catch (error) {
            // throwing here would reject against a controller nobody is watching
            console.error("Failed to save assistant message:", error);
          }
        }

        controller.close();
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    return serverError("Chat", error);
  }
}
