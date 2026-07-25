"use client";

import DocumentCard from "@/components/DocumentCard";
import SectionHeader from "@/components/SectionHeader";
import SiteHeader from "@/components/SiteHeader";
import UploadDropzone from "@/components/UploadDropzone";
import { getGuestToken } from "@/lib/guest";
import { createClient } from "@/lib/supabase/client";
import type { ChatSessionRow, DocumentRow } from "@/lib/types";
import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

export default function Home() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [sessions, setSessions] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        setUser(authUser);

        let docsQuery = supabase
          .from("documents")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(9);

        let sessQuery = supabase
          .from("chat_sessions")
          .select("id, document_id");

        if (authUser) {
          docsQuery = docsQuery.eq("user_id", authUser.id);
          sessQuery = sessQuery.eq("user_id", authUser.id);
        } else {
          const token = getGuestToken();
          if (!token) return;
          docsQuery = docsQuery.eq("session_token", token);
          sessQuery = sessQuery.eq("session_token", token);
        }

        const { data: docRows, error: docsError } = await docsQuery;
        if (docsError) console.error("Failed to fetch documents:", docsError);

        const { data: sessRows, error: sessError } = await sessQuery;
        if (sessError) console.error("Failed to fetch sessions:", sessError);

        if (cancelled) return;

        const map: Record<string, string> = {};
        ((sessRows ?? []) as ChatSessionRow[]).forEach((s) => {
          if (s.document_id) map[s.document_id] = s.id;
        });

        setDocs((docRows ?? []) as DocumentRow[]);
        setSessions(map);
      } catch (error) {
        console.error("Failed to load documents:", error);
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
      <SiteHeader
        user={
          user
            ? {
                name: user.user_metadata?.full_name,
                email: user.email,
                avatarUrl:
                  user.user_metadata?.avatar_url ?? user.user_metadata?.picture,
              }
            : null
        }
        showDashboardLink
      />

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
            <SectionHeader label="recent documents" count={docs.length} />
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
