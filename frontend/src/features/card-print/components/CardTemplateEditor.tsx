import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { downloadBlob, previewCardPdf, saveCardTemplate } from "@/api/domains/cardPrint.api";
import { effectiveCells, type CardCell, type CardFieldOption, type CardSlot, type CardSpec, type CardTemplate, type QrAnchor } from "../types";
import { DEFAULT_SPEC, POSITION_FIELD, QR_FIELD } from "../types";
import { CardPreview } from "./CardPreview";

interface Props {
  fields: CardFieldOption[];
  templates: CardTemplate[];
  onSaved: () => void;
}

const EMPTY_SLOT: CardSlot = {
  cells: null, label: "", fieldKey: null, rightLabel: null, rightFieldKey: null,
  align: "left", bold: null, fontSizePt: null,
};

const EMPTY_TABLE: NonNullable<CardSpec["table"]> = {
  widthMm: null, heightMm: null, anchor: null, colCount: null, colWidthsMm: null,
};

const inputCls =
  "rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface)] px-2 py-1 text-[13px] text-[var(--app-color-text-primary)]";

const BTN_PRIMARY =
  "rounded-twin-md bg-[var(--twin-link-deep)] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50";
const BTN_OUTLINE =
  "rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-[12px] text-[var(--twin-ink)] transition hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50";

const MUTED = "text-[var(--app-color-text-tertiary)]";
const LBL = "w-20 shrink-0 text-[var(--app-color-text-tertiary)]";

export function CardTemplateEditor({ fields, templates, onSaved }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [spec, setSpec] = useState<CardSpec>(DEFAULT_SPEC);
  const [slots, setSlots] = useState<CardSlot[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [previewCageId, setPreviewCageId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 只在「用户显式切换模板」时回填；templates 列表刷新不得覆盖未保存的草稿
  const loadedIdRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (loadedIdRef.current === selectedId) return;
    loadedIdRef.current = selectedId;

    if (selectedId === null) {
      setName("");
      setSpec(DEFAULT_SPEC);
      setSlots([]);
      setIsDefault(false);
      return;
    }
    const t = templates.find((x) => x.id === selectedId);
    if (!t) return; // 刚保存完、列表还没刷新到新 id：保持本地草稿不动
    setName(t.name);
    setIsDefault(Boolean(t.isDefault));
    try {
      setSpec({ ...DEFAULT_SPEC, ...(JSON.parse(t.specJson) as CardSpec) });
      setSlots(
        (JSON.parse(t.slotsJson) as CardSlot[]).map((s) => ({ ...s, cells: effectiveCells(s) })),
      );
    } catch {
      setSpec(DEFAULT_SPEC);
      setSlots([]);
    }
  }, [selectedId, templates]);

  // 预览示例值：表单字段用 label 占位，特殊字段用固定假值
  const sample = useMemo(() => {
    const out: Record<string, string> = {
      [QR_FIELD]: "1234567890123456789",
      [POSITION_FIELD]: "605A A架 3-5",
    };
    for (const f of fields) if (f.source === "FORM") out[f.key] = f.label;
    return out;
  }, [fields]);

  const setSpecField = <K extends keyof CardSpec>(k: K, v: CardSpec[K]) =>
    setSpec((s) => ({ ...s, [k]: v }));
  const setTableField = (patch: Partial<NonNullable<CardSpec["table"]>>) =>
    setSpecField("table", { ...(spec.table ?? EMPTY_TABLE), ...patch });
  const updateCell = (rowIdx: number, colIdx: number, patch: Partial<CardCell>) =>
    setSlots((arr) =>
      arr.map((s, j) => {
        if (j !== rowIdx) return s;
        const cells = (s.cells ?? []).map((c) => ({ label: c.label, fieldKey: c.fieldKey, colSpan: c.colSpan ?? null }));
        while (cells.length <= colIdx) cells.push({ label: null, fieldKey: null, colSpan: null });
        cells[colIdx] = { ...cells[colIdx], ...patch };
        return { ...s, cells };
      }),
    );
  const removeCell = (rowIdx: number, colIdx: number) =>
    setSlots((arr) =>
      arr.map((s, j) => (j !== rowIdx ? s : { ...s, cells: effectiveCells(s).filter((_, k) => k !== colIdx) })),
    );
  const addCell = (rowIdx: number) =>
    setSlots((arr) =>
      arr.map((s, j) => {
        if (j !== rowIdx) return s;
        const cells = [...effectiveCells(s)];
        if (cells.length >= colCount) return s;
        cells.push({ label: null, fieldKey: null, colSpan: null });
        return { ...s, cells };
      }),
    );

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const saved = await saveCardTemplate({
        id: selectedId ?? undefined,
        name,
        specJson: JSON.stringify(spec),
        slotsJson: JSON.stringify(slots),
        isDefault,
        enabled: true,
      });
      if (saved?.id) setSelectedId(saved.id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    if (!selectedId || !previewCageId) {
      setError("请先保存模板并填写一个笼位ID");
      return;
    }
    setError("");
    try {
      downloadBlob(await previewCardPdf(selectedId, previewCageId), "card-preview.pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : "试打失败");
    }
  };

  const num = (v: string) => (v === "" ? 0 : Number(v));

  // 编辑器列数：表格块配置优先，否则取各行有效格数的最大值（与后端 colCount 推导一致）。
  const colCount =
    spec.table?.colCount ?? Math.max(1, ...slots.map((s) => effectiveCells(s).length));

  const addColumn = () => {
    const next = colCount + 1;
    setTableField({ colCount: next });
    setSlots((arr) =>
      arr.map((s) => {
        const cells = [...effectiveCells(s)];
        while (cells.length < next) cells.push({ label: null, fieldKey: null, colSpan: null });
        return { ...s, cells };
      }),
    );
  };
  const removeColumn = () => {
    const next = Math.max(1, colCount - 1);
    setTableField({ colCount: next });
    setSlots((arr) =>
      arr.map((s) => ({ ...s, cells: effectiveCells(s).slice(0, next) })),
    );
  };
  const setColWidth = (i: number, raw: string) => {
    const arr = (spec.table?.colWidthsMm ?? []).slice(0, colCount);
    while (arr.length < colCount) arr.push(0);
    arr[i] = raw === "" ? 0 : Number(raw);
    setTableField({ colWidthsMm: arr.every((v) => v === 0) ? null : arr });
  };
  const addRow = () =>
    setSlots((s) => [
      ...s,
      { ...EMPTY_SLOT, cells: [{ label: null, fieldKey: null, colSpan: null }] },
    ]);

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain">
        <AdminFormCard title="模板">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <select className={inputCls} value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— 新建模板 —</option>
                {templates.map((t) => <option key={t.id} value={t.id!}>{t.name}</option>)}
              </select>
              <input className={inputCls} placeholder="模板名" value={name} onChange={(e) => setName(e.target.value)} />
              <label className="flex items-center gap-1 text-[13px]">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> 设为默认
              </label>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={save}>保存</button>
                <button type="button" className={BTN_OUTLINE} onClick={preview}>试打单张</button>
              </div>
              <input className={inputCls} placeholder="笼位ID（试打用）" value={previewCageId}
                onChange={(e) => setPreviewCageId(e.target.value)} />
            </div>
          </div>
          {error ? <div className="mt-2 text-[13px] text-[var(--app-color-error)]">{error}</div> : null}
        </AdminFormCard>

        <AdminFormCard title="卡牌与排版">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
            <label className="flex items-center gap-1.5">
              <span className={LBL}>尺寸</span>
              <input className={inputCls} type="number" step="0.1" value={spec.pageWidthMm}
                onChange={(e) => setSpecField("pageWidthMm", num(e.target.value))} />
              <span className={MUTED}>×</span>
              <input className={inputCls} type="number" step="0.1" value={spec.pageHeightMm}
                onChange={(e) => setSpecField("pageHeightMm", num(e.target.value))} />
              <span className={MUTED}>mm</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>方向</span>
              <select className={inputCls} value={spec.landscape ? "landscape" : "portrait"}
                onChange={(e) => setSpecField("landscape", e.target.value === "landscape")}>
                <option value="portrait">纵向</option>
                <option value="landscape">横版</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>旋转</span>
              <select className={inputCls} value={spec.rotate90 ? "90" : "0"}
                onChange={(e) => setSpecField("rotate90", e.target.value === "90")}>
                <option value="0">0°</option>
                <option value="90">90°</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>边距</span>
              <input className={inputCls} type="number" step="0.1" value={spec.marginMm}
                onChange={(e) => setSpecField("marginMm", num(e.target.value))} />
              <span className={MUTED}>mm</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>字号</span>
              <input className={inputCls} type="number" step="0.1" value={spec.defaultFontSizePt}
                onChange={(e) => setSpecField("defaultFontSizePt", num(e.target.value))} />
              <span className={MUTED}>pt</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>行高</span>
              <input className={inputCls} type="number" step="0.5" placeholder="自动" value={spec.lineHeightMm ?? ""}
                onChange={(e) => setSpecField("lineHeightMm", e.target.value === "" ? null : Number(e.target.value))} />
              <span className={MUTED}>mm</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>边框</span>
              <input className={inputCls} type="number" step="0.1" value={spec.borderWidthMm}
                onChange={(e) => setSpecField("borderWidthMm", num(e.target.value))} />
              <span className={MUTED}>mm</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>偏移 X</span>
              <input className={inputCls} type="number" step="0.1" value={spec.offsetXMm}
                onChange={(e) => setSpecField("offsetXMm", num(e.target.value))} />
              <span className={MUTED}>mm</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>偏移 Y</span>
              <input className={inputCls} type="number" step="0.1" value={spec.offsetYMm}
                onChange={(e) => setSpecField("offsetYMm", num(e.target.value))} />
              <span className={MUTED}>mm</span>
            </label>
          </div>
          <div className="mt-1 text-[12px] text-[var(--app-color-text-tertiary)]">
            提示：纵向 70×105 / 横版 105×70
          </div>
        </AdminFormCard>

        <AdminFormCard title="二维码">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={spec.qr.enabled}
                onChange={(e) => setSpecField("qr", { ...spec.qr, enabled: e.target.checked })} />
              <span>启用</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>边长</span>
              <input className={inputCls} type="number" value={spec.qr.sizeMm}
                onChange={(e) => setSpecField("qr", { ...spec.qr, sizeMm: num(e.target.value) })} />
              <span className={MUTED}>mm</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>间距</span>
              <input className={inputCls} type="number" value={spec.qr.marginMm}
                onChange={(e) => setSpecField("qr", { ...spec.qr, marginMm: num(e.target.value) })} />
              <span className={MUTED}>mm</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>位置</span>
              <select className={inputCls} value={spec.qr.anchor}
                onChange={(e) => setSpecField("qr", { ...spec.qr, anchor: e.target.value as CardSpec["qr"]["anchor"] })}>
                <optgroup label="上">
                  <option value="top-left">左上</option>
                  <option value="top-center">上中</option>
                  <option value="top-right">右上</option>
                </optgroup>
                <optgroup label="中">
                  <option value="middle-left">左中</option>
                  <option value="middle-center">居中</option>
                  <option value="middle-right">右中</option>
                </optgroup>
                <optgroup label="下">
                  <option value="bottom-left">左下</option>
                  <option value="bottom-center">下中</option>
                  <option value="bottom-right">右下</option>
                </optgroup>
              </select>
            </label>
          </div>
        </AdminFormCard>

        <AdminFormCard title="内容表格">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
            <label className="flex items-center gap-1.5">
              <span className={LBL}>表格块</span>
              <input className={inputCls} type="number" step="0.1" placeholder="自动" value={spec.table?.widthMm ?? ""}
                onChange={(e) => setTableField({ widthMm: e.target.value === "" ? null : Number(e.target.value) })} />
              <span className={MUTED}>×</span>
              <input className={inputCls} type="number" step="0.1" placeholder="自动" value={spec.table?.heightMm ?? ""}
                onChange={(e) => setTableField({ heightMm: e.target.value === "" ? null : Number(e.target.value) })} />
              <span className={MUTED}>mm</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>位置</span>
              <select className={inputCls} value={spec.table?.anchor ?? ""}
                onChange={(e) => setTableField({ anchor: e.target.value === "" ? null : e.target.value as QrAnchor })}>
                <option value="">自动</option>
                <optgroup label="上">
                  <option value="top-left">左上</option>
                  <option value="top-center">上中</option>
                  <option value="top-right">右上</option>
                </optgroup>
                <optgroup label="中">
                  <option value="middle-left">左中</option>
                  <option value="middle-center">居中</option>
                  <option value="middle-right">右中</option>
                </optgroup>
                <optgroup label="下">
                  <option value="bottom-left">左下</option>
                  <option value="bottom-center">下中</option>
                  <option value="bottom-right">右下</option>
                </optgroup>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
            <span className={LBL}>网格列数</span>
            <div className="flex items-center gap-1.5">
              <button type="button" className={BTN_OUTLINE} disabled={colCount <= 1} aria-label="减列" title="减列" onClick={removeColumn}>− 减列</button>
              <span className="min-w-6 text-center tabular-nums">{colCount}</span>
              <button type="button" className={BTN_OUTLINE} aria-label="加列" title="加列" onClick={addColumn}>+ 加列</button>
            </div>
            <span className="text-[var(--app-color-text-tertiary)]">列宽 mm（留空=等分）</span>
            {Array.from({ length: colCount }, (_, i) => (
              <input key={i} className={`${inputCls} w-16`} type="number" step="0.5"
                value={spec.table?.colWidthsMm?.[i] || ""}
                onChange={(e) => setColWidth(i, e.target.value)} />
            ))}
          </div>

          <div className="my-3 border-t border-[var(--app-color-border-default)]" />

          <div className="space-y-2">
            {slots.map((s, j) => {
              const cells = effectiveCells(s);
              return (
                <div key={j} className="flex flex-wrap items-center gap-2">
                  <span className="w-5 shrink-0 text-center text-[12px] text-[var(--app-color-text-tertiary)]">
                    {j < 20 ? String.fromCodePoint(0x2460 + j) : j + 1}
                  </span>
                  {cells.map((cell, i) => (
                    <Fragment key={i}>
                      {i > 0 ? <span className="text-[var(--app-color-border-default)]">│</span> : null}
                      <div className="flex items-center gap-1">
                        <input className={inputCls} placeholder="标签" value={cell.label ?? ""}
                          onChange={(e) => updateCell(j, i, { label: e.target.value })} />
                        <select className={inputCls} value={cell.fieldKey ?? ""}
                          onChange={(e) => updateCell(j, i, { fieldKey: e.target.value || null })}>
                          <option value="">— 字段 —</option>
                          {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                        <select className={`${inputCls} w-16`} title="跨列数" value={cell.colSpan ?? ""}
                          onChange={(e) => updateCell(j, i, { colSpan: e.target.value === "" ? null : Number(e.target.value) })}>
                          <option value="">1列</option>
                          {Array.from({ length: Math.max(0, colCount - 1) }, (_, k) => (
                            <option key={k + 2} value={k + 2}>{k + 2}列</option>
                          ))}
                        </select>
                        <button type="button" className="px-1 text-[13px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-error)]"
                          title="删除格子" aria-label="删除格子" onClick={() => removeCell(j, i)}>✕</button>
                      </div>
                    </Fragment>
                  ))}
                  <button type="button" className={BTN_OUTLINE} title={cells.length >= colCount ? "已达网格列数上限" : "加一格"} aria-label="加一格"
                    disabled={cells.length >= colCount} onClick={() => addCell(j)}>+ 加一格</button>
                  <button type="button" className="ml-1 text-[12px] text-[var(--app-color-error)] hover:underline"
                    title="删除此行" aria-label="删除此行"
                    onClick={() => setSlots((arr) => arr.filter((_, k) => k !== j))}>删除行</button>
                </div>
              );
            })}
          </div>
          <button type="button" className={`${BTN_OUTLINE} mt-3`} onClick={addRow}>+ 添加一行</button>
        </AdminFormCard>
      </div>

      <div className="min-h-0 shrink-0 overflow-y-auto overscroll-y-contain">
        <div className="mb-1 text-[12px] text-[var(--app-color-text-tertiary)]">
          预览 {spec.pageWidthMm}×{spec.pageHeightMm}mm
        </div>
        <CardPreview spec={spec} slots={slots} sample={sample} />
      </div>
    </div>
  );
}
