const CHUNK_SIZE = 900;
const OVERLAP = 150;

const SEPARATORS = ["\n\n", ". ", "? ", "! ", " "];

function clean(text: string): string {
  return (
    text
      .replace(/\r\n?/g, "\n")
      // postgres rejects null bytes, the other control chars are noise (keeps \n and \t)
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      // blank line = paragraph break. a lone newline is a wrapped line (pdfs wrap
      // every line), so it becomes a space, deleting it would glue words together
      .replace(/\n{2,}/g, "\n\n")
      .replace(/(?<!\n)\n(?!\n)/g, " ")
      .trim()
  );
}

// pieces keep their separator, so joining them gives the text back
function pieces(text: string, size: number, seps: string[]): string[] {
  if (text.length <= size) return [text];

  const [sep, ...rest] = seps;
  if (sep === undefined) {
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
      // next chunk starts with this one's tail, so a sentence cut at the
      // boundary still shows up whole in one of them
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

  return chunks.filter((c) => c.length > 20);
}
