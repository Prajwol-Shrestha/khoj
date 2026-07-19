import { embedQuery } from "@/lib/gemini";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role, SourceChunkData } from "@/lib/types";
import Groq from "groq-sdk";
import type { CompletionUsage } from "groq-sdk/resources/completions";
import { NextRequest, NextResponse } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

interface MatchedChunk extends SourceChunkData {
  id: string;
}

interface HistoryMessage {
  role: Role;
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const { question, sessionId, history } = await req.json();

    if (!question || !sessionId) {
      return NextResponse.json(
        { error: "question and sessionId are required" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    // 1. get the session + document
    const { data: session, error: sessionError } = await supabase
      .from("chat_sessions")
      .select("id, document_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // 2. save user message
    await supabase.from("messages").insert({
      session_id: sessionId,
      role: "user",
      content: question,
    });

    // 3. embed the question
    const questionEmbedding = await embedQuery(question);

    // 4. vector search — find top 3 relevant chunks
    const { data: chunks, error: searchError } = await supabase.rpc(
      "match_chunks",
      {
        query_embedding: questionEmbedding,
        match_document_id: session.document_id,
        match_count: 3,
      },
    );

    if (searchError) throw new Error(`Search error: ${searchError.message}`);

    // filter out chunks that aren't actually relevant
    const SIMILARITY_THRESHOLD = 0.5;
    const relevantChunks = (chunks as MatchedChunk[] ?? []).filter(
      (c) => c.similarity >= SIMILARITY_THRESHOLD,
    );

    if (relevantChunks.length === 0) {
      const answer = "I couldn't find that information in the document.";

      await supabase.from("messages").insert({
        session_id: sessionId,
        role: "assistant",
        content: answer,
        source_chunks: [],
      });

      return new Response(
        JSON.stringify({ answer, sources: [], tokensUsed: 0 }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // 5. build context from relevantChunks
    const context = relevantChunks
      .map((c, i) => `[Chunk ${i + 1}]:\n${c.content}`)
      .join("\n\n");

    // 6. build the prompt
    const systemMessage = {
      role: "system" as const,
      content: `You are a helpful assistant that answers questions based strictly on the provided document context.
If the answer is not in the context, say "I couldn't find that information in the document."
Do not make up information. Be concise and clear.

Context from document:
${context}`,
    };

    const historyMessages: HistoryMessage[] = (history ?? []).map(
      (m: HistoryMessage) => ({
        role: m.role,
        content: m.content,
      }),
    );

    // 7. create a ReadableStream to send tokens as they arrive

    const sources: SourceChunkData[] = relevantChunks.map((c) => ({
      content: c.content,
      similarity: Math.round(c.similarity * 100) / 100,
    }));

    let fullAnswer = "";
    let tokensUsed = 0;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        // first chunk — send sources immediately so UI can show them
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "sources", sources })}\n\n`,
          ),
        );

        // stream_options are not supported in groq right now
        // but it send token usage in last chunk
        const completion = await groq.chat.completions.create({
          model: "llama-3.1-8b-instant",
          messages: [
            systemMessage,
            ...historyMessages,
            { role: "user", content: question },
          ],
          max_tokens: 1024,
          temperature: 0.3,
          stream: true,
          // stream_options: {
          //   include_usage: true,
          // },
        });

        for await (const chunk of completion) {
          const token = chunk.choices[0]?.delta?.content ?? "";
          if (token) {
            fullAnswer += token;
            // send data as sse
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "token", content: token })}\n\n`,
              ),
            );
          }

          // Usage is only present on the LAST chunk
          if ("usage" in chunk && chunk.usage) {
            tokensUsed = (chunk.usage as CompletionUsage).total_tokens;
          }
        }

        // save the full answer to DB once streaming is done
        await supabase.from("messages").insert({
          session_id: sessionId,
          role: "assistant",
          content: fullAnswer,
          source_chunks: relevantChunks.map((c) => ({
            id: c.id,
            content: c.content,
            similarity: c.similarity,
          })),
          tokens_used: tokensUsed,
        });

        // signal the end
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`),
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat failed" },
      { status: 500 },
    );
  }
}
