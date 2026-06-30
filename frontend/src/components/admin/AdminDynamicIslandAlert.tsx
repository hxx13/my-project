import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "@/styles/admin-dynamic-island.css";

export type AdminDynamicIslandAction = {
  label: string;
  onClick: () => void;
  variant: "primary" | "secondary" | "ghost";
  disabled?: boolean;
};

export type AdminDynamicIslandTone = "announcement" | "violation" | "unbound";

type AdminDynamicIslandCardProps = {
  title: string;
  subtitle?: string;
  iconEmoji?: string;
  tone?: AdminDynamicIslandTone;
  entering?: boolean;
  leaving?: boolean;
  showProgress?: boolean;
  progressDurationSec?: number;
  actions?: AdminDynamicIslandAction[];
  children?: ReactNode;
};

const TONE_CLASS: Record<AdminDynamicIslandTone, string> = {
  announcement: "scan-notice-theme-announcement",
  violation: "scan-notice-theme-violation",
  unbound: "scan-notice-theme-unbound",
};

export function AdminDynamicIslandCard({
  title,
  subtitle,
  iconEmoji,
  tone = "violation",
  entering = false,
  leaving = false,
  showProgress = false,
  progressDurationSec = 0,
  actions = [],
  children,
}: AdminDynamicIslandCardProps) {
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = progressRef.current;
    if (!el || !showProgress || progressDurationSec <= 0) return;
    el.style.transition = "none";
    el.style.transform = "scaleX(1)";
    void el.offsetWidth;
    el.style.transition = `transform ${progressDurationSec}s linear`;
    el.style.transform = "scaleX(0)";
  }, [showProgress, progressDurationSec]);

  return (
    <div
      className={[
        "admin-dynamic-island-card",
        TONE_CLASS[tone],
        entering ? "admin-dynamic-island-card--entering" : "",
        leaving ? "admin-dynamic-island-card--leaving" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="alert"
    >
      <div className="admin-dynamic-island-card__head">
        {iconEmoji ? <span className="admin-dynamic-island-card__icon">{iconEmoji}</span> : null}
        <div className="admin-dynamic-island-card__text">
          <p className="admin-dynamic-island-card__title">{title}</p>
          {subtitle ? <p className="admin-dynamic-island-card__subtitle">{subtitle}</p> : null}
        </div>
      </div>

      {children ? <div className="admin-dynamic-island-card__body">{children}</div> : null}

      {actions.length > 0 ? (
        <div className="admin-dynamic-island-card__actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={action.disabled}
              onClick={action.onClick}
              className={[
                "admin-dynamic-island-card__btn",
                action.variant === "primary"
                  ? "admin-dynamic-island-card__btn--primary"
                  : action.variant === "ghost"
                    ? "admin-dynamic-island-card__btn--ghost"
                    : "admin-dynamic-island-card__btn--secondary",
              ].join(" ")}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

      {showProgress && progressDurationSec > 0 ? (
        <div ref={progressRef} className="admin-dynamic-island-card__progress" aria-hidden />
      ) : null}
    </div>
  );
}

type AdminDynamicIslandStackProps = {
  children: ReactNode;
};

/** 全局灵动岛容器：固定宽度，居中，位于管理顶栏下方 */
export function AdminDynamicIslandStack({ children }: AdminDynamicIslandStackProps) {
  if (typeof document === "undefined") return null;
  return createPortal(<div className="admin-dynamic-island-stack">{children}</div>, document.body);
}
