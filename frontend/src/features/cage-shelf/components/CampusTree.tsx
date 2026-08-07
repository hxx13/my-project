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
import { ChevronDown, ChevronRight, LayoutGrid } from "lucide-react";
import { CAMPUS_ORDER, cs, type TreeNode } from "../constants";
import type { CageShelfTreeNode, BookingRoom } from "@/api/domains/cageShelf.api";

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
export function CampusTree({ tree, exp, search, onToggle, onOpenRoom, viewMode, onOpenShelf, alertStatusesByShelf, alertStatusesByRoom, pageMode, bookingRooms }: {
  tree: TreeNode[]; exp: Set<string>; search: string; onToggle: (k: string) => void; onOpenRoom: (roomId: string, roomName: string) => void;
  viewMode: "room" | "shelf"; onOpenShelf: (shelveId: string, overrideRoomId?: string) => void;
  alertStatusesByShelf: Map<string, Set<string>>; alertStatusesByRoom: Map<string, Set<string>>;
  pageMode?: "view" | "allocate" | "booking"; bookingRooms?: BookingRoom[];
}) {
  const q = search.trim().toLowerCase();
  const tg = (k: string) => { const n = new Set(exp); n.has(k) ? n.delete(k) : n.add(k); onToggle(k); };
  return <div className="text-[11px] space-y-1.5">
    {tree.map(c => { const open = exp.has(c.key), sty = cs(c.label);
      return <div key={c.key}>
        <button onClick={() => tg(c.key)} className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-twin-lg text-left shadow-sm active:scale-[0.99] transition" style={{ background: sty.bg }}>
          {open ? <ChevronDown className="h-3.5 w-3.5 text-white/80" /> : <ChevronRight className="h-3.5 w-3.5 text-white/80" />}
          <span className="flex-1 truncate text-xs font-bold" style={{ color: sty.text }}>{c.label}校区</span>
        </button>
        {open && <div className="mt-1 ml-1 space-y-0.5">{c.children.map(n => renderNode(n, exp, q, tg, onOpenRoom, viewMode, onOpenShelf, alertStatusesByShelf, alertStatusesByRoom, pageMode, bookingRooms))}</div>}
      </div>;
    })}
    {tree.length === 0 && <div className="text-[var(--twin-mute)] py-6 text-center">暂无数据，请先导入 CSV</div>}
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
export function renderNode(n: TreeNode, exp: Set<string>, q: string, tg: (k: string) => void, onOpenRoom: (rid: string, rname: string) => void, viewMode?: "room" | "shelf", onOpenShelf?: (sid: string, overrideRoomId?: string) => void, alertStatusesByShelf?: Map<string, Set<string>>, alertStatusesByRoom?: Map<string, Set<string>>, pageMode?: "view" | "allocate" | "booking", bookingRooms?: BookingRoom[]): React.ReactNode {
  const open = exp.has(n.key);
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
    return <button key={n.key} onClick={handleClick}
      className="w-full text-left rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 hover:border-[var(--twin-hairline-strong)] transition ml-2">
      <div className="flex items-center gap-1"><LayoutGrid className="h-2.5 w-2.5 shrink-0 text-[var(--twin-mute)]" /><span className="truncate text-[10px] font-medium text-[var(--twin-ink)]">{n.label}</span>
      {shelfStatuses && shelfStatuses.size > 0 && <span className="ml-auto shrink-0 flex items-center gap-0.5">{[...shelfStatuses].map(sc => <span key={sc} className={`inline-block w-2 h-2 rounded-full ${DOT[sc] || "bg-red-500"}`} />)}</span>}
      </div>
      <div className="flex h-1 rounded-full overflow-hidden bg-[var(--twin-canvas-soft)] mt-1">
        {hasData ? bars.map((b: any, i: number) => <div key={i} className="h-full min-w-[2px]" style={{ width: `${b.pct}%`, background: b.color }} />) : <div className="h-full w-full bg-[var(--twin-canvas-soft)]" />}
      </div>
    </button>;
  }
  if (n.type === "room") {
    const filtered = q ? n.label.toLowerCase().includes(q) : true;
    if (!filtered) return null;
    const isBooking = pageMode === "booking";
    const bkRoom = isBooking ? bookingRooms?.find(r => String(r.roomId) === n.key.replace("r:", "")) : null;
    const bkBooked = bkRoom?.rentAnimalCageNumber ?? 0;
    const bkUsed = bkRoom?.usedAnimalCageNumber ?? 0;
    const bkTotal = bkRoom?.animalCageNumber ?? 0;
    const bkBookedPct = bkTotal > 0 ? Math.round(bkBooked / bkTotal * 100) : 0;
    const bkUsedPct = bkTotal > 0 ? Math.round(bkUsed / bkTotal * 100) : 0;
    const shelfChildren = n.children.filter(c => c.type === "shelf");
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
          <span className="flex-1 truncate text-xs font-medium text-[var(--twin-ink)]">{n.label}</span>
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
        : <div className="flex h-1 rounded-full overflow-hidden bg-[var(--twin-canvas-soft)] mt-1.5">
          {aggHasData ? aggBars.map((b: any, i: number) => <div key={i} className="h-full min-w-[2px]" style={{ width: `${b.pct}%`, background: b.color }} />) : <div className="h-full w-full bg-[var(--twin-canvas-soft)]" />}
        </div>}
      </button>
      {open && n.children.length > 0 && <div className="flex flex-col gap-0.5 mt-1 ml-2">{n.children.map(s => renderNode(s, exp, q, tg, onOpenRoom, viewMode, onOpenShelf, alertStatusesByShelf, alertStatusesByRoom, pageMode, bookingRooms))}</div>}
    </div>;
  }
  return <div key={n.key}>
    <button onClick={() => tg(n.key)} className="w-full flex items-center gap-1 rounded-twin-sm px-1.5 py-1 hover:bg-[var(--twin-canvas-soft)] transition">
      {open ? <ChevronDown className="h-3 w-3 text-[var(--twin-mute)]" /> : <ChevronRight className="h-3 w-3 text-[var(--twin-mute)]" />}
      <span className="truncate">{n.label}</span>
    </button>
    {open && <div className="ml-2 space-y-0.5">{n.children.map(c => renderNode(c, exp, q, tg, onOpenRoom, viewMode, onOpenShelf, alertStatusesByShelf, alertStatusesByRoom, pageMode, bookingRooms))}</div>}
  </div>;
}
