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

  const { data: collection } = await admin
    .from("collections")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!collection) return jsonError("Collection not found", 404);

  const { data: links } = await admin
    .from("collection_documents")
    .select("document_id")
    .eq("collection_id", id);

  if (links && links.length > 0) {
    await admin
      .from("documents")
      .delete()
      .in(
        "id",
        links.map((link) => link.document_id),
      );
  }

  // collection_documents and chat_sessions cascade off the collection row
  const { error } = await admin.from("collections").delete().eq("id", id);
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

  return updateOwnedRow("collections", id, user.id, await req.json());
}
