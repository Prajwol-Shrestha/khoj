"use client";

import { ArrowUpIcon } from "@/components/Icons";
import { useRef, useState } from "react";

interface ChatComposerProps {
  sending: boolean;
  disabled: boolean;
  onSend: (question: string) => void;
}

export default function ChatComposer({
  sending,
  disabled,
  onSend,
}: ChatComposerProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    if (!input.trim() || sending || disabled) return;
    onSend(input);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
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
            disabled={disabled}
            className="max-h-40 flex-1 resize-none bg-transparent py-2 text-[15px] text-ink placeholder:text-faint focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!input.trim() || sending || disabled}
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
  );
}
