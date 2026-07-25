import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const GUEST_TABLES = ["documents", "collections", "chat_sessions"] as const;

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const sessionToken = request.cookies.get("khoj_session_token")?.value;

      if (sessionToken) {
        const admin = createAdminClient();

        for (const table of GUEST_TABLES) {
          await admin
            .from(table)
            .update({ user_id: data.user.id, session_token: null })
            .eq("session_token", sessionToken);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
