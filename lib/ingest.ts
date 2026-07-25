import { chunkText } from "@/lib/chunker";
import { extractText } from "@/lib/extractor";
import { isSupportedType, titleFromFileName } from "@/lib/files";
import { embedBatch } from "@/lib/gemini";
import { createAdminClient } from "@/lib/supabase/admin";

// Guests own their rows through a browser-local token; signed-in users through user_id.
export interface Owner {
  userId: string | null;
  sessionToken: string | null;
}

export function ownerColumns(owner: Owner) {
  return {
    user_id: owner.userId,
    session_token: owner.userId ? null : owner.sessionToken,
  };
}

export interface IngestedDocument {
  id: string;
  title: string;
  pageCount: number;
  chunkCount: number;
}

// store → create row → extract → chunk → embed → save chunks → mark ready
export async function ingestFile(
  file: File,
  owner: Owner,
): Promise<IngestedDocument> {
  const mimeType = file.type;
  if (!isSupportedType(mimeType)) {
    throw new Error(`${file.name}: unsupported file type`);
  }

  const supabase = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  const storagePath = [
    owner.userId ?? `guest/${owner.sessionToken}`,
    `${Date.now()}-${file.name.replace(/\s+/g, "-")}`,
  ].join("/");

  const { error: storageError } = await supabase.storage
    .from("documents")
    .upload(storagePath, buffer, { contentType: mimeType });
  if (storageError) {
    throw new Error(`${file.name}: storage error — ${storageError.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("documents").getPublicUrl(storagePath);

  const title = titleFromFileName(file.name);
  const { data: document, error: docError } = await supabase
    .from("documents")
    .insert({
      ...ownerColumns(owner),
      title,
      file_name: file.name,
      file_url: publicUrl,
      status: "processing",
    })
    .select("id")
    .single();
  if (docError) {
    throw new Error(`${file.name}: ${docError.message}`);
  }

  try {
    const { text, pageCount = 1 } = await extractText(buffer, mimeType);
    if (!text.trim()) {
      throw new Error(`Could not extract any text from ${file.name}`);
    }

    const chunks = chunkText(text);
    const embeddings = await embedBatch(chunks);

    const { error: chunkError } = await supabase.from("chunks").insert(
      chunks.map((content, index) => ({
        document_id: document.id,
        content,
        chunk_index: index,
        embedding: JSON.stringify(embeddings[index]),
      })),
    );
    if (chunkError) throw new Error(chunkError.message);

    await supabase
      .from("documents")
      .update({
        status: "ready",
        page_count: pageCount,
        chunk_count: chunks.length,
      })
      .eq("id", document.id);

    return { id: document.id, title, pageCount, chunkCount: chunks.length };
  } catch (error) {
    // without this the row would sit on "processing" forever
    await supabase
      .from("documents")
      .update({ status: "error" })
      .eq("id", document.id);
    throw error;
  }
}
