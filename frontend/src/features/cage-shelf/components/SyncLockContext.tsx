import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Unlock } from "lucide-react";
import toast from "react-hot-toast";
import { fetchSyncLocks, setSyncLock, clearSyncLock, type SyncLockScope } from "@/api/domains/cageShelf.api";

export type { SyncLockScope };

/**
 * 同步保护锁上下文（对齐 CageColorContext 的用法）。
 *
 * 锁有四层粒度 FLOOR / ROOM / SHELF / CELL，判定与后端一致：自下而上取最近一条显式设置。
 * 三态循环：none/inherited → 锁定 → 白名单解锁 → 清除（回到继承）。
 */

export type LockState = "locked" | "unlocked" | "inherited" | "none";

/** 一层引用；chain 自下而上：[本层, ...上级, 顶层] */
export interface ScopeRef {
  type: SyncLockScope;
  key: string;
}

interface SyncLockCtx {
  /** 是否处于「同步保护」模式（打开后才显示锁图标、点击才切换锁） */
  protectMode: boolean;
  setProtectMode: (v: boolean) => void;
  resolve: (chain: ScopeRef[]) => LockState;
  toggle: (chain: ScopeRef[], label?: string) => void;
  /** 由树数据补 roomId → floorId：笼架详情里不带 floorId，网格需借它拼完整 chain */
  floorOfRoom: (roomId?: string | number | null) => string | undefined;
}

const Ctx = createContext<SyncLockCtx>({
  protectMode: false,
  setProtectMode: () => {},
  resolve: () => "none",
  toggle: () => {},
  floorOfRoom: () => undefined,
});

export function SyncLockProvider({ roomFloor, children }: { roomFloor?: Map<string, string>; children: ReactNode }) {
  const [protectMode, setProtectMode] = useState(false);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["cageSyncLocks"],
    queryFn: fetchSyncLocks,
    enabled: protectMode,
    staleTime: 30_000,
  });

  const map = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const e of data ?? []) m.set(`${e.scopeType}:${e.scopeKey}`, e.locked);
    return m;
  }, [data]);

  const resolve = useCallback((chain: ScopeRef[]): LockState => {
    if (chain.length === 0) return "none";
    const own = map.get(`${chain[0].type}:${chain[0].key}`);
    if (own === true) return "locked";
    if (own === false) return "unlocked";
    // 本层无设置 → 往上看最近一条显式设置
    for (let i = 1; i < chain.length; i++) {
      const v = map.get(`${chain[i].type}:${chain[i].key}`);
      if (v === true) return "inherited";
      if (v === false) return "none";
    }
    return "none";
  }, [map]);

  const toggle = useCallback(async (chain: ScopeRef[], label?: string) => {
    if (chain.length === 0) return;
    const head = chain[0];
    const cur = resolve(chain);
    try {
      if (cur === "locked") {
        await setSyncLock(head.type, head.key, false);
        toast.success(`${label ?? "该范围"}已设为白名单：上级锁定时仍照常同步`);
      } else if (cur === "unlocked") {
        await clearSyncLock(head.type, head.key);
        toast.success(`${label ?? "该范围"}已清除锁设置，回到继承上级`);
      } else {
        await setSyncLock(head.type, head.key, true);
        toast.success(`${label ?? "该范围"}已锁定：同步时跳过`);
      }
      await qc.invalidateQueries({ queryKey: ["cageSyncLocks"] });
    } catch (e: any) {
      toast.error(e?.message || "设置同步锁失败");
    }
  }, [resolve, qc]);

  const floorOfRoom = useCallback(
    (roomId?: string | number | null) => roomFloor?.get(String(roomId ?? "")),
    [roomFloor],
  );

  return (
    <Ctx.Provider value={{ protectMode, setProtectMode, resolve, toggle, floorOfRoom }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSyncLock() {
  return useContext(Ctx);
}

/** 依层级取锁图标与配色（渲染用）。 */
export function lockVisual(state: LockState): { icon: "locked" | "unlocked" | "none"; cls: string; title: string } {
  switch (state) {
    case "locked":
      return { icon: "locked", cls: "text-[var(--app-color-feedback-danger)]", title: "已锁定：同步跳过（点击设为白名单）" };
    case "unlocked":
      return { icon: "unlocked", cls: "text-[var(--app-color-feedback-success)]", title: "白名单：上级锁定时本范围仍同步（点击清除）" };
    case "inherited":
      return { icon: "none", cls: "text-[var(--twin-mute)] opacity-60", title: "继承上级锁定（点击设为白名单）" };
    default:
      return { icon: "none", cls: "text-[var(--twin-mute)] opacity-40", title: "点击锁定（同步时跳过）" };
  }
}

/**
 * 锁图标：仅在「同步保护」模式显示；点击在 锁定 → 白名单 → 清除 之间循环。
 * 用 span 而非 button —— 树节点/笼架标题本身已是 button，button 不能嵌套。
 */
export function LockBadge({ chain, label, size = 3 }: { chain: ScopeRef[]; label?: string; size?: number }) {
  const { protectMode, resolve, toggle } = useSyncLock();
  if (!protectMode) return null;
  const v = lockVisual(resolve(chain));
  const Icon = v.icon === "unlocked" ? Unlock : Lock;
  return (
    <span
      role="button"
      tabIndex={0}
      title={v.title}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggle(chain, label); }}
      className={`shrink-0 inline-flex items-center cursor-pointer transition hover:opacity-100 ${v.cls}`}
    >
      <Icon style={{ width: size * 4, height: size * 4 }} />
    </span>
  );
}
