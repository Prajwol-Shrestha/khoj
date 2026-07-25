import type { SupportedMimeType } from "@/lib/files";
import pdfParse from "pdf-parse";

// strip markdown syntax so chunks read as prose, not markup
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "") // headings
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/\*(.+?)\*/g, "$1") // italic
    .replace(/`{1,3}[^`]*`{1,3}/g, "") // inline code + code blocks
    .replace(/\[(.+?)\]\(.+?\)/g, "$1") // links → keep label
    .replace(/^\s*[-*+]\s+/gm, "") // list bullets
    .replace(/^\s*\d+\.\s+/gm, "") // numbered lists
    .replace(/>{1,}\s+/gm, "") // blockquotes
    .replace(/---+/g, ""); // horizontal rules
}

export async function extractText(
  buffer: Buffer,
  mimeType: SupportedMimeType,
): Promise<{ text: string; pageCount?: number }> {
  switch (mimeType) {
    case "application/pdf": {
      const data = await pdfParse(buffer);
      return { text: data.text, pageCount: data.numpages };
    }

    case "text/plain":
    case "text/markdown":
      return { text: stripMarkdown(buffer.toString("utf-8")) };

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      return { text: value };
    }
  }
}
