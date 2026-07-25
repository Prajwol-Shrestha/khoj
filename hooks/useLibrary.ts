"use client";

import { useState } from "react";

interface LibraryItem {
  id: string;
  title: string;
  pinned: boolean;
}

export function useLibrary<T extends LibraryItem>(
  table: "documents" | "collections",
  initialRows: T[],
) {
  const [rows, setRows] = useState<T[]>(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);

  const noun = table === "documents" ? "document" : "collection";

  // stable sort keeps the server's created_at order inside each group
  const items = [...rows].sort((a, b) => {
    if (a.pinned === b.pinned) return 0;
    return a.pinned ? -1 : 1;
  });

  async function patch(
    id: string,
    body: Record<string, unknown>,
    action: string,
  ) {
    const res = await fetch(`/api/${table}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) alert(`Failed to ${action} ${noun}. Please try again.`);
    return res.ok;
  }

  // only delete has a visible pending state, so it alone sets busyId
  async function remove(id: string) {
    if (!confirm(`Delete this ${noun} and its chat history?`)) return;
    setBusyId(id);
    const res = await fetch(`/api/${table}/${id}`, { method: "DELETE" });
    if (res.ok) setRows((prev) => prev.filter((row) => row.id !== id));
    else alert(`Failed to delete ${noun}. Please try again.`);
    setBusyId(null);
  }

  async function rename(id: string, title: string) {
    const ok = await patch(id, { title }, "rename");
    if (ok) {
      setRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, title } : row)),
      );
    }
  }

  async function togglePin(id: string, pinned: boolean) {
    const ok = await patch(id, { pinned: !pinned }, "update");
    if (ok) {
      setRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, pinned: !pinned } : row)),
      );
    }
  }

  return { items, remove, rename, togglePin, busyId };
}
