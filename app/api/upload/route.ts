import { getUser, jsonError, serverError } from "@/lib/api";
import {
  checkFile,
  MAX_FILES_PER_UPLOAD,
  titleFromFileName,
} from "@/lib/files";
import {
  ingestFile,
  ownerColumns,
  type IngestedDocument,
  type Owner,
} from "@/lib/ingest";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UploadResult } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  if (!rateLimit(req)) return jsonError("Too many requests", 429);

  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const sessionToken = formData.get("sessionToken") as string | null;

    if (files.length === 0) return jsonError("No files provided", 400);
    if (files.length > MAX_FILES_PER_UPLOAD) {
      return jsonError(
        `Maximum ${MAX_FILES_PER_UPLOAD} files allowed per upload.`,
        400,
      );
    }

    // check every file up front so a bad third one can't half-upload a batch
    for (const file of files) {
      const problem = checkFile(file);
      if (problem) return jsonError(problem, 400);
    }

    const user = await getUser();
    const owner: Owner = { userId: user?.id ?? null, sessionToken };

    if (files.length === 1) {
      const document = await ingestFile(files[0], owner);
      const sessionId = await insertSession(owner, {
        title: document.title,
        document_id: document.id,
        collection_id: null,
      });

      const result: UploadResult = {
        id: document.id,
        sessionId,
        kind: "document",
        documentCount: 1,
      };
      return NextResponse.json(result);
    }

    const supabase = createAdminClient();
    const title = `${titleFromFileName(files[0].name)} + ${files.length - 1} more`;

    const { data: collection, error: collectionError } = await supabase
      .from("collections")
      .insert({ ...ownerColumns(owner), title })
      .select("id")
      .single();
    if (collectionError) {
      throw new Error(`Collection error: ${collectionError.message}`);
    }

    const documents: IngestedDocument[] = [];
    for (const file of files) {
      const document = await ingestFile(file, owner);
      documents.push(document);

      // link as we go, so a later failure still leaves the finished files
      // in the collection rather than loose on the dashboard
      const { error: linkError } = await supabase
        .from("collection_documents")
        .insert({ collection_id: collection.id, document_id: document.id });
      if (linkError) {
        throw new Error(`Collection link error: ${linkError.message}`);
      }
    }

    const sessionId = await insertSession(owner, {
      title,
      document_id: null,
      collection_id: collection.id,
    });

    const result: UploadResult = {
      id: collection.id,
      sessionId,
      kind: "collection",
      documentCount: documents.length,
    };
    return NextResponse.json(result);
  } catch (error) {
    return serverError("Upload", error);
  }
}

async function insertSession(
  owner: Owner,
  session: {
    title: string;
    document_id: string | null;
    collection_id: string | null;
  },
): Promise<string> {
  const { data, error } = await createAdminClient()
    .from("chat_sessions")
    .insert({ ...ownerColumns(owner), ...session })
    .select("id")
    .single();

  if (error) throw new Error(`Session error: ${error.message}`);
  return data.id;
}
