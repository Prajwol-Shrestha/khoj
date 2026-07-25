// Browser-safe file rules. Extraction lives in extractor.ts (pdf-parse, server only).

export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export const SUPPORTED_EXTENSIONS = [".pdf", ".txt", ".md", ".docx"];

export const FILE_INPUT_ACCEPT = [
  ...SUPPORTED_EXTENSIONS,
  ...SUPPORTED_MIME_TYPES,
].join(",");

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 3;

export function isSupportedType(
  mimeType: string,
): mimeType is SupportedMimeType {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.(pdf|txt|md|docx)$/i, "");
}

// Returns a user-facing message, or null when the file is fine.
export function checkFile(file: File): string | null {
  if (!isSupportedType(file.type)) {
    return `${file.name}: unsupported type. Supported formats: ${SUPPORTED_EXTENSIONS.join(", ")}`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `${file.name}: file too large. Max 20MB.`;
  }
  return null;
}
