import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Printer, Layers } from "lucide-react";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * 顶栏的打印入口。
 *
 * 两个目的地本来就是两件事，直接二选一比猜更快：
 * 「打印文件」是手里已经有 PDF/图片要出纸；「打印卡牌」是要从笼位生成卡片。
 * 放顶栏是因为现场的人找打印时不一定会先想起它藏在哪个二级菜单里。
 */
export function PrintEntryButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const go = (to: string) => {
    setOpen(false);
    navigate(toAdminRoutePath(to));
  };

  const itemCls =
    "flex w-full items-start gap-3 rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-4 py-3 text-left transition hover:bg-[var(--twin-canvas-soft)]";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="打印"
        aria-label="打印"
        className={
          className ??
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
        }
      >
        <Printer className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>要打印什么？</DialogTitle>
            <DialogDescription>选一个，直接跳到对应页面。</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <button type="button" className={itemCls} onClick={() => go("/admin/file-templates")}>
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--twin-body)]" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--twin-ink)]">打印文件</span>
                <span className="mt-0.5 block text-[12px] text-[var(--twin-mute)]">
                  上传的 PDF / 图片，或临时传一份打完即删
                </span>
              </span>
            </button>

            <button type="button" className={itemCls} onClick={() => go("/admin/card-print")}>
              <Layers className="mt-0.5 h-4 w-4 shrink-0 text-[var(--twin-body)]" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--twin-ink)]">打印卡牌</span>
                <span className="mt-0.5 block text-[12px] text-[var(--twin-mute)]">
                  选笼位生成笼位卡 / 二维码卡
                </span>
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default PrintEntryButton;
