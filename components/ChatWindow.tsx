"use client";

import ChatComposer from "@/components/ChatComposer";
import ChatHeader from "@/components/ChatHeader";
import ChatMessage from "@/components/ChatMessage";
import { ScanIcon } from "@/components/Icons";
import { useChat } from "@/hooks/useChat";
import { useEffect, useRef } from "react";

interface ChatWindowProps {
  id: string;
  initialSessionId?: string;
}

const STARTERS = [
  "Summarize this document",
  "What are the key points?",
  "What conclusions does it reach?",
];

export default function ChatWindow({ id, initialSessionId }: ChatWindowProps) {
  const { doc, messages, sending, ready, initError, send } = useChat(
    id,
    initialSessionId,
  );

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const showEmpty = ready && messages.length === 0 && !initError;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <ChatHeader doc={doc} />

      {initError && (
        <div className="shrink-0 border-b border-red/30 bg-red/5 px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <span className="text-sm text-red">⚠</span>
            <p className="flex-1 text-sm text-red/80">{initError}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-muted underline underline-offset-4 transition-colors hover:text-ink"
            >
              Retry
            </button>
          </div>
        </div>
      )}

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

      <ChatComposer sending={sending} disabled={!!initError} onSend={send} />
    </div>
  );
}
