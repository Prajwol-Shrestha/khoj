import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const MODEL = "gemini-embedding-001";
const DIMENSIONS = 768;

// embedContent takes an array and returns embeddings in the same order, so
// chunks go up in batches rather than one request each.
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 200;

// Documents and queries use different task types — Gemini tunes the vector for
// each side of the search, so these must not be swapped.
type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

async function embed(
  contents: string[],
  taskType: TaskType,
): Promise<number[][]> {
  const result = await ai.models.embedContent({
    model: MODEL,
    contents,
    config: { outputDimensionality: DIMENSIONS, taskType },
  });

  const embeddings = result.embeddings ?? [];
  if (embeddings.length !== contents.length) {
    // a short response would pair chunks with the wrong vectors
    throw new Error(
      `Expected ${contents.length} embeddings, got ${embeddings.length}`,
    );
  }

  return embeddings.map((e) => e.values ?? []);
}

export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await embed([text], "RETRIEVAL_QUERY");
  return embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    embeddings.push(
      ...(await embed(texts.slice(i, i + BATCH_SIZE), "RETRIEVAL_DOCUMENT")),
    );
  }

  return embeddings;
}
