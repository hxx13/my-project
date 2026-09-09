/**
 * AssetVisualView — 资产记录 · 图形视图（三栏可视化）
 *
 * 三栏：左「地点树」 + 中「分级画布」 + 右「空间管理面板」。
 * 布局与交互对齐物品台账 InventoryVisualView（FloorCanvas + RoomDetailPanel + ItemDetailDrawer）：
 * 中栏点子空间卡片下钻，卡片内是资产芯片（可拖到左树改地点、点击开右侧抽屉）；
 * 右栏按「本空间 / 各子空间」分组列资产徽标，底部新增资产 / 申请转移。
 *
 * 数据流：
 *   useAssetLocationTree() → AssetLocationNode[]（左树 / 中栏面包屑 / 右栏路径共用）
 *   选中节点 → useAssetList({ locationNodeIds: [节点, ...直接子节点] }) 一次拉取（逗号分隔传参），
 *     前端按 row.locationNodeId 分组，落到中栏各子空间卡片与右栏各分区。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRightLeft, ChevronRight, Plus, Search, Settings, Smile, X } from "lucide-react";
import type { AssetLocationNode } from "@/api/domains/assetLocation.api";
import type { AssetRow } from "@/api/domains/asset.api";
import {
  useAssetLocationTree,
  useCreateAssetLocation,
  useUpdateAssetLocation,
  useDeleteAssetLocation,
  useMoveAssetLocation,
} from "@/api/hooks/useAssetLocation";
import { useAssetList } from "@/api/hooks/useAsset";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import { Portal } from "@/components/Portal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AssetTransferApplyModal from "@/components/asset/AssetTransferApplyModal";
import { AutoImage } from "@/components/ui/AutoImage";
import EmojiPicker from "@/components/ui/EmojiPicker";
import { assetStatusLabel } from "./assetEditableFields";
import { categoryColor } from "@/features/inventory/constants";
import LocationTree from "./LocationTree";
import AssetDetailDrawer from "./AssetDetailDrawer";
import { collectDescendantIds, findPath } from "./locationTreeUtils";

const CATEGORY_KEY = "col_资产类别";
const USER_KEY = "col_使用人";

/** 状态点颜色：NORMAL/在用 绿，报废/停用 灰，其余橙 */
function statusDotColor(status?: string | null) {
  const v = (status ?? "").trim().toUpperCase();
  if (!v || v === "NORMAL" || v === "在用" || v === "正常") return "#10b981";
  if (v === "SCRAPPED" || v === "报废" || v === "DISABLED" || v === "停用") return "#94a3b8";
  return "#f59e0b";
}

/** 无照片时的兜底图标：优先资产自身 icon（后端预置），再否则包裹 */
function iconOf(row: AssetRow): string {
  return row.icon?.trim() || "📦";
}

function firstPhoto(row: AssetRow): string | null {
  const u = (row.photoUrls ?? []).find((x): x is string => typeof x === "string" && x.trim().length > 0);
  return u ?? null;
}

/* ────────────────────────────────────────────────────────────
   资产卡片（本空间资产：大图 / emoji 兜底）
   ──────────────────────────────────────────────────────────── */
function AssetCard({ row, onOpen }: { row: AssetRow; onOpen: (r: AssetRow) => void }) {
  const photo = firstPhoto(row);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/asset-id", row.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onOpen(row)}
      title="拖到左侧地点可移动资产"
      className="flex cursor-grab flex-col overflow-hidden rounded-twin-lg border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] shadow-sm transition hover:border-[var(--twin-link-deep)] active:cursor-grabbing"
    >
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]">
        {photo ? (
          <AutoImage src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[40px] leading-none">{iconOf(row)}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 p-2.5">
        <span className="truncate text-[13px] font-semibold text-[var(--twin-ink)]" title={row.assetName}>
          {row.assetName}
        </span>
        <span className="truncate text-[11px] text-[var(--twin-mute)]">
          使用人 {row.dynamicValues?.[USER_KEY] || "—"}
        </span>
        <span className="truncate font-mono text-[10px] text-[var(--twin-mute)]">{row.assetCode}</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   资产芯片（卡片内用 div：外层卡片是 button，不能套 button）
   ──────────────────────────────────────────────────────────── */
function AssetChip({ row, onOpen }: { row: AssetRow; onOpen: (r: AssetRow) => void }) {
  const photo = firstPhoto(row);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/asset-id", row.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(row);
      }}
      title="拖到左侧地点可移动资产"
      className="flex min-w-0 cursor-grab items-center gap-1 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-1.5 py-1 transition hover:border-[var(--twin-link-deep)] active:cursor-grabbing"
    >
      {photo ? (
        <span className="inline-block h-4 w-4 shrink-0 overflow-hidden rounded-sm">
          <AutoImage src={photo} alt="" className="h-full w-full object-cover" />
        </span>
      ) : (
        <span className="shrink-0 text-[15px] leading-none">{iconOf(row)}</span>
      )}
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[11px] text-[var(--twin-ink)]" title={row.assetName}>
          {row.assetName}
        </span>
        <span className="truncate font-mono text-[9px] text-[var(--twin-mute)]">{row.assetCode}</span>
      </span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   子空间卡片（点击下钻）
   ──────────────────────────────────────────────────────────── */
function SpaceCard({ node, chips, onSelect, onOpen }: {
  node: AssetLocationNode;
  chips: AssetRow[];
  onSelect: (id: number) => void;
  onOpen: (r: AssetRow) => void;
}) {
  const hasChildren = (node.children ?? []).length > 0;
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className="relative flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-twin-lg border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] p-3 text-left shadow-sm transition hover:border-[var(--twin-link-deep)]"
    >
      <div className="flex items-center gap-2">
        <span
          className="h-3.5 w-1 shrink-0 rounded-full"
          style={{ background: chips.length > 0 ? categoryColor(chips[0].dynamicValues?.[CATEGORY_KEY]) : "#a1a1a1" }}
        />
        {node.icon && <span className="shrink-0 text-[14px] leading-none">{node.icon}</span>}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--twin-ink)]">{node.name}</span>
        <span className="shrink-0 rounded-full bg-[var(--twin-canvas-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--twin-mute)]">
          共 {node.totalCount ?? 0} 件
        </span>
        {hasChildren && <span className="shrink-0 text-[10px] text-[var(--twin-link-deep)]">▸ 进入</span>}
      </div>
      {chips.length > 0 && (
        <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5">
          {chips.map((r) => (
            <AssetChip key={r.id} row={r} onOpen={onOpen} />
          ))}
        </div>
      )}
      {/* 下一级地点：点它继续下钻 */}
      {hasChildren && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {(node.children ?? []).slice(0, 6).map((c) => (
            <div
              key={c.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(c.id);
              }}
              title={c.name}
              className="inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-0.5 text-[10px] text-[var(--twin-body)] transition hover:border-[var(--twin-link-deep)]"
            >
              <span className="truncate">{c.name}</span>
              <span className="shrink-0 text-[var(--twin-mute)]">{c.totalCount ?? 0}</span>
            </div>
          ))}
          {(node.children ?? []).length > 6 && (
            <span className="self-center text-[10px] text-[var(--twin-mute)]">
              +{(node.children ?? []).length - 6}
            </span>
          )}
        </div>
      )}
      {chips.length === 0 && !hasChildren && (
        <div className="mt-2 text-[11px] text-[var(--twin-mute)]">暂无资产</div>
      )}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────
   右栏分组卡片（本空间 / 子空间）
   ──────────────────────────────────────────────────────────── */
function SpaceGroup({ title, subTotal, rows, childNodes, onSelect, onOpen }: {
  title: string;
  /** 该空间含下级的资产总数（用于头部计数，避免「有下级但本级 0 件」的误导） */
  subTotal: number;
  rows: AssetRow[];
  /** 下一级地点（有则列出，可点进去） */
  childNodes?: AssetLocationNode[];
  onSelect?: (id: number) => void;
  onOpen: (r: AssetRow) => void;
}) {
  return (
    <div className="mb-2.5 overflow-hidden rounded-twin-md border border-[var(--twin-hairline)]">
      <div className="flex items-center gap-1.5 bg-[var(--twin-canvas-soft)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--twin-ink)]">
        <span className="truncate">{title}</span>
        <span className="ml-auto shrink-0 text-[10px] font-normal text-[var(--twin-mute)]">共 {subTotal} 件</span>
      </div>
      <div className="flex flex-wrap gap-1.5 p-2">
        {rows.length ? (
          rows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpen(r)}
              className="inline-flex max-w-full items-center gap-1.5 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-left transition hover:border-[var(--twin-link-deep)]"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: statusDotColor(r.status) }}
                title={assetStatusLabel(r.status)}
              />
              {firstPhoto(r) ? (
                <span className="inline-block h-4 w-4 shrink-0 overflow-hidden rounded-sm">
                  <AutoImage src={firstPhoto(r)!} alt="" className="h-full w-full object-cover" />
                </span>
              ) : (
                <span className="shrink-0 text-[14px] leading-none">{iconOf(r)}</span>
              )}
              <span className="flex min-w-0 flex-col leading-tight">
                <b className="truncate text-[11px] font-medium text-[var(--twin-ink)]">{r.assetName}</b>
                <span className="truncate text-[9px] text-[var(--twin-mute)]">
                  使用人 {r.dynamicValues?.[USER_KEY] || "—"}
                </span>
              </span>
            </button>
          ))
        ) : (
          <span className="text-[10px] text-[var(--twin-mute)]">
            {subTotal > 0 ? "资产在下级地点内" : "暂无资产"}
          </span>
        )}
        {(childNodes ?? []).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect?.(c.id)}
            title={c.name}
            className="inline-flex max-w-full items-center gap-1 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-0.5 text-[10px] text-[var(--twin-body)] transition hover:border-[var(--twin-link-deep)]"
          >
            <span className="truncate">{c.name}</span>
            <span className="shrink-0 text-[var(--twin-mute)]">{c.totalCount ?? 0}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AssetVisualView(props: { onCreateAsset?: () => void }) {
  const { onCreateAsset } = props;
  const { data: tree = [], isLoading: treeLoading, isError: treeError } = useAssetLocationTree();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [keyword, setKeyword] = useState("");
  const [assetKeyword, setAssetKeyword] = useState("");
  // 检索模式：local=客户端过滤当前节点（默认）；global=服务端跨全部资产检索。
  // 两种模式共用同一个输入框，切换模式时清空关键词（见 switchSearchMode），互不污染。
  const [searchMode, setSearchMode] = useState<"local" | "global">("local");
  // 全局检索防抖 400ms 后的关键词（本地点模式不使用）
  const [globalKeyword, setGlobalKeyword] = useState("");
  // 从全局结果跳转地点时，抑制「换地点关抽屉」的一次性副作用
  const keepDrawerOnNavRef = useRef(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetRow | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<AssetLocationNode | null>(null);
  const [moveParentId, setMoveParentId] = useState("");
  const [iconTarget, setIconTarget] = useState<AssetLocationNode | null>(null);

  const createMut = useCreateAssetLocation();
  const updateMut = useUpdateAssetLocation();
  const deleteMut = useDeleteAssetLocation();
  const moveMut = useMoveAssetLocation();

  // 首次加载：选中第一个节点并展开其祖先链
  useEffect(() => {
    if (selectedId != null || tree.length === 0) return;
    const first = tree[0];
    setSelectedId(first.id);
    setExpanded(new Set(findPath(tree, first.id).map((n) => n.id)));
  }, [tree, selectedId]);

  const path = useMemo(() => (selectedId == null ? [] : findPath(tree, selectedId)), [tree, selectedId]);
  const node: AssetLocationNode | null = path.length > 0 ? path[path.length - 1] : null;
  const pathText = useMemo(() => path.map((n) => n.name).join(" / "), [path]);
  const children = useMemo(() => node?.children ?? [], [node]);

  // 选中节点 + 其直接子节点一次拉取；axios 数组会序列化成 a[]=，故传逗号分隔字符串
  const nodeIdsParam = useMemo(
    () => (selectedId == null ? undefined : [selectedId, ...children.map((c) => c.id)].join(",")),
    [selectedId, children]
  );
  const { data: assetData, isLoading: assetsLoading, isError: assetsError } = useAssetList(
    { page: 1, size: 500, locationNodeIds: nodeIdsParam, sortBy: "assetCode", sortDirection: "asc" },
    selectedId != null
  );
  const rows = useMemo(() => assetData?.rows ?? [], [assetData]);

  // 全局检索：防抖 400ms 后跨全部资产服务端查询（仅全局模式且有关键词时启用）
  useEffect(() => {
    if (searchMode !== "global") return;
    const kw = assetKeyword.trim();
    if (!kw) {
      setGlobalKeyword("");
      return;
    }
    const id = window.setTimeout(() => setGlobalKeyword(kw), 400);
    return () => window.clearTimeout(id);
  }, [assetKeyword, searchMode]);

  const globalSearchActive = searchMode === "global" && globalKeyword.length > 0;
  const { data: globalData, isFetching: globalLoading } = useAssetList(
    { page: 1, size: 50, keyword: globalKeyword, sortBy: "assetCode", sortDirection: "asc" },
    globalSearchActive
  );
  const globalRows = useMemo(() => globalData?.rows ?? [], [globalData]);

  // 抽屉持有的选中项是点击时的快照；列表刷新后按 id 取最新行，保证编辑/移动后详情即时更新
  const selectedAssetLive = useMemo(
    () => (selectedAsset ? rows.find((r) => r.id === selectedAsset.id) ?? selectedAsset : null),
    [rows, selectedAsset]
  );

  // 按归属节点分组
  const byNode = useMemo(() => {
    const m = new Map<number, AssetRow[]>();
    for (const r of rows) {
      const id = r.locationNodeId;
      if (id == null) continue;
      const arr = m.get(id) ?? [];
      arr.push(r);
      m.set(id, arr);
    }
    return m;
  }, [rows]);
  const chipsFor = (id: number | null | undefined): AssetRow[] => (id == null ? [] : byNode.get(id) ?? []);

  const nodeRows = useMemo(() => chipsFor(node?.id), [byNode, node]);
  const directCount = nodeRows.length;
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of nodeRows) {
      const k = (r.dynamicValues?.[CATEGORY_KEY] ?? "").trim() || "未分类";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [nodeRows]);

  // 换地点后关掉抽屉（从全局结果跳转时跳过这一次，因为同时要打开该资产的抽屉）
  useEffect(() => {
    if (keepDrawerOnNavRef.current) {
      keepDrawerOnNavRef.current = false;
      return;
    }
    setSelectedAsset(null);
  }, [selectedId]);

  // 「检索资产…」按编码/名称客户端过滤
  const q = assetKeyword.trim().toLowerCase();
  const matchAsset = (r: AssetRow) =>
    !q || (r.assetCode ?? "").toLowerCase().includes(q) || (r.assetName ?? "").toLowerCase().includes(q);
  const visibleChildren = useMemo(() => {
    if (!q) return children;
    const hit = (r: AssetRow) => (r.assetCode ?? "").toLowerCase().includes(q) || (r.assetName ?? "").toLowerCase().includes(q);
    return children.filter((c) => (byNode.get(c.id) ?? []).some(hit));
  }, [children, q, byNode]);
  const visibleNodeRows = useMemo(() => {
    if (!q) return nodeRows;
    return nodeRows.filter((r) => (r.assetCode ?? "").toLowerCase().includes(q) || (r.assetName ?? "").toLowerCase().includes(q));
  }, [nodeRows, q]);

  // 共用同一个输入框：切换模式时清空关键词与全局结果，两种检索互不污染
  const switchSearchMode = (m: "local" | "global") => {
    if (m === searchMode) return;
    setSearchMode(m);
    setAssetKeyword("");
    setGlobalKeyword("");
  };

  // 全局结果点击：跳到该资产所在地点并打开抽屉；同时清空关键词，让中栏回到该地点画布
  const openGlobalResult = (r: AssetRow) => {
    if (r.locationNodeId != null && r.locationNodeId !== selectedId) {
      keepDrawerOnNavRef.current = true;
      setSelectedId(r.locationNodeId);
    }
    setSelectedAsset(r);
    setAssetKeyword("");
    setGlobalKeyword("");
  };

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCreateRoot = (name: string) => {
    createMut.mutate({ parentId: null, name });
  };

  const handleCreateChild = (parentId: number, name: string) => {
    createMut.mutate({ parentId, name });
  };

  const handleRename = (id: number, name: string) => {
    updateMut.mutate({ id, payload: { name } });
  };

  const handleSetIcon = (id: number, icon: string) => {
    updateMut.mutate({ id, payload: { icon } });
  };

  const handleMove = (id: number, parentId: number) => {
    updateMut.mutate({ id, payload: { parentId } });
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMut.mutateAsync(id);
    } catch {
      return; // 后端拒绝（非空节点）已由 hook toast 透出
    }
    if (selectedId === id) setSelectedId(null);
  };

  const handleDropAsset = async (assetId: string, nodeId: number) => {
    const target = findPath(tree, nodeId).at(-1);
    if (!target) return;
    const asset = rows.find((r) => r.id === assetId);
    const label = asset ? `${asset.assetCode} ${asset.assetName}` : assetId;
    const ok = await appConfirm(`把「${label}」移到「${target.name}」？`, { title: "移动资产" });
    if (!ok) return;
    try {
      await moveMut.mutateAsync({ assetId, nodeId });
    } catch {
      // 已由 hook toast 透出
    }
  };

  // 右栏「设置」：改名 / 移动 / 删除（对齐左树「⋯」菜单）
  const doRename = async (n: AssetLocationNode) => {
    const name = await appPrompt("修改地点名称", n.name, { title: "改名" });
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === n.name) return;
    handleRename(n.id, trimmed);
  };

  const doDelete = async (n: AssetLocationNode) => {
    const ok = await appConfirm(`确认删除地点「${n.name}」？该地点下有子地点或资产时无法删除。`, {
      title: "删除地点",
      danger: true,
    });
    if (!ok) return;
    void handleDelete(n.id);
  };

  const nodeOptions = useMemo(() => {
    const out: { value: number; label: string }[] = [];
    const walk = (nodes: AssetLocationNode[], depth: number) => {
      for (const n of nodes) {
        out.push({ value: n.id, label: `${"　".repeat(depth)}${n.name}` });
        if (n.children?.length) walk(n.children, depth + 1);
      }
    };
    walk(tree, 0);
    return out;
  }, [tree]);

  const moveCandidates = useMemo(() => {
    if (!moveTarget) return [];
    const excluded = new Set(collectDescendantIds(moveTarget));
    return nodeOptions.filter((o) => !excluded.has(o.value));
  }, [moveTarget, nodeOptions]);

  const submitMove = () => {
    if (!moveTarget || !moveParentId) return;
    handleMove(moveTarget.id, Number(moveParentId));
    setMoveTarget(null);
    setMoveParentId("");
  };

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      {/* ════════ 左：地点树 ════════ */}
      <div className="flex w-[236px] shrink-0 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-sm">
        <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--twin-hairline)] px-3 py-2 text-[11px] font-medium text-[var(--twin-mute)]">
          <Search className="h-3 w-3 shrink-0" /> 地点
        </div>
        <div className="mx-3 mb-1 mt-2 flex shrink-0 items-center gap-1.5 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1.5">
          <Search className="h-3 w-3 shrink-0 text-[var(--twin-mute)]" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索地点…"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--twin-ink)] outline-none placeholder:text-[var(--twin-mute)]"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {treeLoading ? (
            <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">加载中…</div>
          ) : treeError ? (
            <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">地点树加载失败，请重试</div>
          ) : (
            <LocationTree
              tree={tree}
              selectedId={selectedId}
              expanded={expanded}
              keyword={keyword}
              onSelect={setSelectedId}
              onToggle={toggle}
              onCreateRoot={handleCreateRoot}
              onCreateChild={handleCreateChild}
              onRename={handleRename}
              onMove={handleMove}
              onDelete={handleDelete}
              onSetIcon={handleSetIcon}
              onDropAsset={handleDropAsset}
            />
          )}
        </div>
      </div>

      {/* ════════ 中：分级画布 ════════ */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-sm">
        {/* 头部：返回 + 面包屑 + 检索资产 */}
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--twin-hairline)] px-3 py-2">
          {path.length > 1 && (
            <button
              type="button"
              onClick={() => setSelectedId(path[path.length - 2].id)}
              className="flex shrink-0 items-center gap-1 rounded-twin-sm border border-[var(--twin-hairline)] px-1.5 py-0.5 text-[11px] text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)]"
            >
              <ArrowLeft className="h-3 w-3" /> 返回
            </button>
          )}
          <nav className="flex min-w-0 items-center gap-1 overflow-hidden">
            {path.length === 0 && <span className="text-[13px] font-semibold text-[var(--twin-ink)]">地点</span>}
            {path.map((seg, i) => (
              <span key={seg.id} className="flex shrink-0 items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-[var(--twin-mute)]" />}
                {i === path.length - 1 ? (
                  <span className="truncate text-[13px] font-semibold text-[var(--twin-ink)]">{seg.name}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSelectedId(seg.id)}
                    className="truncate text-[12px] text-[var(--twin-link-deep)] hover:underline"
                  >
                    {seg.name}
                  </button>
                )}
              </span>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {/* 检索模式切换：本地点=客户端过滤当前节点；全局=服务端跨全部资产检索 */}
            <div className="flex shrink-0 items-center rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-0.5">
              {(["local", "global"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchSearchMode(m)}
                  className={
                    "h-6 rounded-full px-2 text-[10px] transition " +
                    (searchMode === m
                      ? "bg-[var(--twin-link-deep)] font-medium text-white"
                      : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]")
                  }
                >
                  {m === "local" ? "本地点" : "全局"}
                </button>
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-1.5 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1">
              <Search className="h-3 w-3 shrink-0 text-[var(--twin-mute)]" />
              <input
                value={assetKeyword}
                onChange={(e) => setAssetKeyword(e.target.value)}
                placeholder={searchMode === "global" ? "全局检索资产…" : "检索资产…"}
                className="w-32 min-w-0 bg-transparent text-[11px] text-[var(--twin-ink)] outline-none placeholder:text-[var(--twin-mute)]"
              />
              {assetKeyword && (
                <button
                  type="button"
                  onClick={() => {
                    setAssetKeyword("");
                    setGlobalKeyword("");
                  }}
                  className="shrink-0 text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
                  aria-label="清除检索"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 画布主体（点阵背景，对齐库存页平面图） */}
        <div
          className="relative min-h-0 flex-1 overflow-auto"
          style={{
            background: "radial-gradient(circle at 1px 1px, var(--twin-hairline) 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        >
          {globalSearchActive ? (
            /* 全局检索结果：替换中栏主体（树与右栏不动） */
            <div className="p-4">
              {globalLoading && globalRows.length === 0 ? (
                <div className="py-10 text-center text-[12px] text-[var(--twin-mute)]">检索中…</div>
              ) : globalRows.length === 0 ? (
                <div className="py-10 text-center text-[12px] text-[var(--twin-mute)]">没有匹配的资产</div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {globalRows.map((r) => {
                    const locPath =
                      r.locationNodeId != null
                        ? findPath(tree, r.locationNodeId).map((n) => n.name).join(" / ")
                        : "";
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => openGlobalResult(r)}
                          className="flex w-full min-w-0 items-center gap-3 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-left transition hover:border-[var(--twin-link-deep)]"
                        >
                          <span className="w-28 shrink-0 truncate font-mono text-[11px] text-[var(--twin-mute)]">
                            {r.assetCode}
                          </span>
                          <span
                            className="min-w-0 flex-1 truncate text-[12px] text-[var(--twin-ink)]"
                            title={r.assetName}
                          >
                            {r.assetName}
                          </span>
                          <span
                            className="w-56 shrink-0 truncate text-[11px] text-[var(--twin-body)]"
                            title={locPath || r.location}
                          >
                            {locPath || r.location || "—"}
                          </span>
                          <span className="w-24 shrink-0 truncate text-[11px] text-[var(--twin-mute)]">
                            {r.dynamicValues?.[USER_KEY] || "—"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : !node ? (
            <div className="flex h-full items-center justify-center text-[12px] text-[var(--twin-mute)]">
              请在左侧选择一个地点
            </div>
          ) : assetsError ? (
            <div className="flex h-full items-center justify-center text-[12px] text-[var(--twin-mute)]">
              资产加载失败，请重试
            </div>
          ) : (
            <div className="flex h-full min-h-[420px] flex-col">
              <div className="min-h-0 flex-1 overflow-auto p-4">
                {assetsLoading ? (
                  <div className="py-10 text-center text-[12px] text-[var(--twin-mute)]">加载中…</div>
                ) : visibleNodeRows.length === 0 && visibleChildren.length === 0 ? (
                  <div className="py-10 text-center text-[12px] text-[var(--twin-mute)]">
                    {q ? "没有匹配的资产" : "该地点暂无资产"}
                  </div>
                ) : (
                  <>
                    {/* 本空间资产：大图 / emoji 兜底卡片 */}
                    {visibleNodeRows.length > 0 && (
                      <div className="mb-4">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-[11px] font-medium text-[var(--twin-mute)]">本空间资产</span>
                          <span className="text-[10px] text-[var(--twin-mute)]">
                            {visibleNodeRows.length} 件
                          </span>
                        </div>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                          {visibleNodeRows.map((r) => (
                            <AssetCard key={r.id} row={r} onOpen={setSelectedAsset} />
                          ))}
                        </div>
                      </div>
                    )}
                    {/* 子空间卡片 */}
                    {visibleChildren.length > 0 && (
                      <div className="grid auto-rows-[minmax(160px,1fr)] grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                        {visibleChildren.map((c) => (
                          <SpaceCard
                            key={c.id}
                            node={c}
                            chips={chipsFor(c.id).filter(matchAsset)}
                            onSelect={setSelectedId}
                            onOpen={setSelectedAsset}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════ 右：空间管理面板 ════════ */}
      <div className="flex w-[272px] shrink-0 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-sm">
        <div className="shrink-0 border-b border-[var(--twin-hairline)] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--twin-ink)]">
              {node?.name ?? "未选择"}
            </h3>
            {node && (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex shrink-0 items-center gap-1 rounded-twin-sm border border-[var(--twin-hairline)] px-1.5 py-0.5 text-[11px] text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)]">
                  <Settings className="h-3 w-3" /> 设置
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[9rem]">
                  <DropdownMenuItem onSelect={() => void doRename(node)}>改名</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setIconTarget(node)}>
                    <Smile className="mr-2 h-3.5 w-3.5" />
                    设置图标
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setMoveTarget(node);
                      setMoveParentId("");
                    }}
                  >
                    移动地点
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void doDelete(node)} className="text-red-600 focus:text-red-700">
                    删除地点
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <p className="mt-1 truncate text-[11px] text-[var(--twin-mute)]" title={pathText}>
            {pathText || "—"} · 本空间直接 {directCount} 件 · 共 {node?.totalCount ?? 0} 件
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 py-2.5">
          {!node ? (
            <div className="py-6 text-center text-[12px] text-[var(--twin-mute)]">未选择地点</div>
          ) : assetsError ? (
            <div className="py-6 text-center text-[12px] text-[var(--twin-mute)]">资产加载失败，请重试</div>
          ) : (
            <>
              <SpaceGroup title="本空间" subTotal={directCount} rows={nodeRows} onOpen={setSelectedAsset} />
              {children.map((c) => (
                <SpaceGroup
                  key={c.id}
                  title={c.name}
                  subTotal={c.totalCount ?? 0}
                  rows={chipsFor(c.id)}
                  childNodes={c.children ?? []}
                  onSelect={setSelectedId}
                  onOpen={setSelectedAsset}
                />
              ))}
            </>
          )}
        </div>

        <div className="flex shrink-0 gap-1.5 border-t border-[var(--twin-hairline)] p-2">
          <button
            type="button"
            onClick={onCreateAsset}
            className="flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-twin-md bg-[var(--twin-link-deep)] px-1.5 py-1.5 text-[11px] font-medium text-white transition hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" /> 新增资产
          </button>
          <button
            type="button"
            onClick={() => setTransferOpen(true)}
            className="flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-1.5 text-[11px] text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)]"
          >
            <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" /> 申请转移
          </button>
        </div>
      </div>

      {/* ════════ 抽屉：资产详情 / 地点小结 / 转移记录 ════════ */}
      <AssetDetailDrawer
        asset={selectedAssetLive}
        columns={assetData?.columns ?? []}
        nodeName={node?.name ?? null}
        nodeTotal={directCount}
        byCategory={byCategory}
        onClose={() => setSelectedAsset(null)}
      />

      {/* ════════ 申请转移弹层 ════════ */}
      <AssetTransferApplyModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        initialAsset={selectedAsset}
        onSuccess={() => {
          // query invalidation is handled by useCreateAssetTransfer hook internally
        }}
      />

      {/* ════════ 地点图标选择（右栏「设置」用；左树「⋯」由 LocationTree 自持） ════════ */}
      {iconTarget && (
        <EmojiPicker
          value={iconTarget.icon ?? ""}
          onChange={(emoji) => {
            handleSetIcon(iconTarget.id, emoji);
            setIconTarget(null);
          }}
          onClose={() => setIconTarget(null)}
        />
      )}

      {/* ════════ 移动地点弹层（右栏「设置」用） ════════ */}
      {moveTarget && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setMoveTarget(null)}>
            <div
              className="w-full max-w-md rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-[var(--twin-ink)]">移动地点</h3>
              <p className="mt-2 text-sm text-[var(--twin-body)]">将「{moveTarget.name}」移动到：</p>
              <select
                value={moveParentId}
                onChange={(e) => setMoveParentId(e.target.value)}
                className="mt-3 w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
              >
                <option value="">请选择新父地点</option>
                {moveCandidates.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]"
                  onClick={() => setMoveTarget(null)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)] disabled:opacity-50"
                  disabled={!moveParentId}
                  onClick={submitMove}
                >
                  确认移动
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
