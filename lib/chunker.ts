const CHUNK_SIZE = 900;
const OVERLAP = 150;

// Biggest natural break first: paragraph, then sentence, then word.
const SEPARATORS = ["\n\n", ". ", "? ", "! ", " "];

function clean(text: string): string {
  return (
    text
      .replace(/\r\n?/g, "\n")
      // Postgres rejects null bytes, and the rest are noise — but keep \n and \t
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      // a blank line is a paragraph break; a lone newline is just a wrapped line
      // (PDFs wrap every line), so join it with a space — never delete it, or
      // "end.\nStart" would fuse into one word
      .replace(/\n{2,}/g, "\n\n")
      .replace(/(?<!\n)\n(?!\n)/g, " ")
      .trim()
  );
}

// Cut at the biggest separator that works, recursing into any piece still too
// big. Each piece keeps its separator so joining the pieces gives back the text.
function pieces(text: string, size: number, seps: string[]): string[] {
  if (text.length <= size) return [text];

  const [sep, ...rest] = seps;
  if (sep === undefined) {
    // no separator left (one giant "word"): hard cut
    return Array.from({ length: Math.ceil(text.length / size) }, (_, i) =>
      text.slice(i * size, (i + 1) * size),
    );
  }

  return text
    .split(sep)
    .map((part, i, all) => (i < all.length - 1 ? part + sep : part))
    .filter(Boolean)
    .flatMap((part) => pieces(part, size, rest));
}

export function chunkText(
  text: string,
  chunkSize = CHUNK_SIZE,
  overlap = OVERLAP,
): string[] {
  const chunks: string[] = [];
  const current: string[] = [];
  let length = 0;

  for (const piece of pieces(clean(text), chunkSize, SEPARATORS)) {
    if (length + piece.length > chunkSize && current.length > 0) {
      chunks.push(current.join("").trim());
      // the next chunk starts with this one's tail, so a sentence cut by the
      // boundary still appears whole in one of them
      while (
        current.length > 0 &&
        (length > overlap || length + piece.length > chunkSize)
      ) {
        length -= current.shift()!.length;
      }
    }
    current.push(piece);
    length += piece.length;
  }
  if (current.length > 0) chunks.push(current.join("").trim());

  return chunks.filter((c) => c.length > 20); // drop tiny useless chunks
}
