import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchFullTree,
  fetchLocalShelfGridByShelveId,
  type CageShelfDetail,
  type PersistedAlert,
} from "@/api/domains/cageShelf.api";
import { downloadBlob, downloadCardArchive, fetchCardData, generateCardPdf } from "@/api/domains/cardPrint.api";
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
  nameSuffix: string;
  onSelectionChange: (selected: number, total: number) => void;
  onMessage: (m: string) => void;
  onBusyChange: (b: boolean) => void;
}

export interface CardPrintPanelHandle {
  generate: () => Promise<void>;
}

const inputCls =
  "rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 text-[13px] text-[var(--app-color-text-primary)]";

const EMPTY_MAP: Map<string, Set<string>> = new Map();
const EMPTY_ALERTS: Map<string, PersistedAlert> = new Map();

export const CardPrintPanel = forwardRef<CardPrintPanelHandle, Props>(function CardPrintPanel(
  { templates, templateId, onTemplateChange, boxSelectMode, onBoxSelectModeChange, nameSuffix, onSelectionChange, onMessage, onBusyChange },
  ref,
) {
  const [exp, setExp] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<CageShelfDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const anchorRef = useRef<{ shelveId: string; x: number; y: number } | null>(null);

  // 全量树数据 —— 与 AdminCageShelfPage 同 key，命中其缓存
  const { data: fullTree = [] } = useQuery({
    queryKey: ["cageShelfFullTree"],
    queryFn: fetchFullTree,
  });
  const tree = useMemo(() => buildTree(fullTree), [fullTree]);

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

  useEffect(() => {
    onSelectionChange(selectedCells.size, detail?.grid.length ?? 0);
  }, [selectedCells, detail, onSelectionChange]);

  const pickShelf = async (shelveId: string) => {
    onMessage("");
    setLoading(true);
    setDetail(null);
    try {
      const d = await fetchLocalShelfGridByShelveId(shelveId);
      setDetail(d);
      setSelectedCells(new Set());
      anchorRef.current = null;
      onBoxSelectModeChange(false);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "加载笼位失败");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCell = (shelveId: string, x: number, y: number, shiftKey?: boolean) => {
    if (boxSelectMode) {
      const anchor = anchorRef.current;
      if (!anchor) {
        // 第一次点击：只设起点，不选
        anchorRef.current = { shelveId, x, y };
        return;
      }
      // 第二次点击：框选矩形并关闭模式
      setSelectedCells((prev) => {
        const next = new Set(prev);
        const minX = Math.min(anchor.x, x), maxX = Math.max(anchor.x, x);
        const minY = Math.min(anchor.y, y), maxY = Math.max(anchor.y, y);
        for (let cx = minX; cx <= maxX; cx++)
          for (let cy = minY; cy <= maxY; cy++) next.add(`${shelveId}:${cx}:${cy}`);
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

  // 选中键 `${shelveId}:${x}:${y}` → animalCageId（雪花 ID 全程 string）
  const selectedCageIds = useMemo(() => {
    const ids: string[] = [];
    for (const key of selectedCells) {
      const [sid, xs, ys] = key.split(":");
      if (!detail || String(detail.shelfMeta?.shelveId) !== sid) continue;
      const cell = detail.grid.find((c) => c.x === Number(xs) && c.y === Number(ys));
      if (cell?.id) ids.push(String(cell.id));
    }
    return ids;
  }, [selectedCells, detail]);

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

  useImperativeHandle(ref, () => ({ generate }));

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
            onOpenRoom={() => {}}
            viewMode="shelf"
            onOpenShelf={(shelveId) => void pickShelf(shelveId)}
            alertStatusesByShelf={EMPTY_MAP}
            alertStatusesByRoom={EMPTY_MAP}
            hideProgress
          />
        </div>

        {/* 中栏：笼位网格 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--app-color-border-default)]">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3">
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
          </div>
        </div>

        {/* 右栏：卡牌预览（真实数据） */}
        <div className="w-[320px] shrink-0 min-h-0 overflow-y-auto overscroll-y-contain rounded-xl border border-[var(--app-color-border-default)] p-3">
          {!activeTemplate ? (
            <div className="text-[13px] text-[var(--app-color-text-tertiary)]">请先选择模板</div>
          ) : selectedCageIds.length === 0 ? (
            <div className="text-[13px] text-[var(--app-color-text-tertiary)]">请在中间网格选择笼位</div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              {previewRows.map((row, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  {spec ? <CardPreview spec={spec} slots={slots} sample={row} /> : null}
                  <span className="text-[11px] text-[var(--app-color-text-tertiary)]">{row[POSITION_FIELD] ?? ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
