import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, PanelLeft, PanelLeftClose, Search, Settings2 } from "lucide-react";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { Tree } from "@/components/tree/Tree";
import { fetchSopTree, type SopDocument } from "@/api/domains/sop.api";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { cn } from "@/lib/utils";
import { buildSopTree, documentsOfNode, formatBytes, sopNodePath, type SopTreeNode } from "./sopTree";
import SopViewer from "./components/SopViewer";
import SopManageDrawer from "./components/SopManageDrawer";

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

  /** 左栏的文档行；节点下与「未分类」共用 */
  const renderDocRow = (doc: SopDocument, indent: number) => {
    const active = doc.id === selectedDocId;
    return (
      <button
        key={doc.id}
        type="button"
        onClick={() => setSelectedDocId(doc.id)}
        title={doc.title}
        style={{ paddingLeft: indent * 8 + 24 }}
        className={cn(
          "flex w-full items-center gap-1 rounded-[var(--app-radius-element)] py-1 pr-1.5 text-left transition",
          active
            ? "bg-[color-mix(in_srgb,var(--app-color-accent-hover)_12%,transparent)] text-[var(--app-color-accent-hover)]"
            : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]",
        )}
      >
        <FileText className="h-3 w-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-[11px]" title={doc.title}>
          {doc.title}
        </span>
        <span className="shrink-0 text-[9px] tabular-nums text-[var(--app-color-text-tertiary)]">
          {formatBytes(doc.sizeBytes)}
        </span>
      </button>
    );
  };

  return (
    <AdminPageShell>
      <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] gap-2">
        {/* 左栏：分类 + 文档列表 */}
        {!collapsed ? (
          <aside className="flex h-full w-64 shrink-0 flex-col gap-1.5">
            <div className="flex shrink-0 items-center gap-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1">
              <Search className="h-3.5 w-3.5 shrink-0 text-[var(--app-color-text-tertiary)]" />
              <input
                type="search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索分类或文档…"
                className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)]"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-1.5">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-[11px] text-[var(--app-color-text-tertiary)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  加载中…
                </div>
              ) : (
                <>
                  {/* 未分类文档在树里没有节点可挂，单独列一块 */}
                  {unfiled.length > 0 ? (
                    <div className="mb-1 rounded-[var(--app-radius-element)] border border-dashed border-[var(--app-color-border-default)] pb-1">
                      <div className="px-2 py-1 text-[10px] font-semibold text-[var(--app-color-text-tertiary)]">
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
                    getCount={(n) => documentsOfNode(documents, n.id).length || null}
                    selectedId={selectedDoc?.nodeId ?? null}
                    expanded={expanded}
                    onSelect={() => {
                      /* 分类行只是容器：点它不该改变右栏，展开/收起由 Tree 自己的箭头与热区处理 */
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

            <span className="min-w-0 shrink truncate text-[12px] font-medium text-[var(--app-color-text-primary)]">
              {selectedDoc?.title ?? "SOP 操作"}
            </span>
            {selectedPath ? (
              <span className="hidden min-w-0 truncate text-[10px] text-[var(--app-color-text-tertiary)] md:inline">
                {selectedPath}
              </span>
            ) : null}

            {canManage ? (
              <button
                type="button"
                onClick={() => setManageOpen(true)}
                className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-color-text-secondary)] transition hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]"
              >
                <Settings2 className="h-3 w-3" />
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
                <span className="mt-1 text-[11px]">
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
