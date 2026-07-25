import { FileIcon, LayersIcon, PagesIcon } from "@/components/Icons";
import StatusDot from "@/components/StatusDot";
import { relativeTime } from "@/lib/format";
import { chatHref } from "@/lib/routes";
import type { DocumentRow } from "@/lib/types";
import Link from "next/link";

interface DocumentCardProps {
  doc: DocumentRow;
  sessionId?: string;
}

export default function DocumentCard({ doc, sessionId }: DocumentCardProps) {
  const time = relativeTime(doc.created_at);

  return (
    <Link
      href={chatHref(doc.id, sessionId)}
      className="group flex flex-col gap-4 rounded-xl border border-line bg-panel/60 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-green/50 hover:bg-panel-2/70"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-bright bg-panel-2 text-muted transition-colors group-hover:text-green">
          <FileIcon size={16} />
        </span>
        <StatusDot status={doc.status} />
      </div>

      <div className="min-w-0">
        <h3 className="truncate text-sm font-medium text-ink group-hover:text-green">
          {doc.title || doc.file_name}
        </h3>
        <p className="mono-label mt-1 truncate">{doc.file_name}</p>
      </div>

      <div className="mt-auto flex items-center gap-4 border-t border-line pt-3">
        <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted">
          <PagesIcon size={13} />
          {doc.page_count ?? "—"}p
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted">
          <LayersIcon size={13} />
          {doc.chunk_count ?? "—"}c
        </span>
        {time && (
          <span className="ml-auto font-mono text-xs text-faint">{time}</span>
        )}
      </div>
    </Link>
  );
}
