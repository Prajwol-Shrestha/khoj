"use client";

import { getGuestToken } from "@/lib/guest";
import { chatHref } from "@/lib/routes";
import type { ApiError, UploadResult } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

type Phase = "idle" | "sending" | "processing" | "error";

export function useUpload() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");

  const fail = useCallback((message: string) => {
    setError(message);
    setPhase("error");
  }, []);

  const start = useCallback(
    (selected: File[]) => {
      setFiles(selected);
      setError("");
      setProgress(0);
      setPhase("sending");

      const form = new FormData();
      selected.forEach((file) => form.append("files", file));
      form.append("sessionToken", getGuestToken());

      // XMLHttpRequest, not fetch: fetch cannot report upload progress
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");

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
          let result: UploadResult;
          try {
            result = JSON.parse(xhr.responseText) as UploadResult;
          } catch {
            fail("Upload finished but response could not be read.");
            return;
          }
          router.push(chatHref(result.id, result.sessionId));
          return;
        }

        let message = "Upload failed. Please try again.";
        try {
          message = (JSON.parse(xhr.responseText) as ApiError).error || message;
        } catch {
          /* keep default */
        }
        fail(message);
      };

      xhr.onerror = () =>
        fail("Network error. Check your connection and try again.");

      xhr.send(form);
    },
    [router, fail],
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setProgress(0);
    setFiles([]);
    setError("");
  }, []);

  return { phase, progress, files, error, start, reset };
}
