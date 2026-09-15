import { useCallback, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Printer } from "lucide-react";
import { uploadAdminFileTemplate } from "@/api/domains/fileTemplates.api";
import { createPrintJob, fetchSelectableStations, type PrintStationOption } from "@/api/domains/print.api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * 临时打印：选一台打印机 → 选一个文件 → 上传后立刻派发，打完即删。
 *
 * 跟「文件模板库」正相反 —— 那边是长期留档、反复使用；这边是传一次、打一次，
 * 服务端不留文件，也不在模板库列表里出现。
 *
 * 为什么必须先上传：工位是从服务端拉文件来渲染的，没有落地方就没得拉。
 * 所以「不留痕」只能靠打完再删，不能靠不落盘。
 *
 * 注意：删的只是服务端那份。你本机的打印后台（Spooler）和浏览器缓存里
 * 可能还留着痕迹，那不在我们能管的范围内。
 */
export function TempPrintButton() {
  const [stations, setStations] = useState<PrintStationOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  /** 用户在菜单里选的工位，等选完文件再用 */
  const pickedRef = useRef<PrintStationOption | null>(null);

  const loadStations = useCallback(async () => {
    if (stations !== null) return;
    try {
      setStations(await fetchSelectableStations());
    } catch {
      setStations([]);
    }
  }, [stations]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    const station = pickedRef.current;
    pickedRef.current = null;
    if (!f || !station) return;

    setBusy(true);
    try {
      const row = await uploadAdminFileTemplate(f, "TEMPLATE", true);
      await createPrintJob({
        stationId: station.id,
        sourceType: "ADMIN_FILE",
        sourceId: row.id,
        fileName: row.originalName,
      });
      toast.success(`已派给「${station.name}」打印，打完即删`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "临时打印失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={(ev) => void onFile(ev)}
      />
      <DropdownMenu onOpenChange={(open) => { if (open) void loadStations(); }}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)] disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            临时打印
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-56 min-w-[12rem] overflow-y-auto">
          {stations === null ? (
            <div className="px-2 py-1.5 text-[12px] text-[var(--app-color-text-tertiary)]">加载中…</div>
          ) : stations.length === 0 ? (
            <div className="max-w-[16rem] whitespace-normal px-2 py-1.5 text-[12px] text-[var(--app-color-text-tertiary)]">
              没有可用的打印机，请联系管理员配置打印工位
            </div>
          ) : (
            stations.map((s) => (
              <DropdownMenuItem
                key={s.id}
                disabled={busy}
                onSelect={() => {
                  pickedRef.current = s;
                  // 菜单关闭后再拉文件选择框，否则弹窗会被菜单的关闭动作吃掉
                  setTimeout(() => fileRef.current?.click(), 0);
                }}
              >
                {s.name}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export default TempPrintButton;
