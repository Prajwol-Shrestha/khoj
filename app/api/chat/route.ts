import { jsonError, serverError } from "@/lib/api";
import { embedQuery } from "@/lib/gemini";
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
  history?: HistoryMessage[];
}

export async function POST(req: NextRequest) {
  try {
    const {
      question,
      sessionId,
      history = [],
    } = (await req.json()) as ChatRequestBody;

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

    await supabase.from("messages").insert({
      session_id: sessionId,
      role: "user",
      content: question,
    });

    const questionEmbedding = await embedQuery(question);

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
      ...history
        .slice(-MAX_HISTORY_MESSAGES)
        .map(({ role, content }) => ({ role, content })),
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
