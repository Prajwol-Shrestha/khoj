"use client";

import {
  AlertIcon,
  CloseIcon,
  FileIcon,
  SpinnerIcon,
  UploadIcon,
} from "@/components/Icons";
import { getGuestToken } from "@/lib/guest";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

type Phase = "idle" | "sending" | "processing" | "error";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SUPPORTED_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export default function UploadDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [activeFiles, setActiveFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>("");

  const upload = useCallback(
    (files: File[]) => {
      setActiveFiles(files);
      setError("");
      setProgress(0);
      setPhase("sending");

      const form = new FormData();
      const isCollection = files.length > 1;

      if (isCollection) {
        files.forEach((f) => form.append("files", f));
      } else {
        form.append("file", files[0]);
      }
      form.append("sessionToken", getGuestToken());

      const xhr = new XMLHttpRequest();
      xhr.open("POST", isCollection ? "/api/upload-collection" : "/api/upload");

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.upload.onload = () => {
        setProgress(100);
        setPhase("processing");
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            console.log(
              "redirect url:",
              `/chat/${isCollection ? data.collectionId : data.documentId}?session=${data.sessionId}`,
            );
            console.log("full response:", data);
            router.push(
              `/chat/${isCollection ? data.collectionId : data.documentId}?session=${data.sessionId}`,
            );
            return;
          } catch {
            setError("Upload finished but response could not be read.");
            setPhase("error");
            return;
          }
        }
        let message = "Upload failed. Please try again.";
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.error) message = data.error;
        } catch {
          /* keep default */
        }
        setError(message);
        setPhase("error");
      };

      xhr.onerror = () => {
        setError("Network error. Check your connection and try again.");
        setPhase("error");
      };

      xhr.send(form);
    },
    [router],
  );
  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      if (files.length > 3) {
        setError("Maximum 3 files allowed per chat session.");
        setPhase("error");
        return;
      }

      // validate all files
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        if (!SUPPORTED_TYPES.includes(file.type)) {
          setActiveFiles([file]);
          setError(`${file.name}: Supported formats are PDF, TXT, MD, DOCX`);
          setPhase("error");
          return;
        }
      }

      upload(fileArray);
    },
    [upload],
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setActiveFiles([]);
    setError("");
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const busy = phase === "sending" || phase === "processing";

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,.md,.docx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        multiple
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {phase === "idle" && (
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
              — up to 3 files
            </span>
          </span>
          <span className="mono-label">pdf · txt · md · docx</span>{" "}
        </button>
      )}

      {busy && activeFiles && (
        <div className="rounded-2xl border border-line-bright bg-panel/70 px-6 py-6">
          <div className="space-y-2">
            {activeFiles.map((f, i) => (
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

      {phase === "error" && (
        <div className="rounded-2xl border border-red/40 bg-red/5 px-6 py-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red/40 bg-red/10 text-red">
              <AlertIcon size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                Couldn&apos;t process that file
              </p>
              <p className="mt-1 text-sm text-muted">{error}</p>
              {activeFiles && (
                <p className="mono-label mt-2 truncate">
                  {activeFiles.map((f) => f.name).join(", ")}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={reset}
              className="text-muted transition-colors hover:text-ink"
              aria-label="Dismiss error"
            >
              <CloseIcon size={16} />
            </button>
          </div>
          <button
            type="button"
            onClick={reset}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line-bright bg-panel-2 px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-green/60 hover:text-green"
          >
            Try another file
          </button>
        </div>
      )}
    </div>
  );
}
