/**
 * ============================================================================
 * CampusTree — 校区/区域/楼层/房间/笼架 递归目录树
 * ============================================================================
 *
 * 数据流:
 *   fetchFullTree() → CageShelfTreeNode[] → buildTree() → TreeNode[] → CampusTree
 *
 * 校区排序: 浦东 > 浦西 > 其他（按拼音）
 * 校区样式: CAMPUS_STYLES 控制渐变色背景
 *
 * 房间节点支持:
 *   - 查看模式: 聚合子笼架的 type1~4 进度条 + 告警圆点
 *   - 预约模式: 已预约/已使用 双进度条
 *
 * 笼架节点支持:
 *   - type1~4 分色进度条
 *   - 告警状态圆点 (NEED_DIVIDE/HEALTH_ABNORMAL/ANIMAL_TRANSFER/SPECIAL_FEEDING/COHABITATION)
 * ============================================================================
 */

import React from "react";
import { ChevronDown, ChevronRight, LayoutGrid, Star } from "lucide-react";
import { CAMPUS_ORDER, cs, type TreeNode } from "../constants";
import type { CageShelfTreeNode, BookingRoom } from "@/api/domains/cageShelf.api";
import { LockBadge, type ScopeRef, type SyncLockScope } from "./SyncLockContext";
import { roomIdOf, shelveIdOf, subtreeHasBookmarked, visibleShelfChildren, type RoomBookmarkOpts } from "./campusTreeBookmarkFilter";

/** 由树节点 raw 拼同步保护锁链（自下而上：本层 → 上级 → 顶层），空 ID 段跳过。 */
function lockChain(raw: any, depth: SyncLockScope): ScopeRef[] {
  const chain: ScopeRef[] = [];
  const push = (type: SyncLockScope, v: any) => {
    const s = v == null ? "" : String(v);
    if (s) chain.push({ type, key: s });
  };
  if (depth === "SHELF") push("SHELF", raw?.shelveId);
  if (depth !== "FLOOR") push("ROOM", raw?.roomId);
  push("FLOOR", raw?.floorId);
  return chain;
}

/**
 * buildTree — 全量 flat 数据 → 嵌套 TreeNode 树
 *
 * 输入: CageShelfTreeNode[]（每行含 campusId/areaId/floorId/roomId/shelveId）
 * 输出: TreeNode[]（campus → area → floor → room → shelf 五层嵌套）
 *
 * 排序: campus 按 CAMPUS_ORDER，其余保持原始顺序
 */
export function buildTree(rows: CageShelfTreeNode[]): TreeNode[] {
  const campusMap = new Map<string, TreeNode>();
  for (const r of rows) {
    const cid = String(r.campusId ?? ""); if (!cid) continue;
    if (!campusMap.has(cid)) {
      campusMap.set(cid, { key: `c:${cid}`, label: r.campusName, type: "campus", children: [], raw: r });
    }
    const campus = campusMap.get(cid)!;
    const aid = String(r.areaId ?? "");
    let area = campus.children.find(a => a.key === `a:${aid}`);
    if (!area && aid) { area = { key: `a:${aid}`, label: r.areaName, type: "area", children: [], raw: r }; campus.children.push(area); }
    const fid = String(r.floorId ?? "");
    const parent = area || campus;
    let floor = parent.children.find(f => f.key === `f:${fid}`);
    if (!floor && fid) { floor = { key: `f:${fid}`, label: r.floorName, type: "floor", children: [], raw: r }; parent.children.push(floor); }
    const rid = String(r.roomId ?? "");
    const p2 = floor || parent;
    let room = p2.children.find(rm => rm.key === `r:${rid}`);
    if (!room && rid) { room = { key: `r:${rid}`, label: r.roomName, type: "room", children: [], raw: r }; p2.children.push(room); }
    const sid = String(r.shelveId ?? "");
    if (sid && room) { room.children.push({ key: `s:${sid}`, label: r.shelveName || sid, type: "shelf", children: [], raw: r }); }
  }
  const campuses = [...campusMap.values()];
  campuses.sort((a, b) => {
    const ai = CAMPUS_ORDER.indexOf(a.label as any), bi = CAMPUS_ORDER.indexOf(b.label as any);
    if (ai !== -1 && bi !== -1) return ai - bi; if (ai !== -1) return -1; if (bi !== -1) return 1;
    return a.label.localeCompare(b.label, "zh-CN");
  });
  return campuses;
}

/**
 * CampusTree — 递归目录树渲染组件
 *
 * 交互:
 *   - 点击 campus/area/floor → 展开/收起子节点
 *   - 点击 room → 展开子笼架 + 触发 onOpenRoom
 *   - 点击 shelf → viewMode==="room" 时滚动到对应笼架；"shelf" 时触发 onOpenShelf
 *   - 搜索过滤: 仅在 room 层级生效，大小写不敏感
 *
 * Props:
 *   tree                        — buildTree() 的输出
 *   exp                         — 展开状态 Set
 *   search                      — 搜索文本
 *   onToggle                    — 展开/收起回调
 *   onOpenRoom, onOpenShelf     — 房间/笼架选中回调
 *   viewMode                    — "room" | "shelf"
 *   alertStatusesByShelf        — 每个笼架含哪些告警状态码
 *   alertStatusesByRoom         — 每个房间含哪些告警状态码
 *   pageMode                    — "view" | "allocate" | "booking"
 *   bookingRooms                — 预约模式下的房间数据
 */
export function CampusTree({ tree, exp, search, onToggle, onOpenRoom, viewMode, onOpenShelf, alertStatusesByShelf, alertStatusesByRoom, pageMode, bookingRooms, hideProgress, highlightShelveIds, bookmark }: {
  tree: TreeNode[]; exp: Set<string>; search: string; onToggle: (k: string) => void; onOpenRoom: (roomId: string, roomName: string) => void;
  viewMode: "room" | "shelf"; onOpenShelf: (shelveId: string, overrideRoomId?: string) => void;
  alertStatusesByShelf: Map<string, Set<string>>; alertStatusesByRoom: Map<string, Set<string>>;
  pageMode?: "view" | "allocate" | "booking"; bookingRooms?: BookingRoom[]; hideProgress?: boolean;
  /** 有可选笼位的笼架 id：命中时在树上高亮，提示「这架里有能选的格子」 */
  highlightShelveIds?: Set<string>;
  /** 房间收藏：星标 + 「只看收藏」。不传 = 没有收藏能力（其它弹窗的树照旧） */
  bookmark?: RoomBookmarkOpts;
}) {
  const q = search.trim().toLowerCase();
  const searching = !!q;
  const tg = (k: string) => { const n = new Set(exp); n.has(k) ? n.delete(k) : n.add(k); onToggle(k); };
  return <div className="text-[11px] space-y-1.5">
    {tree.map(c => {
      if (searching && !subtreeMatches(c, q)) return null;
      // 收藏视图：整支都没有收藏项（房间或笼架）的校区不画
      if (bookmark?.onlyBookmarked && !subtreeHasBookmarked(c, bookmark.bookmarkedRooms ?? new Set(), bookmark.bookmarkedShelves ?? new Set())) return null;
      const open = searching || exp.has(c.key), sty = cs(c.label);
      return <div key={c.key}>
        <button onClick={() => tg(c.key)} className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-twin-lg text-left shadow-sm active:scale-[0.99] transition" style={{ background: sty.bg }}>
          {open ? <ChevronDown className="h-3.5 w-3.5 text-white/80" /> : <ChevronRight className="h-3.5 w-3.5 text-white/80" />}
          <span className="flex-1 truncate text-xs font-bold" style={{ color: sty.text }}>{c.label}校区</span>
        </button>
        {open && <div className="mt-1 ml-1 space-y-0.5">{c.children.map(n => renderNode(n, exp, q, tg, onOpenRoom, viewMode, onOpenShelf, alertStatusesByShelf, alertStatusesByRoom, pageMode, bookingRooms, hideProgress, highlightShelveIds, bookmark))}</div>}
      </div>;
    })}
    {bookmark?.onlyBookmarked && (bookmark.bookmarkedRooms?.size ?? 0) === 0 && (bookmark.bookmarkedShelves?.size ?? 0) === 0
      ? <div className="text-[var(--twin-mute)] py-6 text-center leading-relaxed">还没有收藏的房间或笼架<br/><span className="text-[10px]">切到「筛选」，点房间名 / 笼架名后面的 ☆</span></div>
      : tree.length === 0 && <div className="text-[var(--twin-mute)] py-6 text-center">暂无数据，请先导入 CSV</div>}
    {searching && tree.length > 0 && !tree.some(c => subtreeMatches(c, q)) && (
      <div className="text-[var(--twin-mute)] py-6 text-center">没有匹配的校区 / 房间 / 笼架</div>
    )}
  </div>;
}

/**
 * renderNode — 递归渲染单个树节点
 *
 * 内部函数，由 CampusTree 调用。按 node.type 分支:
 *   "campus" → 渐变色按钮
 *   "area" / "floor" → 普通展开按钮
 *   "room"   → 带聚合进度条 + 告警圆点 + (booking模式)双进度条
 *   "shelf"  → 带 type1~4 分色进度条 + 告警圆点，点击跳转
 */
/**
 * 搜索态：该节点自身或任一后代命中关键词。
 *
 * 搜索必须**穿透整棵树**，不能只看当前已渲染的那一层 —— 以前只拿 q 比对「房间」标签，
 * 且只在已展开的分支里生效，所以搜笼架名（201A-1）或没展开时看着像没反应（用户报的「摆设」）。
 */
function subtreeMatches(n: TreeNode, q: string): boolean {
  if (!q) return true;
  if (n.label.toLowerCase().includes(q)) return true;
  return (n.children || []).some(c => subtreeMatches(c, q));
}

/**
 * 房间收藏（笼架信息页左侧树）相关的可选能力。**不传 = 老行为**（其它用到这棵树的弹窗不受影响）。
 * 口径与纯函数实现见 ./campusTreeBookmarkFilter（那边可单测）。
 */
export type { RoomBookmarkOpts } from "./campusTreeBookmarkFilter";

export function renderNode(n: TreeNode, exp: Set<string>, q: string, tg: (k: string) => void, onOpenRoom: (rid: string, rname: string) => void, viewMode?: "room" | "shelf", onOpenShelf?: (sid: string, overrideRoomId?: string) => void, alertStatusesByShelf?: Map<string, Set<string>>, alertStatusesByRoom?: Map<string, Set<string>>, pageMode?: "view" | "allocate" | "booking", bookingRooms?: BookingRoom[], hideProgress?: boolean, highlightShelveIds?: Set<string>, bookmark?: RoomBookmarkOpts): React.ReactNode {
  // 搜索态下自动展开命中路径，并剪掉整条都不命中的分支
  const searching = !!q;
  if (searching && !subtreeMatches(n, q)) return null;
  // 收藏视图：非房间层若整支没有收藏项就不画（笼架自身的取舍交给它所属房间的 children 过滤）
  if (bookmark?.onlyBookmarked && n.type !== "shelf"
    && !subtreeHasBookmarked(n, bookmark.bookmarkedRooms ?? new Set(), bookmark.bookmarkedShelves ?? new Set())) return null;
  const open = searching || exp.has(n.key);
  if (n.type === "shelf") {
    const r = n.raw;
    const handleClick = () => {
      if (pageMode === "booking") {
        onOpenRoom(String(r.roomId), r.roomName);
        if (onOpenShelf) onOpenShelf(String(r.shelveId), String(r.roomId));
        return;
      }
      if (viewMode === "shelf" && onOpenShelf) { onOpenShelf(String(r.shelveId)); return; }
      onOpenRoom(String(r.roomId), r.roomName);
      setTimeout(() => document.getElementById(`shelf-${r.shelveId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    };
    const counts = [r.type3 || 0, r.type1 || 0, r.type4 || 0, r.type2 || 0];
    const colors = ["#f43f5e", "#f59e0b", "#3b82f6", "#10b981"];
    const total = counts.reduce((a: number, b: number) => a + b, 0) || 80;
    const bars = counts.map((c: number, i: number) => ({ pct: Math.round(c / total * 100), color: colors[i] })).filter((b: any) => b.pct > 0);
    const hasData = counts.some((c: number) => c > 0);
    const shelfStatuses = alertStatusesByShelf?.get(String(r.shelveId));
    const DOT: Record<string, string> = { NEED_DIVIDE: "bg-amber-500", HEALTH_ABNORMAL: "bg-purple-500", ANIMAL_TRANSFER: "bg-cyan-500", SPECIAL_FEEDING: "bg-red-500", COHABITATION: "bg-emerald-500" };
    const hasSelectable = !!highlightShelveIds?.has(String(r.shelveId));
    return <button key={n.key} onClick={handleClick}
      className={`w-full text-left rounded-twin-sm border px-2 py-1 transition ml-2 ${
        hasSelectable
          ? "border-red-500 ring-2 ring-red-500/50 bg-red-50/60"
          : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)] hover:border-[var(--twin-hairline-strong)]"
      }`}>
      <div className="flex items-center gap-1"><LayoutGrid className="h-2.5 w-2.5 shrink-0 text-[var(--twin-mute)]" /><span className="truncate text-[10px] font-medium text-[var(--twin-ink)]">{n.label}</span>
      {/* 笼架名后面的收藏星标（同样不能是 <button>：整行就是 button） */}
      {bookmark?.onToggleBookmarkShelf && (() => {
        const sid = String(r.shelveId ?? n.key.replace(/^s:/, ""));
        const on = bookmark.bookmarkedShelves?.has(sid) ?? false;
        const flip = () => bookmark.onToggleBookmarkShelf?.(String(r.roomId ?? ""), sid);
        return <span role="button" tabIndex={0}
          title={on ? "取消收藏该笼架" : "收藏该笼架（在「收藏」里可直达）"}
          onClick={(e) => { e.stopPropagation(); flip(); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); flip(); } }}
          className="shrink-0 cursor-pointer rounded p-0.5 outline-none transition hover:bg-[var(--twin-canvas-soft)] focus-visible:ring-2 focus-visible:ring-[var(--twin-primary)]">
          <Star className={`h-2.5 w-2.5 ${on ? "fill-[var(--twin-link-deep)] text-[var(--twin-link-deep)]" : "text-[var(--twin-mute)]"}`} />
        </span>;
      })()}<LockBadge chain={lockChain(r, "SHELF")} label={n.label} />
      {shelfStatuses && shelfStatuses.size > 0 && <span className="ml-auto shrink-0 flex items-center gap-0.5">{[...shelfStatuses].map(sc => <span key={sc} className={`inline-block w-2 h-2 rounded-full ${DOT[sc] || "bg-red-500"}`} />)}</span>}
      </div>
      {hideProgress ? null : (
        <div className="flex h-1 rounded-full overflow-hidden bg-[var(--twin-canvas-soft)] mt-1">
          {hasData ? bars.map((b: any, i: number) => <div key={i} className="h-full min-w-[2px]" style={{ width: `${b.pct}%`, background: b.color }} />) : <div className="h-full w-full bg-[var(--twin-canvas-soft)]" />}
        </div>
      )}
    </button>;
  }
  if (n.type === "room") {
    // 房间级不再自己过滤：是否显示由上面的 subtreeMatches 统一决定 ——
    // 房间名不命中但里面有命中的笼架时也要露出来，否则搜笼架名会看不到房间。
    const isBooking = pageMode === "booking";
    const bkRoom = isBooking ? bookingRooms?.find(r => String(r.roomId) === n.key.replace("r:", "")) : null;
    const bkBooked = bkRoom?.rentAnimalCageNumber ?? 0;
    const bkUsed = bkRoom?.usedAnimalCageNumber ?? 0;
    const bkTotal = bkRoom?.animalCageNumber ?? 0;
    const bkBookedPct = bkTotal > 0 ? Math.round(bkBooked / bkTotal * 100) : 0;
    const bkUsedPct = bkTotal > 0 ? Math.round(bkUsed / bkTotal * 100) : 0;
    const shelfChildren = n.children.filter(c => c.type === "shelf");
    /**
     * 收藏视图下这间房该显示哪些笼架：收藏了房间 → 整间照常；只收藏了某几架 → 只露那几架
     * （「只收藏了一架」却把整间铺开，收藏视图就没意义了）。非收藏视图原样。
     */
    const kids = bookmark?.onlyBookmarked
      ? visibleShelfChildren(n, bookmark.bookmarkedRooms ?? new Set(), bookmark.bookmarkedShelves ?? new Set())
      : n.children;
    const aggCounts = shelfChildren.reduce((acc, s) => {
      const r = s.raw;
      acc[0] += (r.type3 || 0);
      acc[1] += (r.type1 || 0);
      acc[2] += (r.type4 || 0);
      acc[3] += (r.type2 || 0);
      return acc;
    }, [0, 0, 0, 0]);
    const aggTotal = aggCounts.reduce((a: number, b: number) => a + b, 0) || (shelfChildren.length * 80);
    const colors = ["#f43f5e", "#f59e0b", "#3b82f6", "#10b981"];
    const aggBars = aggCounts.map((c: number, i: number) => ({ pct: Math.round((c / aggTotal) * 100), color: colors[i] })).filter((b: any) => b.pct > 0);
    const aggHasData = aggCounts.some((c: number) => c > 0);
    return <div key={n.key} data-room-key={n.key}>
      <button onClick={() => { tg(n.key); if (isBooking) onOpenRoom(n.key.replace("r:", ""), n.label); }} className="w-full text-left rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 py-1.5 hover:border-[var(--twin-hairline-strong)] transition">
        <div className="flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3 w-3 text-[var(--twin-mute)]" /> : <ChevronRight className="h-3 w-3 text-[var(--twin-mute)]" />}
          {/* 名称**不占满**（去掉 flex-1）：星标要紧挨着名称，不能被推到行尾。
              行尾那点空隙由一个 flex-1 占位撑开，右侧的锁/告警点/架数照旧贴右。 */}
          <span className="min-w-0 truncate text-xs font-medium text-[var(--twin-ink)]">{n.label}</span>
          {/* 房间名后面的收藏星标。**不能是 <button>** —— 它在房间卡片这个 <button> 里面，
              button 套 button 是非法 HTML（CellButton 那边刚踩过）。用 span+role 补键盘可达性。 */}
          {bookmark?.onToggleBookmarkRoom && (() => {
            const rid = roomIdOf(n);
            const on = bookmark.bookmarkedRooms?.has(rid) ?? false;
            const flip = () => bookmark.onToggleBookmarkRoom?.(rid);
            return <span role="button" tabIndex={0}
              title={on ? "取消收藏该房间" : "收藏该房间（在「收藏」里只看这些）"}
              onClick={(e) => { e.stopPropagation(); flip(); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); flip(); } }}
              className="shrink-0 cursor-pointer rounded p-0.5 outline-none transition hover:bg-[var(--twin-canvas-soft)] focus-visible:ring-2 focus-visible:ring-[var(--twin-primary)]">
              <Star className={`h-3 w-3 ${on ? "fill-[var(--twin-link-deep)] text-[var(--twin-link-deep)]" : "text-[var(--twin-mute)]"}`} />
            </span>;
          })()}
          <span className="flex-1" />
          <LockBadge chain={lockChain(n.raw, "ROOM")} label={n.label} />
          {isBooking && bkRoom ? <span className="text-[9px] text-[var(--twin-mute)] shrink-0">约{bkBooked} 用{bkUsed}</span>
          : <>{(() => { const rs = alertStatusesByRoom?.get(n.key.replace("r:", "")); if (!rs || rs.size === 0) return null; const DOT: Record<string, string> = { NEED_DIVIDE: "bg-amber-500", HEALTH_ABNORMAL: "bg-purple-500", ANIMAL_TRANSFER: "bg-cyan-500", SPECIAL_FEEDING: "bg-red-500", COHABITATION: "bg-emerald-500" }; return <span className="shrink-0 flex items-center gap-0.5 ml-1">{[...rs].map(sc => <span key={sc} className={`inline-block w-2 h-2 rounded-full ${DOT[sc] || "bg-red-500"}`} />)}</span>; })()}
          <span className="text-[10px] text-[var(--twin-mute)]">{n.children.length}架</span></>}
        </div>
        {isBooking ? <div className="flex gap-1 mt-1.5">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-[var(--twin-canvas-soft)]">
            {bkBookedPct > 0 ? <div className="h-full rounded-full bg-indigo-500" style={{ width: `${bkBookedPct}%` }} /> : <div className="h-full w-full bg-[var(--twin-canvas-soft)]" />}
          </div>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-[var(--twin-canvas-soft)]">
            {bkUsedPct > 0 ? <div className="h-full rounded-full bg-emerald-500" style={{ width: `${bkUsedPct}%` }} /> : <div className="h-full w-full bg-[var(--twin-canvas-soft)]" />}
          </div>
        </div>
        : (hideProgress ? null : <div className="flex h-1 rounded-full overflow-hidden bg-[var(--twin-canvas-soft)] mt-1.5">
          {aggHasData ? aggBars.map((b: any, i: number) => <div key={i} className="h-full min-w-[2px]" style={{ width: `${b.pct}%`, background: b.color }} />) : <div className="h-full w-full bg-[var(--twin-canvas-soft)]" />}
        </div>)}
      </button>
      {open && kids.length > 0 && <div className="flex flex-col gap-0.5 mt-1 ml-2">{kids.map(s => renderNode(s, exp, q, tg, onOpenRoom, viewMode, onOpenShelf, alertStatusesByShelf, alertStatusesByRoom, pageMode, bookingRooms, hideProgress, highlightShelveIds, bookmark))}</div>}
    </div>;
  }
  return <div key={n.key}>
    <button onClick={() => tg(n.key)} className="w-full flex items-center gap-1 rounded-twin-sm px-1.5 py-1 hover:bg-[var(--twin-canvas-soft)] transition">
      {open ? <ChevronDown className="h-3 w-3 text-[var(--twin-mute)]" /> : <ChevronRight className="h-3 w-3 text-[var(--twin-mute)]" />}
      <span className="truncate">{n.label}</span>
      {n.type === "floor" && <LockBadge chain={lockChain(n.raw, "FLOOR")} label={n.label} />}
    </button>
    {open && <div className="ml-2 space-y-0.5">{n.children.map(c => renderNode(c, exp, q, tg, onOpenRoom, viewMode, onOpenShelf, alertStatusesByShelf, alertStatusesByRoom, pageMode, bookingRooms, hideProgress, highlightShelveIds, bookmark))}</div>}
  </div>;
}
