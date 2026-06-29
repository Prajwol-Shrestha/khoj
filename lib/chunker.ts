export function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = []
  let start = 0

  // clean up excessive whitespace from PDF extraction
  const cleaned = text.replace(/\s+/g, ' ').trim()

  while (start < cleaned.length) {
    const end = start + chunkSize
    chunks.push(cleaned.slice(start, end))
    start = end - overlap // overlap so context isn't lost at boundaries
  }

  return chunks.filter(c => c.trim().length > 20) // drop tiny useless chunks
}