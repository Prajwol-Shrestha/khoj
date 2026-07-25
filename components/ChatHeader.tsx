import {
  ArrowLeftIcon,
  LayersIcon,
  PagesIcon,
  ScanIcon,
} from "@/components/Icons";
import StatusDot from "@/components/StatusDot";
import type { DocMeta } from "@/hooks/useChat";
import Link from "next/link";

interface ChatHeaderProps {
  doc: DocMeta | null;
}

export default function ChatHeader({ doc }: ChatHeaderProps) {
  return (
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
              {doc.page_count ?? "—"} pages
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted">
              <LayersIcon size={13} />
              {doc.chunk_count ?? "—"} chunks
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
