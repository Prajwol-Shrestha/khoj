"use client";

import { ChevronDownIcon } from "@/components/Icons";
import type { AgentStep } from "@/lib/types";
import { useState } from "react";

const TOOL_LABELS: Record<string, string> = {
  search_document: "searched",
  read_summary: "read the summary",
  no_lookup_needed: "no lookup",
};

interface AgentStepsProps {
  steps: AgentStep[];
  live: boolean;
}

export default function AgentSteps({ steps, live }: AgentStepsProps) {
  const [open, setOpen] = useState(false);
  const shown = live || open;

  return (
    <div className="rounded-xl border border-line bg-panel/50 p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2"
      >
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm bg-amber"
          style={{ boxShadow: "0 0 8px -1px var(--amber)" }}
        />
        <span className="mono-label" style={{ color: "var(--amber)" }}>
          reasoning
        </span>
        <span className="font-mono text-xs tabular-nums text-faint">
          {String(steps.length).padStart(2, "0")}{" "}
          {steps.length === 1 ? "step" : "steps"}
        </span>
        <ChevronDownIcon
          size={14}
          className={`ml-auto text-muted transition-transform ${
            shown ? "rotate-180" : ""
          }`}
        />
      </button>

      {shown && (
        <ol className="mt-3 space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="font-mono text-xs text-faint">
                [{String(i + 1).padStart(2, "0")}]
              </span>
              <div className="min-w-0 space-y-1">
                {step.reason && (
                  <p className="text-[13px] italic leading-relaxed text-muted">
                    {step.reason}
                  </p>
                )}
                <p className="font-mono text-xs text-ink">
                  {TOOL_LABELS[step.tool] ?? step.tool}
                  {step.query && (
                    <span className="text-cyan"> “{step.query}”</span>
                  )}
                </p>
                <p className="font-mono text-[11px] text-faint">
                  → {step.outcome}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
