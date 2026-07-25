"use client";

import { readEvents } from "@/lib/sse";
import { createClient } from "@/lib/supabase/client";
import type {
  ApiError,
  ChatMessage,
  DocumentRow,
  MessageRow,
} from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";

export type DocMeta = Pick<
  DocumentRow,
  "title" | "file_name" | "status" | "page_count" | "chunk_count"
>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GENERIC_SEND_ERROR = "Something went wrong retrieving an answer.";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m-${Math.random().toString(36).slice(2)}`;
}

function rowToMessage(row: MessageRow): ChatMessage {
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

export function useChat(id: string, initialSessionId?: string) {
  const [sessionId, setSessionId] = useState<string | undefined>(
    initialSessionId,
  );
  const [doc, setDoc] = useState<DocMeta | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // read through refs so send() keeps a stable identity — messages change on every streamed token
  const messagesRef = useRef<ChatMessage[]>([]);
  const sendingRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const supabase = createClient();

        let sid = initialSessionId;
        // the id is spliced into a PostgREST filter string, so only accept a plain uuid
        if (!sid && UUID_RE.test(id)) {
          const sessions = await supabase
            .from("chat_sessions")
            .select("id")
            .or(`document_id.eq.${id},collection_id.eq.${id}`)
            .limit(1);
          sid = sessions.data?.[0]?.id;
        }

        if (!cancelled) setSessionId(sid);

        const docRes = await supabase
          .from("documents")
          .select("title, file_name, status, page_count, chunk_count")
          .eq("id", id)
          .maybeSingle();

        if (docRes.error) {
          if (!cancelled) setInitError("Failed to load document.");
          return;
        }

        if (docRes.data) {
          if (!cancelled) setDoc(docRes.data as DocMeta);
        } else {
          // no document with this id means it addresses a collection
          const colRes = await supabase
            .from("collections")
            .select("title")
            .eq("id", id)
            .maybeSingle();

          if (colRes.error) {
            if (!cancelled) setInitError("Failed to load collection.");
            return;
          }

          if (colRes.data && !cancelled) {
            setDoc({
              title: colRes.data.title,
              file_name: "",
              status: "ready",
              page_count: null,
              chunk_count: null,
            });
          }
        }

        if (sid) {
          const mRes = await supabase
            .from("messages")
            .select("*")
            .eq("session_id", sid)
            .order("created_at", { ascending: true });

          if (mRes.error) {
            console.error("Failed to load message history:", mRes.error);
          } else if (!cancelled && mRes.data) {
            setMessages((mRes.data as MessageRow[]).map(rowToMessage));
          }
        }
      } catch {
        if (!cancelled) setInitError("Something went wrong loading this page.");
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [id, initialSessionId]);

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || sendingRef.current) return;

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
        return;
      }

      const pendingId = newId();
      setMessages((m) => [
        ...m,
        { id: newId(), role: "user", content: question },
        { id: pendingId, role: "assistant", content: "", pending: true },
      ]);
      sendingRef.current = true;
      setSending(true);

      const patchPending = (patch: (msg: ChatMessage) => ChatMessage) =>
        setMessages((m) =>
          m.map((msg) => (msg.id === pendingId ? patch(msg) : msg)),
        );

      try {
        const history = messagesRef.current
          .filter((m) => !m.pending && !m.error)
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, sessionId, history }),
        });

        if (!res.ok) {
          const data = (await res.json()) as ApiError;
          throw new Error(data.error || GENERIC_SEND_ERROR);
        }

        if (!res.body) throw new Error("Failed to get stream reader");

        for await (const event of readEvents(res.body)) {
          if (event.type === "sources") {
            patchPending((msg) => ({ ...msg, sources: event.sources }));
          } else if (event.type === "token") {
            patchPending((msg) => ({
              ...msg,
              content: msg.content + event.content,
              pending: false,
            }));
          } else if (event.type === "error") {
            throw new Error(event.message);
          } else if (event.type === "done") {
            break;
          }
        }
      } catch (e) {
        patchPending(() => ({
          id: pendingId,
          role: "assistant",
          content: e instanceof Error ? e.message : GENERIC_SEND_ERROR,
          error: true,
        }));
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [sessionId],
  );

  return { doc, messages, sending, ready, initError, send };
}
