import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  wide?: boolean;
};

/** 后台右侧配置抽屉（通道漏斗、清洗规则、统计任务编辑等） */
export function AdminRightDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  wide,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="rightSheet"
        className={cn(
          wide ? "w-[min(36rem,96vw)] max-w-[min(36rem,96vw)]" : undefined,
          "flex flex-col gap-0 p-0",
          className
        )}
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3 text-left space-y-1">
          <DialogTitle className="text-base font-semibold text-slate-900">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-xs text-slate-500">{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer ? <div className="shrink-0 border-t bg-slate-50/80 px-4 py-3">{footer}</div> : null}
      </DialogContent>
    </Dialog>
  );
}
