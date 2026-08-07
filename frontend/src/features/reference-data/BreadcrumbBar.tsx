export interface BreadcrumbSegment {
  id: number;
  label: string;
  typeKey: string;
}

interface BreadcrumbBarProps {
  stack: BreadcrumbSegment[];
  onNavigate: (index: number) => void;
}

export default function BreadcrumbBar({ stack, onNavigate }: BreadcrumbBarProps) {
  if (stack.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-[var(--twin-body)] whitespace-nowrap overflow-x-auto">
      {stack.map((seg, i) => {
        const isLast = i === stack.length - 1;
        return (
          <span key={`${seg.typeKey}-${seg.id}`} className="flex items-center gap-1 shrink-0">
            {i > 0 && <span className="text-[var(--twin-mute)] mx-0.5">/</span>}
            <button
              type="button"
              onClick={() => onNavigate(i)}
              className={`rounded px-1.5 py-0.5 hover:bg-[var(--twin-canvas-soft)] transition-colors ${
                isLast ? "font-semibold text-[var(--twin-ink)]" : "text-[var(--twin-body)]"
              }`}
            >
              <span className="truncate max-w-[140px]">{seg.label}</span>
            </button>
          </span>
        );
      })}
    </nav>
  );
}
