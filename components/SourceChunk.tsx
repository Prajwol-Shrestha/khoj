"use client";

import { ChevronDownIcon } from "@/components/Icons";
import MatchMeter from "@/components/MatchMeter";
import type { SourceChunkData } from "@/lib/types";
import { useState } from "react";

interface SourceChunkProps {
  index: number;
  source: SourceChunkData;
}

export default function SourceChunk({ index, source }: SourceChunkProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-line bg-void/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-faint">
          [{String(index).padStart(2, "0")}]
        </span>
        <MatchMeter similarity={source.similarity} />
      </div>

      <p
        className={`mt-2.5 text-[13px] leading-relaxed text-muted ${
          open ? "" : "line-clamp-2"
        }`}
      >
        {source.content}
      </p>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-faint transition-colors hover:text-cyan"
      >
        <ChevronDownIcon
          size={12}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
        {open ? "collapse" : "expand"}
      </button>
    </div>
  );
}
