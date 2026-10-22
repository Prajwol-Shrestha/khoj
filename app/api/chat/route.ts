import { runAgent } from "@/lib/agent";
import { documentTools, type MatchedChunk } from "@/lib/agent-tools";
import { getUser, jsonError, serverError } from "@/lib/api";
import { GUEST_TOKEN_KEY } from "@/lib/guest";
import { rateLimit } from "@/lib/rate-limit";
import { encodeEvent } from "@/lib/sse";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role, SourceChunkData } from "@/lib/types";
import { NextRequest } from "next/server";

const MAX_HISTORY_MESSAGES = 10;
const NO_ANSWER = "I couldn't find that information in the document.";

const SYSTEM_PROMPT = `You are the assistant in a chat about an uploaded document, or about a few uploaded documents together. You answer strictly from what the document says, and you look things up with tools.
Start every reply with a tool call:
- search_document: for a specific question or detail. Before saying you couldn't find something, search at least twice with different wording.
- read_summary: for an overview of the document, or basic facts about it (what it is, who it is about, names, contact details).
- no_lookup_needed: for greetings, thanks, small talk and anything unrelated to the document.
Every tool call takes a short "reason": one sentence on what you need and why. Write no other text before a tool call.
Answer only from what the tools return. If it is not there, say "${NO_ANSWER}" Do not make up information. Be concise and clear.
If the user wants an overview and the summary seems to cover only part of the document, say so.`;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

interface HistoryMessage {
  role: Role;
  content: string;
}

interface ChatRequestBody {
  question?: string;
  sessionId?: string;
}

// the admin client skips row level security, so ownership is checked here
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

    // someone else's session looks like a missing one, so ids can't be probed
    if (sessionError || !session || !(await ownsSession(req, session))) {
      return jsonError("Session not found", 404);
    }

    // history comes from our table, not the request body, so it can't be forged
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

    const found = new Map<string, MatchedChunk>();
    const sources = (): SourceChunkData[] =>
      [...found.values()].map((c) => ({
        id: c.id,
        content: c.content,
        similarity: Math.round(c.similarity * 100) / 100,
        document_id: c.document_id,
      }));

    const stream = new ReadableStream({
      async start(controller) {
        let answer = "";
        let tokensUsed = 0;

        try {
          const result = await runAgent({
            system: SYSTEM_PROMPT,
            history: [...history, { role: "user", content: question }],
            tools: documentTools(session, found),
            onToken: (token) => {
              answer += token;
              controller.enqueue(encodeEvent({ type: "token", content: token }));
            },
            onStep: (step) => {
              // text before a tool call was the model thinking aloud, not the answer
              answer = "";
              controller.enqueue(encodeEvent({ type: "step", step }));
              controller.enqueue(encodeEvent({ type: "sources", sources: sources() }));
            },
          });
          answer = result.answer;
          tokensUsed = result.tokensUsed;

          controller.enqueue(encodeEvent({ type: "done" }));
        } catch (error) {
          console.error("Chat stream error:", error);
          controller.enqueue(
            encodeEvent({
              type: "error",
              message: error instanceof Error ? error.message : "Streaming failed",
            }),
          );
        }

        // has to finish before close(), the host may stop the function after it
        if (answer) {
          try {
            await supabase.from("messages").insert({
              session_id: sessionId,
              role: "assistant",
              content: answer,
              source_chunks: sources(),
              tokens_used: tokensUsed,
            });
          } catch (error) {
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
