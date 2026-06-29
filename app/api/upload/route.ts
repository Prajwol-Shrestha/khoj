import { chunkText } from "@/lib/chunker";
import { embedBatch } from "@/lib/gemini";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient(); // get the user
    const supabase = createAdminClient(); // all DB/storage ops

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const sessionToken = formData.get("sessionToken") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDFs are supported" },
        { status: 400 },
      );
    }

    // get current user (null if guest)
    const {
      data: { user },
    } = await authClient.auth.getUser();

    // 1. upload PDF to Supabase Storage
    const fileBuffer = await file.arrayBuffer();
    const fileName = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
    const storagePath = user
      ? `${user.id}/${fileName}`
      : `guest/${sessionToken}/${fileName}`;

    const { error: storageError } = await supabase.storage
      .from("documents")
      .upload(storagePath, fileBuffer, { contentType: "application/pdf" });

    if (storageError) throw new Error(`Storage error: ${storageError.message}`);

    const {
      data: { publicUrl },
    } = supabase.storage.from("documents").getPublicUrl(storagePath);

    // 2. create document row (status: processing)
    const { data: document, error: docError } = await supabase
      .from("documents")
      .insert({
        user_id: user?.id ?? null,
        session_token: user ? null : sessionToken,
        title: file.name.replace(".pdf", ""),
        file_name: file.name,
        file_url: publicUrl,
        status: "processing",
      })
      .select()
      .single();

    if (docError) throw new Error(`Document insert error: ${docError.message}`);

    // 3. extract text from PDF
    const pdfData = await pdfParse(Buffer.from(fileBuffer));
    const rawText = pdfData.text;
    const pageCount = pdfData.numpages;

    if (!rawText || rawText.trim().length === 0) {
      await supabase
        .from("documents")
        .update({ status: "error" })
        .eq("id", document.id);
      return NextResponse.json(
        { error: "Could not extract text from PDF" },
        { status: 422 },
      );
    }

    // 4. chunk the text
    const chunks = chunkText(rawText);

    // 5. embed all chunks
    const embeddings = await embedBatch(chunks);

    // 6. store chunks + embeddings in DB
    const chunkRows = chunks.map((content, index) => ({
      document_id: document.id,
      content,
      chunk_index: index,
      embedding: JSON.stringify(embeddings[index]),
    }));

    const { error: chunkError } = await supabase
      .from("chunks")
      .insert(chunkRows);

    if (chunkError)
      throw new Error(`Chunk insert error: ${chunkError.message}`);

    // 7. update document status to ready
    await supabase
      .from("documents")
      .update({
        status: "ready",
        page_count: pageCount,
        chunk_count: chunks.length,
      })
      .eq("id", document.id);

    // 8. create a chat session
    const { data: session, error: sessionError } = await supabase
      .from("chat_sessions")
      .insert({
        document_id: document.id,
        user_id: user?.id ?? null,
        session_token: user ? null : sessionToken,
        title: document.title,
      })
      .select()
      .single();

    if (sessionError) throw new Error(`Session error: ${sessionError.message}`);

    return NextResponse.json({
      success: true,
      documentId: document.id,
      sessionId: session.id,
      chunkCount: chunks.length,
      pageCount,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}

// allow large file uploads
export const config = {
  api: { bodyParser: false },
};
