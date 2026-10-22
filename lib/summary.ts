import { createAdminClient } from "@/lib/supabase/admin";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

const SUMMARY_MODEL = "openai/gpt-oss-20b";

// groq's free tier allows about 7k input tokens a minute, so a summary is one call
// over chunks spread evenly across the document, not over the whole text
const MAX_CHUNKS = 13;

const SUMMARY_PROMPT = `You write a reference summary of a document, so that questions like "what is this about?" and "what are the key points?" can be answered from the summary alone.
Cover: what kind of document it is and who or what it is about; the main points, in the order they appear; important names, dates, numbers, contact details (emails, phone numbers, addresses, links) and terms.
Use short plain-text bullet points, under 400 words. Use only what the text says. Do not add opinions or anything that is not in the text.
The text may be excerpts spread across a long document, in order. Write one summary of the whole document.`;

async function ask(text: string): Promise<string> {
  const res = await groq.chat.completions.create({
    model: SUMMARY_MODEL,
    temperature: 0.2,
    max_completion_tokens: 4096, // reasoning tokens count too
    reasoning_effort: "low",
    messages: [
      { role: "system", content: SUMMARY_PROMPT },
      { role: "user", content: text },
    ],
  });

  const summary = res.choices[0]?.message?.content?.trim();
  if (!summary) throw new Error("The model returned an empty summary");
  return summary;
}

export async function generateSummary(documentId: string): Promise<string> {
  const supabase = createAdminClient();

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("chunk_count")
    .eq("id", documentId)
    .single();
  if (docError) throw new Error(`Document error: ${docError.message}`);

  // evenly spaced chunk indexes, first and last included
  const total = doc.chunk_count ?? 0;
  const count = Math.min(total, MAX_CHUNKS);
  const indexes = Array.from({ length: count }, (_, i) =>
    count === 1 ? 0 : Math.round((i * (total - 1)) / (count - 1)),
  );

  const { data: chunks, error } = await supabase
    .from("chunks")
    .select("content")
    .eq("document_id", documentId)
    .in("chunk_index", indexes)
    .order("chunk_index");
  if (error) throw new Error(`Chunk error: ${error.message}`);
  if (!chunks?.length) throw new Error("Nothing to summarize");

  const summary = await ask(chunks.map((c) => c.content).join("\n\n"));

  const { error: saveError } = await supabase
    .from("documents")
    .update({ summary })
    .eq("id", documentId);
  if (saveError) throw new Error(`Summary save error: ${saveError.message}`);

  return summary;
}

export type SessionScope = { document_id: string | null; collection_id: string | null };

async function loadDocs(session: SessionScope) {
  const supabase = createAdminClient();

  let ids = [session.document_id];
  if (session.collection_id) {
    const { data, error } = await supabase
      .from("collection_documents")
      .select("document_id")
      .eq("collection_id", session.collection_id);
    if (error) throw new Error(`Collection error: ${error.message}`);
    ids = (data ?? []).map((row) => row.document_id);
  }

  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, title, summary")
    .in("id", ids);
  if (error) throw new Error(`Summary error: ${error.message}`);
  if (!docs?.length) throw new Error("No documents to summarize");

  return docs;
}

function join(
  items: { title: string; summary: string }[],
  titled: boolean,
): string {
  return items
    .map((i) => (titled ? `## ${i.title}\n${i.summary}` : i.summary))
    .join("\n\n");
}

// what an overview question reads. a missing summary is built and saved here,
// which covers old uploads and failed builds
export async function getOverview(session: SessionScope): Promise<string> {
  const docs = await loadDocs(session);

  // one at a time, the token limit is per minute across all calls
  const items = [];
  for (const doc of docs) {
    items.push({
      title: doc.title,
      summary: doc.summary ?? (await generateSummary(doc.id)),
    });
  }

  return join(items, !!session.collection_id);
}
