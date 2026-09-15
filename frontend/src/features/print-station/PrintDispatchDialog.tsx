import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import {
  createPrintJob,
  fetchPrintPreview,
  fetchSelectableStations,
  type PrintStationOption,
} from "@/api/domains/print.api";
import { uploadAdminFileTemplate } from "@/api/domains/fileTemplates.api";
import { templateKeyOf, type CartOverride, type PrintItem, type LocalFileItem } from "./printCart";
import { PdfPrintCanvas } from "./PdfPrintCanvas";
import { StationPicker } from "./StationPicker";
import {
  FILE_GROUPS,
  fileGroupOf,
  printKindOf,
  sniffBlobKind,
  stationSupports,
  UNSUPPORTED_PRINT_HINT,
} from "@/features/print-station/printableTypes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PrintDispatchItem = PrintItem | LocalFileItem;

interface BatchDoneResult {
  succeededKeys: string[];
  failed: { key: string; reason: string }[];
}

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
  /**
   * 待打清单（批量模式）。有值就按数组逐条派发；没值维持单文件行为。
   */
  items?: PrintDispatchItem[];
  /** 批量派发结束回调：调用方据此把成功的从清单摘掉、把失败的留下。 */
  onBatchDone?: (result: BatchDoneResult) => void;
  /**
   * 逐条覆盖（待打清单里单独设的份数 / 加急），key 与清单项一致：
   * 模板项 templateKeyOf，本地文件项 item.key。有值就盖过弹窗里的统一值；
   * 不传 = 全部走统一值 = 单文件路径行为不变。
   */
  overrides?: Record<string, CartOverride>;
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
  items,
  onBatchDone,
  overrides,
}: Props) {
  const [stations, setStations] = useState<PrintStationOption[] | null>(null);
  const [stationId, setStationId] = useState("");
  const [note, setNote] = useState("");
  const [copies, setCopies] = useState(1);
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});

  /* ── 预览：给的是**实际会被打印的那份**（Word 是转换后的 PDF，不是原文件）── */
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewKind, setPreviewKind] = useState<"pdf" | "image" | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [previewErr, setPreviewErr] = useState("");
  const [previewImgUrl, setPreviewImgUrl] = useState<string | null>(null);

  // 图片预览走 objectURL，生命周期跟着 blob 走，用完就撤
  useEffect(() => {
    if (!previewBlob || previewKind !== "image") {
      setPreviewImgUrl(null);
      return;
    }
    const url = URL.createObjectURL(previewBlob);
    setPreviewImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [previewBlob, previewKind]);

  /** 待打清单：items 有值就是批量模式，逐条派发；没值维持单文件行为。 */
  const batchItems = items ?? [];
  const isBatch = batchItems.length > 0;

  /** 文件模板库里还留着上传限制之前传的 .docx / .xlsx，点它们的「打印」要拦住并说明原因 */
  const unsupported = !isBatch && printKindOf(pendingFile ? pendingFile.name : fileName) === "unsupported";

  // 这台机器认不认这类文件。工位可配（比如斑马卡牌机只吃 PDF），
  // 不拦的话用户要等打到一半才发现卡住。
  const group = fileGroupOf(pendingFile ? pendingFile.name : fileName);
  const selectedStation = (stations ?? []).find((s) => s.id === stationId) ?? null;
  const stationAccepts = isBatch || (selectedStation ? stationSupports(selectedStation.supportedTypes, group) : true);

  useEffect(() => {
    if (!open) return;
    setNote("");
    setCopies(1);
    setUrgent(false);
    setBusy(false);
    setItemErrors({});
    void fetchSelectableStations()
      .then((list) => {
        setStations(list);
        // 保留上次选的工位（还在的话），否则默认第一台，省掉一次点击
        setStationId((prev) => (prev && list.some((s) => s.id === prev) ? prev : list[0]?.id ?? ""));
      })
      .catch(() => setStations([]));
  }, [open]);

  /**
   * 预览：拉的是**实际会被打印的那份** —— Word 给的是转换后的 PDF，不是原文件。
   * 用文件模板的下载接口会看到 .docx，跟出纸对不上（浏览器也渲染不了）。
   *
   * 临时打印的文件还没上传，服务端没有转换产物：PDF/图片直接看本地的，
   * Office 只能等上传后才看得到。
   */
  useEffect(() => {
    if (!open || isBatch) {
      setPreviewBlob(null);
      setPreviewKind(null);
      setPreviewState("idle");
      return;
    }
    let cancelled = false;

    const load = async () => {
      if (pendingFile) {
        const kind = printKindOf(pendingFile.name);
        if (kind === "pdf" || kind === "image") {
          setPreviewBlob(pendingFile);
          setPreviewKind(kind);
          setPreviewState("ready");
        } else {
          setPreviewBlob(null);
          setPreviewState("idle");
        }
        return;
      }
      setPreviewState("loading");
      try {
        const blob = await fetchPrintPreview(sourceType, sourceId);
        const k = await sniffBlobKind(blob);
        if (cancelled) return;
        setPreviewBlob(blob);
        setPreviewKind(k === "image" ? "image" : "pdf");
        setPreviewState("ready");
      } catch (e) {
        if (cancelled) return;
        setPreviewErr(e instanceof Error ? e.message : "预览加载失败");
        setPreviewState("error");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, pendingFile, sourceType, sourceId, isBatch]);

  /** 条目 key：模板项现算，本地文件项用自带 key。与 succeededKeys / failed 同一套。 */
  const keyOf = (item: PrintDispatchItem) => ("file" in item ? item.key : templateKeyOf(item));

  /** 本次派发的条目里有没有单独设过份数/加急，有就在控件旁提示。 */
  const hasOverrides = isBatch
    ? batchItems.some((item) => {
        const ov = overrides?.[keyOf(item)];
        return ov !== undefined && (ov.copies !== undefined || ov.urgent !== undefined);
      })
    : false;

  /** 逐条派发：模板库项直接发；本地文件先上传拿 id 再发（ephemeral 打完即删）。 */
  const dispatchOne = async (item: PrintDispatchItem) => {
    const key = keyOf(item);
    const nCopies = overrides?.[key]?.copies ?? copies;
    const isUrgent = overrides?.[key]?.urgent ?? urgent;
    if ("file" in item) {
      const row = await uploadAdminFileTemplate(item.file, "TEMPLATE", true);
      await createPrintJob({
        stationId,
        sourceType: "ADMIN_FILE",
        sourceId: row.id,
        fileName: row.originalName,
        copies: nCopies,
        note,
        urgent: isUrgent,
      });
    } else {
      await createPrintJob({
        stationId,
        sourceType: item.sourceType as "CARD_ARCHIVE" | "ADMIN_FILE",
        sourceId: item.sourceId,
        fileName: item.fileName,
        copies: nCopies,
        note,
        urgent: isUrgent,
      });
    }
  };

  /** 批量派发：串行 for...of，逐条收集成败，失败项留在清单并标原因。
   *  逐条过跟单文件一样的两道类型门禁（渲染不了 / 这台工位不支持）——
   *  命中的那一条本地判失败、不发请求，不拖累其余条目。 */
  const dispatchBatch = async () => {
    setBusy(true);
    const succeededKeys: string[] = [];
    const failed: { key: string; reason: string }[] = [];
    const stationName = selectedStation?.name ?? "该打印机";
    for (const item of batchItems) {
      const key = keyOf(item);
      const name = "file" in item ? item.name : item.fileName;
      if (printKindOf(name) === "unsupported") {
        failed.push({ key, reason: "这个文件类型打不了" });
        continue;
      }
      const itemGroup = fileGroupOf(name);
      if (!stationSupports(selectedStation?.supportedTypes, itemGroup)) {
        const groupLabel = FILE_GROUPS.find((g) => g.key === itemGroup)?.label ?? "该类型";
        failed.push({ key, reason: `这台打印机「${stationName}」不支持「${groupLabel}」` });
        continue;
      }
      try {
        await dispatchOne(item);
        succeededKeys.push(key);
      } catch (e) {
        failed.push({ key, reason: e instanceof Error ? e.message : "派发失败" });
      }
    }
    setBusy(false);

    if (failed.length) {
      const errMap: Record<string, string> = {};
      for (const f of failed) errMap[f.key] = f.reason;
      setItemErrors(errMap);
      toast.error(`成功 ${succeededKeys.length} 条，失败 ${failed.length} 条`);
    } else {
      setItemErrors({});
      toast.success(`已派发 ${succeededKeys.length} 份`);
      onOpenChange(false);
    }
    onBatchDone?.({ succeededKeys, failed });
  };

  const confirm = async () => {
    if (isBatch) {
      if (!stationId) {
        toast.error("请选择打印机");
        return;
      }
      await dispatchBatch();
      return;
    }
    if (unsupported) return;
    if (!stationAccepts) {
      toast.error("这台打印机不支持该文件类型，请换一台");
      return;
    }
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
            {isBatch ? `共 ${batchItems.length} 份，逐条派发` : pendingFile ? pendingFile.name : fileName}
            {isBatch ? null : pendingFile ? "（打完即删，不留档）" : ""}
          </DialogDescription>
        </DialogHeader>

        {isBatch ? (
          /* 批量：列出待打清单，失败的那几行在这里标出原因 */
          <div className="max-h-[45vh] min-h-[150px] overflow-y-auto rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-2">
            <ul className="space-y-1">
              {batchItems.map((item) => {
                const key = keyOf(item);
                const name = "file" in item ? item.name : item.fileName;
                const err = itemErrors[key];
                return (
                  <li key={key} className="text-[13px] leading-relaxed text-[var(--app-color-text-primary)]">
                    <span className="break-all">{name}</span>
                    {err ? (
                      <span className="mt-0.5 block text-[12px] text-[var(--app-color-feedback-error)]">{err}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          /* 预览：确认前先看一眼真实产物。Word 的话这里就是转换后的 PDF */
          <div className="max-h-[45vh] min-h-[150px] overflow-y-auto rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-2">
            {previewState === "loading" ? (
              <div className="flex h-[130px] items-center justify-center gap-2 text-[13px] text-[var(--app-color-text-tertiary)]">
                <Loader2 className="size-4 animate-spin" />
                正在准备预览…
              </div>
            ) : previewState === "error" ? (
              <div className="flex h-[130px] items-center justify-center px-4 text-center text-[13px] text-[var(--app-color-feedback-error)]">
                {previewErr}
              </div>
            ) : previewBlob && previewKind === "pdf" ? (
              <PdfPrintCanvas blob={previewBlob} />
            ) : previewImgUrl ? (
              <img src={previewImgUrl} alt="" className="mx-auto block max-w-full" />
            ) : (
              <div className="flex h-[130px] items-center justify-center px-4 text-center text-[13px] text-[var(--app-color-text-tertiary)]">
                {pendingFile ? "这份文件上传后才能预览" : "没有可预览的内容"}
              </div>
            )}
          </div>
        )}

        {unsupported ? (
          <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-800">
            {UNSUPPORTED_PRINT_HINT}
          </div>
        ) : null}

        <div className={unsupported ? "hidden" : "space-y-3"}>
          <div>
            <label className={labelCls}>打印机</label>
            <StationPicker stations={stations} value={stationId} onChange={setStationId} />

            {/* 红绿灯：这台机器认哪些类型。当前文件所属的那一类加一圈描边，
                一眼看出"我要打的东西在这儿是不是绿的"。批量模式无单文件，不显示。 */}
            {!isBatch && selectedStation ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-[var(--app-color-text-tertiary)]">这台机器支持：</span>
                {FILE_GROUPS.map((g) => {
                  const on = stationSupports(selectedStation.supportedTypes, g.key);
                  return (
                    <span
                      key={g.key}
                      className={
                        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 " +
                        (on
                          ? "text-[var(--app-color-feedback-success)]"
                          : "text-[var(--app-color-text-tertiary)] opacity-70") +
                        (g.key === group ? " ring-1 ring-current" : "")
                      }
                    >
                      <span
                        className={
                          "size-1.5 shrink-0 rounded-full " +
                          (on
                            ? "bg-[var(--app-color-feedback-success)]"
                            : "bg-[var(--app-color-text-tertiary)] opacity-50")
                        }
                      />
                      {g.label}
                    </span>
                  );
                })}
              </div>
            ) : null}

            {!stationAccepts ? (
              <p className="mt-1 text-[11px] text-[var(--app-color-feedback-error)]">
                这台打印机不支持「{FILE_GROUPS.find((g) => g.key === group)?.label ?? "该类型"}」，
                换一台，或先转成它支持的格式。
              </p>
            ) : null}
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

          {hasOverrides ? (
            <p className="rounded-md border-l-4 border-[color-mix(in_srgb,var(--app-color-feedback-warning)_50%,transparent)] bg-[color-mix(in_srgb,var(--app-color-feedback-warning)_10%,transparent)] px-3 py-2 text-[12px] leading-relaxed text-[var(--app-color-text-secondary)]">
              清单里有条目单独设过份数 / 加急，派发时会优先采用它们；这里填的份数和加急只对没单独设过的条目生效。
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
            disabled={busy || !stationId || unsupported || !stationAccepts}
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
