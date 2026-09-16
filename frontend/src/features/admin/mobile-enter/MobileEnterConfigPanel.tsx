import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { PersonnelPicker } from "@/components/admin/PersonnelPicker";
import { AdminSegmentedControl } from "@/components/admin/AdminSegmentedControl";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import {
  fetchMobileEnterGrants,
  fetchMobileEnterSettings,
  removeMobileEnterGrants,
  updateMobileEnterGrants,
  updateMobileEnterMaster,
  type MobileEnterGrantRow,
} from "@/api/domains/mobileEnter.api";
import toast from "react-hot-toast";

type ListKey = "WHITE" | "BLACK";

/**
 * 移动端「房间详情 → 进入」灰度管理。
 *
 * 生效优先级：黑名单 > 白名单 > 一键开关。两个名单都是「一键」的例外，不受它控制。
 * 入参 id 两种形态（学生 = aro_personnel.user_id，教职工 = sys_user.id / STAFF_xxx）直接透传，
 * 归一化在服务端做 —— 因此同一个人无论从哪个 id 加进去，禁用的都是他本人。
 */
export function MobileEnterConfigPanel({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const [masterEnabled, setMasterEnabled] = useState(false);
  const [masterSaving, setMasterSaving] = useState(false);
  const [listKey, setListKey] = useState<ListKey>("WHITE");
  const [keyword, setKeyword] = useState("");
  const [kwDraft, setKwDraft] = useState("");
  const [rows, setRows] = useState<MobileEnterGrantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const loadSettings = useCallback(async () => {
    try {
      const s = await fetchMobileEnterSettings();
      setMasterEnabled(s.masterEnabled);
      onCountChange?.(s.whitelistCount + s.blacklistCount);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载开关失败");
    }
  }, [onCountChange]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMobileEnterGrants(listKey === "WHITE", keyword.trim() || undefined);
      setRows(data);
      setSelected([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载名单失败");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [listKey, keyword]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const saveMaster = async (checked: boolean) => {
    setMasterSaving(true);
    try {
      await updateMobileEnterMaster(checked);
      setMasterEnabled(checked);
      toast.success(checked ? "已一键开启（名单外的人可见）" : "已一键关闭（仅白名单可见）");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setMasterSaving(false);
    }
  };

  /** 加入当前名单：白名单=始终开启，黑名单=始终关闭 */
  const addToCurrentList = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const n = await updateMobileEnterGrants(ids, listKey === "WHITE");
      toast.success(`已加入${listKey === "WHITE" ? "白名单" : "黑名单"} ${n} 人`);
      await Promise.all([loadRows(), loadSettings()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const removeSelected = async () => {
    if (!selected.length) return;
    try {
      const n = await removeMobileEnterGrants(selected);
      toast.success(`已移出 ${n} 人，回到跟随一键开关`);
      await Promise.all([loadRows(), loadSettings()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移除失败");
    }
  };

  const allChecked = rows.length > 0 && selected.length === rows.length;
  const toggleAll = () => setSelected(allChecked ? [] : rows.map((r) => r.userId));
  const toggleOne = (userId: string) =>
    setSelected((prev) => (prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId]));

  const listLabel = listKey === "WHITE" ? "白名单" : "黑名单";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* ─── 一键开关 ─── */}
      <div className="shrink-0 flex items-center justify-between gap-3 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-4 py-3">
        <div>
          <p className="text-sm font-bold text-[var(--app-color-text-primary)]">一键开关（所有人）</p>
          <p className="text-xs text-[var(--app-color-text-tertiary)] mt-0.5">
            控制名单之外的所有人，默认关闭。白名单 / 黑名单不受它控制。
          </p>
        </div>
        <label className="flex items-center gap-2 shrink-0 text-sm font-medium text-[var(--app-color-text-secondary)]">
          <AdminSwitchScaled
            size="sm"
            disabled={masterSaving}
            checked={masterEnabled}
            onChange={(checked) => void saveMaster(checked)}
          />
          {masterSaving ? "保存中…" : masterEnabled ? "已开启" : "已关闭"}
        </label>
      </div>

      {/* ─── 名单切换 + 工具条 ─── */}
      <div className="shrink-0 flex flex-wrap items-center gap-3">
        <AdminSegmentedControl<ListKey>
          aria-label="切换名单"
          value={listKey}
          onChange={(v) => {
            setListKey(v);
            setKeyword("");
            setKwDraft("");
          }}
          options={[
            { value: "WHITE", label: "白名单" },
            { value: "BLACK", label: "黑名单" },
          ]}
        />
        <AdminToolbarSearchField
          className="w-[min(46vw,15rem)] shrink-0 sm:w-60"
          placeholder="搜账号 id"
          value={kwDraft}
          onChange={setKwDraft}
          onSubmit={() => setKeyword(kwDraft.trim())}
        />
        <AdminButton type="button" tone="secondary" size="sm" onClick={() => setPickerOpen(true)}>
          <UserPlus className="h-4 w-4" aria-hidden />
          添加到{listLabel}
        </AdminButton>
        {selected.length > 0 ? (
          <AdminButton type="button" tone="secondary" size="sm" onClick={() => void removeSelected()}>
            <Trash2 className="h-4 w-4" aria-hidden />
            移出（{selected.length}）
          </AdminButton>
        ) : null}
      </div>

      <p className="shrink-0 text-xs text-[var(--app-color-text-tertiary)]">
        {listKey === "WHITE"
          ? "白名单：无论一键开关怎么设，这些人都能看到「进入」按钮。"
          : "黑名单：无论一键开关怎么开，这些人都看不到「进入」按钮。"}
      </p>

      {/* ─── 列表 ─── */}
      <div className="min-h-0 flex-1 overflow-auto rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)]">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--app-color-text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            加载中…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--app-color-text-tertiary)]">
            {keyword.trim() ? "没有符合条件的账号" : `${listLabel}为空`}
          </div>
        ) : (
          <table className="twin-table w-full text-sm">
            <thead>
              <tr>
                <th className="w-10">
                  <input type="checkbox" aria-label="全选" checked={allChecked} onChange={toggleAll} />
                </th>
                <th className="text-left">账号 id</th>
                <th className="text-left">状态</th>
                <th className="text-left">最后操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`选择 ${r.userId}`}
                      checked={selected.includes(r.userId)}
                      onChange={() => toggleOne(r.userId)}
                    />
                  </td>
                  <td className="font-mono text-xs break-all">{r.userId}</td>
                  <td>{r.enabled ? "始终开启" : "始终关闭"}</td>
                  <td className="text-xs text-[var(--app-color-text-tertiary)]">{r.updatedAt || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pickerOpen && (
        <PersonnelPicker
          onClose={() => setPickerOpen(false)}
          onConfirm={(ids) => {
            setPickerOpen(false);
            void addToCurrentList(ids);
          }}
        />
      )}
    </div>
  );
}
