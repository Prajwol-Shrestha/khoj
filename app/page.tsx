"use client";

import DocumentCard from "@/components/DocumentCard";
import { ScanIcon } from "@/components/Icons";
import UploadDropzone from "@/components/UploadDropzone";
import { getGuestToken } from "@/lib/guest";
import { createClient } from "@/lib/supabase/client";
import type { ChatSessionRow, DocumentRow } from "@/lib/types";
import { useEffect, useState } from "react";

export default function Home() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [sessions, setSessions] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const token = getGuestToken();
        if (!token) return;

        const supabase = createClient();

        const { data: docs, error: docsError } = await supabase
          .from("documents")
          .select("*")
          .eq("session_token", token)
          .order("created_at", { ascending: false })
          .limit(9);

        if (docsError) {
          console.error("Failed to fetch documents:", docsError);
        }

        const { data: sessData, error: sessError } = await supabase
          .from("chat_sessions")
          .select("id, document_id")
          .eq("session_token", token);  // session_token for guest user - like temp id

        if (sessError) {
          console.error("Failed to fetch sessions:", sessError);
        }

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
          <span className="mono-label hidden items-center gap-2 sm:flex">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-green"
              style={{ boxShadow: "0 0 8px var(--green)" }}
            />
            online · llama-3.1 · gemini-embed
          </span>
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
            documents stay scoped to this browser
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
