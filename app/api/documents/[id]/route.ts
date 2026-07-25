import { getUser, jsonError, updateOwnedRow } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const admin = createAdminClient();

  const { data: doc } = await admin
    .from("documents")
    .select("file_url")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!doc) return jsonError("Document not found", 404);

  if (doc.file_url) {
    const path = doc.file_url.split("/storage/v1/object/public/documents/")[1];
    if (path) await admin.storage.from("documents").remove([path]);
  }

  // chunks, sessions and messages cascade off the document row
  const { error } = await admin.from("documents").delete().eq("id", id);
  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getUser();
  if (!user) return jsonError("Unauthorized", 401);

  return updateOwnedRow("documents", id, user.id, await req.json());
}
