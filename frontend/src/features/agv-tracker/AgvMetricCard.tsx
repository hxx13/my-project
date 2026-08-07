import { useState, useEffect, useRef, useCallback } from "react";

interface MetricCardProps {
  label: string;
  value: number;
  trend: "up" | "down" | "flat";
  isRunning?: boolean;
  format: "number" | "duration" | "decimal";
}

const TREND_ICONS: Record<string, string> = {
  up: "▲",   // ▲
  down: "▼", // ▼
  flat: "→", // →
};

const TREND_COLORS: Record<string, string> = {
  up: "#22c55e",
  down: "#ef4444",
  flat: "#6b7280",
};

const TREND_LABELS: Record<string, string> = {
  up: "上升",
  down: "下降",
  flat: "持平",
};

/** Format a numeric value according to the requested display format. */
function formatValue(value: number, format: MetricCardProps["format"]): string {
  switch (format) {
    case "duration": {
      const totalSec = Math.round(value);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      if (h > 0) {
        return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      }
      return `${m}:${String(s).padStart(2, "0")}`;
    }
    case "decimal":
      return value.toFixed(2);
    case "number":
    default:
      return Math.round(value).toLocaleString();
  }
}

/** Extract the numeric suffix that follows a unit character for decimal format. */
function getDecimalUnit(value: number): string {
  if (value >= 1000) return "km";
  return "m";
}

/**
 * Animated metric card for the AGV Stats Pipeline dashboard.
 * Features animated number transitions, trend indicators, and running-state pulse.
 */
export default function AgvMetricCard({ label, value, trend, isRunning, format }: MetricCardProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const animRef = useRef<number | null>(null);
  const prevValueRef = useRef(value);

  const animateValue = useCallback(
    (from: number, to: number) => {
      if (animRef.current) cancelAnimationFrame(animRef.current);

      // No animation needed
      if (from === to) {
        setDisplayValue(to);
        return;
      }

      const duration = 500; // ms
      const startTime = performance.now();

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out-quart
        const eased = 1 - Math.pow(1 - progress, 4);
        const current = from + (to - from) * eased;
        setDisplayValue(current);

        if (progress < 1) {
          animRef.current = requestAnimationFrame(step);
        } else {
          setDisplayValue(to);
          animRef.current = null;
        }
      };

      animRef.current = requestAnimationFrame(step);
    },
    []
  );

  useEffect(() => {
    if (value !== prevValueRef.current) {
      animateValue(prevValueRef.current, value);
      prevValueRef.current = value;
    }
  }, [value, animateValue]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const formattedValue = formatValue(displayValue, format);
  const unit =
    format === "decimal" ? getDecimalUnit(value) : null;

  return (
    <div className="flex flex-col gap-1 p-[var(--app-space-container-padding)] rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] transition-shadow hover:shadow-[var(--app-elevation-card)]">
      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-[var(--app-color-text-secondary)] truncate">
          {label}
        </span>
        {isRunning && (
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: "#22c55e" }}
            />
            <span className="text-[9px] text-[var(--app-color-text-tertiary)]">
              进行中
            </span>
          </span>
        )}
      </div>

      {/* Value row */}
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-xl font-bold tabular-nums text-[var(--app-color-text-primary)]"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formattedValue}
        </span>
        {unit && (
          <span className="text-[11px] text-[var(--app-color-text-tertiary)]">
            {unit}
          </span>
        )}
      </div>

      {/* Trend row */}
      <div className="flex items-center gap-1">
        <span
          className="text-[10px] font-semibold"
          style={{ color: TREND_COLORS[trend] }}
        >
          {TREND_ICONS[trend]}
        </span>
        <span className="text-[10px] text-[var(--app-color-text-tertiary)]">
          {TREND_LABELS[trend]}
        </span>
      </div>
    </div>
  );
}
