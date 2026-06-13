import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

export type ScanActionVariant = "student" | "quick" | "neutral";

type BaseProps = {
  variant: ScanActionVariant;
  icon: LucideIcon;
  onClick: () => void;
  className?: string;
};

type CompactProps = BaseProps & {
  layout: "compact";
  label: string;
};

type RowProps = BaseProps & {
  layout: "row";
  title: string;
  description?: string;
  showChevron?: boolean;
};

export type ScanActionButtonProps = CompactProps | RowProps;

const VARIANT_CLASS: Record<ScanActionVariant, string> = {
  student: "scan-action-btn--student",
  quick: "scan-action-btn--quick",
  neutral: "scan-action-btn--neutral",
};

export function ScanActionButton(props: ScanActionButtonProps) {
  const { variant, icon: Icon, onClick, className = "" } = props;
  const variantClass = VARIANT_CLASS[variant];

  if (props.layout === "compact") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`scan-action-btn scan-action-btn--compact ${variantClass} ${className}`.trim()}
      >
        <span className="scan-action-btn__icon-well scan-action-btn__icon-well--compact" aria-hidden>
          <Icon className="scan-action-btn__icon" strokeWidth={2.25} />
        </span>
        <span className="scan-action-btn__label">{props.label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`scan-action-btn scan-action-btn--row ${variantClass} ${className}`.trim()}
    >
      <span className="scan-action-btn__icon-well" aria-hidden>
        <Icon className="scan-action-btn__icon" strokeWidth={2.25} />
      </span>
      <span className="scan-action-btn__copy">
        <span className="scan-action-btn__title">{props.title}</span>
        {props.description ? (
          <span className="scan-action-btn__desc">{props.description}</span>
        ) : null}
      </span>
      {props.showChevron !== false ? (
        <span className="scan-action-btn__chevron" aria-hidden>
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      ) : null}
    </button>
  );
}
