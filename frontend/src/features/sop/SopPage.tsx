import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Folder, FolderOpen, Loader2, PanelLeft, PanelLeftClose, Search, Settings2, Star } from "lucide-react";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { ResizeHandle } from "@/components/shared/ResizeHandle";
import { Tree } from "@/components/tree/Tree";
import { fetchSopTree, type SopDocument } from "@/api/domains/sop.api";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { cn } from "@/lib/utils";
import { buildSopTree, documentsOfNode, sopNodePath, type SopTreeNode } from "./sopTree";
import { useSopFavorites } from "./sopFavorites";
import SopViewer from "./components/SopViewer";
import SopManageDrawer from "./components/SopManageDrawer";

/**
 * Tree 节点行在「缩进 d*8」之外还有一段固定前缀：`[展开箭头 24px] gap4` = 28px，之后才是图标。
 * 文档行没有箭头，得补上同样的前缀，图标才能和**同级子文件夹的图标**对齐；
 * 不补的话文档会卡在「父文件夹箭头」和「同级文件夹图标」中间，看着哪一层都不像。
 *
 * 这里**不含计数槽** —— 本页不传 `getCount`，Tree 现在会整块不渲染那 18px（早先只清空数字、
 * 槽位照占，白吃一截宽度）。数值和 Tree.tsx 的节点行布局耦合，那边改了宽度这里要跟着改。
 */
const TREE_ROW_PREFIX_PX = 28;

/** 星标槽宽 = 对齐点 − 行内 gap(4px)，这样插在星标之后的图标仍落在 50px 的对齐点上 */
const STAR_SLOT_PX = TREE_ROW_PREFIX_PX - 4;

/** 左栏宽度可拖拽，落 localStorage 记住；上下限保证标题还能看清 / 不给右栏挤没 */
const LEFT_WIDTH_KEY = "aro-sop-left-width";
const LEFT_MIN = 180;
const LEFT_MAX = 560;
const LEFT_DEFAULT = 260;

function readLeftWidth(): number {
  try {
    const raw = Number(localStorage.getItem(LEFT_WIDTH_KEY));
    if (Number.isFinite(raw) && raw >= LEFT_MIN && raw <= LEFT_MAX) return raw;
  } catch {
    /* ignore */
  }
  return LEFT_DEFAULT;
}

/**
 * SOP 操作：左「分类文档列表」+ 右「带水印的 PDF 阅读器」，右上角进管理抽屉。
 *
 * 高度链复刻 /student/cage-shelf：外层定死 `100dvh - --admin-chrome-offset`，
 * 左右两栏各自内部滚动，整页不滚；无大字标题、无副标题。
 */
export default function SopPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["sop", "tree"], queryFn: fetchSopTree, staleTime: 30_000 });

  const nodes = data?.nodes ?? [];
  const documents = data?.documents ?? [];
  const tree = useMemo(() => buildSopTree(nodes), [nodes]);

  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [keyword, setKeyword] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [leftWidth, setLeftWidth] = useState(readLeftWidth);

  const { favorites, isFavorite, toggle: toggleFavorite } = useSopFavorites();

  useEffect(() => {
    try {
      localStorage.setItem(LEFT_WIDTH_KEY, String(leftWidth));
    } catch {
      /* ignore */
    }
  }, [leftWidth]);

  /** 首次拿到树时展开前两层：整棵收起时用户得多点好几下才能看到文档 */
  const initedRef = useRef(false);
  useEffect(() => {
    if (initedRef.current || tree.length === 0) return;
    const s = new Set<number>();
    for (const n of tree) {
      s.add(n.id);
      for (const c of n.children) s.add(c.id);
    }
    setExpanded(s);
    initedRef.current = true;
  }, [tree]);

  /** 选中的文档可能被删掉/移走，每次数据刷新都重新解析，避免右侧挂着一份已经不存在的文档 */
  const selectedDoc = useMemo(
    () => documents.find((d) => d.id === selectedDocId) ?? null,
    [documents, selectedDocId],
  );
  const selectedPath = useMemo(
    () => (selectedDoc ? sopNodePath(nodes, selectedDoc.nodeId) : null),
    [nodes, selectedDoc],
  );

  const unfiled = useMemo(() => documentsOfNode(documents, null), [documents]);

  /** 收藏里可能有已被删除的文档，按当前文档表过滤后再渲染 */
  const favoritedDocs = useMemo(() => {
    const byId = new Map(documents.map((d) => [d.id, d]));
    return favorites.map((id) => byId.get(id)).filter((d): d is SopDocument => !!d);
  }, [favorites, documents]);

  const role = authStorage.getRole() || "MEMBER";
  const canManage = hasMinRole(role, "ADMIN");
  const user = authStorage.getUserInfo();
  const viewerName = (user?.displayName || user?.displayNickname || user?.username || "").trim();
  const empty = documents.length === 0;

  const refresh = () => void qc.invalidateQueries({ queryKey: ["sop", "tree"] });

  const toggleExpand = (id: number) =>
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** 收藏开关。星标在名称**之前**、占固定槽位：不占位的话悬停显隐会让名称左右跳 */
  const renderStar = (doc: SopDocument) => {
    const fav = isFavorite(doc.id);
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(doc.id);
        }}
        title={fav ? "取消收藏" : "收藏"}
        aria-label={fav ? "取消收藏" : "收藏"}
        className={cn(
          "shrink-0 rounded p-0.5 transition",
          fav
            ? "text-amber-400 hover:text-amber-300"
            : "text-[var(--app-color-text-tertiary)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-[var(--app-color-text-primary)]",
        )}
      >
        <Star className={cn("h-3.5 w-3.5", fav && "fill-amber-400")} />
      </button>
    );
  };

  /** 左栏的文档行；树节点下、「未分类」、「收藏」三处共用 */
  const renderDocRow = (doc: SopDocument, indent: number) => {
    const active = doc.id === selectedDocId;
    return (
      <div
        key={doc.id}
        style={{ paddingLeft: (indent + 1) * 8 }}
        className={cn(
          "group flex w-full items-center gap-1 rounded-[var(--app-radius-element)] py-1 pr-1.5 transition",
          active ? "bg-[color-mix(in_srgb,var(--app-color-accent-hover)_12%,transparent)]" : "hover:bg-[var(--app-color-surface-hover)]",
        )}
      >
        {/* 星标槽宽度 = 对齐点 − gap，这样后面的图标仍落在 TREE_ROW_PREFIX_PX 上，
            与同级子文件夹的图标对齐；星标本身落在左侧装订线里 */}
        <span className="flex shrink-0 items-center justify-center" style={{ width: STAR_SLOT_PX }}>
          {renderStar(doc)}
        </span>
        <button
          type="button"
          onClick={() => setSelectedDocId(doc.id)}
          title={doc.title}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 text-left text-[13px]",
            active ? "text-[var(--app-color-accent-hover)]" : "text-[var(--app-color-text-secondary)]",
          )}
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{doc.title}</span>
        </button>
      </div>
    );
  };

  return (
    <AdminPageShell>
      <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] gap-2">
        {/* 左栏：收藏 + 分类树 + 文档列表 */}
        {!collapsed ? (
          <>
            <aside className="flex h-full shrink-0 flex-col gap-1.5" style={{ width: leftWidth }}>
              <div className="flex shrink-0 items-center gap-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1.5">
                <Search className="h-4 w-4 shrink-0 text-[var(--app-color-text-tertiary)]" />
                <input
                  type="search"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜索分类或文档…"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)]"
                />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-1.5">
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-[var(--app-color-text-tertiary)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    加载中…
                  </div>
                ) : (
                  <>
                    {/* 收藏置顶：常用文档不用每次都去树里翻 */}
                    {favoritedDocs.length > 0 ? (
                      <div className="mb-1.5 rounded-[var(--app-radius-element)] border border-amber-400/30 bg-amber-400/[0.06] pb-1">
                        <div className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          <Star className="h-3 w-3 fill-current" />
                          收藏
                        </div>
                        {favoritedDocs.map((d) => renderDocRow(d, -1))}
                      </div>
                    ) : null}

                    {/* 未分类文档在树里没有节点可挂，单独列一块 */}
                    {unfiled.length > 0 ? (
                      <div className="mb-1 rounded-[var(--app-radius-element)] border border-dashed border-[var(--app-color-border-default)] pb-1">
                        <div className="px-2 py-1 text-[11px] font-semibold text-[var(--app-color-text-tertiary)]">
                          未分类
                        </div>
                        {unfiled.map((d) => renderDocRow(d, 0))}
                      </div>
                    ) : null}

                    <Tree<SopTreeNode>
                      nodes={tree}
                      getId={(n) => n.id}
                      getName={(n) => n.name}
                      getChildren={(n) => n.children}
                      /* 不传 getCount：本页不要数字角标 */
                      /* 图标由这里给，好在不共用组件的尺寸 —— 默认 14px 偏小 */
                      getIcon={(n) =>
                        expanded.has(n.id) ? (
                          <FolderOpen className="h-4 w-4 shrink-0 text-amber-400" />
                        ) : (
                          <Folder className="h-4 w-4 shrink-0 text-amber-400" />
                        )
                      }
                      /* Tree 默认只把「有子节点」的算作可展开。只挂文档、没有子分类的文件夹，
                         按默认就不可展开 —— 行点击永远不会展开它，而 onSelect 又能把它收起，
                         于是「收起来就再也打不开」。所以凡是有文档的分类都要声明成可展开。 */
                      expandable={(n) => n.children.length > 0 || documentsOfNode(documents, n.id).length > 0}
                      selectedId={selectedDoc?.nodeId ?? null}
                      expanded={expanded}
                      onSelect={(id) => {
                        /* 只处理「点已展开的分类行 → 收起」。
                           收起态的行点击，Tree 内部已经先 expandAndReveal 展开过了；
                           这里若无条件再 toggle 一次就会和它抵消，变成点了没反应。 */
                        if (expanded.has(id)) toggleExpand(id);
                      }}
                      onToggle={toggleExpand}
                      keyword={keyword}
                      renderExtras={(n, depth) => documentsOfNode(documents, n.id).map((d) => renderDocRow(d, depth))}
                      emptyText="暂无分类"
                      noMatchText="没有匹配的分类"
                    />
                  </>
                )}
              </div>
            </aside>
            <ResizeHandle
              onResize={(d) => setLeftWidth((p) => Math.min(LEFT_MAX, Math.max(LEFT_MIN, p + d)))}
            />
          </>
        ) : null}

        {/* 右栏：常驻工具条 + PDF 查看区 */}
        <section className="flex h-full min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              title={collapsed ? "展开列表" : "收起列表"}
              aria-label={collapsed ? "展开列表" : "收起列表"}
              className="shrink-0 rounded p-1 text-[var(--app-color-text-tertiary)] transition hover:bg-[var(--app-color-surface-container)] hover:text-[var(--app-color-text-primary)]"
            >
              {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>

            <span className="min-w-0 shrink truncate text-[13px] font-medium text-[var(--app-color-text-primary)]">
              {selectedDoc?.title ?? "SOP 操作"}
            </span>
            {selectedPath ? (
              <span className="hidden min-w-0 truncate text-[11px] text-[var(--app-color-text-tertiary)] md:inline">
                {selectedPath}
              </span>
            ) : null}

            {canManage ? (
              <button
                type="button"
                onClick={() => setManageOpen(true)}
                className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2.5 py-1 text-[12px] font-medium text-[var(--app-color-text-secondary)] transition hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]"
              >
                <Settings2 className="h-3.5 w-3.5" />
                管理
              </button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1">
            {selectedDoc ? (
              <SopViewer key={selectedDoc.id} doc={selectedDoc} viewerName={viewerName} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-[var(--app-radius-container)] border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-center text-sm text-[var(--app-color-text-tertiary)]">
                <FileText className="mb-3 h-9 w-9 opacity-20" />
                {empty ? "还没有 SOP 文档" : "从左侧选择一个文档"}
                <span className="mt-1 text-[12px]">
                  {empty && canManage ? "点右上角「管理」上传 PDF" : "左侧按分类列出全部文档"}
                </span>
              </div>
            )}
          </div>
        </section>
      </div>

      {canManage ? (
        <SopManageDrawer
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          nodes={nodes}
          documents={documents}
          onChanged={refresh}
        />
      ) : null}
    </AdminPageShell>
  );
}
