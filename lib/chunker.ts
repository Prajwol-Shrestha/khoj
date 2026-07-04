export function chunkText(
  text: string,
  chunkSize = 500,
  overlap = 50,
): string[] {
  const chunks: string[] = [];
  let start = 0;

  const cleaned = text
    .replace(/\u0000/g, "") // remove null bytes — Postgres can't store these
    .replace(/[\u0001-\u001F\u007F]/g, "") // remove other control characters
    .replace(/\s+/g, " ")
    .trim();

  while (start < cleaned.length) {
    const end = start + chunkSize;
    chunks.push(cleaned.slice(start, end));
    start = end - overlap; // overlap so context isn't lost at boundaries
  }

  return chunks.filter((c) => c.trim().length > 20); // drop tiny useless chunks
}
