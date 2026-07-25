import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardClient from "./dashboard-client";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient();
  const [
    { data: allDocuments },
    { data: collectionDocs },
    { data: collections },
    { data: sessions },
  ] = await Promise.all([
    admin
      .from("documents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    admin.from("collection_documents").select("document_id, collection_id"),
    admin
      .from("collections")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    admin
      .from("chat_sessions")
      .select("id, document_id, collection_id")
      .eq("user_id", user.id),
  ]);

  // filter standalone documents (not part of any collection)
  const collectionDocIdSet = new Set(
    (collectionDocs ?? []).map((cd) => cd.document_id),
  );
  const documents = (allDocuments ?? []).filter(
    (doc) => !collectionDocIdSet.has(doc.id),
  );

  // count documents per collection
  const collectionDocCounts: Record<string, number> = {};
  (collectionDocs ?? []).forEach((cd) => {
    collectionDocCounts[cd.collection_id] =
      (collectionDocCounts[cd.collection_id] ?? 0) + 1;
  });

  // build session map (document_id or collection_id → session_id)
  const sessionMap: Record<string, string> = {};
  (sessions ?? []).forEach((s) => {
    if (s.document_id) sessionMap[s.document_id] = s.id;
    if (s.collection_id) sessionMap[s.collection_id] = s.id;
  });

  return (
    <DashboardClient
      user={{
        email: user.email ?? "",
        name: user.user_metadata?.full_name ?? "",
        avatarUrl:
          user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? "",
      }}
      documents={documents ?? []}
      collections={collections ?? []}
      collectionDocCounts={collectionDocCounts}
      sessionMap={sessionMap}
    />
  );
}
