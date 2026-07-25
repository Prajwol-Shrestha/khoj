import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function serverError(context: string, error: unknown) {
  console.error(`${context}:`, error);
  return jsonError(
    error instanceof Error ? error.message : `${context} failed`,
    500,
  );
}

// Null for guests. The auth client reads cookies; the admin client does the work.
export async function getUser() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  return user;
}

export type OwnedTable = "documents" | "collections";

const EDITABLE_FIELDS = ["title", "pinned"] as const;

// Rename / pin. Documents and collections behave identically here.
// Ownership is enforced by the user_id match — someone else's row updates
// zero rows and 404s.
export async function updateOwnedRow(
  table: OwnedTable,
  id: string,
  userId: string,
  body: unknown,
) {
  const updates = pickEditableFields(body);
  if (!updates) return jsonError("No valid fields to update", 400);

  const { data, error } = await createAdminClient()
    .from(table)
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Not found", 404);

  return NextResponse.json({ data });
}

function pickEditableFields(body: unknown) {
  if (!body || typeof body !== "object") return null;

  const updates: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      updates[field] = (body as Record<string, unknown>)[field];
    }
  }

  return Object.keys(updates).length > 0 ? updates : null;
}
