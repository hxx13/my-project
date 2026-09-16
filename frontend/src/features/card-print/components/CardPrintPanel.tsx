import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchFullTree,
  fetchLocalShelfGridByShelveId,
  type CageShelfDetail,
  type PersistedAlert,
} from "@/api/domains/cageShelf.api";
import { downloadBlob, downloadCardArchive, fetchCardData, generateCardPdf } from "@/api/domains/cardPrint.api";
import type { PrintStationOption } from "@/api/domains/print.api";
import { CardPrintConfirmDialog } from "./CardPrintConfirmDialog";
import CageOpDrawer, { CagePickerTab } from "@/components/cage/CageOpDrawer";
import { buildTree, CampusTree } from "@/features/cage-shelf/components/CampusTree";
import { ShelfGrid } from "@/features/cage-shelf/components/ShelfGrid";
import { CardPreview } from "./CardPreview";
import { POSITION_FIELD } from "../types";
import type { CardSlot, CardSpec, CardTemplate } from "../types";

interface Props {
  templates: CardTemplate[];
  templateId: number | null;
  onTemplateChange: (id: number | null) => void;
  boxSelectMode: boolean;
  onBoxSelectModeChange: (v: boolean) => void;
  /** 全房间=一个房间的所有笼架铺满主区、预览进右抽屉；单笼架=一个架子 + 右侧面板渲染预览 */
  viewMode: ViewMode;
  nameSuffix: string;
  /** 可选打印工位，供确认弹窗里选择 */
  stations: PrintStationOption[];
  onSelectionChange: (selected: number, total: number) => void;
  onMessage: (m: string) => void;
  onBusyChange: (b: boolean) => void;
}

export type ViewMode = "room" | "shelf";

export interface CardPrintPanelHandle {
  generate: () => Promise<void>;
  /** 打开「预览 → 确认 → 派发」弹窗 */
  print: () => void;
}

const inputCls =
  "rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 text-[13px] text-[var(--app-color-text-primary)]";

const EMPTY_MAP: Map<string, Set<string>> = new Map();
const EMPTY_ALERTS: Map<string, PersistedAlert> = new Map();

export const CardPrintPanel = forwardRef<CardPrintPanelHandle, Props>(function CardPrintPanel(
  { templates, templateId, onTemplateChange, boxSelectMode, onBoxSelectModeChange, viewMode, nameSuffix, stations, onSelectionChange, onMessage, onBusyChange },
  ref,
) {
  const [exp, setExp] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<CageShelfDetail | null>(null);
  /** 全房间模式：当前房间各笼架的网格（单笼架模式下不用） */
  const [roomDetails, setRoomDetails] = useState<CageShelfDetail[]>([]);
  const [roomName, setRoomName] = useState("");
  const [loading, setLoading] = useState(false);
  /** 全房间模式下右抽屉的开合（单笼架模式的预览走右栏，不用抽屉） */
  const [previewOpen, setPreviewOpen] = useState(true);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const anchorRef = useRef<{ shelveId: string; x: number; y: number } | null>(null);
  /** 已加载的房间 id：同一房间重复点击只当「定位」，不重载、不清已选 */
  const roomIdRef = useRef("");

  // 全量树数据 —— 与 AdminCageShelfPage 同 key，命中其缓存
  const { data: fullTree = [] } = useQuery({
    queryKey: ["cageShelfFullTree"],
    queryFn: fetchFullTree,
  });
  const tree = useMemo(() => buildTree(fullTree), [fullTree]);

  // 房间 → 该房间的笼架列表（全量扁平行按 roomId 聚合，做法同 AdminCageShelfPage 的 roomShelveMap）
  const roomShelveMap = useMemo(() => {
    const m = new Map<string, { shelveId: string; shelveName: string }[]>();
    for (const r of fullTree) {
      const rid = String(r.roomId ?? "");
      if (!rid) continue;
      if (!m.has(rid)) m.set(rid, []);
      m.get(rid)!.push({ shelveId: String(r.shelveId ?? ""), shelveName: r.shelveName || String(r.shelveId) });
    }
    return m;
  }, [fullTree]);

  // 首屏默认展开前两级（校区 + 区域）
  const expInited = useRef(false);
  useEffect(() => {
    if (expInited.current || tree.length === 0) return;
    const keys = new Set<string>();
    for (const c of tree) {
      keys.add(c.key);
      for (const n of c.children) keys.add(n.key);
    }
    setExp(keys);
    expInited.current = true;
  }, [tree]);

  /** 分母：全房间模式=已加载各架格数之和；单笼架模式=该架格数 */
  const totalCells = useMemo(
    () => (viewMode === "room"
      ? roomDetails.reduce((n, d) => n + (d.grid?.length ?? 0), 0)
      : detail?.grid.length ?? 0),
    [viewMode, roomDetails, detail],
  );

  useEffect(() => {
    onSelectionChange(selectedCells.size, totalCells);
  }, [selectedCells, totalCells, onSelectionChange]);

  /**
   * 框选模式开关一变就丢掉锚点。两种手势共用 anchorRef：单击/Shift 矩形留下一格锚点后，
   * 若带着它进框选模式，第一次点击会被当成「第二下」——直接按「上次单击格 → 本次点击格」
   * 画出矩形并立刻退出模式，看着就像框选默认拿上次单选的那格当起点。
   */
  useEffect(() => { anchorRef.current = null; }, [boxSelectMode]);

  /**
   * 切模式即清空已选：两个模式加载的架子集合不同，留着会出现「看不见但已选」的静默状态。
   * 同时决定预览落点——全房间模式进右抽屉（主区要让给多架网格），单笼架模式回右栏。
   */
  useEffect(() => {
    setSelectedCells(new Set());
    anchorRef.current = null;
    setPreviewOpen(viewMode === "room");
  }, [viewMode]);

  /** 清空已选与手势残留（换房间 / 换架子都要走这一份，别各写一遍） */
  const resetSelection = () => {
    setSelectedCells(new Set());
    anchorRef.current = null;
    onBoxSelectModeChange(false);
  };

  const pickShelf = async (shelveId: string) => {
    onMessage("");
    setLoading(true);
    setDetail(null);
    try {
      const d = await fetchLocalShelfGridByShelveId(shelveId);
      setDetail(d);
      resetSelection();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "加载笼位失败");
    } finally {
      setLoading(false);
    }
  };

  /**
   * 全房间模式：点房间 → 一次拉完该房间各架网格（Promise.all，与笼架页本地数据源同款）。
   * 同一房间重复点击（树上点笼架名做定位）直接返回：不重载、不清已选 ——
   * 定位交给 CampusTree 自己的 `scrollIntoView('#shelf-<sid>')`。
   * 否则每次「点笼架名定位」都会把整房间重拉一遍并清掉已选。
   */
  const openRoom = async (rid: string, rname: string) => {
    if (rid === roomIdRef.current) return;
    roomIdRef.current = rid;
    onMessage("");
    resetSelection();
    setRoomDetails([]);
    setRoomName(rname);
    setDetail(null);
    const shelves = roomShelveMap.get(rid) ?? [];
    if (shelves.length === 0) return;
    setLoading(true);
    try {
      const results = await Promise.all(
        shelves.map((s) => fetchLocalShelfGridByShelveId(s.shelveId).catch(() => null)),
      );
      setRoomDetails(results.filter((r): r is CageShelfDetail => r !== null));
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "加载房间笼位失败");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCell = (shelveId: string, x: number, y: number, shiftKey?: boolean) => {
    if (boxSelectMode) {
      const anchor = anchorRef.current;
      // 起点必须落在同一架：全房间模式多架并排，跨架取矩形会把另一架的同名坐标一起画进去
      if (!anchor || anchor.shelveId !== shelveId) {
        anchorRef.current = { shelveId, x, y };
        return;
      }
      // 第二次点击：按锚点所在架框选矩形并关闭模式
      setSelectedCells((prev) => {
        const next = new Set(prev);
        const minX = Math.min(anchor.x, x), maxX = Math.max(anchor.x, x);
        const minY = Math.min(anchor.y, y), maxY = Math.max(anchor.y, y);
        for (let cx = minX; cx <= maxX; cx++)
          for (let cy = minY; cy <= maxY; cy++) next.add(`${anchor.shelveId}:${cx}:${cy}`);
        return next;
      });
      anchorRef.current = null;
      onBoxSelectModeChange(false);
      return;
    }
    setSelectedCells((prev) => {
      const next = new Set(prev);
      const anchor = anchorRef.current;
      if (shiftKey && anchor && anchor.shelveId === shelveId) {
        // Shift+Click → 选中锚点与当前格之间的矩形区域（只加不减）
        const minX = Math.min(anchor.x, x), maxX = Math.max(anchor.x, x);
        const minY = Math.min(anchor.y, y), maxY = Math.max(anchor.y, y);
        for (let cx = minX; cx <= maxX; cx++)
          for (let cy = minY; cy <= maxY; cy++) next.add(`${shelveId}:${cx}:${cy}`);
        return next;
      }
      const key = `${shelveId}:${x}:${y}`;
      next.has(key) ? next.delete(key) : next.add(key);
      anchorRef.current = { shelveId, x, y };
      return next;
    });
  };

  /** shelveId → 该架「x:y → animalCageId」。全房间模式查 roomDetails，单笼架模式查 detail。 */
  const cellsByShelveId = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    const list = viewMode === "room" ? roomDetails : detail ? [detail] : [];
    for (const d of list) {
      const sid = String(d.shelfMeta?.shelveId ?? "");
      if (!sid) continue;
      const byPos = new Map<string, string>();
      for (const c of d.grid ?? []) if (c.id) byPos.set(`${c.x}:${c.y}`, String(c.id));
      m.set(sid, byPos);
    }
    return m;
  }, [viewMode, roomDetails, detail]);

  // 选中键 `${shelveId}:${x}:${y}` → animalCageId（雪花 ID 全程 string）
  const selectedCageIds = useMemo(() => {
    const ids: string[] = [];
    for (const key of selectedCells) {
      const [sid, ...pos] = key.split(":");
      const cageId = cellsByShelveId.get(sid)?.get(pos.join(":"));
      if (cageId) ids.push(cageId);
    }
    return ids;
  }, [selectedCells, cellsByShelveId]);

  // 右侧预览：selectedCageIds 变化 → 300ms 防抖 → 取前 10 个笼位真实数据
  useEffect(() => {
    if (selectedCageIds.length === 0) {
      setPreviewRows([]);
      return;
    }
    const ids = selectedCageIds.slice(0, 10);
    const t = setTimeout(async () => {
      try {
        setPreviewRows(await fetchCardData(ids));
      } catch (e) {
        onMessage(e instanceof Error ? e.message : "预览加载失败");
      }
    }, 300);
    return () => clearTimeout(t);
  }, [selectedCageIds, onMessage]);

  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );
  const spec = useMemo<CardSpec | null>(() => {
    if (!activeTemplate) return null;
    try {
      return JSON.parse(activeTemplate.specJson) as CardSpec;
    } catch {
      return null;
    }
  }, [activeTemplate]);
  const slots = useMemo<CardSlot[]>(() => {
    if (!activeTemplate) return [];
    try {
      return JSON.parse(activeTemplate.slotsJson) as CardSlot[];
    } catch {
      return [];
    }
  }, [activeTemplate]);

  const generate = async () => {
    if (!templateId || selectedCageIds.length === 0) {
      onMessage("请先选择模板与至少一个笼位");
      return;
    }
    onBusyChange(true);
    onMessage("");
    try {
      const r = await generateCardPdf(templateId, selectedCageIds, nameSuffix);
      if (r) {
        onMessage(`已生成 ${r.pageCount} 页：${r.fileName}`);
        downloadBlob(await downloadCardArchive(r.archiveId), r.fileName);
      }
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "生成失败");
    } finally {
      onBusyChange(false);
    }
  };

  /** 打印走「先预览再确认」：弹窗自己负责生成 PDF 并把真实产物画出来给用户看。 */
  const openPrint = () => {
    if (!templateId || selectedCageIds.length === 0) {
      onMessage("请先选择模板与至少一个笼位");
      return;
    }
    onMessage("");
    setConfirmOpen(true);
  };

  useImperativeHandle(ref, () => ({ generate, print: openPrint }));

  /** 卡面预览：全房间模式进右抽屉、单笼架模式放右栏，两处共用同一份 */
  const renderPreview = () =>
    !activeTemplate ? (
      <div className="text-[13px] text-[var(--app-color-text-tertiary)]">请先选择模板</div>
    ) : selectedCageIds.length === 0 ? (
      <div className="text-[13px] text-[var(--app-color-text-tertiary)]">请在网格中选择笼位</div>
    ) : (
      <div className="flex flex-col items-center gap-3">
        {previewRows.map((row, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            {spec ? <CardPreview spec={spec} slots={slots} sample={row} /> : null}
            <span className="text-[11px] text-[var(--app-color-text-tertiary)]">{row[POSITION_FIELD] ?? ""}</span>
          </div>
        ))}
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 封顶高度：外壳自身不约束高度，必须在这里扣掉顶栏+页边距+工具行（-51px = 工具行 38 + pt-3 12） */}
      <div className="flex min-h-0 flex-1 gap-3"
        style={{ maxHeight: "calc(100dvh - var(--admin-chrome-offset) - 51px)", minHeight: "420px" }}>
        {/* 左栏：层级树 */}
        <div className="w-[240px] shrink-0 min-h-0 overflow-y-auto overscroll-y-contain rounded-xl border border-[var(--app-color-border-default)] p-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索校区/房间/笼架…" className={inputCls + " mb-2 w-full"} />
          <CampusTree
            tree={tree}
            exp={exp}
            search={search}
            onToggle={(k) => setExp((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; })}
            onOpenRoom={(rid, rname) => void openRoom(rid, rname)}
            viewMode={viewMode}
            onOpenShelf={(shelveId) => void pickShelf(shelveId)}
            alertStatusesByShelf={EMPTY_MAP}
            alertStatusesByRoom={EMPTY_MAP}
            hideProgress
          />
        </div>

        {/* 中栏：笼位网格。全房间模式铺开整个房间（两列），单笼架模式只有一架 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--app-color-border-default)]">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3">
            {viewMode === "room" ? (
              loading && roomDetails.length === 0 ? (
                <div className="grid h-full place-items-center text-[13px] text-[var(--app-color-text-tertiary)]">正在加载房间笼位…</div>
              ) : roomDetails.length === 0 ? (
                <div className="grid h-full place-items-center text-center text-[13px] text-[var(--app-color-text-tertiary)]">
                  点击房间下的笼架
                  <br />
                  <span className="text-[11px]">点笼架后铺开该房间所有笼架（与笼架信息页同款）</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {roomDetails.map((d) => {
                    const sid = String(d.shelfMeta?.shelveId ?? "");
                    return (
                      // id 是 CampusTree 房间模式下「点笼架名定位」的锚点，必须带
                      <div key={sid} id={`shelf-${sid}`}>
                        <ShelfGrid
                          title={d.shelfMeta?.shelveName ?? sid}
                          detail={d}
                          loading={false}
                          alertMap={EMPTY_ALERTS}
                          selectable
                          clickMode="toggle"
                          selectedCells={selectedCells}
                          onToggleCell={handleToggleCell}
                        />
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <ShelfGrid
                title={detail?.shelfMeta?.shelveName ?? "未选择笼架"}
                detail={detail}
                loading={loading}
                emptyHint="在左侧选择笼架后，此处显示该架笼位"
                alertMap={EMPTY_ALERTS}
                selectable
                clickMode="toggle"
                selectedCells={selectedCells}
                onToggleCell={handleToggleCell}
              />
            )}
          </div>
        </div>

        {/* 右栏：只服务单笼架模式；全房间模式的预览走右抽屉，主区要让给多架网格 */}
        {viewMode === "shelf" ? (
          <div className="w-[320px] shrink-0 min-h-0 overflow-y-auto overscroll-y-contain rounded-xl border border-[var(--app-color-border-default)] p-3">
            {renderPreview()}
          </div>
        ) : null}
      </div>

      {/* 全房间模式：预览进通用右抽屉；关掉时右边缘留一枚细标签再点开 */}
      {viewMode === "room" ? (
        previewOpen ? (
          <CageOpDrawer
            title="卡面预览"
            countText={`已选 ${selectedCageIds.length}`}
            hint={roomName ? `${roomName} · 最多预览 10 张` : undefined}
            collapseLabel="卡面预览"
            onClose={() => setPreviewOpen(false)}
          >
            {renderPreview()}
          </CageOpDrawer>
        ) : (
          <CagePickerTab label="卡面预览" onClick={() => setPreviewOpen(true)} />
        )
      ) : null}

      {templateId ? (
        <CardPrintConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          templateId={templateId}
          cageIds={selectedCageIds}
          nameSuffix={nameSuffix}
          stations={stations}
        />
      ) : null}
    </div>
  );
});
