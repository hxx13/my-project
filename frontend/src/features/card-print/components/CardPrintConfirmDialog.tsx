import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import {
  downloadCardArchive,
  generateCardPdf,
} from "@/api/domains/cardPrint.api";
import { createPrintJob, type PrintStationOption } from "@/api/domains/print.api";
import { PdfPrintCanvas } from "@/features/print-station/PdfPrintCanvas";
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
  templateId: number;
  cageIds: string[];
  nameSuffix: string;
  stations: PrintStationOption[];
  /** 派发成功后回调（父组件用来刷新归档列表等） */
  onDispatched?: () => void;
}

/**
 * 打印前先看一眼真实产物，确认了才派发。
 *
 * 为什么预览的是「已经生成出来的 PDF」而不是右栏那套 React 预览：
 * 卡牌有两条渲染路径（前端 React 一套、后端 PDFBox 一套），
 * 预览与实印必须一致是这个项目的硬规矩。直接把生成好的 PDF 画出来，
 * 预览的就**是**最终产物本身，绕开「两套渲染器到底一不一致」这个说不清的问题。
 *
 * 代价是点开弹窗就会生成一次 PDF。卡牌 PDF 很小；用户取消的话，
 * 归档留在归档列表里，需要时能直接补打，不算浪费。
 */
export function CardPrintConfirmDialog({
  open,
  onOpenChange,
  templateId,
  cageIds,
  nameSuffix,
  stations,
  onDispatched,
}: Props) {
  const [stage, setStage] = useState<"generating" | "ready" | "error">("generating");
  const [archive, setArchive] = useState<{ id: number; fileName: string; pageCount: number } | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [err, setErr] = useState("");
  const [stationId, setStationId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStage("generating");
    setArchive(null);
    setBlob(null);
    setErr("");
    // 默认选中第一台，省掉一次点击；用户可以改
    setStationId((prev) => prev || stations[0]?.id || "");

    (async () => {
      try {
        const r = await generateCardPdf(templateId, cageIds, nameSuffix);
        if (cancelled || !r) return;
        const b = await downloadCardArchive(r.archiveId);
        if (cancelled) return;
        setArchive({ id: r.archiveId, fileName: r.fileName, pageCount: r.pageCount });
        setBlob(b);
        setStage("ready");
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "生成失败");
        setStage("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // cageIds 由调用方 memo，避免每次渲染都重跑生成
  }, [open, templateId, cageIds, nameSuffix, stations]);

  const confirm = async () => {
    if (!archive) return;
    if (!stationId) {
      toast.error("请选择打印机");
      return;
    }
    setBusy(true);
    try {
      await createPrintJob({
        stationId,
        sourceType: "CARD_ARCHIVE",
        sourceId: String(archive.id),
        fileName: archive.fileName,
      });
      const name = stations.find((s) => s.id === stationId)?.name ?? "打印工位";
      toast.success(`已派给「${name}」打印`);
      onDispatched?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "派发失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>确认打印</DialogTitle>
          <DialogDescription>
            {stationId
              ? `下面就是将要打印的内容，共 ${archive?.pageCount ?? "—"} 页。`
              : "请先选择打印机。"}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] min-h-[240px] overflow-y-auto rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-3">
          {stage === "generating" ? (
            <div className="flex h-[220px] items-center justify-center gap-2 text-sm text-[var(--app-color-text-tertiary)]">
              <Loader2 className="size-4 animate-spin" />
              正在生成 PDF…
            </div>
          ) : stage === "error" ? (
            <div className="flex h-[220px] items-center justify-center px-6 text-center text-sm text-[var(--app-color-feedback-error)]">
              {err}
            </div>
          ) : blob ? (
            <PdfPrintCanvas blob={blob} />
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[13px] text-[var(--app-color-text-secondary)]">打印机</span>
          <select
            className="min-w-48 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1.5 text-[13px] text-[var(--app-color-text-primary)]"
            value={stationId}
            disabled={stage !== "ready"}
            onChange={(e) => setStationId(e.target.value)}
          >
            {stations.length === 0 ? <option value="">没有可用的打印机</option> : null}
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {archive ? (
            <span className="min-w-0 truncate text-[12px] text-[var(--app-color-text-tertiary)]">
              {archive.fileName}
            </span>
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
            disabled={stage !== "ready" || busy || !stationId}
            className="rounded-md bg-[var(--twin-primary)] px-3 py-1.5 text-sm font-medium text-[var(--twin-on-primary)] disabled:opacity-50"
            onClick={() => void confirm()}
          >
            {busy ? "派发中…" : "确认打印"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CardPrintConfirmDialog;
