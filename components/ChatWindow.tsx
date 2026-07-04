"use client";

import ChatMessage from "@/components/ChatMessage";
import {
  ArrowLeftIcon,
  ArrowUpIcon,
  LayersIcon,
  PagesIcon,
  ScanIcon,
} from "@/components/Icons";
import StatusDot from "@/components/StatusDot";
import { createClient } from "@/lib/supabase/client";
import type {
  ApiError,
  ChatApiResponse,
  ChatMessage as ChatMessageType,
  DocumentRow,
  MessageRow,
} from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface ChatWindowProps {
  docId: string;
  initialSessionId?: string;
}

type DocMeta = Pick<
  DocumentRow,
  "title" | "file_name" | "status" | "page_count" | "chunk_count"
>;

const STARTERS = [
  "Summarize this document",
  "What are the key points?",
  "What conclusions does it reach?",
];

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m-${Math.random().toString(36).slice(2)}`;
}

function rowToMessage(row: MessageRow): ChatMessageType {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    sources:
      row.role === "assistant" && row.source_chunks
        ? row.source_chunks
        : undefined,
    tokensUsed: row.tokens_used ?? undefined,
  };
}

export default function ChatWindow({
  docId,
  initialSessionId,
}: ChatWindowProps) {
  const [sessionId, setSessionId] = useState<string | undefined>(
    initialSessionId,
  );
  const [doc, setDoc] = useState<DocMeta | null>(null);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const supabase = createClient();

        const docRes = await supabase
          .from("documents")
          .select("title, file_name, status, page_count, chunk_count")
          .eq("id", docId)
          .maybeSingle();
        if (!cancelled && docRes.data) setDoc(docRes.data as DocMeta);

        let sid = initialSessionId;
        if (!sid) {
          const sRes = await supabase
            .from("chat_sessions")
            .select("id")
            .eq("document_id", docId)
            .limit(1);
          sid = (sRes.data as { id: string }[] | null)?.[0]?.id;
        }
        if (!cancelled) setSessionId(sid);

        if (sid) {
          let mRes = await supabase
            .from("messages")
            .select("*")
            .eq("session_id", sid)
            .order("created_at", { ascending: true });
          if (mRes.error) {
            mRes = await supabase
              .from("messages")
              .select("*")
              .eq("session_id", sid);
          }
          if (!cancelled && mRes.data) {
            setMessages((mRes.data as MessageRow[]).map(rowToMessage));
          }
        }
      } catch {
        if (!cancelled && initialSessionId) setSessionId(initialSessionId);
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [docId, initialSessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || sending) return;

      if (!sessionId) {
        setMessages((m) => [
          ...m,
          { id: newId(), role: "user", content: question },
          {
            id: newId(),
            role: "assistant",
            content:
              "No active session for this document. Try re-uploading it.",
            error: true,
          },
        ]);
        setInput("");
        return;
      }

      const pendingId = newId();
      setMessages((m) => [
        ...m,
        { id: newId(), role: "user", content: question },
        { id: pendingId, role: "assistant", content: "", pending: true },
      ]);
      setInput("");
      setSending(true);

      if (textareaRef.current) textareaRef.current.style.height = "auto";

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, sessionId }),
        });
        const data = (await res.json()) as ChatApiResponse | ApiError;

        if (!res.ok) {
          throw new Error(
            (data as ApiError).error ||
              "Something went wrong retrieving an answer.",
          );
        }

        const ok = data as ChatApiResponse;
        setMessages((m) =>
          m.map((msg) =>
            msg.id === pendingId
              ? {
                  id: pendingId,
                  role: "assistant",
                  content: ok.answer,
                  sources: ok.sources,
                  tokensUsed: ok.tokensUsed,
                }
              : msg,
          ),
        );
      } catch (e) {
        const message =
          e instanceof Error
            ? e.message
            : "Something went wrong retrieving an answer.";
        setMessages((m) =>
          m.map((msg) =>
            msg.id === pendingId
              ? {
                  id: pendingId,
                  role: "assistant",
                  content: message,
                  error: true,
                }
              : msg,
          ),
        );
      } finally {
        setSending(false);
      }
    },
    [sessionId, sending],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const showEmpty = ready && messages.length === 0;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <header className="z-20 shrink-0 border-b border-line bg-void/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link
            href="/"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line-bright bg-panel-2 text-muted transition-colors hover:border-green/50 hover:text-green"
            aria-label="Back to upload"
          >
            <ArrowLeftIcon size={16} />
          </Link>

          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-green/30 bg-green/10 text-green">
            <ScanIcon size={16} />
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-medium text-ink">
              {doc?.title || doc?.file_name || "Document"}
            </h1>
            <div className="mt-0.5 flex items-center gap-3">
              {doc ? (
                <StatusDot status={doc.status} showLabel />
              ) : (
                <span className="mono-label">loading</span>
              )}
            </div>
          </div>

          {doc && (
            <div className="hidden items-center gap-3 sm:flex">
              <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted">
                <PagesIcon size={13} />
                {doc.page_count ?? "—"}p
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted">
                <LayersIcon size={13} />
                {doc.chunk_count ?? "—"}c
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {showEmpty ? (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-green/30 bg-green/10 text-green">
                <ScanIcon size={22} />
              </span>
              <h2 className="mt-5 text-lg font-medium text-ink">
                Ask {doc?.title ? `"${doc.title}"` : "this document"} anything
              </h2>
              <p className="mt-2 max-w-sm text-sm text-muted">
                Questions are answered only from the document&apos;s contents,
                with the matched passages shown under each reply.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border border-line-bright bg-panel-2 px-4 py-2 text-sm text-muted transition-colors hover:border-green/50 hover:text-green"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m) => (
                <ChatMessage key={m.id} message={m} />
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-void/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="flex items-end gap-2 rounded-2xl border border-line-bright bg-panel px-3 py-2 transition-colors focus-within:border-green/50">
            <span className="pb-2 pl-1 font-mono text-green">&gt;</span>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={onInput}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Ask about this document…"
              className="max-h-40 flex-1 resize-none bg-transparent py-2 text-[15px] text-ink placeholder:text-faint focus:outline-none"
            />
            <button
              type="button"
              onClick={() => send(input)}
              disabled={!input.trim() || sending}
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green text-void transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:bg-line-bright disabled:text-faint"
              aria-label="Send question"
            >
              <ArrowUpIcon size={18} />
            </button>
          </div>
          <p className="mono-label mt-2 px-1 text-center">
            enter to send · shift + enter for a new line
          </p>
        </div>
      </div>
    </div>
  );
}
