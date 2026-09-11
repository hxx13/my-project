import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminTableShell } from "@/components/admin/AdminPageShell";
import {
  deleteCardValueMap,
  fetchCardFields,
  fetchCardValueMaps,
  saveCardValueMap,
  type CardValueMap,
} from "@/api/domains/cardPrint.api";
import { POSITION_FIELD, QR_FIELD, type CardFieldOption } from "../types";

const BTN_PRIMARY =
  "rounded-twin-md bg-[var(--twin-link-deep)] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50";
const BTN_OUTLINE =
  "rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-[12px] text-[var(--twin-ink)] transition hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50";

const inputCls =
  "rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface)] px-2 py-1 text-[13px] text-[var(--app-color-text-primary)]";

/** 可编辑行：id 为 0 表示尚未保存的本地草稿。 */
interface DraftRow {
  id: number;
  canonical: string;
  rawValue: string;
  shortValue: string;
}

export function CardValueMapPanel() {
  const [fields, setFields] = useState<CardFieldOption[]>([]);
  const [rows, setRows] = useState<CardValueMap[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fieldOptions = useMemo(
    () => fields.filter((f) => f.key !== QR_FIELD && f.key !== POSITION_FIELD),
    [fields],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, maps] = await Promise.all([fetchCardFields(), fetchCardValueMaps()]);
      setFields(f);
      setRows(maps);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载字段映射失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const addRow = () =>
    setDrafts((d) => [...d, { id: 0, canonical: "", rawValue: "", shortValue: "" }]);

  const patchDraft = (idx: number, patch: Partial<DraftRow>) =>
    setDrafts((d) => d.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const patchSaved = (idx: number, patch: Partial<CardValueMap>) =>
    setRows((r) => r.map((v, i) => (i === idx ? { ...v, ...patch } : v)));

  const save = async (row: DraftRow, kind: string) => {
    if (!row.canonical.trim() || !row.rawValue.trim()) {
      setError("请填写字段与原值");
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      await saveCardValueMap({
        ...(row.id ? { id: row.id } : {}),
        canonical: row.canonical.trim(),
        rawValue: row.rawValue,
        shortValue: row.shortValue,
      });
      setDrafts((d) => d.filter((r) => r !== row));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(null);
    }
  };

  const removeSaved = async (row: CardValueMap) => {
    if (!window.confirm("删除该字段映射？")) return;
    try {
      await deleteCardValueMap(row.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };
  const removeDraft = (idx: number) => setDrafts((d) => d.filter((_, i) => i !== idx));

  const fieldSelect = (value: string, onChange: (v: string) => void) => (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— 字段 —</option>
      {fieldOptions.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
    </select>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 shrink-0 text-[12px] text-[var(--app-color-text-tertiary)]">
        渲染卡牌时，命中的原值会替换为简称；未配置的按原样输出。
      </div>
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <button type="button" className={BTN_OUTLINE} onClick={addRow}>+ 添加一行</button>
      </div>
      <AdminTableShell loading={loading} error={error} onRetry={load}
        empty={rows.length === 0 && drafts.length === 0}
        emptyMessage="还没有配置任何字段映射" scrollable>
        <table className="twin-table w-full text-[13px]">
          <thead>
            <tr>
              <th>字段</th><th>原值</th><th>简称</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((r, i) => (
              <tr key={`draft-${i}`}>
                <td>{fieldSelect(r.canonical, (v) => patchDraft(i, { canonical: v }))}</td>
                <td><input className={inputCls} placeholder="原值" value={r.rawValue}
                  onChange={(e) => patchDraft(i, { rawValue: e.target.value })} /></td>
                <td><input className={inputCls} placeholder="简称" value={r.shortValue}
                  onChange={(e) => patchDraft(i, { shortValue: e.target.value })} /></td>
                <td>
                  <div className="flex gap-2">
                    <button type="button" className={BTN_PRIMARY} disabled={busy === `draft-${i}`}
                      onClick={() => save(r, `draft-${i}`)}>保存</button>
                    <button type="button" className={BTN_OUTLINE} onClick={() => removeDraft(i)}>移除</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td>{fieldSelect(r.canonical, (v) => patchSaved(i, { canonical: v }))}</td>
                <td><input className={inputCls} placeholder="原值" value={r.rawValue}
                  onChange={(e) => patchSaved(i, { rawValue: e.target.value })} /></td>
                <td><input className={inputCls} placeholder="简称" value={r.shortValue}
                  onChange={(e) => patchSaved(i, { shortValue: e.target.value })} /></td>
                <td>
                  <div className="flex gap-2">
                    <button type="button" className={BTN_PRIMARY} disabled={busy === `saved-${r.id}`}
                      onClick={() => save(r, `saved-${r.id}`)}>保存</button>
                    <button type="button" className={BTN_OUTLINE} onClick={() => removeSaved(r)}>删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>
    </div>
  );
}
