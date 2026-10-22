import { createAdminClient } from "@/lib/supabase/admin";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

const SUMMARY_MODEL = "qwen/qwen3.8-27b";

// longer documents are summarized in sections, then the summaries get summarized
const SECTION_CHARS = 24_000;
const PARALLEL_CALLS = 3; // keeps us under groq's rate limit
const MAX_PASSES = 6;

const SUMMARY_PROMPT = `You write a reference summary of a document, so that questions like "what is this about?" and "what are the key points?" can be answered from the summary alone.
Cover: what kind of document it is and who or what it is about; the main points, in the order they appear; important names, dates, numbers, contact details (emails, phone numbers, addresses, links) and terms.
Use short plain-text bullet points, under 400 words. Use only what the text says. Do not add opinions or anything that is not in the text.
The text may be the document itself, or summaries of consecutive parts of it. Either way, write one summary of the whole.`;

async function ask(text: string): Promise<string> {
  const res = await groq.chat.completions.create({
    model: SUMMARY_MODEL,
    temperature: 0.2,
    max_completion_tokens: 4096, // reasoning tokens count too
    reasoning_effort: "default",
    messages: [
      { role: "system", content: SUMMARY_PROMPT },
      { role: "user", content: text },
    ],
  });

  const summary = res.choices[0]?.message?.content?.trim();
  if (!summary) throw new Error("The model returned an empty summary");
  return summary;
}

function group(parts: string[], max: number): string[] {
  const groups: string[] = [];
  let current = "";

  for (const part of parts) {
    if (current && current.length + part.length > max) {
      groups.push(current);
      current = "";
    }
    current += (current ? "\n\n" : "") + part;
  }
  if (current) groups.push(current);

  return groups;
}

async function inBatches<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += PARALLEL_CALLS) {
    results.push(...(await Promise.all(items.slice(i, i + PARALLEL_CALLS).map(fn))));
  }
  return results;
}

export async function summarize(parts: string[]): Promise<string> {
  if (parts.length === 0) throw new Error("Nothing to summarize");

  let texts = parts;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    texts = await inBatches(group(texts, SECTION_CHARS), ask);
    if (texts.length === 1) return texts[0];
  }
  throw new Error("The summary did not converge");
}

export async function generateSummary(documentId: string): Promise<string> {
  const supabase = createAdminClient();

  const { data: chunks, error } = await supabase
    .from("chunks")
    .select("content")
    .eq("document_id", documentId)
    .order("chunk_index");
  if (error) throw new Error(`Chunk error: ${error.message}`);

  const summary = await summarize((chunks ?? []).map((c) => c.content));

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

  const items = await Promise.all(
    docs.map(async (doc) => ({
      title: doc.title,
      summary: doc.summary ?? (await generateSummary(doc.id)),
    })),
  );

  return join(items, !!session.collection_id);
}
