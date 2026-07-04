export type DocStatus = "processing" | "ready" | "error";

export type Role = "user" | "assistant";

export interface DocumentRow {
  id: string;
  title: string;
  file_name: string;
  file_url: string | null;
  status: DocStatus;
  page_count: number | null;
  chunk_count: number | null;
  created_at?: string | null;
  session_token?: string | null;
  user_id?: string | null;
}

export interface ChatSessionRow {
  id: string;
  document_id: string;
  title: string | null;
}

export interface SourceChunkData {
  id?: string;
  content: string;
  similarity: number;
}

export interface MessageRow {
  id: string;
  session_id: string;
  role: Role;
  content: string;
  source_chunks: SourceChunkData[] | null;
  tokens_used: number | null;
  created_at?: string | null;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  sources?: SourceChunkData[];
  tokensUsed?: number;
  pending?: boolean;
  error?: boolean;
}

export interface UploadResponse {
  success: boolean;
  documentId: string;
  sessionId: string;
  chunkCount: number;
  pageCount: number;
}

export interface ChatApiResponse {
  answer: string;
  sources: SourceChunkData[];
  tokensUsed: number;
}

export interface ApiError {
  error: string;
}
