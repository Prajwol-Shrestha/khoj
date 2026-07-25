"use client";

import {
  AlertIcon,
  CloseIcon,
  FileIcon,
  SpinnerIcon,
  UploadIcon,
} from "@/components/Icons";
import { useUpload } from "@/hooks/useUpload";
import {
  checkFile,
  FILE_INPUT_ACCEPT,
  MAX_FILES_PER_UPLOAD,
} from "@/lib/files";
import { formatBytes } from "@/lib/format";
import { useCallback, useRef, useState } from "react";

export default function UploadDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { phase, progress, files, error, start, reset } = useUpload();

  // rejected files never reach the hook, so they carry their own error state
  const [rejected, setRejected] = useState<{
    files: File[];
    message: string;
  } | null>(null);

  const handleFiles = useCallback(
    (picked: FileList | null) => {
      if (!picked || picked.length === 0) return;
      const selected = Array.from(picked);

      if (selected.length > MAX_FILES_PER_UPLOAD) {
        setRejected({
          files: selected,
          message: `Maximum ${MAX_FILES_PER_UPLOAD} files allowed per chat session.`,
        });
        return;
      }

      for (const file of selected) {
        const problem = checkFile(file);
        if (problem) {
          setRejected({ files: [file], message: problem });
          return;
        }
      }

      setRejected(null);
      start(selected);
    },
    [start],
  );

  const dismiss = useCallback(() => {
    setRejected(null);
    reset();
    if (inputRef.current) inputRef.current.value = "";
  }, [reset]);

  const busy = phase === "sending" || phase === "processing";
  const failed = rejected !== null || phase === "error";
  const shownFiles = rejected?.files ?? files;
  const shownError = rejected?.message ?? error;

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept={FILE_INPUT_ACCEPT}
        multiple
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {!busy && !failed && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`group relative flex w-full flex-col items-center justify-center gap-5 rounded-2xl border border-dashed px-8 py-14 text-center transition-all duration-200 ${
            dragging
              ? "border-green bg-green/5 glow-green"
              : "border-line-bright bg-panel/60 hover:border-green/60 hover:bg-panel-2/60"
          }`}
        >
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-xl border transition-colors ${
              dragging
                ? "border-green/50 bg-green/10 text-green"
                : "border-line-bright bg-panel-2 text-muted group-hover:text-green"
            }`}
          >
            <UploadIcon size={24} />
          </span>
          <span className="space-y-1.5">
            <span className="block text-base font-medium text-ink">
              {dragging ? "Release to ingest" : "Drop files to begin"}
            </span>
            <span className="block text-sm text-muted">
              or{" "}
              <span className="text-green underline underline-offset-4">
                browse files
              </span>{" "}
              — up to {MAX_FILES_PER_UPLOAD} files
            </span>
          </span>
          <span className="mono-label">pdf · txt · md · docx</span>{" "}
        </button>
      )}

      {busy && (
        <div className="rounded-2xl border border-line-bright bg-panel/70 px-6 py-6">
          <div className="space-y-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <FileIcon size={14} className="text-green shrink-0" />
                <p className="truncate text-sm text-ink">{f.name}</p>
                <span className="ml-auto font-mono text-xs text-faint">
                  {formatBytes(f.size)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-green transition-all duration-300"
              style={{
                width: phase === "sending" ? `${progress}%` : "100%",
                opacity: phase === "processing" ? 0.5 : 1,
              }}
            />
          </div>

          <div className="mt-4 flex items-center gap-2 text-sm text-muted">
            {phase === "sending" ? (
              <>
                <SpinnerIcon size={14} className="text-green" />
                <span>Uploading document…</span>
              </>
            ) : (
              <>
                <span className="scan-dots flex items-center" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
                <span>
                  Extracting text<span className="text-faint"> · </span>chunking
                  <span className="text-faint"> · </span>embedding vectors
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {failed && (
        <div className="rounded-2xl border border-red/40 bg-red/5 px-6 py-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red/40 bg-red/10 text-red">
              <AlertIcon size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                Couldn&apos;t process that file
              </p>
              <p className="mt-1 text-sm text-muted">{shownError}</p>
              {shownFiles.length > 0 && (
                <p className="mono-label mt-2 truncate">
                  {shownFiles.map((f) => f.name).join(", ")}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="text-muted transition-colors hover:text-ink"
              aria-label="Dismiss error"
            >
              <CloseIcon size={16} />
            </button>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line-bright bg-panel-2 px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-green/60 hover:text-green"
          >
            Try another file
          </button>
        </div>
      )}
    </div>
  );
}
