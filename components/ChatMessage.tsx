"use client";

import { AlertIcon, ChevronDownIcon, ScanIcon } from "@/components/Icons";
import SourceChunk from "@/components/SourceChunk";
import type { ChatMessage as ChatMessageType } from "@/lib/types";
import { useState } from "react";

interface ChatMessageProps {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex animate-fade-up justify-end">
        <div className="max-w-[82%] rounded-2xl rounded-br-sm border border-line-bright bg-panel-2 px-4 py-2.5 text-[15px] leading-relaxed text-ink">
          {message.content}
        </div>
      </div>
    );
  }

  const sources = message.sources ?? [];

  return (
    <div className="flex animate-fade-up gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-green/30 bg-green/10 text-green">
        <ScanIcon size={16} />
      </span>

      <div className="min-w-0 flex-1 space-y-3">
        {message.pending ? (
          <div className="flex items-center gap-2.5 py-1.5 text-sm text-muted">
            <span className="scan-dots flex items-center" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            <span>Retrieving passages and composing an answer…</span>
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
            {message.content}
          </div>
        )}

        {message.error && (
          <div className="flex items-center gap-2 rounded-lg border border-red/40 bg-red/5 px-3 py-2 text-sm text-red">
            <AlertIcon size={15} />
            <span>{message.content}</span>
          </div>
        )}

        {sources.length > 0 && (
          <div className="rounded-xl border border-line bg-panel/50 p-3">
            <button
              type="button"
              onClick={() => setSourcesOpen((o) => !o)}
              className="flex w-full items-center gap-2"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm bg-cyan"
                style={{ boxShadow: "0 0 8px -1px var(--cyan)" }}
              />
              <span className="mono-label" style={{ color: "var(--cyan)" }}>
                sources
              </span>
              <span className="font-mono text-xs tabular-nums text-faint">
                {String(sources.length).padStart(2, "0")} matched
              </span>
              <ChevronDownIcon
                size={14}
                className={`ml-auto text-muted transition-transform ${
                  sourcesOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {sourcesOpen && (
              <div className="mt-3 space-y-2">
                {sources.map((s, i) => (
                  <SourceChunk key={s.id ?? i} index={i + 1} source={s} />
                ))}
              </div>
            )}
          </div>
        )}

        {typeof message.tokensUsed === "number" && message.tokensUsed > 0 && (
          <p className="mono-label">{message.tokensUsed} tokens</p>
        )}
      </div>
    </div>
  );
}
