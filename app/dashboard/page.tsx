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

  const { data: documents } = await admin
    .from("documents")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: sessions } = await admin
    .from("chat_sessions")
    .select("id, document_id")
    .eq("user_id", user.id);

  // build a map of document_id -> session_id
  const sessionMap: Record<string, string> = {};
  (sessions ?? []).forEach((s) => {
    if (s.document_id) sessionMap[s.document_id] = s.id;
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
      sessionMap={sessionMap}
    />
  );
}
