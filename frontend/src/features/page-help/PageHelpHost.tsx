import { useState } from "react";
import { CircleHelp } from "lucide-react";
import { AdminPageHelpDialog } from "@/features/admin/AdminPageHelpDialog";
import { hasMinRole } from "@/features/auth/roleAccess";
import { authStorage } from "@/features/auth/authStorage";
import { PageHelpIntroDialog, usePageHelpIntro } from "@/features/page-help/PageHelpIntroDialog";
import { cn } from "@/lib/utils";

type Variant = "admin" | "student" | "twin";

const buttonClassByVariant: Record<Variant, string> = {
  admin:
    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]",
  student:
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--student-hairline)] bg-[var(--student-canvas)] text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] transition-colors",
  twin:
    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]/90 text-[var(--app-color-text-secondary)] shadow-[var(--app-elevation-card)] backdrop-blur-sm hover:bg-[var(--app-color-surface-hover)]",
};

type Props = {
  pagePath: string;
  variant?: Variant;
  className?: string;
  /** admin 壳：同时打开完整帮助（教程编辑 + 留言） */
  enableFullHelpDialog?: boolean;
  /** 过渡路由上禁止首次介绍自动弹出（如侧栏锁定跳转完成前） */
  suppressAutoIntro?: boolean;
};

export function PageHelpHost({
  pagePath,
  variant = "admin",
  className,
  enableFullHelpDialog = variant === "admin",
  suppressAutoIntro = false,
}: Props) {
  const role = authStorage.getRole() || "STUDENT";
  const staffLike = hasMinRole(role, "STAFF");
  const { introOpen, setIntroOpen, bundle, deferIntro, acknowledgeIntro, openIntroManually } =
    usePageHelpIntro(pagePath, { suppressAutoIntro });
  const [fullHelpOpen, setFullHelpOpen] = useState(false);

  const onHelpClick = () => {
    if (enableFullHelpDialog && staffLike) {
      setFullHelpOpen(true);
      return;
    }
    void openIntroManually();
  };

  return (
    <>
      <button
        type="button"
        onClick={onHelpClick}
        className={cn(buttonClassByVariant[variant], className)}
        title="本页帮助"
        aria-label="本页帮助"
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden />
      </button>

      {introOpen ? (
        <PageHelpIntroDialog
          open
          onOpenChange={setIntroOpen}
          pagePath={pagePath}
          bundle={bundle}
          onDeferred={deferIntro}
          onAcknowledged={acknowledgeIntro}
        />
      ) : null}

      {enableFullHelpDialog && staffLike && fullHelpOpen ? (
        <AdminPageHelpDialog open onOpenChange={setFullHelpOpen} pagePath={pagePath} />
      ) : null}
    </>
  );
}
