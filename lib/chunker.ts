const CHUNK_SIZE = 500;
const OVERLAP = 50;

export function chunkText(
  text: string,
  chunkSize = CHUNK_SIZE,
  overlap = OVERLAP,
): string[] {
  const cleaned = text
    // collapse first — stripping newlines up front would fuse "end.\nStart" into one word
    .replace(/\s+/g, " ")
    // Postgres rejects null bytes, and the rest are noise
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();

  const step = Math.max(1, chunkSize - overlap); // a step of 0 would loop forever
  const chunks: string[] = [];

  for (let start = 0; start < cleaned.length; start += step) {
    chunks.push(cleaned.slice(start, start + chunkSize));
  }

  return chunks.filter((c) => c.trim().length > 20); // drop tiny useless chunks
}
