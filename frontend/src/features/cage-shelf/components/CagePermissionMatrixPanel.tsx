import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Grid3x3 } from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchCagePermissionMatrix,
  saveCagePermissionGrant,
  type CagePermissionCapability,
} from "@/api/domains/cageShelf.api";
import { fetchIdentityTags, type IdentityTag } from "@/api/domains/personIdentity.api";
import { SettingsSection } from "./SettingsPrimitives";

/**
 * 身份权限矩阵：**行 = 身份标识**（person_identity_tag），**列 = 能力**（cage_permission_capability），
 * 格子勾选 = 授予。取代原来「模式可见性」那套逗号串配置。
 *
 * 空行语义是 **fail-closed**：某能力一个身份都没勾 = 全员禁用（不是「不限制」）。
 * 所以空行会标红并给顶部提示——迁移漏一行就会静默锁死一个模式，必须一眼看得见。
 *
 * 样式走笼架设置弹窗自己的 --twin-* 令牌，与弹窗内其他分类一致；
 * 不复用 NHP 的 MatrixTable（那套走 nhp.css 的 --primary/--text，两套变量混用会整体失效）。
 */

const VIEW_GROUP_LABEL: Record<string, string> = {
  STAFF: "教职工视角",
  STUDENT: "学生视角",
};

export default function CagePermissionMatrixPanel() {
  const [caps, setCaps] = useState<CagePermissionCapability[]>([]);
  const [identities, setIdentities] = useState<IdentityTag[]>([]);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [emptyCaps, setEmptyCaps] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const cellKey = (cap: string, identity: string) => `${cap}|${identity}`;

  const load = useCallback(async () => {
    const [matrix, tags] = await Promise.all([fetchCagePermissionMatrix(), fetchIdentityTags()]);
    setCaps(matrix.capabilities);
    setIdentities(tags);
    setGranted(new Set(matrix.grants.map((g) => cellKey(g.capabilityCode, g.identityCode))));
    setEmptyCaps(matrix.emptyCapabilities);
  }, []);

  useEffect(() => {
    let cancelled = false;
    load()
      .catch(() => toast.error("加载权限矩阵失败"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, CagePermissionCapability[]>();
    for (const c of caps) {
      const key = c.viewGroup || "STAFF";
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(c);
    }
    return [...byGroup.entries()];
  }, [caps]);

  /** 乐观更新 + 失败回滚：勾选是高频操作，不能每格都等一个来回。 */
  const toggle = async (cap: string, identity: string, next: boolean) => {
    const key = cellKey(cap, identity);
    if (savingCell) return;
    setSavingCell(key);
    setGranted((prev) => {
      const s = new Set(prev);
      if (next) s.add(key);
      else s.delete(key);
      return s;
    });
    try {
      await saveCagePermissionGrant(cap, identity, next);
      // 空行清单由后端口径决定，改动后重新拉一次（只读、代价小），不在前端自己算。
      const fresh = await fetchCagePermissionMatrix();
      setEmptyCaps(fresh.emptyCapabilities);
    } catch (e) {
      setGranted((prev) => {
        const s = new Set(prev);
        if (next) s.delete(key);
        else s.add(key);
        return s;
      });
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingCell(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-4 text-center text-[10px] text-[var(--twin-mute)]">
        加载中…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {emptyCaps.length > 0 && (
        <div className="rounded-twin-sm border border-[var(--app-color-feedback-danger)] bg-[var(--twin-canvas)] px-3 py-2 text-[10px] leading-relaxed text-[var(--app-color-feedback-danger)]">
          <strong>以下权限没有任何身份可用，等于全员禁用：</strong>
          {emptyCaps.map((c) => caps.find((x) => x.code === c)?.label ?? c).join("、")}
        </div>
      )}

      {groups.map(([group, cols]) => (
        <SettingsSection
          key={group}
          title={VIEW_GROUP_LABEL[group] ?? group}
          description="勾选 = 该身份拥有该权限。一个都不勾 = 该权限对所有人禁用。"
          actions={
            <span className="flex items-center gap-1 text-[10px] text-[var(--twin-mute)]">
              <Grid3x3 className="size-3" />
              {cols.length} 项权限 × {identities.length} 种身份
            </span>
          }
        >
          <div className="overflow-auto rounded-twin-sm border border-[var(--twin-hairline)]">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 w-[132px] min-w-[132px] border-b border-r border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 py-2 text-left font-semibold text-[var(--twin-mute)]">
                    身份 \ 权限
                  </th>
                  {cols.map((c) => {
                    const isEmpty = emptyCaps.includes(c.code);
                    return (
                      <th
                        key={c.code}
                        title={c.code}
                        className={`sticky top-0 z-10 border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-2 align-bottom font-semibold ${
                          isEmpty ? "text-[var(--app-color-feedback-danger)]" : "text-[var(--twin-ink)]"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="whitespace-nowrap">{c.label}</span>
                          {isEmpty && <span className="text-[9px] font-normal whitespace-nowrap">无人可用</span>}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {identities.map((idt) => (
                  <tr key={idt.code} className="odd:bg-[var(--twin-canvas-soft)]">
                    <td className="sticky left-0 z-10 border-b border-r border-[var(--twin-hairline)] bg-inherit px-2.5 py-2">
                      <div className="font-semibold text-[var(--twin-ink)]">{idt.label}</div>
                      <div className="text-[9px] text-[var(--twin-mute)]">{idt.code}</div>
                    </td>
                    {cols.map((c) => {
                      const key = cellKey(c.code, idt.code);
                      const on = granted.has(key);
                      return (
                        <td
                          key={c.code}
                          className="border-b border-[var(--twin-hairline)] px-2 py-2 text-center"
                        >
                          <button
                            type="button"
                            aria-pressed={on}
                            aria-label={`${idt.label} × ${c.label}`}
                            disabled={savingCell === key}
                            onClick={() => void toggle(c.code, idt.code, !on)}
                            className={`mx-auto flex size-5 items-center justify-center rounded-twin-sm border transition disabled:opacity-40 ${
                              on
                                ? "border-transparent bg-[var(--twin-primary)] text-white"
                                : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)] hover:border-[var(--twin-primary)]"
                            }`}
                          >
                            {on && <Check className="size-3" strokeWidth={3} />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SettingsSection>
      ))}
    </div>
  );
}
