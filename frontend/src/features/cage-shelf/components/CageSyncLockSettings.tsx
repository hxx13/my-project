import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { fetchSyncLocks, clearSyncLock, type CageShelfTreeNode, type SyncLockScope } from "@/api/domains/cageShelf.api";
import { useSyncLock } from "./SyncLockContext";
import { SettingsSection, SettingsRow, SettingsSwitch } from "./SettingsPrimitives";

/**
 * 同步保护锁设置：保护模式开关 + 已锁范围清单 + 笼位ID同步入口。
 *
 * 锁清单原先只在「同步前二次确认」弹窗里能看到 —— 不进同步流程就不知道锁了哪些地方，
 * 这里独立拉取（不受保护模式开关限制），可随时核对与清除。
 */

const LEVEL_LABEL: Record<SyncLockScope, string> = {
  FLOOR: "楼层",
  ROOM: "房间",
  SHELF: "笼架",
  CELL: "笼位",
};

const LEVEL_ORDER: SyncLockScope[] = ["FLOOR", "ROOM", "SHELF", "CELL"];

export default function CageSyncLockSettings({
  fullTree,
  onRunCellIdSync,
  cellIdSyncing,
}: {
  fullTree: CageShelfTreeNode[];
  onRunCellIdSync: (deleteExisting: boolean) => void;
  cellIdSyncing: boolean;
}) {
  const { protectMode, setProtectMode } = useSyncLock();
  const qc = useQueryClient();
  const [clearing, setClearing] = useState<string | null>(null);

  const { data: locks = [], isLoading } = useQuery({
    queryKey: ["cageSyncLocks"],
    queryFn: fetchSyncLocks,
    staleTime: 30_000,
  });

  const nameMaps = useMemo(() => {
    const floor = new Map<string, string>();
    const room = new Map<string, string>();
    const shelf = new Map<string, string>();
    for (const r of fullTree ?? []) {
      const f = String(r.floorId ?? "");
      const rm = String(r.roomId ?? "");
      const s = String(r.shelveId ?? "");
      if (f) floor.set(f, r.floorName || f);
      if (rm) room.set(rm, r.roomName || rm);
      if (s) shelf.set(s, r.shelveName || s);
    }
    return { floor, room, shelf };
  }, [fullTree]);

  const nameOf = (scopeType: SyncLockScope, scopeKey: string): string => {
    if (scopeType === "FLOOR") return nameMaps.floor.get(scopeKey) ?? `楼层 ${scopeKey}`;
    if (scopeType === "ROOM") return nameMaps.room.get(scopeKey) ?? `房间 ${scopeKey}`;
    if (scopeType === "SHELF") return nameMaps.shelf.get(scopeKey) ?? `笼架 ${scopeKey}`;
    return `笼位 ${scopeKey}`;
  };

  const sorted = useMemo(
    () =>
      [...locks].sort((a, b) => {
        const d = LEVEL_ORDER.indexOf(a.scopeType) - LEVEL_ORDER.indexOf(b.scopeType);
        return d !== 0 ? d : nameOf(a.scopeType, a.scopeKey).localeCompare(nameOf(b.scopeType, b.scopeKey), "zh");
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locks, nameMaps],
  );

  const lockedCount = sorted.filter((l) => l.locked).length;
  const whitelistCount = sorted.length - lockedCount;

  const clear = async (scopeType: SyncLockScope, scopeKey: string) => {
    const id = `${scopeType}:${scopeKey}`;
    setClearing(id);
    try {
      await clearSyncLock(scopeType, scopeKey);
      toast.success("已清除该范围的锁设置");
      await qc.invalidateQueries({ queryKey: ["cageSyncLocks"] });
    } catch (e: any) {
      toast.error(e?.message || "清除失败");
    } finally {
      setClearing(null);
    }
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="同步保护模式"
        description="开启后笼架树与网格上出现锁图标，点图标在「锁定 → 白名单解锁 → 清除」之间循环。锁定范围在同步时会被跳过，保持本地现状。"
      >
        <SettingsRow
          label={protectMode ? "保护模式进行中" : "保护模式已关闭"}
          description={protectMode ? "锁图标已显示，可直接在树/网格上点选切换。" : "关闭时锁依然生效，只是界面上不显示锁图标。"}
        >
          <SettingsSwitch checked={protectMode} onChange={setProtectMode} label="同步保护模式" />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="已锁定范围"
        description="当前库里全部锁设置（含白名单解锁）。层级判定自下而上取最近一条显式设置。"
        actions={
          <span className="text-[10px] text-[var(--twin-mute)]">
            锁定 {lockedCount} · 白名单 {whitelistCount}
          </span>
        }
      >
        {isLoading ? (
          <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-4 text-center text-[10px] text-[var(--twin-mute)]">
            加载中…
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-4 text-center text-[10px] text-[var(--twin-mute)]">
            还没有任何锁设置 —— 同步会覆盖全部笼位数据（含人工修改过的内容）
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-twin-sm border border-[var(--twin-hairline)]">
            <table className="twin-table">
              <thead>
                <tr>
                  <th className="w-16">层级</th>
                  <th>范围</th>
                  <th className="w-20">状态</th>
                  <th className="w-20">操作人</th>
                  <th className="w-14" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((l) => {
                  const id = `${l.scopeType}:${l.scopeKey}`;
                  return (
                    <tr key={id}>
                      <td className="px-2.5 py-1 text-[11px] text-[var(--twin-mute)]">{LEVEL_LABEL[l.scopeType]}</td>
                      <td className="px-2.5 py-1 text-[11px] text-[var(--twin-ink)]">{nameOf(l.scopeType, l.scopeKey)}</td>
                      <td className="px-2.5 py-1 text-[11px]">
                        <span className={l.locked ? "text-[var(--app-color-feedback-danger)]" : "text-[var(--app-color-feedback-success)]"}>
                          {l.locked ? "已锁定" : "白名单"}
                        </span>
                      </td>
                      <td className="px-2.5 py-1 text-[11px] text-[var(--twin-mute)]">{l.operatorName || "—"}</td>
                      <td className="px-2.5 py-1 text-right">
                        <button
                          type="button"
                          disabled={clearing === id}
                          onClick={() => void clear(l.scopeType, l.scopeKey)}
                          className="rounded-md px-2 py-0.5 text-[10px] text-[var(--twin-mute)] transition hover:text-[var(--app-color-feedback-danger)] disabled:opacity-40"
                        >
                          清除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="笼位ID同步"
        description="把 /back 的笼位索引拉回本地。两种方式都会后台异步执行，进度见页面顶部进度条。"
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={cellIdSyncing}
            onClick={() => onRunCellIdSync(false)}
            className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2.5 text-left transition hover:bg-[var(--twin-canvas-soft)] disabled:opacity-50"
          >
            <div className="text-[11px] font-semibold text-[var(--twin-ink)]">仅补充缺失</div>
            <div className="mt-0.5 text-[10px] text-[var(--twin-mute)]">保留已有笼位ID，只补新增/缺失的笼位（推荐）</div>
          </button>
          <button
            type="button"
            disabled={cellIdSyncing}
            onClick={() => onRunCellIdSync(true)}
            className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2.5 text-left transition hover:bg-[var(--twin-canvas-soft)] disabled:opacity-50"
          >
            <div className="text-[11px] font-semibold text-[var(--twin-ink)]">删旧重拉</div>
            <div className="mt-0.5 text-[10px] text-[var(--twin-mute)]">先清空每个架子的旧索引再全量重拉（索引脏时用）</div>
          </button>
        </div>
      </SettingsSection>
    </div>
  );
}
