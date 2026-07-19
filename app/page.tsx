"use client";

import DocumentCard from "@/components/DocumentCard";
import { ScanIcon } from "@/components/Icons";
import { SignOutButton } from "@/components/SignOutButton";
import UploadDropzone from "@/components/UploadDropzone";
import UserAvatar from "@/components/UserAvatar";
import { getGuestToken } from "@/lib/guest";
import { createClient } from "@/lib/supabase/client";
import type { ChatSessionRow, DocumentRow } from "@/lib/types";
import { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

export default function Home() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [sessions, setSessions] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createClient();

        // check if user is logged in
        const {
          data: { user },
        } = await supabase.auth.getUser();

        let docsQuery = supabase
          .from("documents")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(9);

        let sessQuery = supabase
          .from("chat_sessions")
          .select("id, document_id");

        if (user) {
          // logged in — fetch by user_id
          docsQuery = docsQuery.eq("user_id", user.id);
          sessQuery = sessQuery.eq("user_id", user.id);
        } else {
          // guest — fetch by session_token
          const token = getGuestToken();
          if (!token) return;
          docsQuery = docsQuery.eq("session_token", token);
          sessQuery = sessQuery.eq("session_token", token);
        }

        const { data: docs, error: docsError } = await docsQuery;
        if (docsError) console.error("Failed to fetch documents:", docsError);

        const { data: sessData, error: sessError } = await sessQuery;
        if (sessError) console.error("Failed to fetch sessions:", sessError);

        if (cancelled) return;

        const map: Record<string, string> = {};
        ((sessData ?? []) as ChatSessionRow[]).forEach((s) => {
          if (s.document_id) map[s.document_id] = s.id;
        });

        setDocs((docs ?? []) as DocumentRow[]);
        setSessions(map);
      } catch {
        console.log("Error loading documents");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-void/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <span className="flex items-center gap-2 font-mono text-sm font-semibold tracking-tight text-ink">
            <ScanIcon size={16} className="text-green" />
            khoj<span className="caret">_</span>
          </span>

          <div className="flex items-center gap-4">
            <span className="mono-label hidden items-center gap-2 sm:flex">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-green"
                style={{ boxShadow: "0 0 8px var(--green)" }}
              />
              online · llama-3.1 · gemini-embed
            </span>

            {user ? (
              <div className="flex items-center gap-3">
                <a
                  href="/dashboard"
                  className="text-sm text-muted transition-colors hover:text-ink"
                >
                  Dashboard
                </a>
                <UserAvatar
                  name={user.user_metadata?.full_name}
                  email={user.email}
                  avatarUrl={
                    user.user_metadata?.avatar_url ??
                    user.user_metadata?.picture
                  }
                />
                <SignOutButton />
              </div>
            ) : (
              <a
                href="/login"
                className="rounded-lg border border-line-bright bg-panel-2 px-3 py-1.5 text-sm text-muted transition-colors hover:border-green/50 hover:text-green"
              >
                Sign in
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-16">
          <div className="animate-fade-up">
            <p className="mono-label flex items-center gap-2">
              <span className="h-px w-6 bg-green/50" />
              document retrieval engine
            </p>
            <h1 className="mt-5 font-mono text-5xl font-bold tracking-tight text-ink sm:text-6xl">
              khoj<span className="text-green text-glow">_</span>
            </h1>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-muted">
              Upload a PDF and ask questions in plain language. khoj retrieves
              the most relevant passages and answers from them — every response
              cites the exact chunks it used.
            </p>
          </div>

          <div
            className="relative mt-10 animate-fade-up"
            style={{ animationDelay: "80ms" }}
          >
            <div className="scanline" aria-hidden />
            <UploadDropzone />
          </div>

          <p className="mono-label mt-6 text-center">
            {user
              ? "documents saved to your account"
              : "documents stay scoped to this browser · sign in to save permanently"}
          </p>
        </section>

        {loaded && docs.length > 0 && (
          <section className="mx-auto w-full max-w-5xl px-5 pb-24">
            <div className="flex items-center gap-3">
              <span className="mono-label">recent documents</span>
              <span className="h-px flex-1 bg-line" />
              <span className="font-mono text-xs tabular-nums text-faint">
                {String(docs.length).padStart(2, "0")}
              </span>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {docs.map((d) => (
                <DocumentCard key={d.id} doc={d} sessionId={sessions[d.id]} />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
