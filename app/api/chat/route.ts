import { jsonError, serverError } from "@/lib/api";
import { embedQuery } from "@/lib/gemini";
import { rateLimit } from "@/lib/rate-limit";
import { encodeEvent } from "@/lib/sse";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role, SourceChunkData } from "@/lib/types";
import Groq from "groq-sdk";
import type { CompletionUsage } from "groq-sdk/resources/completions";
import { NextRequest } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

const SIMILARITY_THRESHOLD = 0.5;
const MAX_HISTORY_MESSAGES = 10;
const NO_ANSWER = "I couldn't find that information in the document.";

// small and fast: it only rewrites one line, so it shouldn't add noticeable latency
const CONDENSE_MODEL = "openai/gpt-oss-20b";
const CONDENSE_CONTEXT_MESSAGES = 4;
const CONDENSE_SNIPPET_CHARS = 500;

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

// "and the second one?" embeds to nothing useful on its own. Rewrite it into a
// standalone query using the recent conversation. Retrieval only — the answer
// prompt still gets the user's original wording. Any failure falls back to the
// raw question, so this can only help, never block a reply.
async function condenseQuestion(
  question: string,
  history: HistoryMessage[],
): Promise<string> {
  if (history.length === 0) return question;

  const transcript = history
    .slice(-CONDENSE_CONTEXT_MESSAGES)
    .map(
      (m) =>
        `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, CONDENSE_SNIPPET_CHARS)}`,
    )
    .join("\n");

  try {
    const res = await groq.chat.completions.create({
      model: CONDENSE_MODEL,
      temperature: 0,
      max_completion_tokens: 512, // reasoning tokens count against this
      reasoning_effort: "low",
      messages: [
        {
          role: "system",
          content:
            "Rewrite the user's last message as a standalone search query for finding passages in a document. " +
            'Resolve references like "it", "that", "the second one" using the conversation. ' +
            "Keep names and key terms. If the message already stands alone, return it unchanged. " +
            "Output only the query — no quotes, no explanation.",
        },
        {
          role: "user",
          content: `Conversation:\n${transcript}\n\nLast message: ${question}`,
        },
      ],
    });
    return res.choices[0]?.message?.content?.trim() || question;
  } catch (error) {
    console.error("Condense failed, using raw question:", error);
    return question;
  }
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
      .select("id, document_id, collection_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) return jsonError("Session not found", 404);

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

    const questionEmbedding = await embedQuery(
      await condenseQuestion(question, history),
    );

    const { data: chunks, error: searchError } = await supabase.rpc(
      "match_chunks",
      {
        query_embedding: questionEmbedding,
        match_document_id: session.document_id,
        match_collection_id: session.collection_id,
        match_count: session.collection_id ? 5 : 3,
      },
    );
    if (searchError) throw new Error(`Search error: ${searchError.message}`);

    const relevantChunks = ((chunks as MatchedChunk[]) ?? []).filter(
      (c) => c.similarity >= SIMILARITY_THRESHOLD,
    );

    if (relevantChunks.length === 0) {
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

    const context = relevantChunks
      .map((c, i) => `[Chunk ${i + 1}]:\n${c.content}`)
      .join("\n\n");

    const messages = [
      {
        role: "system" as const,
        content: `You are a helpful assistant that answers questions based strictly on the provided document context.
If the answer is not in the context, say "I couldn't find that information in the document."
Do not make up information. Be concise and clear.

Context from document:
${context}`,
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
