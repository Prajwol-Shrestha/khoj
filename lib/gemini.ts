import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

async function embed(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[]> {
  const result = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: text,
    config: {
      outputDimensionality: 768,
      taskType,
    },
  });

  return result?.embeddings?.[0]?.values ?? [];
}

export function embedText(text: string): Promise<number[]> {
  return embed(text, "RETRIEVAL_DOCUMENT");
}

export function embedQuery(text: string): Promise<number[]> {
  return embed(text, "RETRIEVAL_QUERY");
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  // embed one by one — Gemini free tier has rate limits
  const embeddings: number[][] = [];
  for (const text of texts) {
    const embedding = await embedText(text);
    embeddings.push(embedding);
    // small delay to avoid hitting rate limits
    // 1500 req / minute
    await new Promise((r) => setTimeout(r, 100));
  }
  return embeddings;
}
