import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  fetchPagePermissionLookup,
  updatePagePermission,
  type MinRole,
  type PagePermissionLookupRow,
  type PagePlatform,
} from "@/api/domains/pagePermission.api";

const ROLE_OPTIONS: MinRole[] = ["STUDENT", "STAFF", "SENIOR", "ADMIN", "SUPER_ADMIN", "PLATFORM_OWNER"];

const ROLE_LABEL: Record<MinRole, string> = {
  STUDENT: "学生",
  STAFF: "教职工",
  SENIOR: "高级职工",
  ADMIN: "管理员",
  SUPER_ADMIN: "超级管理员",
  PLATFORM_OWNER: "平台所有者",
};

export type AdminEntryPermQuickSectionProps = {
  path: string;
  entryLabel: string;
  platform?: PagePlatform;
  /** 为 false 时仅展示说明，不请求改权接口（角色收紧） */
  canConfigure: boolean;
  onOpenInSettingsPage: (path: string) => void;
  onSaved?: () => void | Promise<void>;
};

/**
 * 「入口权限（快捷）」子面板内容：元信息与改权表单（由右侧接力面板承载，无顶部分割线）。
 */
export function AdminEntryPermQuickSection({
  path,
  entryLabel,
  platform = "WEB",
  canConfigure,
  onOpenInSettingsPage,
  onSaved,
}: AdminEntryPermQuickSectionProps) {
  const [loading, setLoading] = useState(false);
  const [row, setRow] = useState<PagePermissionLookupRow | null>(null);
  const [draftMinRole, setDraftMinRole] = useState<MinRole>("STUDENT");
  const [draftEnabled, setDraftEnabled] = useState(1);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!canConfigure) return;
    setLoading(true);
    setRow(null);
    try {
      const data = await fetchPagePermissionLookup(platform, path);
      if (!data?.nodeKey) throw new Error("未找到对应权限节点");
      setRow(data);
      setDraftMinRole((data.minRole || "STUDENT") as MinRole);
      setDraftEnabled(data.enabled === 1 ? 1 : 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载权限节点失败");
    } finally {
      setLoading(false);
    }
  }, [path, platform, canConfigure]);

  useEffect(() => {
    if (!canConfigure) return;
    void load();
  }, [canConfigure, load]);

  if (!canConfigure) {
    return null;
  }

  return (
    <div className="space-y-2 text-slate-100">
      <div className="truncate text-[12px] font-medium text-slate-100" title={entryLabel}>
        {entryLabel}
      </div>
      <div className="truncate font-mono text-[10px] text-slate-400">{path}</div>

      {loading ? (
        <p className="py-2 text-center text-[11px] text-slate-400">加载节点…</p>
      ) : !row ? (
        <p className="text-[11px] text-amber-200/90">未加载到节点，请在「页面权限设置」中执行「重新扫描」。</p>
      ) : (
        <>
          <div className="rounded border border-white/5 bg-black/25 px-2 py-1.5 text-[10px] leading-relaxed text-slate-400">
            <span className="font-mono text-slate-300">
              {row.nodeType} · {row.entrySource || "-"}
            </span>
            {row.manualOverride === 1 ? <span className="ml-2 text-amber-200/80">· 已人工覆盖</span> : null}
          </div>
          <label className="block text-[11px] text-slate-300">
            展示名（库）
            <div className="mt-0.5 truncate rounded border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-slate-200">
              {(row.displayName || "").trim() || "—"}
            </div>
          </label>
          <label className="block text-[11px] text-slate-300">
            最小角色
            <select
              className="mt-0.5 w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
              value={draftMinRole}
              onChange={(e) => setDraftMinRole(e.target.value as MinRole)}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}（{r}）
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
            <input
              type="checkbox"
              className="rounded border-white/30"
              checked={draftEnabled === 1}
              onChange={(e) => setDraftEnabled(e.target.checked ? 1 : 0)}
            />
            启用该节点
          </label>
          <div className="flex flex-wrap gap-2 pt-0.5">
            <button
              type="button"
              className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              disabled={saving}
              onClick={async () => {
                try {
                  setSaving(true);
                  await updatePagePermission(row.nodeKey, { minRole: draftMinRole, enabled: draftEnabled });
                  toast.success("已保存");
                  await onSaved?.();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "保存失败");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "保存中…" : "保存"}
            </button>
            <button
              type="button"
              className="rounded border border-white/20 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/10"
              onClick={() => onOpenInSettingsPage(path)}
            >
              在权限页打开
            </button>
          </div>
        </>
      )}
    </div>
  );
}
