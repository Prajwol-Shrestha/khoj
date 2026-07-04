"use client";

import { useEffect, useState } from "react";

interface MatchMeterProps {
  similarity: number;
  segments?: number;
}

export default function MatchMeter({ similarity, segments = 10 }: MatchMeterProps) {
  const clamped = Math.max(0, Math.min(1, similarity));
  const filled = Math.max(1, Math.round(clamped * segments));
  const [lit, setLit] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setLit(filled));
    return () => cancelAnimationFrame(id);
  }, [filled]);

  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="match-track" aria-hidden>
        {Array.from({ length: segments }).map((_, i) => (
          <span
            key={i}
            className={`match-seg${i < lit ? " on" : ""}`}
            style={{ transitionDelay: `${i * 28}ms` }}
          />
        ))}
      </span>
      <span
        className="font-mono text-xs tabular-nums text-cyan"
        aria-label={`similarity ${clamped.toFixed(2)}`}
      >
        {clamped.toFixed(2)}
      </span>
    </span>
  );
}
