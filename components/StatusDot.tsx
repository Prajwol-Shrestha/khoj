import type { DocStatus } from "@/lib/types";

const CONFIG: Record<
  DocStatus,
  { color: string; label: string; pulse: boolean }
> = {
  ready: { color: "var(--green)", label: "ready", pulse: false },
  processing: { color: "var(--amber)", label: "processing", pulse: true },
  error: { color: "var(--red)", label: "error", pulse: false },
};

interface StatusDotProps {
  status: DocStatus;
  showLabel?: boolean;
}

export default function StatusDot({
  status,
  showLabel = false,
}: StatusDotProps) {
  const cfg = CONFIG[status] ?? CONFIG.processing;

  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative inline-flex h-2 w-2">
        {cfg.pulse && (
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
            style={{ backgroundColor: cfg.color }}
          />
        )}
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{
            backgroundColor: cfg.color,
            boxShadow: `0 0 8px -1px ${cfg.color}`,
          }}
        />
      </span>
      {showLabel && (
        <span className="mono-label" style={{ color: cfg.color }}>
          {cfg.label}
        </span>
      )}
    </span>
  );
}
