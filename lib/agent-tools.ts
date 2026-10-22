import { defineTool, type AgentTool } from "@/lib/agent";
import { embedQuery } from "@/lib/gemini";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOverview, type SessionScope } from "@/lib/summary";
import type { SourceChunkData } from "@/lib/types";

const SIMILARITY_THRESHOLD = 0.5;

export interface MatchedChunk extends SourceChunkData {
  id: string;
}

// `found` collects every passage returned, for the sources shown with the answer
export function documentTools(
  session: SessionScope,
  found: Map<string, MatchedChunk>,
): AgentTool[] {
  const supabase = createAdminClient();

  return [
    defineTool(
      "search_document",
      "Search the document for passages that answer a specific question or detail. Returns the closest passages with similarity scores. Use specific keywords, not a full sentence.",
      {
        query: {
          type: "string",
          description:
            "What to look for. Must make sense on its own: replace words like 'he', 'it' or 'the second one' with what they refer to in the conversation.",
        },
      },
      async (args) => {
        const query = typeof args.query === "string" ? args.query.trim() : "";
        if (!query) throw new Error("query is required");

        const { data, error } = await supabase.rpc("match_chunks", {
          query_embedding: await embedQuery(query),
          match_document_id: session.document_id,
          match_collection_id: session.collection_id,
          match_count: session.collection_id ? 5 : 3,
        });
        if (error) throw new Error(`Search error: ${error.message}`);

        const hits = ((data as MatchedChunk[]) ?? []).filter(
          (c) => c.similarity >= SIMILARITY_THRESHOLD,
        );
        const fresh = hits.filter((c) => !found.has(c.id));
        fresh.forEach((c) => found.set(c.id, c));

        if (hits.length === 0) {
          return {
            content:
              "No passages matched. Try different keywords, or say you couldn't find it.",
            outcome: "nothing relevant found",
          };
        }
        // same passages again means rewording went nowhere
        if (fresh.length === 0) {
          return {
            content:
              "Nothing new, these are the passages you already have. Answer from them, or say you couldn't find it.",
            outcome: "nothing new, same passages as before",
          };
        }
        return {
          content: fresh
            .map((c) => `[Passage, similarity ${c.similarity.toFixed(2)}]\n${c.content}`)
            .join("\n\n"),
          outcome: `found ${fresh.length} passages`,
        };
      },
    ),

    defineTool(
      "read_summary",
      "Read the summary of the whole document (or of each document in a collection): what it is, who or what it is about, the main points, names and contact details. Use it for overview questions ('what is this about?', 'key points?') and basic facts about the document. For a specific detail, use search_document instead.",
      {},
      async () => ({
        content: await getOverview(session),
        outcome: "read the summary",
      }),
    ),

    defineTool(
      "no_lookup_needed",
      "Call this ONLY when the message is a greeting, thanks or other small talk that asks nothing about the document. Never use it for a question.",
      {},
      async () => ({
        content:
          "Reply in one short, friendly sentence and invite a question about the document. Do not state facts about the document.",
        outcome: "small talk, no lookup",
      }),
    ),
  ];
}
