import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // verify ownership
  const { data: col } = await admin
    .from("collections")
    .select("id, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!col) {
    return NextResponse.json(
      { error: "Collection not found" },
      { status: 404 },
    );
  }

  // get all document ids in this collection
  const { data: colDocs } = await admin
    .from("collection_documents")
    .select("document_id")
    .eq("collection_id", id);

  // delete each document (cascades chunks)
  if (colDocs && colDocs.length > 0) {
    await admin
      .from("documents")
      .delete()
      .in(
        "id",
        colDocs.map((d) => d.document_id),
      );
  }

  // delete collection (cascades collection_documents + chat_sessions)
  const { error } = await admin.from("collections").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const allowed = ["title", "pinned"];
  const updates = Object.fromEntries(
    Object.entries(body).filter(([key]) => allowed.includes(key)),
  );

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("collections")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
