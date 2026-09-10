import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Search } from "lucide-react";
import {
  fetchOwnerApprovalConfig,
  fetchOwnerApprovalOverview,
  saveOwnerApprovalConfig,
  searchPersonnelByKeyword,
  type CageOwnerApprovalOverview,
} from "@/api/domains/cageShelf.api";
import { hasMinRole } from "@/features/auth/roleAccess";
import { authStorage } from "@/features/auth/authStorage";
import { SettingsRow, SettingsSection, SettingsSwitch } from "./SettingsPrimitives";

/**
 * 所属人审核配置：到位确认 / 分笼审核 / 转移审核三个开关，按「所属人」维护。
 *
 * 分上下两区：
 *  - 上「我的审核开关」：能打开设置中心的人都能配自己那份（后端同样放行本人）。
 *  - 下「其他人的审核配置」：仅 ADMIN 及以上可见/可用（后端也做了同等校验，前端只是不显示）。
 *
 * 判定口径：学生提交的分笼/转移看**目标所属人（接收方）**的配置；认领/代认领看接收人自己的配置。
 * 没配过的所属人一律按「三个开关全 true」（需要审核）处理。
 */
export default function CageOwnerApprovalSettings() {
  const role = authStorage.getRole();
  const canManageOthers = hasMinRole(role, "ADMIN");
  const myAccountId = String(authStorage.getUserInfo()?.id ?? "");

  /* ══════════ 上区：我的三个开关 ══════════
     独立一份 state，不与下区共用 —— 共用的话改上面的开关会串到下面正在编辑的人 */
  const [myConfirm, setMyConfirm] = useState(true);
  const [myDivide, setMyDivide] = useState(true);
  const [myTransfer, setMyTransfer] = useState(true);
  const [myLoading, setMyLoading] = useState(false);
  const [mySaving, setMySaving] = useState(false);

  useEffect(() => {
    if (!myAccountId) return;
    let cancelled = false;
    setMyLoading(true);
    fetchOwnerApprovalConfig(myAccountId)
      .then((c) => {
        if (cancelled) return;
        setMyConfirm(c.confirmRequired);
        setMyDivide(c.divideApprovalRequired);
        setMyTransfer(c.transferApprovalRequired);
      })
      .catch(() => { /* 读不到就按默认（三个全 true）显示 */ })
      .finally(() => {
        if (!cancelled) setMyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [myAccountId]);

  /* ══════════ 下区：其他人（仅 ADMIN+） ══════════ */
  const [overview, setOverview] = useState<CageOwnerApprovalOverview[]>([]);
  const [loading, setLoading] = useState(true);

  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<Array<{ id: number; name: string; accountId: string; projectGroupName: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<{ name: string; accountId: string } | null>(null);

  const [confirmRequired, setConfirmRequired] = useState(true);
  const [divideRequired, setDivideRequired] = useState(true);
  const [transferRequired, setTransferRequired] = useState(true);
  const [loadingCfg, setLoadingCfg] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await fetchOwnerApprovalOverview());
    } catch {
      setOverview([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManageOthers) {
      setLoading(false);
      return;
    }
    void loadOverview();
  }, [canManageOthers, loadOverview]);

  const saveMine = async () => {
    if (!myAccountId) {
      toast.error("没取到当前账号，无法保存");
      return;
    }
    setMySaving(true);
    try {
      await saveOwnerApprovalConfig(myAccountId, {
        confirmRequired: myConfirm,
        divideApprovalRequired: myDivide,
        transferApprovalRequired: myTransfer,
      });
      toast.success("已保存我的审核开关");
      if (canManageOthers) await loadOverview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setMySaving(false);
    }
  };

  // 换人 → 拉其生效配置（没配过返回三个 true）
  useEffect(() => {
    if (!selected?.accountId) return;
    let cancelled = false;
    setLoadingCfg(true);
    fetchOwnerApprovalConfig(selected.accountId)
      .then((c) => {
        if (cancelled) return;
        setConfirmRequired(c.confirmRequired);
        setDivideRequired(c.divideApprovalRequired);
        setTransferRequired(c.transferApprovalRequired);
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : "加载审核配置失败");
      })
      .finally(() => {
        if (!cancelled) setLoadingCfg(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.accountId]);

  const runSearch = async () => {
    const kw = keyword.trim();
    if (!kw) {
      toast.error("请输入姓名或工号");
      return;
    }
    setSearching(true);
    try {
      const list = await searchPersonnelByKeyword(kw);
      setResults(list);
      if (list.length === 0) toast("未找到匹配人员");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "搜索失败");
    } finally {
      setSearching(false);
    }
  };

  const save = async () => {
    if (!selected?.accountId) {
      toast.error("请先选择所属人");
      return;
    }
    setSaving(true);
    try {
      await saveOwnerApprovalConfig(selected.accountId, {
        confirmRequired,
        divideApprovalRequired: divideRequired,
        transferApprovalRequired: transferRequired,
      });
      toast.success("所属人审核配置已保存");
      await loadOverview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const flag = (on: boolean) => (
    <span
      className={
        on
          ? "text-[var(--app-color-feedback-warning)]"
          : "text-[var(--app-color-feedback-success)]"
      }
    >
      {on ? "需审核" : "免审核"}
    </span>
  );

  return (
    <div className="space-y-5">
      {/* ── 上区：我的审核开关（所有人） ── */}
      <SettingsSection
        title="我的审核开关"
        description="控制你名下笼位的审核要求。开启「到位确认」后，审核通过仍需到场扫码确认；关掉分笼/转移审核，对应操作会直接执行、不进审批队列。"
      >
        {myLoading ? (
          <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-4 text-center text-[10px] text-[var(--twin-mute)]">
            加载中…
          </div>
        ) : (
          <>
            <SettingsRow label="到位确认" description="开启后审核通过仍需到场扫码确认到位">
              <SettingsSwitch checked={myConfirm} onChange={setMyConfirm} label="到位确认" />
            </SettingsRow>
            <SettingsRow label="分笼审核" description="关闭后你名下笼位的分笼直接执行">
              <SettingsSwitch checked={myDivide} onChange={setMyDivide} label="分笼审核" />
            </SettingsRow>
            <SettingsRow label="转移审核" description="关闭后你名下笼位的转移直接执行">
              <SettingsSwitch checked={myTransfer} onChange={setMyTransfer} label="转移审核" />
            </SettingsRow>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void saveMine()}
                disabled={mySaving}
                className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-1 text-[11px] font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
              >
                {mySaving ? "保存中…" : "保存我的开关"}
              </button>
            </div>
          </>
        )}
      </SettingsSection>

      {/* ── 下区：其他人（仅 ADMIN 及以上） ── */}
      {canManageOthers && (
        <>
          <SettingsSection
            title="已配置的所属人"
            description="只列出配过的人。没配过的所属人一律按「三个开关全开（需要审核）」处理，不需要在这里逐个建行。"
            actions={<span className="text-[10px] text-[var(--twin-mute)]">{overview.length} 位</span>}
          >
            {loading ? (
              <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-4 text-center text-[10px] text-[var(--twin-mute)]">
                加载中…
              </div>
            ) : overview.length === 0 ? (
              <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-4 text-center text-[10px] text-[var(--twin-mute)]">
                还没有配置过任何人 —— 全部所属人当前都按「需要审核」处理
              </div>
            ) : (
              <div className="overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)]">
                <table className="twin-table">
                  <thead>
                    <tr>
                      <th>所属人</th>
                      <th className="w-20">到位确认</th>
                      <th className="w-20">分笼审核</th>
                      <th className="w-20">转移审核</th>
                      <th className="w-32">更新时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.map((o) => (
                      <tr key={o.ownerAccountId}>
                        <td className="px-2.5 py-1">
                          <button
                            type="button"
                            title="载入到下方编辑"
                            onClick={() => setSelected({ name: o.ownerName, accountId: o.ownerAccountId })}
                            className="text-[11px] font-semibold text-[var(--twin-primary)] hover:underline"
                          >
                            {o.ownerName}
                          </button>
                        </td>
                        <td className="px-2.5 py-1 text-[11px]">{flag(o.confirmRequired)}</td>
                        <td className="px-2.5 py-1 text-[11px]">{flag(o.divideApprovalRequired)}</td>
                        <td className="px-2.5 py-1 text-[11px]">{flag(o.transferApprovalRequired)}</td>
                        <td className="px-2.5 py-1 text-[11px] text-[var(--twin-mute)]">
                          {(o.updateTime || "").replace("T", " ").slice(0, 16) || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SettingsSection>

          <SettingsSection title="编辑配置（搜索所属人）" description="搜到人后逐个开关设置，保存即整体覆盖。">
            <div className="flex items-center gap-1.5">
              <div className="flex min-w-0 flex-1 items-center gap-1 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1">
                <Search className="size-3 shrink-0 text-[var(--twin-mute)]" />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void runSearch();
                  }}
                  placeholder="搜索所属人姓名 / 工号"
                  className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => void runSearch()}
                disabled={searching}
                className="shrink-0 rounded-twin-sm border border-[var(--twin-hairline)] px-2.5 py-1 text-[11px] font-semibold text-[var(--twin-ink)] hover:bg-[var(--twin-canvas-soft)] disabled:opacity-50"
              >
                {searching ? "…" : "检索"}
              </button>
            </div>

            {results.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-twin-sm border border-[var(--twin-hairline)] p-1">
                {results.map((p) => {
                  const on = selected?.accountId === p.accountId;
                  return (
                    <button
                      key={p.accountId || p.id}
                      type="button"
                      onClick={() => setSelected({ name: p.name, accountId: p.accountId })}
                      className={`flex w-full items-center gap-2 rounded-twin-sm px-2 py-1.5 text-left text-[11px] transition ${
                        on ? "bg-[var(--twin-primary)]/10" : "hover:bg-[var(--twin-canvas-soft)]"
                      }`}
                    >
                      <span className={`font-semibold ${on ? "text-[var(--twin-primary)]" : "text-[var(--twin-ink)]"}`}>
                        {p.name}
                      </span>
                      {p.projectGroupName && <span className="text-[10px] text-[var(--twin-mute)]">{p.projectGroupName}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </SettingsSection>

          {selected && (
            <SettingsSection
              title={`${selected.name} 的审核配置`}
              description={loadingCfg ? "加载中…" : "三个开关分别控制：审核通过后是否还要到场扫码确认、分笼是否先审、转移是否先审。"}
            >
              <SettingsRow label="到位确认" description="开启后审核通过仍需到场扫码确认到位">
                <SettingsSwitch checked={confirmRequired} disabled={loadingCfg} onChange={setConfirmRequired} label="到位确认" />
              </SettingsRow>
              <SettingsRow label="分笼审核" description="关闭后该所属人的笼位分笼直接执行">
                <SettingsSwitch checked={divideRequired} disabled={loadingCfg} onChange={setDivideRequired} label="分笼审核" />
              </SettingsRow>
              <SettingsRow label="转移审核" description="关闭后该所属人的笼位转移直接执行">
                <SettingsSwitch checked={transferRequired} disabled={loadingCfg} onChange={setTransferRequired} label="转移审核" />
              </SettingsRow>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || loadingCfg}
                  className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-1 text-[11px] font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
                >
                  {saving ? "保存中…" : "保存"}
                </button>
              </div>
            </SettingsSection>
          )}
        </>
      )}
    </div>
  );
}
