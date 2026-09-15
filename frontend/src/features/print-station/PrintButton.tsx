import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { Printer } from "lucide-react";
import { createPrintJob, fetchSelectableStations, type PrintStationOption } from "@/api/domains/print.api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * 「打印」按钮：点开选一台打印机，就把这份文件派给对应工位。
 *
 * 三处触发入口（文件模板库、卡片打印、归档补打）共用这一个组件 ——
 * 选工位这一步的行为和要求完全一样，没必要各写一份。
 *
 * 用 radix 的 DropdownMenu 而不是自己写 absolute 定位的下拉：
 * 这个按钮出现在表格行里，外面套着 overflow-auto 的滚动容器，
 * 自绘的绝对定位菜单会被容器边框裁掉。radix 会把菜单 portal 到 body 并自动定位。
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
  const [stations, setStations] = useState<PrintStationOption[] | null>(null);
  const [busy, setBusy] = useState(false);

  // 首次展开才拉工位列表：这个按钮在每个列表行上都会出现，不该一进页面就发 N 个请求
  const loadStations = useCallback(async () => {
    if (stations !== null) return;
    try {
      setStations(await fetchSelectableStations());
    } catch {
      setStations([]);
    }
  }, [stations]);

  const onPick = async (s: PrintStationOption) => {
    setBusy(true);
    try {
      await createPrintJob({ stationId: s.id, sourceType, sourceId, fileName });
      toast.success(`已派给「${s.name}」打印`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "派发打印失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) void loadStations(); }}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--app-color-text-primary)] hover:underline disabled:opacity-50"
        >
          <Printer className="size-3.5" />
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-56 min-w-[12rem] overflow-y-auto">
        {stations === null ? (
          <div className="px-2 py-1.5 text-[12px] text-[var(--app-color-text-tertiary)]">加载中…</div>
        ) : stations.length === 0 ? (
          <div className="max-w-[16rem] whitespace-normal px-2 py-1.5 text-[12px] text-[var(--app-color-text-tertiary)]">
            没有可用的打印机，请联系管理员配置打印工位
          </div>
        ) : (
          stations.map((s) => (
            <DropdownMenuItem key={s.id} disabled={busy} onSelect={() => void onPick(s)}>
              {s.name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default PrintButton;
