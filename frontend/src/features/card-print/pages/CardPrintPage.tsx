import { useCallback, useEffect, useRef, useState } from "react";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { fetchCardFields, fetchCardTemplates } from "@/api/domains/cardPrint.api";
import type { CardFieldOption, CardTemplate } from "../types";
import { CardTemplateEditor } from "../components/CardTemplateEditor";
import { CardPrintPanel, type CardPrintPanelHandle } from "../components/CardPrintPanel";
import { CardArchivePanel } from "../components/CardArchivePanel";
import { CardValueMapPanel } from "../components/CardValueMapPanel";

type Tab = "print" | "template" | "archive" | "valuemap";

const BTN_PRIMARY =
  "rounded-twin-md bg-[var(--twin-link-deep)] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50";
const BTN_OUTLINE =
  "rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-[12px] text-[var(--twin-ink)] transition hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50";
const inputCls =
  "rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 text-[13px] text-[var(--app-color-text-primary)]";

export default function CardPrintPage() {
  const [tab, setTab] = useState<Tab>("print");
  const [fields, setFields] = useState<CardFieldOption[]>([]);
  const [templates, setTemplates] = useState<CardTemplate[]>([]);
  const [loadError, setLoadError] = useState("");
  const [templateId, setTemplateId] = useState<number | null>(null);

  const [boxSelectMode, setBoxSelectMode] = useState(false);
  const [nameSuffix, setNameSuffix] = useState("");
  const [selectedCount, setSelectedCount] = useState(0);
  const [selectedTotal, setSelectedTotal] = useState(0);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const panelRef = useRef<CardPrintPanelHandle>(null);

  const reload = useCallback(async () => {
    try {
      const [f, t] = await Promise.all([fetchCardFields(), fetchCardTemplates()]);
      setFields(f);
      setTemplates(t);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "加载模板与字段失败");
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const handleSelectionChange = useCallback((selected: number, total: number) => {
    setSelectedCount(selected);
    setSelectedTotal(total);
  }, []);

  const handleMessage = useCallback((m: string) => setMsg(m), []);

  const tabs: [Tab, string][] = [["print", "打印"], ["template", "模板"], ["archive", "归档"], ["valuemap", "字段映射"]];

  return (
    <AdminPageShell fillHeight>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--twin-hairline)] pb-2">
        <div className="flex items-center gap-0.5 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-0.5">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${tab === k ? "bg-[var(--twin-link-deep)] text-white shadow-sm" : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
              {label}
            </button>
          ))}
        </div>
        {tab === "print" ? (
          <>
            <div className="ml-2 flex items-center gap-1.5">
              <span className="text-[12px] text-[var(--app-color-text-tertiary)]">模板</span>
              <select
                className="rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 text-[12px] text-[var(--app-color-text-primary)]"
                value={templateId ?? ""}
                onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— 选择模板 —</option>
                {templates.map((t) => <option key={t.id} value={t.id!}>{t.name}</option>)}
              </select>
            </div>
            <button type="button" className={boxSelectMode ? BTN_PRIMARY : BTN_OUTLINE}
              onClick={() => setBoxSelectMode((v) => !v)}>
              ⬜ 矩形框选
            </button>
            <span className="text-[11px] text-[var(--app-color-text-tertiary)] select-none">
              {boxSelectMode ? "请点击第一个笼位设置框选起点，再点击对角笼位完成框选" : "🖱️ 点击选中 · Shift+点击 矩形多选"}
            </span>
            <span className="text-[12px] text-[var(--app-color-text-tertiary)]">已选 {selectedCount} / {selectedTotal}</span>
            <input value={nameSuffix} onChange={(e) => setNameSuffix(e.target.value)}
              placeholder="文件名备注（可选）" className={inputCls + " w-44"} />
            <button type="button" className={BTN_PRIMARY} disabled={busy}
              onClick={() => void panelRef.current?.generate()}>生成 PDF</button>
            {msg ? <span className="min-w-0 truncate text-[12px] text-[var(--app-color-text-secondary)]">{msg}</span> : null}
          </>
        ) : null}
      </div>
      {loadError ? (
        <div className="mt-2 flex shrink-0 items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--app-color-feedback-error)_40%,transparent)] bg-[var(--app-color-feedback-danger-soft)] px-3 py-1.5 text-[12px] text-[var(--app-color-feedback-error)]">
          <span className="min-w-0 truncate">加载失败：{loadError}</span>
          <button type="button" onClick={() => void reload()}
            className="shrink-0 rounded border border-current px-2 py-0.5">重试</button>
        </div>
      ) : null}
      {/* 必须是 flex 列，子面板的 flex-1 才有确定高度可用（块级父容器会让 flex-1 失效） */}
      <div className="flex min-h-0 flex-1 flex-col pt-3">
        {tab === "template" ? <CardTemplateEditor fields={fields} templates={templates} onSaved={reload} /> : null}
        {tab === "print" ? (
          <CardPrintPanel
            ref={panelRef}
            templates={templates}
            templateId={templateId}
            onTemplateChange={setTemplateId}
            boxSelectMode={boxSelectMode}
            onBoxSelectModeChange={setBoxSelectMode}
            nameSuffix={nameSuffix}
            onSelectionChange={handleSelectionChange}
            onMessage={handleMessage}
            onBusyChange={setBusy}
          />
        ) : null}
        {tab === "archive" ? <CardArchivePanel /> : null}
        {tab === "valuemap" ? <CardValueMapPanel /> : null}
      </div>
    </AdminPageShell>
  );
}
