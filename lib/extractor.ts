import pdfParse from 'pdf-parse'

export type SupportedMimeType =
  | 'application/pdf'
  | 'text/plain'
  | 'text/markdown'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const SUPPORTED_TYPES: SupportedMimeType[] = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export const SUPPORTED_EXTENSIONS = ['.pdf', '.txt', '.md', '.docx']

export function isSupportedType(mimeType: string): mimeType is SupportedMimeType {
  return SUPPORTED_TYPES.includes(mimeType as SupportedMimeType)
}

export async function extractText(
  buffer: Buffer,
  mimeType: SupportedMimeType
): Promise<{ text: string; pageCount?: number }> {
  switch (mimeType) {
    case 'application/pdf': {
      const data = await pdfParse(buffer)
      return { text: data.text, pageCount: data.numpages }
    }

    case 'text/plain':
    case 'text/markdown': {
      const text = buffer.toString('utf-8')
      // strip markdown syntax for cleaner chunking
      const cleaned = text
        .replace(/#{1,6}\s+/g, '')        // headings
        .replace(/\*\*(.+?)\*\*/g, '$1')  // bold
        .replace(/\*(.+?)\*/g, '$1')      // italic
        .replace(/`{1,3}[^`]*`{1,3}/g, '') // inline code + code blocks
        .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links → keep label
        .replace(/^\s*[-*+]\s+/gm, '')    // list bullets
        .replace(/^\s*\d+\.\s+/gm, '')    // numbered lists
        .replace(/>{1,}\s+/gm, '')        // blockquotes
        .replace(/---+/g, '')             // horizontal rules
      return { text: cleaned }
    }

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      return { text: result.value }
    }

    default:
      throw new Error(`Unsupported file type: ${mimeType}`)
  }
}