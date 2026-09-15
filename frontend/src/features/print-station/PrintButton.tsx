import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Printer } from "lucide-react";
import { createPrintJob, fetchSelectableStations, type PrintStationOption } from "@/api/domains/print.api";

/**
 * 「打印」按钮：点开选一台打印机，就把这份文件派给对应工位。
 *
 * 三处触发入口（文件模板库、卡片打印、归档补打）共用这一个组件 ——
 * 选工位这一步的行为和要求完全一样，没必要各写一份。
 *
 * 普通人员只需要选打印机；工位怎么配、背后绑哪个账号，他们看不到也不需要知道。
 */
export function PrintButton({
  sourceType,
  sourceId,
  fileName,
  label = "打印",
}: {
  sourceType: "CARD_ARCHIVE" | "ADMIN_FILE";
  sourceId: string;
  fileName: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [stations, setStations] = useState<PrintStationOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  // 首次展开才拉工位列表：这个按钮在每个列表行上都会出现，不该一进页面就发 N 个请求
  const loadStations = useCallback(async () => {
    if (stations !== null) return;
    try {
      setStations(await fetchSelectableStations());
    } catch {
      setStations([]);
    }
  }, [stations]);

  const onToggle = () => {
    if (!open) void loadStations();
    setOpen((v) => !v);
  };

  const onPick = async (s: PrintStationOption) => {
    setBusy(true);
    try {
      await createPrintJob({ stationId: s.id, sourceType, sourceId, fileName });
      toast.success(`已派给「${s.name}」打印`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "派发打印失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={boxRef} className="relative inline-block">
      <button
        type="button"
        disabled={busy}
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--app-color-text-primary)] hover:underline disabled:opacity-50"
        onClick={onToggle}
      >
        <Printer className="size-3.5" />
        {label}
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-1 max-h-56 w-52 overflow-y-auto rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] shadow-lg">
          {stations === null ? (
            <div className="px-3 py-2 text-[12px] text-[var(--app-color-text-tertiary)]">加载中…</div>
          ) : stations.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-[var(--app-color-text-tertiary)]">
              没有可用的打印机，请联系管理员配置打印工位
            </div>
          ) : (
            stations.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                className="block w-full truncate px-3 py-2 text-left text-[13px] text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50"
                onClick={() => void onPick(s)}
              >
                {s.name}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export default PrintButton;
