"use client";

import { FileIcon, LayersIcon, PagesIcon, ScanIcon } from "@/components/Icons";
import LibraryCard from "@/components/LibraryCard";
import SectionHeader from "@/components/SectionHeader";
import SiteHeader from "@/components/SiteHeader";
import { useLibrary } from "@/hooks/useLibrary";
import { pluralize } from "@/lib/format";
import { chatHref } from "@/lib/routes";
import type { CollectionRow, DocumentRow } from "@/lib/types";
import Link from "next/link";

interface Props {
  user: { email: string; name: string; avatarUrl?: string };
  documents: DocumentRow[];
  collections: CollectionRow[];
  collectionDocCounts: Record<string, number>;
  sessionMap: Record<string, string>;
}

export default function DashboardClient({
  user,
  documents,
  collections,
  collectionDocCounts,
  sessionMap,
}: Props) {
  const docs = useLibrary("documents", documents);
  const cols = useLibrary("collections", collections);

  const isEmpty = docs.items.length === 0 && cols.items.length === 0;

  return (
    <>
      <SiteHeader user={user} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12">
        <div className="flex animate-fade-up items-center justify-between">
          <div>
            <p className="mono-label flex items-center gap-2">
              <span className="h-px w-6 bg-green/50" />
              your library
            </p>
            <h1 className="mt-3 font-mono text-3xl font-bold tracking-tight text-ink">
              Documents
            </h1>
            <p className="mt-1 text-sm text-muted">
              {isEmpty
                ? "No documents yet"
                : [
                    docs.items.length > 0 &&
                      pluralize(docs.items.length, "document"),
                    cols.items.length > 0 &&
                      pluralize(cols.items.length, "collection"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
          </div>
          <Link
            href="/"
            className="rounded-xl border border-line-bright bg-panel-2 px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-green/50 hover:text-green"
          >
            + Upload new
          </Link>
        </div>

        {isEmpty && (
          <div
            className="mt-16 flex animate-fade-up flex-col items-center justify-center text-center"
            style={{ animationDelay: "80ms" }}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-green/30 bg-green/10 text-green">
              <ScanIcon size={22} />
            </span>
            <h2 className="mt-5 text-lg font-medium text-ink">
              No documents yet
            </h2>
            <p className="mt-2 max-w-sm text-sm text-muted">
              Upload a PDF from the home page to get started.
            </p>
            <Link
              href="/"
              className="mt-6 rounded-xl border border-line-bright bg-panel-2 px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-green/50 hover:text-green"
            >
              Upload a document
            </Link>
          </div>
        )}

        {docs.items.length > 0 && (
          <div
            className="mt-8 animate-fade-up"
            style={{ animationDelay: "80ms" }}
          >
            <SectionHeader label="documents" count={docs.items.length} />

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {docs.items.map((doc) => {
                const sessionId = sessionMap[doc.id];
                const openable = Boolean(sessionId) && doc.status === "ready";

                return (
                  <LibraryCard
                    key={doc.id}
                    icon={<FileIcon size={16} />}
                    title={doc.title || doc.file_name}
                    subtitle={doc.file_name}
                    status={doc.status}
                    stats={
                      <>
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted">
                          <PagesIcon size={13} />
                          {doc.page_count ?? "—"}p
                        </span>
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted">
                          <LayersIcon size={13} />
                          {doc.chunk_count ?? "—"}c
                        </span>
                      </>
                    }
                    createdAt={doc.created_at}
                    href={openable ? chatHref(doc.id, sessionId) : undefined}
                    pinned={doc.pinned}
                    busy={docs.busyId === doc.id}
                    deleteLabel="Delete document"
                    onRename={(title) => docs.rename(doc.id, title)}
                    onTogglePin={() => docs.togglePin(doc.id, doc.pinned)}
                    onDelete={() => docs.remove(doc.id)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {cols.items.length > 0 && (
          <div
            className="mt-12 animate-fade-up"
            style={{ animationDelay: "120ms" }}
          >
            <SectionHeader label="collections" count={cols.items.length} />

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cols.items.map((col) => {
                const sessionId = sessionMap[col.id];
                const docCount = collectionDocCounts[col.id] ?? 0;

                return (
                  <LibraryCard
                    key={col.id}
                    icon={<LayersIcon size={16} />}
                    title={col.title}
                    label="collection"
                    stats={
                      <span className="font-mono text-xs tabular-nums text-muted">
                        {pluralize(docCount, "document")}
                      </span>
                    }
                    createdAt={col.created_at}
                    href={sessionId ? chatHref(col.id, sessionId) : undefined}
                    pinned={col.pinned}
                    busy={cols.busyId === col.id}
                    deleteLabel="Delete collection"
                    onRename={(title) => cols.rename(col.id, title)}
                    onTogglePin={() => cols.togglePin(col.id, col.pinned)}
                    onDelete={() => cols.remove(col.id)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
