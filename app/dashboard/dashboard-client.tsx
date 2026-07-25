"use client";

import { FileIcon, LayersIcon, PagesIcon, ScanIcon } from "@/components/Icons";
import { SignOutButton } from "@/components/SignOutButton";
import StatusDot from "@/components/StatusDot";
import UserAvatar from "@/components/UserAvatar";
import type { CollectionRow, DocumentRow } from "@/lib/types";
import Link from "next/link";
import { useState } from "react";

interface Props {
  user: { email: string; name: string; avatarUrl?: string };
  documents: DocumentRow[];
  collections: CollectionRow[];
  collectionDocCounts: Record<string, number>;
  sessionMap: Record<string, string>;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DashboardClient({
  user,
  documents,
  collections,
  collectionDocCounts,
  sessionMap,
}: Props) {
  const [docs, setDocs] = useState<DocumentRow[]>(documents);
  const [cols, setCols] = useState<CollectionRow[]>(collections);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const isEmpty = docs.length === 0 && cols.length === 0;

  const sortedDocs = [...docs].sort((a, b) => {
    if (a.pinned === b.pinned) return 0;
    return a.pinned ? -1 : 1;
  });

  const sortedCols = [...cols].sort((a, b) => {
    if (a.pinned === b.pinned) return 0;
    return a.pinned ? -1 : 1;
  });

  async function deleteDocument(id: string) {
    if (!confirm("Delete this document and its chat history?")) return;
    setDeleting(id);
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) setDocs((d) => d.filter((doc) => doc.id !== id));
    else alert("Failed to delete document. Please try again.");
    setDeleting(null);
  }

  async function deleteCollection(id: string) {
    if (!confirm("Delete this collection and its chat history?")) return;
    setDeleting(id);
    const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
    if (res.ok) setCols((c) => c.filter((col) => col.id !== id));
    else alert("Failed to delete collection. Please try again.");
    setDeleting(null);
  }

  async function renameDocument(id: string, title: string) {
    const res = await fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      setDocs((d) => d.map((doc) => (doc.id === id ? { ...doc, title } : doc)));
    }
  }

  async function renameCollection(id: string, title: string) {
    const res = await fetch(`/api/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      setCols((c) => c.map((col) => (col.id === id ? { ...col, title } : col)));
    }
  }

  async function togglePinDocument(id: string, pinned: boolean) {
    const res = await fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !pinned }),
    });
    if (res.ok) {
      setDocs((d) =>
        d.map((doc) => (doc.id === id ? { ...doc, pinned: !pinned } : doc)),
      );
    }
  }

  async function togglePinCollection(id: string, pinned: boolean) {
    const res = await fetch(`/api/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !pinned }),
    });
    if (res.ok) {
      setCols((c) =>
        c.map((col) => (col.id === id ? { ...col, pinned: !pinned } : col)),
      );
    }
  }

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-void/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <Link
            href="/"
            className="flex items-center gap-2 font-mono text-sm font-semibold tracking-tight text-ink"
          >
            <ScanIcon size={16} className="text-green" />
            khoj<span className="caret">_</span>
          </Link>

          <div className="flex items-center gap-4">
            <span className="mono-label hidden items-center gap-2 sm:flex">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-green"
                style={{ boxShadow: "0 0 8px var(--green)" }}
              />
              online · llama-3.1 · gemini-embed
            </span>

            <div className="flex items-center gap-3">
              <UserAvatar
                name={user.name}
                email={user.email}
                avatarUrl={user.avatarUrl}
              />
              <span className="hidden text-sm text-muted sm:block">
                {user.name || user.email}
              </span>
              <SignOutButton />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12">
        {/* page title */}
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
                    docs.length > 0 &&
                      `${docs.length} document${docs.length === 1 ? "" : "s"}`,
                    cols.length > 0 &&
                      `${cols.length} collection${cols.length === 1 ? "" : "s"}`,
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

        {/* empty state */}
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

        {/* document grid */}
        {sortedDocs.length > 0 && (
          <div
            className="mt-8 animate-fade-up"
            style={{ animationDelay: "80ms" }}
          >
            <div className="flex items-center gap-3">
              <span className="mono-label">documents</span>
              <span className="h-px flex-1 bg-line" />
              <span className="font-mono text-xs tabular-nums text-faint">
                {String(docs.length).padStart(2, "0")}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedDocs.map((doc) => {
                const sessionId = sessionMap[doc.id];
                const href = sessionId
                  ? `/chat/${doc.id}?session=${sessionId}`
                  : `/chat/${doc.id}`;

                return (
                  <div
                    key={doc.id}
                    className="group relative flex flex-col gap-4 rounded-xl border border-line bg-panel/60 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-green/50 hover:bg-panel-2/70"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-bright bg-panel-2 text-muted transition-colors group-hover:text-green">
                        <FileIcon size={16} />
                      </span>
                      <div className="flex items-center gap-3">
                        <StatusDot status={doc.status} />
                        <button
                          onClick={() => togglePinDocument(doc.id, doc.pinned)}
                          className={`text-faint opacity-0 transition-all hover:text-green group-hover:opacity-100 ${doc.pinned ? "opacity-100 text-green" : ""}`}
                          aria-label={doc.pinned ? "Unpin" : "Pin"}
                          title={doc.pinned ? "Unpin" : "Pin to top"}
                        >
                          {doc.pinned ? "★" : "☆"}
                        </button>
                        <button
                          onClick={() => deleteDocument(doc.id)}
                          disabled={deleting === doc.id}
                          className="cursor-pointer text-faint opacity-0 transition-opacity hover:text-red disabled:opacity-50 group-hover:opacity-100"
                          aria-label="Delete document"
                        >
                          {deleting === doc.id ? "..." : "✕"}
                        </button>
                      </div>
                    </div>
                    <div className="min-w-0">
                      {editingId === doc.id ? (
                        <input
                          autoFocus
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={async () => {
                            if (
                              editingTitle.trim() &&
                              editingTitle !== doc.title
                            ) {
                              await renameDocument(doc.id, editingTitle.trim());
                            }
                            setEditingId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="w-full bg-transparent text-sm font-medium text-ink outline-none border-b border-green pb-0.5"
                        />
                      ) : (
                        <h3
                          className="truncate text-sm font-medium text-ink group-hover:text-green cursor-text"
                          onDoubleClick={() => {
                            setEditingId(doc.id);
                            setEditingTitle(doc.title || doc.file_name);
                          }}
                          title="Double-click to rename"
                        >
                          {doc.title || doc.file_name}
                        </h3>
                      )}
                      <p className="mono-label mt-1 truncate">
                        {doc.file_name}
                      </p>
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
                      <span className="ml-auto font-mono text-xs text-faint">
                        {formatDate(doc.created_at)}
                      </span>
                    </div>

                    {sessionId && doc.status === "ready" && (
                      <Link
                        href={href}
                        className="flex items-center justify-center rounded-lg border border-line-bright bg-panel-2 py-2 text-sm text-muted transition-colors hover:border-green/50 hover:text-green"
                      >
                        Open chat →
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* collections section */}
        {cols.length > 0 && (
          <div
            className="mt-12 animate-fade-up"
            style={{ animationDelay: "120ms" }}
          >
            <div className="flex items-center gap-3">
              <span className="mono-label">collections</span>
              <span className="h-px flex-1 bg-line" />
              <span className="font-mono text-xs tabular-nums text-faint">
                {String(cols.length).padStart(2, "0")}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedCols.map((col) => {
                const sessionId = sessionMap[col.id];
                const docCount = collectionDocCounts[col.id] ?? 0;
                const href = sessionId
                  ? `/chat/${col.id}?session=${sessionId}`
                  : `/chat/${col.id}`;

                return (
                  <div
                    key={col.id}
                    className="group relative flex flex-col gap-4 rounded-xl border border-line bg-panel/60 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-green/50 hover:bg-panel-2/70"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-bright bg-panel-2 text-muted transition-colors group-hover:text-green">
                        <LayersIcon size={16} />
                      </span>
                      <button
                        onClick={() => togglePinCollection(col.id, col.pinned)}
                        className={`text-faint opacity-0 transition-all hover:text-green group-hover:opacity-100 ${col.pinned ? "opacity-100 text-green" : ""}`}
                        aria-label={col.pinned ? "Unpin" : "Pin"}
                        title={col.pinned ? "Unpin" : "Pin to top"}
                      >
                        {col.pinned ? "★" : "☆"}
                      </button>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-green">
                          collection
                        </span>
                        <button
                          onClick={() => deleteCollection(col.id)}
                          disabled={deleting === col.id}
                          className="cursor-pointer text-faint opacity-0 transition-opacity hover:text-red disabled:opacity-50 group-hover:opacity-100"
                          aria-label="Delete collection"
                        >
                          {deleting === col.id ? "..." : "✕"}
                        </button>
                      </div>
                    </div>

                    <div className="min-w-0">
                      {editingId === col.id ? (
                        <input
                          autoFocus
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={async () => {
                            if (
                              editingTitle.trim() &&
                              editingTitle !== col.title
                            ) {
                              await renameCollection(col.id, editingTitle.trim());
                            }
                            setEditingId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="w-full bg-transparent text-sm font-medium text-ink outline-none border-b border-green pb-0.5"
                        />
                      ) : (
                        <h3
                          className="truncate text-sm font-medium text-ink group-hover:text-green cursor-text"
                          onDoubleClick={() => {
                            setEditingId(col.id);
                            setEditingTitle(col.title);
                          }}
                          title="Double-click to rename"
                        >
                          {col.title}
                        </h3>
                      )}
                    </div>

                    <div className="mt-auto flex items-center border-t border-line pt-3">
                      <span className="ml-auto font-mono text-xs text-faint">
                        {formatDate(col.created_at)}
                      </span>
                    </div>

                    {sessionId && (
                      <Link
                        href={href}
                        className="flex items-center justify-center rounded-lg border border-line-bright bg-panel-2 py-2 text-sm text-muted transition-colors hover:border-green/50 hover:text-green"
                      >
                        Open chat →
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
