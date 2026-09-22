import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { X, Layers } from "lucide-react";
import { updateCageInfoValuesBatch, type CageClaimInfoValue } from "../api/cageForm.api";
import { CageFieldEditor, canEditField } from "./CageFieldEditor";
import { useCageFormAssets } from "./useCageFormAssets";
import { CageFormModalPortal } from "./CageFormModalPortal";

/**
 * 批量编辑：把同一组字段值一次性覆盖到所有选中的笼位。
 *
 * 字段控件、候选来源、开关判定全部走 {@link CageFieldEditor} / {@link useCageFormAssets}，
 * 与单笼位详情表单是同一套 —— 这里只多一层「哪些字段要改」的勾选，不做第二份表单。
 *
 * 候选列表只能取**其中一个**选中笼位当样本（候选按笼位现算，如品系取该笼位 AUP 白名单）：
 * ponytail: 用第一个笼位的候选列表代表整批；哪天要按笼位分别出候选，再把 optionsFor 改成按笼位取。
 */
export default function CageBatchEditDialog({
  open,
  cageIds,
  onClose,
  onDone,
}: {
  open: boolean;
  /** 本次要覆盖的笼位 id（网格上选中的那些） */
  cageIds: string[];
  onClose: () => void;
  onDone?: () => void;
}) {
  const sample = cageIds[0] ?? null;
  const { template, loading, fields, optionsFor, dynFlags } = useCageFormAssets(sample);

  /** 勾中的字段 → 要写入的值 */
  const [picked, setPicked] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setPicked({});
  }, [open, cageIds.join(",")]);

  /** 只有字段本身允许人工修改，才谈得上批量覆盖 */
  const editableFields = useMemo(() => fields.filter(({ field }) => canEditField(field)), [fields]);
  const pickedCount = Object.keys(picked).length;

  const toggle = (canonical: string, on: boolean, seed: unknown) =>
    setPicked((p) => {
      if (!on) {
        const next = { ...p };
        delete next[canonical];
        return next;
      }
      return { ...p, [canonical]: seed };
    });

  if (!open) return null;

  const handleSubmit = async () => {
    if (pickedCount === 0) {
      toast("请先勾选要修改的字段");
      return;
    }
    const payload: CageClaimInfoValue[] = editableFields
      .filter(({ field }) => field.canonical in picked)
      .map(({ field }) => {
        const raw = picked[field.canonical];
        return {
          fieldId: field.fieldId,
          value: Array.isArray(raw)
            ? raw.map(String)
            : typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean"
              ? raw
              : null,
        };
      });
    if (payload.length === 0) {
      toast("请先勾选要修改的字段");
      return;
    }
    setSubmitting(true);
    try {
      const r = await updateCageInfoValuesBatch(cageIds, payload);
      if (r.failed.length === 0) {
        toast.success(`已覆盖 ${r.updatedCount} 个笼位`);
      } else {
        // 逐条回报：被拦的笼位不该把整批回滚，用户要知道是哪些
        toast.error(
          `成功 ${r.updatedCount} 个，${r.failed.length} 个未更新（首个原因：${r.failed[0]?.reason ?? "无权限"}）`,
          { duration: 6000 },
        );
      }
      onDone?.();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "批量保存失败");
    } finally {
      setSubmitting(false);
    }
  };

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
          className="flex max-h-[86vh] w-[92vw] max-w-[620px] flex-col overflow-hidden rounded-twin-xl bg-[var(--twin-canvas)] shadow-[0_24px_70px_-12px_rgba(15,23,42,0.35)] ring-1 ring-black/5"
        >
          <header className="flex shrink-0 items-start gap-3 px-5 pb-4 pt-5">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-twin-lg bg-[var(--twin-primary-soft,#eef2ff)] text-[var(--twin-primary)]">
              <Layers className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold leading-tight text-[var(--twin-ink)]">批量编辑笼位表单</h3>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--twin-mute)]">
                勾选要改的字段并填写，提交后统一覆盖选中的 <b>{cageIds.length}</b> 个笼位；未勾选的字段原样不动
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

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
            {loading ? (
              <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">加载中…</div>
            ) : !template || template.status !== "FROZEN" ? (
              <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">表单未发布</div>
            ) : editableFields.length === 0 ? (
              <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">该表单没有可人工修改的字段</div>
            ) : (
              <div className="space-y-2">
                {editableFields.map(({ field }) => {
                  const on = field.canonical in picked;
                  return (
                    <div
                      key={field.fieldId}
                      className={`rounded-twin-md border px-3 py-2 transition ${
                        on ? "border-[var(--twin-primary)] bg-[var(--twin-canvas)]" : "border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]"
                      }`}
                    >
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => {
                            const ft = field.fieldType || (field.dictKey ? "select" : "text");
                            const seed =
                              ft === "checkbox" ? true : field.config && /"choiceType"\s*:\s*"multiple"/.test(field.config) ? [] : "";
                            toggle(field.canonical, e.target.checked, seed);
                          }}
                          className="h-3.5 w-3.5 accent-[var(--twin-primary)]"
                        />
                        <span className="text-[11px] font-semibold text-[var(--twin-ink)]">{field.label || field.canonical}</span>
                        {!on && <span className="text-[10px] text-[var(--twin-mute)]">不动</span>}
                      </label>
                      {on && (
                        <div className="mt-1.5">
                          <CageFieldEditor
                            field={field}
                            value={picked[field.canonical]}
                            options={optionsFor(field)}
                            canAddOption={!!dynFlags[field.canonical]?.allowAddOption}
                            onChange={(v) => setPicked((p) => ({ ...p, [field.canonical]: v }))}
                            onAddOption={(name) => {
                              // 新增候选的落点是「字段级码表」（与 AUP 无关），但授权是按笼位判的
                              //（后端要一个 animalCageId 才判得了「你能不能改这个笼位」）。
                              // 批量这里没有唯一笼位，交回单笼位详情表单去做。
                              toast.error(`请到单个笼位的详情表单里新增候选：${name}`);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--twin-hairline)] px-5 py-4">
            <span className="mr-auto text-[10px] text-[var(--twin-mute)]">
              {pickedCount > 0 ? `已选 ${pickedCount} 个字段` : "勾选要修改的字段"}
            </span>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-twin-md px-3.5 py-2 text-[12px] font-semibold text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas-soft-2)] hover:text-[var(--twin-ink)] disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || pickedCount === 0}
              className="rounded-twin-md bg-[var(--twin-primary)] px-3.5 py-2 text-[12px] font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
            >
              {submitting ? "提交中…" : `覆盖到 ${cageIds.length} 个笼位`}
            </button>
          </footer>
        </motion.div>
      </motion.div>
    </CageFormModalPortal>
  );
}
