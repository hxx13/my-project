import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { X, SplitSquareHorizontal, MoveRight } from "lucide-react";
import {
  submitCageDivide,
  submitCageTransfer,
  fetchTransferFormPrefill,
  type CageOpTarget,
  type CageTransferFormData,
  type CageTransferFormPrefill,
} from "@/api/domains/cageShelf.api";
import {
  buildTransferForm,
  type TransferFormEdits,
  type TransferFormRowField as RowField,
  type TransferFormTopField as TopField,
} from "../cageTransferForm";
import { CageFormModalPortal } from "./CageFormModalPortal";
import { displayPosition } from "../constants";
import type { CageOpKind, CageOpSource, BatchPair } from "../useCageOpSelect";

/** 坐标 → 位号，与网格显示同一套换算（A-1 在底行，显示为 A-10） */
function positionLabel(x?: number | null, y?: number | null): string {
  if (x == null || y == null) return "—";
  return displayPosition(`${x}-${y}`);
}

function whereOf(t: CageOpTarget): string {
  return [t.campusName, t.roomName, t.shelveName].filter(Boolean).join(" / ");
}

/** 转移单区块里的输入框：底色比容器浅一档，否则跟容器的 canvas-soft 糊成一片 */
const FIELD_CLS =
  "rounded-twin-md bg-[var(--twin-canvas)] px-2 py-1.5 text-[11px] text-[var(--twin-ink)] outline-none ring-1 ring-[var(--twin-hairline)] transition placeholder:text-[var(--twin-mute)] focus:ring-[color-mix(in_srgb,var(--twin-primary)_40%,transparent)]";

/** 只读字段：值是后端算的，学生改不了，所以只置灰显示，不做输入框 */
function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <>
      <dt className="text-[10px] leading-relaxed text-[var(--twin-mute)]">{label}</dt>
      <dd className="truncate text-[11px] leading-relaxed text-[var(--twin-ink)] opacity-70" title={value || undefined}>
        {value || "—"}
      </dd>
    </>
  );
}

/**
 * 分笼 / 转移的确认弹窗 — 三端共用。
 * 目标已在主网格上选好，这里只复核坐标 + 补充保留源笼位/原因，然后提交。
 *
 * 样式**自包含**：不用 `.aup-modal*`（那些定义在 aup.css，笼架页没 import，
 * 类名落空后 `border:1px solid var(--border)` 会解析成生硬黑边）。这里只用 twin 令牌。
 */
export default function CageOperationDialog({
  open,
  op,
  source,
  picked,
  pairs,
  onClose,
  onDone,
}: {
  open: boolean;
  op: CageOpKind;
  source: CageOpSource | null;
  picked: CageOpTarget[];
  /** 批量转移模式：一次确认 N 对（源→目标），每对各一张转移单，逐对提交 */
  pairs?: BatchPair[];
  onClose: () => void;
  onDone?: () => void;
}) {
  /** 分笼默认保留源笼位；不勾选才会把源笼位归档为空笼盒 */
  const [keepSource, setKeepSource] = useState(true);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isDivide = op === "divide";
  const isBatch = !!pairs && pairs.length > 0;
  /** 批量模式下真正要提交的配对（只留有目标的）；下标与 batchPrefills/batchRowEdits 对齐 */
  const batchList = isBatch ? pairs!.filter((p) => p.targetId) : [];
  const batchPairsKey = batchList.map((p) => `${p.sourceId}:${p.targetId}`).join(",");

  /* ---- 转移单：只读/预填的自动值来自后端 prefill，学生改动只叠在上面 ---- */
  const [prefill, setPrefill] = useState<CageTransferFormPrefill | null>(null);
  const [prefillLoading, setPrefillLoading] = useState(false);
  /** 学生**改动过**的字段。值与自动值相同的一律剔除，所以这里只装「真正动过」的 */
  const [edits, setEdits] = useState<TransferFormEdits>({});

  /* ---- 批量转移：N 对，各取各的 prefill，各记各的行改动 ---- */
  const [batchPrefills, setBatchPrefills] = useState<Array<CageTransferFormPrefill | null>>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  /** 整批共享的顶层改动（拟定转移日期 / 单位 / 电话），与首个 prefill 对齐做 touched-only */
  const [batchTopEdits, setBatchTopEdits] = useState<TransferFormEdits>({});
  /** 每对的行改动（下标与 batchList 对齐）；rowEdits[i].rows 只装那一对的目标笼位 id */
  const [batchRowEdits, setBatchRowEdits] = useState<TransferFormEdits[]>([]);

  const sourceCageId = source?.animalCageId;
  const targetKey = picked.map((t) => t.animalCageId).join(",");

  useEffect(() => {
    if (open) {
      setKeepSource(true);
      setReason("");
    }
  }, [open]);

  /**
   * 换源/换目标就重新取一次自动值（并丢掉旧改动：行是按序号对齐的，目标变了旧行就没意义）。
   * 取不到不拦提交 —— 学生手填，后端本来就有「缺则用笼位值」的兜底。
   */
  useEffect(() => {
    if (!open || isDivide || !sourceCageId) return;
    let alive = true;
    setPrefill(null);
    setEdits({});
    setPrefillLoading(true);
    fetchTransferFormPrefill(sourceCageId, picked.map((t) => t.animalCageId))
      .then((p) => { if (alive) setPrefill(p); })
      .catch(() => { if (alive) setPrefill(null); })
      .finally(() => { if (alive) setPrefillLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- picked 用 targetKey 代表（排序+集合）
  }, [open, isDivide, sourceCageId, targetKey]);

  /**
   * 批量：并发取每对的自动值（各一源一目标）。取不到的那对置 null —— 不拦提交，
   * 学生手填，后端本来就有「缺则用笼位值」的兜底。
   */
  useEffect(() => {
    if (!open || !isBatch) return;
    let alive = true;
    setBatchPrefills([]);
    setBatchTopEdits({});
    setBatchRowEdits([]);
    setBatchLoading(true);
    Promise.all(
      batchList.map((p) =>
        fetchTransferFormPrefill(p.sourceId, [p.targetId!]).catch(() => null),
      ),
    )
      .then((arr) => { if (alive) setBatchPrefills(arr); })
      .finally(() => { if (alive) setBatchLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- batchPairsKey 代表配对集合
  }, [open, isBatch, batchPairsKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || (!isBatch && !source)) return null;

  /** 单源分支必非空；批量分支 source=null 且走 isBatch 渲染，不会碰这里 */
  const src = source as CageOpSource;

  /* ---- 自动值 ↔ 学生值 ---- */

  const autoTop = (k: TopField): string => prefill?.[k] ?? "";
  /** 第 i 行（序号与 picked 对齐）的自动值；取不到给空串，学生填了才算改过 */
  const autoRow = (i: number, f: RowField): string => {
    const v = prefill?.rows?.[i]?.[f];
    return v == null ? "" : String(v);
  };
  const showTop = (k: TopField): string => edits[k] ?? autoTop(k);
  const showRow = (cageId: string, i: number, f: RowField): string => edits.rows?.[cageId]?.[f] ?? autoRow(i, f);

  /** 改动记录：**跟自动值相同就删掉这条**，于是「改回自动值」= 没改过，提交时不会把自动值冻住 */
  const setTop = (k: TopField, v: string) =>
    setEdits((p) => {
      const next = { ...p };
      if (v === autoTop(k)) delete next[k];
      else next[k] = v;
      return next;
    });

  const setRow = (cageId: string, i: number, f: RowField, v: string) =>
    setEdits((p) => {
      const rows = { ...(p.rows ?? {}) };
      const row = { ...(rows[cageId] ?? {}) };
      if (v === autoRow(i, f)) delete row[f];
      else row[f] = v;
      if (Object.keys(row).length === 0) delete rows[cageId];
      else rows[cageId] = row;
      return { ...p, rows };
    });

  /**
   * 提交载荷：**只发学生动过的值**，一行都没动就整行不发。
   * 后端对每个缺失字段各自回退到自动值，多发一个自动值 = 把那一刻的自动值冻进单子。
   */
  const buildForm = () => buildTransferForm(edits, picked.map((t) => t.animalCageId));

  /* ---- 批量：自动值 ↔ 学生值（与单源同一套 touched-only 口径） ---- */
  const batchAutoTop = (k: TopField): string => batchPrefills[0]?.[k] ?? "";
  const batchAutoRow = (i: number, f: RowField): string => {
    const v = batchPrefills[i]?.rows?.[0]?.[f];
    return v == null ? "" : String(v);
  };
  const showBatchTop = (k: TopField): string => batchTopEdits[k] ?? batchAutoTop(k);
  const showBatchRow = (i: number, f: RowField): string =>
    batchRowEdits[i]?.rows?.[batchList[i].targetId!]?.[f] ?? batchAutoRow(i, f);

  const setBatchTop = (k: TopField, v: string) =>
    setBatchTopEdits((p) => {
      const next = { ...p };
      if (v === batchAutoTop(k)) delete next[k];
      else next[k] = v;
      return next;
    });

  const setBatchRow = (i: number, f: RowField, v: string) => {
    const targetId = batchList[i].targetId!;
    setBatchRowEdits((prev) => {
      const arr = prev.slice();
      const cur = arr[i] ?? {};
      const rows = { ...(cur.rows ?? {}) };
      const row = { ...(rows[targetId] ?? {}) };
      if (v === batchAutoRow(i, f)) delete row[f];
      else row[f] = v;
      if (Object.keys(row).length === 0) delete rows[targetId];
      else rows[targetId] = row;
      arr[i] = { ...cur, rows };
      return arr;
    });
  };

  /** 整批提交载荷：整批共享的顶层 + 全部对的行（rows[i] 与 pairs[i] 对齐），都只发动过的值 */
  const buildBatchForm = (): CageTransferFormData | undefined => {
    const rows: NonNullable<TransferFormEdits["rows"]> = {};
    batchList.forEach((p, i) => {
      const r = batchRowEdits[i]?.rows?.[p.targetId!];
      if (r) rows[p.targetId!] = r;
    });
    return buildTransferForm(
      { ...batchTopEdits, rows },
      batchList.map((p) => p.targetId!),
    );
  };

  const handleSubmit = async () => {
    if (picked.length === 0) {
      toast.error(isDivide ? "请先选择分笼目标笼位" : "请先选择转移目标笼位");
      return;
    }
    const transferForm = isDivide ? undefined : buildForm();
    setSubmitting(true);
    try {
      const res = isDivide
        ? await submitCageDivide({
            sourceAnimalCageId: src.animalCageId,
            targetAnimalCageIds: picked.map((t) => t.animalCageId),
            keepSource,
            reason: reason.trim() || undefined,
          })
        : await submitCageTransfer({
            fromAnimalCageId: src.animalCageId,
            targetAnimalCageIds: picked.map((t) => t.animalCageId),
            reason: reason.trim() || undefined,
            transferForm,
          });
      toast.success(res.needApproval ? "已提交，等待审核" : "操作已完成");
      onDone?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  /** 批量提交：一次提交整批 pairs + 一份 transferForm = 一张单、一次三签（全成或全败） */
  const handleBatchSubmit = async () => {
    if (batchList.length === 0) return;
    setSubmitting(true);
    try {
      const res = await submitCageTransfer({
        pairs: batchList.map((p) => ({ source: p.sourceId, target: p.targetId! })),
        reason: reason.trim() || undefined,
        transferForm: buildBatchForm(),
      });
      toast.success(res.needApproval ? "已提交，等待审核" : "操作已完成");
      onDone?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const title = isBatch ? "确认批量转移" : isDivide ? "确认分笼" : "确认转移笼位";
  const Icon = isDivide ? SplitSquareHorizontal : MoveRight;

  return (
    <CageFormModalPortal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.16 }}
        className="fixed inset-0 z-[var(--z-modal,800)] grid place-items-center bg-slate-900/35 p-4 backdrop-blur-[2px]"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[86vh] w-[92vw] max-w-[560px] flex-col overflow-hidden rounded-twin-xl bg-[var(--twin-canvas)] shadow-[0_24px_70px_-12px_rgba(15,23,42,0.35)] ring-1 ring-black/5"
        >
          {/* 头部 */}
          <header className="flex shrink-0 items-start gap-3 px-5 pb-4 pt-5">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-twin-lg bg-[var(--twin-primary-soft,#eef2ff)] text-[var(--twin-primary)]">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold leading-tight text-[var(--twin-ink)]">{title}</h3>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--twin-mute)]">
                {isBatch
                  ? "逐对确认转移单，一次性提交全部配对"
                  : isDivide
                    ? "表单将整表复制到选中的目标笼位作为基础信息"
                    : "占用者、动物信息与状态标记将整体迁入目标笼位"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-twin-md text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas-soft-2)] hover:text-[var(--twin-ink)]"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            {isBatch ? (
              <>
                {/* 转移单头部 */}
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[var(--twin-ink)]">转移单</span>
                  <span className="text-[10px] text-[var(--twin-mute)]">
                    {batchLoading ? "自动值加载中…" : "灰底为系统自动填，不可改"}
                  </span>
                </div>

                {batchList.map((p, i) => {
                  const pf = batchPrefills[i];
                  return (
                    <div key={p.sourceId} className="mt-3 rounded-twin-lg bg-[var(--twin-canvas-soft)] px-3.5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: p.color }} />
                        <span className="text-[12px] font-semibold text-[var(--twin-ink)]">
                          {p.sourceLabel?.position ?? p.sourceId}
                          <MoveRight className="mx-1.5 inline h-3.5 w-3.5 text-[var(--twin-mute)]" />
                          {p.targetLabel?.position ?? p.targetId}
                        </span>
                        <span className="ml-auto shrink-0 text-[10px] text-[var(--twin-mute)]">包装盒 1 个</span>
                      </div>

                      <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1">
                        <ReadOnlyField label="负责人（PI）" value={pf?.piName} />
                        <ReadOnlyField label="实验人员" value={pf?.experimenterName} />
                        <ReadOnlyField label="实验动物转出地点" value={pf?.fromLocation} />
                        <ReadOnlyField label="实验动物接收地点" value={pf?.toLocation} />
                        <ReadOnlyField label="负责人（PI签字）" value={pf?.piName} />
                        <ReadOnlyField label="实验人员签字" value={pf?.experimenterName} />
                      </dl>

                      <div className="mt-2 flex items-center gap-2">
                        <input
                          value={showBatchRow(i, "strain")}
                          onChange={(e) => setBatchRow(i, "strain", e.target.value)}
                          placeholder="品系"
                          className={`${FIELD_CLS} min-w-0 flex-1`}
                        />
                        <input
                          value={showBatchRow(i, "female")}
                          onChange={(e) => setBatchRow(i, "female", e.target.value)}
                          inputMode="numeric"
                          placeholder="0"
                          className={`${FIELD_CLS} w-12 shrink-0 text-center`}
                        />
                        <input
                          value={showBatchRow(i, "male")}
                          onChange={(e) => setBatchRow(i, "male", e.target.value)}
                          inputMode="numeric"
                          placeholder="0"
                          className={`${FIELD_CLS} w-12 shrink-0 text-center`}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* 整批共享的顶层字段 */}
                <div className="mt-3 rounded-twin-lg bg-[var(--twin-canvas-soft)] px-3.5 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--twin-mute)]">整批共享</div>
                  <label className="mt-2 flex items-center gap-2">
                    <span className="shrink-0 text-[11px] text-[var(--twin-ink)]">拟定转移日期</span>
                    <input
                      type="date"
                      value={showBatchTop("transferDate")}
                      onChange={(e) => setBatchTop("transferDate", e.target.value)}
                      className={`${FIELD_CLS} min-w-0 flex-1`}
                    />
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="text-[10px] text-[var(--twin-mute)]">申请方单位名称</span>
                      <input
                        value={showBatchTop("unitName")}
                        onChange={(e) => setBatchTop("unitName", e.target.value)}
                        placeholder="自动取，缺则填写"
                        className={FIELD_CLS}
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="text-[10px] text-[var(--twin-mute)]">电话</span>
                      <input
                        value={showBatchTop("phone")}
                        onChange={(e) => setBatchTop("phone", e.target.value)}
                        placeholder="自动取，缺则填写"
                        className={FIELD_CLS}
                      />
                    </label>
                  </div>
                </div>
              </>
            ) : (
              <>
            {/* 源笼位 */}
            <div className="rounded-twin-lg bg-[var(--twin-canvas-soft)] px-3.5 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--twin-mute)]">源笼位</div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[15px] font-semibold text-[var(--twin-ink)]">
                  {src.position ? displayPosition(src.position) : src.animalCageId}
                </span>
                {src.occupantName && (
                  <span className="text-[11px] text-[var(--twin-mute)]">占用者 {src.occupantName}</span>
                )}
              </div>
            </div>

            {/* 目标列表 */}
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--twin-ink)]">
                {isDivide ? "分笼目标" : "转移目标"}
              </span>
              <span className="text-[11px] text-[var(--twin-mute)]">{picked.length} 个</span>
            </div>
            <div className="mt-2 overflow-hidden rounded-twin-lg bg-[var(--twin-canvas-soft)]">
              {picked.length === 0 ? (
                <div className="px-3.5 py-6 text-center text-[11px] text-[var(--twin-mute)]">未选择目标笼位</div>
              ) : (
                picked.map((t) => (
                  <div
                    key={t.animalCageId}
                    className="flex items-center gap-3 px-3.5 py-2.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--twin-hairline)]"
                  >
                    <span className="shrink-0 rounded-twin-sm bg-[var(--twin-canvas)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--twin-ink)]">
                      {positionLabel(t.positionX, t.positionY)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--twin-mute)]">{whereOf(t)}</span>
                    {t.aupNumber && (
                      <span className="shrink-0 font-mono text-[10px] text-[var(--twin-mute)]">{t.aupNumber}</span>
                    )}
                  </div>
                ))
              )}
            </div>

            {!isDivide && (
              <div className="mt-4 rounded-twin-lg bg-[var(--twin-canvas-soft)] px-3.5 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[var(--twin-ink)]">转移单</span>
                  <span className="text-[10px] text-[var(--twin-mute)]">
                    {prefillLoading ? "自动值加载中…" : prefill ? "灰底为系统自动填，不可改" : "自动值未取到，可手动填写"}
                  </span>
                </div>

                {/* 只读：后端自动填 */}
                <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1">
                  <ReadOnlyField label="负责人（PI）" value={prefill?.piName} />
                  <ReadOnlyField label="实验人员" value={prefill?.experimenterName} />
                  <ReadOnlyField label="实验动物转出地点" value={prefill?.fromLocation} />
                  <ReadOnlyField label="实验动物接收地点" value={prefill?.toLocation} />
                  <ReadOnlyField label="负责人（PI签字）" value={prefill?.piName} />
                  <ReadOnlyField label="实验人员签字" value={prefill?.experimenterName} />
                  <ReadOnlyField label="包装盒" value={`${picked.length} 个`} />
                </dl>

                {/* 自动填但可改：一个目标一行，行随 picked 增减 */}
                <div className="mt-3 flex items-center gap-2 text-[10px] text-[var(--twin-mute)]">
                  <span className="w-11 shrink-0 text-center">笼位</span>
                  <span className="min-w-0 flex-1">品系</span>
                  <span className="w-12 shrink-0 text-center">雌</span>
                  <span className="w-12 shrink-0 text-center">雄</span>
                </div>
                <div className="mt-1 space-y-1.5">
                  {picked.map((t, i) => (
                    <div key={t.animalCageId} className="flex items-center gap-2">
                      <span className="w-11 shrink-0 rounded-twin-sm bg-[var(--twin-canvas)] py-1 text-center text-[10px] font-semibold text-[var(--twin-ink)]">
                        {positionLabel(t.positionX, t.positionY)}
                      </span>
                      <input
                        value={showRow(t.animalCageId, i, "strain")}
                        onChange={(e) => setRow(t.animalCageId, i, "strain", e.target.value)}
                        placeholder="品系"
                        className={`${FIELD_CLS} min-w-0 flex-1`}
                      />
                      <input
                        value={showRow(t.animalCageId, i, "female")}
                        onChange={(e) => setRow(t.animalCageId, i, "female", e.target.value)}
                        inputMode="numeric"
                        placeholder="0"
                        className={`${FIELD_CLS} w-12 shrink-0 text-center`}
                      />
                      <input
                        value={showRow(t.animalCageId, i, "male")}
                        onChange={(e) => setRow(t.animalCageId, i, "male", e.target.value)}
                        inputMode="numeric"
                        placeholder="0"
                        className={`${FIELD_CLS} w-12 shrink-0 text-center`}
                      />
                    </div>
                  ))}
                </div>

                {/* 学生填 */}
                <label className="mt-3 flex items-center gap-2">
                  <span className="shrink-0 text-[11px] text-[var(--twin-ink)]">拟定转移日期</span>
                  <input
                    type="date"
                    value={showTop("transferDate")}
                    onChange={(e) => setTop("transferDate", e.target.value)}
                    className={`${FIELD_CLS} min-w-0 flex-1`}
                  />
                </label>

                {/* 自动取，缺则手填 */}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-[10px] text-[var(--twin-mute)]">申请方单位名称</span>
                    <input
                      value={showTop("unitName")}
                      onChange={(e) => setTop("unitName", e.target.value)}
                      placeholder="自动取，缺则填写"
                      className={FIELD_CLS}
                    />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-[10px] text-[var(--twin-mute)]">电话</span>
                    <input
                      value={showTop("phone")}
                      onChange={(e) => setTop("phone", e.target.value)}
                      placeholder="自动取，缺则填写"
                      className={FIELD_CLS}
                    />
                  </label>
                </div>
              </div>
            )}

            {isDivide && (
              <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-twin-lg bg-[var(--twin-canvas-soft)] px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={keepSource}
                  onChange={(e) => setKeepSource(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--twin-primary)]"
                />
                <span className="text-[11px] leading-relaxed text-[var(--twin-ink)]">
                  保留原笼位不变
                  <span className="ml-1 text-[var(--twin-mute)]">（不勾选则源笼位归档为空笼盒）</span>
                </span>
              </label>
            )}

            <input
              type="text"
              placeholder="原因（可选，会记入留痕）"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-3 mb-5 w-full rounded-twin-lg bg-[var(--twin-canvas-soft)] px-3.5 py-2.5 text-[12px] text-[var(--twin-ink)] outline-none ring-1 ring-transparent transition placeholder:text-[var(--twin-mute)] focus:bg-[var(--twin-canvas)] focus:ring-[color-mix(in_srgb,var(--twin-primary)_40%,transparent)]"
            />
              </>
            )}
          </div>

          {/* 底部 */}
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--twin-hairline)] px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-twin-md px-3.5 py-2 text-[12px] font-semibold text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas-soft-2)] hover:text-[var(--twin-ink)] disabled:opacity-50"
            >
              返回选位
            </button>
            <button
              type="button"
              onClick={isBatch ? handleBatchSubmit : handleSubmit}
              disabled={submitting || (isBatch ? batchList.length === 0 : picked.length === 0)}
              className="rounded-twin-md bg-[var(--twin-primary)] px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:brightness-95 disabled:opacity-50"
            >
              {submitting ? "提交中…" : isBatch ? `确认转移（${batchList.length}）` : isDivide ? `确认分笼（${picked.length}）` : "确认转移"}
            </button>
          </footer>
        </motion.div>
      </motion.div>
    </CageFormModalPortal>
  );
}
