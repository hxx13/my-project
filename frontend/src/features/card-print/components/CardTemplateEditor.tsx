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
  align: "left", bold: null, fontSizePt: null, fontWeight: null, heightMm: null, vAlign: null,
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
const LBL = "w-16 shrink-0 text-right text-[var(--app-color-text-tertiary)]";

/** mm 值展示：整数原样，小数保留 1 位。 */
const fmtMm = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));

/** 默认字重预设：数值对应 CSS font-weight；null（未设置）按 700 加粗显示。 */
const WEIGHT_PRESETS: { label: string; value: number; b?: boolean }[] = [
  { label: "常规", value: 400 },
  { label: "中等", value: 500 },
  { label: "加粗", value: 700, b: true },
  { label: "特粗", value: 900 },
];

/** 数字输入：内部存字符串，清空=null（不写 0），失焦恢复为当前值。必填项在 onChange 里丢弃 null。 */
function NumInput({ value, onChange, step = 0.1, min, className, placeholder }: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  step?: number; min?: number; className?: string; placeholder?: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => { setText(value == null ? "" : String(value)); }, [value]);
  return <input type="number" step={step} min={min} className={className} placeholder={placeholder}
    value={text}
    onBlur={() => setText(value == null ? "" : String(value))}
    onChange={(e) => {
      const t = e.target.value;
      setText(t);
      if (t.trim() === "") { onChange(null); return; }        // 清空 = null，不写 0
      const n = Number(t);
      if (!Number.isNaN(n)) onChange(n);
    }} />;
}

export function CardTemplateEditor({ fields, templates, onSaved }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [spec, setSpec] = useState<CardSpec>(DEFAULT_SPEC);
  const [slots, setSlots] = useState<CardSlot[]>([]);
  const [isDefault, setIsDefault] = useState(false);
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
      [POSITION_FIELD]: "示例笼架#A-10",
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
  const updateSlot = (rowIdx: number, patch: Partial<CardSlot>) =>
    setSlots((arr) => arr.map((s, j) => (j !== rowIdx ? s : { ...s, ...patch })));

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
    if (!selectedId) {
      setError("请先保存模板");
      return;
    }
    setError("");
    try {
      downloadBlob(await previewCardPdf(selectedId), "card-preview.pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : "试打失败");
    }
  };

  // 必填数字项：清空（null）不写回，保留上一个有效值
  const reqNum = (apply: (n: number) => void) => (v: number | null) => {
    if (v != null) apply(v);
  };

  // 编辑器列数：表格块配置优先，否则取各行有效格数的最大值（与后端 colCount 推导一致）。
  const colCount =
    spec.table?.colCount ?? Math.max(1, ...slots.map((s) => effectiveCells(s).length));

  const addColumn = () => {
    const next = colCount + 1;
    const widths = spec.table?.colWidthsMm ?? null;
    setTableField({
      colCount: next,
      // 同步列宽数组长度 === colCount：缺的补 0（后端按均值补位），等分模式保持 null
      colWidthsMm: widths == null ? null : [...widths, 0],
    });
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
    const widths = spec.table?.colWidthsMm ?? null;
    setTableField({
      colCount: next,
      colWidthsMm: widths == null ? null : widths.slice(0, next),
    });
    setSlots((arr) =>
      arr.map((s) => ({ ...s, cells: effectiveCells(s).slice(0, next) })),
    );
  };
  const setColWidth = (i: number, v: number | null) => {
    const arr = (spec.table?.colWidthsMm ?? []).slice(0, colCount);
    while (arr.length < colCount) arr.push(0);
    arr[i] = v ?? 0;
    setTableField({ colWidthsMm: arr.every((x) => x === 0) ? null : arr });
  };
  const addRow = () =>
    setSlots((s) => [
      ...s,
      { ...EMPTY_SLOT, cells: [{ label: null, fieldKey: null, colSpan: null }] },
    ]);

  // S4：固定行高合计 vs 表格块可用高（表格块高为 null 时用内容区高 contentH，与布局引擎同口径）
  const landscape = spec.landscape === true;
  const rotate90 = spec.rotate90 === true;
  const paperWmm = landscape ? spec.pageHeightMm : spec.pageWidthMm;
  const paperHmm = landscape ? spec.pageWidthMm : spec.pageHeightMm;
  const layoutHmm = rotate90 ? paperWmm : paperHmm;
  const contentHmm = layoutHmm - 2 * spec.marginMm;
  // 与 cardPreviewLayout / 后端 CardLayoutEngine 的 tH 推导逐字一致
  const autoRowH =
    spec.lineHeightMm != null
      ? Math.min(spec.lineHeightMm, contentHmm / Math.max(1, slots.length))
      : contentHmm / Math.max(1, slots.length);
  const fixedRowTotal = slots.reduce((acc, s) => acc + (s.heightMm ?? 0), 0);
  const autoRowCount = slots.filter((s) => s.heightMm == null).length;
  const tHmm =
    spec.table?.heightMm != null
      ? Math.max(1, Math.min(spec.table.heightMm, contentHmm))
      : Math.min(contentHmm, fixedRowTotal + autoRowCount * autoRowH);
  const rowOverflow = fixedRowTotal > tHmm;
  // 未配表格高、但行高合计已超出可用高度 → 块被撑满，位置锚点看不出效果
  const rowCappedByContent =
    spec.table?.heightMm == null &&
    fixedRowTotal + autoRowCount * autoRowH > contentHmm + 0.001;

  return (
    // 封顶高度：外壳自身不约束高度，必须在这里扣掉顶栏+页边距+工具行（-51px = 工具行 38 + pt-3 12）
    <div className="flex min-h-0 flex-1 gap-4"
      style={{ maxHeight: "calc(100dvh - var(--admin-chrome-offset) - 51px)", minHeight: "460px" }}>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain pr-1">
        <AdminFormCard title="模板配置">
          <div className="space-y-4">
            <section>
              <div className="border-b border-[var(--app-color-border-default)] pb-1 text-[12px] font-semibold text-[var(--app-color-text-secondary)]">模板</div>
              <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
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
            </div>
          </div>
          {error ? <div className="mt-2 text-[13px] text-[var(--app-color-error)]">{error}</div> : null}
            </section>

            <section>
              <div className="border-b border-[var(--app-color-border-default)] pb-1 text-[12px] font-semibold text-[var(--app-color-text-secondary)]">卡牌与排版</div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <label className="flex items-center gap-1.5">
              <span className={LBL}>尺寸</span>
              <NumInput className={inputCls} value={spec.pageWidthMm}
                onChange={reqNum((n) => setSpecField("pageWidthMm", n))} />
              <span className={MUTED}>×</span>
              <NumInput className={inputCls} value={spec.pageHeightMm}
                onChange={reqNum((n) => setSpecField("pageHeightMm", n))} />
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
              <NumInput className={inputCls} value={spec.marginMm}
                onChange={reqNum((n) => setSpecField("marginMm", n))} />
              <span className={MUTED}>mm</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>字号</span>
              <NumInput className={inputCls} value={spec.defaultFontSizePt}
                onChange={reqNum((n) => setSpecField("defaultFontSizePt", n))} />
              <span className={MUTED}>pt</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>行高</span>
              <NumInput className={inputCls} step={0.5} placeholder="自动" value={spec.lineHeightMm}
                onChange={(v) => setSpecField("lineHeightMm", v)} />
              <span className={MUTED}>mm</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>边框</span>
              <NumInput className={inputCls} value={spec.borderWidthMm}
                onChange={reqNum((n) => setSpecField("borderWidthMm", n))} />
              <span className={MUTED}>mm</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>偏移 X</span>
              <NumInput className={inputCls} value={spec.offsetXMm}
                onChange={reqNum((n) => setSpecField("offsetXMm", n))} />
              <span className={MUTED}>mm</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>偏移 Y</span>
              <NumInput className={inputCls} value={spec.offsetYMm}
                onChange={reqNum((n) => setSpecField("offsetYMm", n))} />
              <span className={MUTED}>mm</span>
            </label>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[13px]">
            <span className={LBL}>默认字重</span>
            <div className="flex items-center gap-1.5">
              {WEIGHT_PRESETS.map((p) => {
                const active = (spec.defaultFontWeight ?? 700) === p.value;
                return (
                  <button key={p.value} type="button"
                    className={`rounded-twin-md border px-2 py-1 text-[12px] transition ${active ? "border-[var(--twin-link-deep)] bg-[var(--twin-link-deep)] text-white" : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-ink)] hover:bg-[var(--app-color-surface-hover)]"}`}
                    style={{ fontWeight: p.value }}
                    onClick={() => setSpecField("defaultFontWeight", p.value)}>
                    {p.b ? <span className="mr-0.5 font-extrabold">[B]</span> : null}{p.label}
                  </button>
                );
              })}
            </div>
            <NumInput className={`${inputCls} w-16`} step={100} min={100} placeholder="700"
              value={spec.defaultFontWeight}
              onChange={(v) => setSpecField("defaultFontWeight", v)} />
          </div>
          <div className="mt-1 text-[12px] text-[var(--app-color-text-tertiary)]">
            提示：纵向 70×105 / 横版 105×70
          </div>
            </section>

            <section>
              <div className="border-b border-[var(--app-color-border-default)] pb-1 text-[12px] font-semibold text-[var(--app-color-text-secondary)]">二维码</div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={spec.qr.enabled}
                onChange={(e) => setSpecField("qr", { ...spec.qr, enabled: e.target.checked })} />
              <span>启用</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>边长</span>
              <NumInput className={inputCls} value={spec.qr.sizeMm}
                onChange={reqNum((n) => setSpecField("qr", { ...spec.qr, sizeMm: n }))} />
              <span className={MUTED}>mm</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className={LBL}>间距</span>
              <NumInput className={inputCls} value={spec.qr.marginMm}
                onChange={reqNum((n) => setSpecField("qr", { ...spec.qr, marginMm: n }))} />
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
            </section>

            <section>
              <div className="border-b border-[var(--app-color-border-default)] pb-1 text-[12px] font-semibold text-[var(--app-color-text-secondary)]">内容表格</div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <label className="flex items-center gap-1.5">
              <span className={LBL}>表格块</span>
              <NumInput className={inputCls} placeholder="自动" value={spec.table?.widthMm}
                onChange={(v) => setTableField({ widthMm: v })} />
              <span className={MUTED}>×</span>
              <NumInput className={inputCls} placeholder="自动" value={spec.table?.heightMm}
                onChange={(v) => setTableField({ heightMm: v })} />
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
              <NumInput key={i} className={`${inputCls} w-16`} step={0.5}
                value={spec.table?.colWidthsMm?.[i] ?? null}
                onChange={(v) => setColWidth(i, v)} />
            ))}
          </div>

          {rowOverflow ? (
            <div className="mt-2 text-[12px] text-[var(--app-color-feedback-warning)]">
              ⚠ 固定行高合计 {fmtMm(fixedRowTotal)}mm 超出表格高度 {fmtMm(tHmm)}mm，已按比例压缩
            </div>
          ) : null}
          {rowCappedByContent ? (
            <div className="mt-2 text-[12px] text-[var(--app-color-feedback-warning)]">
              ⚠ 行高合计 {fmtMm(fixedRowTotal + autoRowCount * autoRowH)}mm 超出可用高度 {fmtMm(contentHmm)}mm，
              表格块已撑满整卡，位置锚点不再生效（调小行高或显式设表格块高度即可恢复）
            </div>
          ) : null}

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
                  <label className="flex items-center gap-1">
                    <span className="text-[12px] text-[var(--app-color-text-tertiary)]">对齐</span>
                    <select className={`${inputCls} w-20`} value={`${s.align ?? "left"}-${s.vAlign ?? "middle"}`}
                      onChange={(e) => {
                        const [h, v] = e.target.value.split("-");
                        updateSlot(j, { align: h as CardSlot["align"], vAlign: v === "middle" ? null : v });
                      }}>
                      <optgroup label="上">
                        <option value="left-top">左上</option>
                        <option value="center-top">上中</option>
                        <option value="right-top">右上</option>
                      </optgroup>
                      <optgroup label="中">
                        <option value="left-middle">左中</option>
                        <option value="center-middle">居中</option>
                        <option value="right-middle">右中</option>
                      </optgroup>
                      <optgroup label="下">
                        <option value="left-bottom">左下</option>
                        <option value="center-bottom">下中</option>
                        <option value="right-bottom">右下</option>
                      </optgroup>
                    </select>
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-[12px] text-[var(--app-color-text-tertiary)]">字重</span>
                    <NumInput className={`${inputCls} w-16`} step={100} min={100} placeholder="默认" value={s.fontWeight}
                      onChange={(v) => updateSlot(j, { fontWeight: v })} />
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-[12px] text-[var(--app-color-text-tertiary)]">行高</span>
                    <NumInput className={`${inputCls} w-16`} step={0.5} placeholder="自动" value={s.heightMm}
                      onChange={(v) => updateSlot(j, { heightMm: v })} />
                    <span className={MUTED}>mm</span>
                  </label>
                  <button type="button" className="ml-1 text-[12px] text-[var(--app-color-error)] hover:underline"
                    title="删除此行" aria-label="删除此行"
                    onClick={() => setSlots((arr) => arr.filter((_, k) => k !== j))}>删除行</button>
                </div>
              );
            })}
          </div>
          <button type="button" className={`${BTN_OUTLINE} mt-3`} onClick={addRow}>+ 添加一行</button>
            </section>
          </div>
        </AdminFormCard>
      </div>

      <div className="flex min-h-0 w-[360px] shrink-0 flex-col overflow-y-auto overscroll-y-contain">
        <div className="mb-1 text-[12px] text-[var(--app-color-text-tertiary)]">
          预览 {spec.pageWidthMm}×{spec.pageHeightMm}mm
        </div>
        <CardPreview spec={spec} slots={slots} sample={sample} />
      </div>
    </div>
  );
}
