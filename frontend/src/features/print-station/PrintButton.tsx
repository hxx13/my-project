import { useState } from "react";
import { Printer } from "lucide-react";
import { PrintDispatchDialog } from "./PrintDispatchDialog";

/**
 * 「打印」按钮：点开派发弹窗（选打印机 + 备注 + 份数 + 加急），确认后派给对应工位。
 *
 * 三处触发入口（文件模板库、卡片打印、归档补打）共用这一个组件 ——
 * 派发时该填什么只有一个答案，各写一份迟早会走样。
 *
 * 普通人员只需要选打印机；工位怎么配、背后绑哪个账号，他们看不到也不需要知道。
 */
export function PrintButton({
  sourceType,
  sourceId,
  fileName,
  label = "打印",
  onDispatched,
}: {
  sourceType: "CARD_ARCHIVE" | "ADMIN_FILE";
  sourceId: string;
  fileName: string;
  label?: string;
  onDispatched?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--app-color-text-primary)] hover:underline"
        onClick={() => setOpen(true)}
      >
        <Printer className="size-3.5" />
        {label}
      </button>
      <PrintDispatchDialog
        open={open}
        onOpenChange={setOpen}
        sourceType={sourceType}
        sourceId={sourceId}
        fileName={fileName}
        onDispatched={onDispatched}
      />
    </>
  );
}

export default PrintButton;
