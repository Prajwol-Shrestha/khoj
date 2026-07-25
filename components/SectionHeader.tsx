import { padCount } from "@/lib/format";

interface SectionHeaderProps {
  label: string;
  count: number;
}

export default function SectionHeader({ label, count }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="mono-label">{label}</span>
      <span className="h-px flex-1 bg-line" />
      <span className="font-mono text-xs tabular-nums text-faint">
        {padCount(count)}
      </span>
    </div>
  );
}
