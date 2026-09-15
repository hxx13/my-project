import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { createPrintJob, fetchSelectableStations, type PrintStationOption } from "@/api/domains/print.api";
import { uploadAdminFileTemplate } from "@/api/domains/fileTemplates.api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceType: "CARD_ARCHIVE" | "ADMIN_FILE";
  sourceId: string;
  fileName: string;
  /**
   * 还没上传的文件。给了它就等确认时才上传（且按一次性文件处理）。
   * 临时打印走这条路 —— 用户取消时服务端什么都没留下。
   */
  pendingFile?: File | null;
  onDispatched?: () => void;
}

const labelCls = "mb-1 block text-[12px] font-medium text-[var(--app-color-text-secondary)]";
const inputCls =
  "w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1.5 text-[13px] text-[var(--app-color-text-primary)] outline-none";

/**
 * 派发打印的统一弹窗：选打印机 + 备注 + 份数 + 加急。
 *
 * 三个入口（文件模板库、卡片打印、归档补打）共用这一个 ——
 * 「派发时要填什么」这件事只有一个答案，各写一份迟早会走样。
 */
export function PrintDispatchDialog({
  open,
  onOpenChange,
  sourceType,
  sourceId,
  fileName,
  pendingFile,
  onDispatched,
}: Props) {
  const [stations, setStations] = useState<PrintStationOption[] | null>(null);
  const [stationId, setStationId] = useState("");
  const [note, setNote] = useState("");
  const [copies, setCopies] = useState(1);
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNote("");
    setCopies(1);
    setUrgent(false);
    setBusy(false);
    void fetchSelectableStations()
      .then((list) => {
        setStations(list);
        // 保留上次选的工位（还在的话），否则默认第一台，省掉一次点击
        setStationId((prev) => (prev && list.some((s) => s.id === prev) ? prev : list[0]?.id ?? ""));
      })
      .catch(() => setStations([]));
  }, [open]);

  const confirm = async () => {
    if (!stationId) {
      toast.error("请选择打印机");
      return;
    }
    setBusy(true);
    try {
      // 临时打印：先上传拿 fileId 再派发。放在确认之后，
      // 用户取消时服务端不会留下任何东西。
      let sid = sourceId;
      let name = fileName;
      if (pendingFile) {
        const row = await uploadAdminFileTemplate(pendingFile, "TEMPLATE", true);
        sid = row.id;
        name = row.originalName;
      }
      await createPrintJob({ stationId, sourceType, sourceId: sid, fileName: name, copies, note, urgent });
      const stName = stations?.find((s) => s.id === stationId)?.name ?? "打印工位";
      toast.success(`已派给「${stName}」打印`);
      onDispatched?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "派发打印失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>派发打印</DialogTitle>
          <DialogDescription className="break-all">
            {pendingFile ? pendingFile.name : fileName}
            {pendingFile ? "（打完即删，不留档）" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>打印机</label>
            <select
              className={inputCls}
              value={stationId}
              disabled={stations === null}
              onChange={(e) => setStationId(e.target.value)}
            >
              {stations === null ? <option value="">加载中…</option> : null}
              {stations !== null && stations.length === 0 ? (
                <option value="">没有可用的打印机</option>
              ) : null}
              {(stations ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>备注（工位旁边的人看得到）</label>
            <input
              className={inputCls}
              value={note}
              maxLength={200}
              placeholder="如：三月批的笼位卡，打完放前台"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="w-24">
              <label className={labelCls}>份数</label>
              <input
                type="number"
                min={1}
                max={99}
                className={inputCls}
                value={copies}
                onChange={(e) => setCopies(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
              />
            </div>
            <label className="flex items-center gap-2 pb-1.5 text-[13px] text-[var(--app-color-text-primary)]">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
              加急（排到队首）
            </label>
          </div>

          {copies > 1 ? (
            <p className="text-[11px] text-[var(--app-color-text-tertiary)]">
              工位会连打 {copies} 次。中途某一次失败会少打一份，工位页会标出来。
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <button
            type="button"
            className="rounded-md border border-[var(--app-color-border-default)] px-3 py-1.5 text-sm text-[var(--app-color-text-primary)]"
            onClick={() => onOpenChange(false)}
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy || !stationId}
            className="rounded-md bg-[var(--twin-primary)] px-3 py-1.5 text-sm font-medium text-[var(--twin-on-primary)] disabled:opacity-50"
            onClick={() => void confirm()}
          >
            {busy ? "派发中…" : "确认派发"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PrintDispatchDialog;
