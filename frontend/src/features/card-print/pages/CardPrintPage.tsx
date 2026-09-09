import { useCallback, useEffect, useState } from "react";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { fetchCardFields, fetchCardTemplates } from "@/api/domains/cardPrint.api";
import type { CardFieldOption, CardTemplate } from "../types";
import { CardTemplateEditor } from "../components/CardTemplateEditor";
import { CardPrintPanel } from "../components/CardPrintPanel";
import { CardArchivePanel } from "../components/CardArchivePanel";

type Tab = "print" | "template" | "archive";

export default function CardPrintPage() {
  const [tab, setTab] = useState<Tab>("print");
  const [fields, setFields] = useState<CardFieldOption[]>([]);
  const [templates, setTemplates] = useState<CardTemplate[]>([]);
  const [loadError, setLoadError] = useState("");
  const [templateId, setTemplateId] = useState<number | null>(null);

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

  const tabs: [Tab, string][] = [["print", "打印"], ["template", "模板"], ["archive", "归档"]];

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
      </div>
      {loadError ? (
        <div className="mt-2 flex shrink-0 items-center gap-2 rounded-md border border-[var(--app-color-feedback-error)]/40 bg-[var(--app-color-feedback-danger-soft)] px-3 py-1.5 text-[12px] text-[var(--app-color-feedback-error)]">
          <span className="min-w-0 truncate">加载失败：{loadError}</span>
          <button type="button" onClick={() => void reload()}
            className="shrink-0 rounded border border-current px-2 py-0.5">重试</button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 pt-3">
        {tab === "template" ? <CardTemplateEditor fields={fields} templates={templates} onSaved={reload} /> : null}
        {tab === "print" ? <CardPrintPanel templates={templates} templateId={templateId} onTemplateChange={setTemplateId} /> : null}
        {tab === "archive" ? <CardArchivePanel /> : null}
      </div>
    </AdminPageShell>
  );
}
