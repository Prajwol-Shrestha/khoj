"use client";

import StatusDot from "@/components/StatusDot";
import { formatDate } from "@/lib/format";
import type { DocStatus } from "@/lib/types";
import Link from "next/link";
import { useState, type ReactNode } from "react";

interface LibraryCardProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  status?: DocStatus;
  label?: string;
  stats?: ReactNode;
  createdAt: string | null | undefined;
  href?: string;
  pinned: boolean;
  busy: boolean;
  deleteLabel: string;
  onRename: (title: string) => Promise<void>;
  onTogglePin: () => void;
  onDelete: () => void;
}

export default function LibraryCard({
  icon,
  title,
  subtitle,
  status,
  label,
  stats,
  createdAt,
  href,
  pinned,
  busy,
  deleteLabel,
  onRename,
  onTogglePin,
  onDelete,
}: LibraryCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <div className="group relative flex flex-col gap-4 rounded-xl border border-line bg-panel/60 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-green/50 hover:bg-panel-2/70">
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-bright bg-panel-2 text-muted transition-colors group-hover:text-green">
          {icon}
        </span>
        <div className="flex items-center gap-3">
          {status && <StatusDot status={status} />}
          {label && (
            <span className="font-mono text-xs text-green">{label}</span>
          )}
          <button
            onClick={onTogglePin}
            className={`text-faint opacity-0 transition-all hover:text-green group-hover:opacity-100 ${pinned ? "opacity-100 text-green" : ""}`}
            aria-label={pinned ? "Unpin" : "Pin"}
            title={pinned ? "Unpin" : "Pin to top"}
          >
            {pinned ? "★" : "☆"}
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            className="cursor-pointer text-faint opacity-0 transition-opacity hover:text-red disabled:opacity-50 group-hover:opacity-100"
            aria-label={deleteLabel}
          >
            {busy ? "..." : "✕"}
          </button>
        </div>
      </div>

      <div className="min-w-0">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            // await before unmounting, or the old title flashes back while the PATCH is in flight
            onBlur={async () => {
              const next = draft.trim();
              if (next && next !== title) await onRename(next);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-full bg-transparent text-sm font-medium text-ink outline-none border-b border-green pb-0.5"
          />
        ) : (
          <h3
            className="truncate text-sm font-medium text-ink group-hover:text-green cursor-text"
            onDoubleClick={() => {
              setDraft(title);
              setEditing(true);
            }}
            title="Double-click to rename"
          >
            {title}
          </h3>
        )}
        {subtitle && <p className="mono-label mt-1 truncate">{subtitle}</p>}
      </div>

      <div className="mt-auto flex items-center gap-4 border-t border-line pt-3">
        {stats}
        <span className="ml-auto font-mono text-xs text-faint">
          {formatDate(createdAt)}
        </span>
      </div>

      {href && (
        <Link
          href={href}
          className="flex items-center justify-center rounded-lg border border-line-bright bg-panel-2 py-2 text-sm text-muted transition-colors hover:border-green/50 hover:text-green"
        >
          Open chat →
        </Link>
      )}
    </div>
  );
}
