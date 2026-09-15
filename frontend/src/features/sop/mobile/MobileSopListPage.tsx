import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Loader2, Search } from "lucide-react";
import { fetchSopTree, type SopDocument, type SopNode } from "@/api/domains/sop.api";
import { buildSopTree, documentsOfNode, formatBytes, sopNodePath, subtreeDocCounts, type SopTreeNode } from "../sopTree";

/** 展开态与「上次从哪个分类点进去的」都放 sessionStorage：返回列表要接着上次看，但不能跨标签页串味 */
const EXPANDED_KEY = "sop-mobile-expanded";
const RETURN_NODE_KEY = "sop-mobile-return-node";

function readExpanded(): Set<number> {
  try {
    const raw = sessionStorage.getItem(EXPANDED_KEY);
    if (!raw) return new Set();
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((n): n is number => typeof n === "number")) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * H5「SOP 操作」列表：**按分类分级折叠**，点文档进阅读器。
 *
 * 默认**全部收起**（只露顶层分类），展开态与「上次点进去的分类」记在 sessionStorage：
 * 进阅读器再返回时，列表接着上次的展开状态，并滚回那个分类，不用从头翻。
 *
 * 搜索时**不刻意维持树形**：有关键词就直接列命中的文档（每条带上所属路径），
 * 因为没有「自动展开全部命中链」的话，命中项可能藏在收起的文件夹里根本看不见。
 */
export default function MobileSopListPage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(readExpanded);
  const { data, isLoading, error } = useQuery({ queryKey: ["sop", "tree"], queryFn: fetchSopTree, staleTime: 30_000 });

  const nodes = data?.nodes ?? [];
  const documents = data?.documents ?? [];
  const tree = useMemo(() => buildSopTree(nodes), [nodes]);
  const unfiled = useMemo(() => documentsOfNode(documents, null), [documents]);
  const subtreeDocCount = useMemo(() => subtreeDocCounts(nodes, documents), [nodes, documents]);

  useEffect(() => {
    try {
      sessionStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
    } catch {
      /* 隐私模式下写不进去，忽略即可 */
    }
  }, [expanded]);

  /**
   * 从阅读器返回时把位置还回来：展开该分类的祖先链，并把这一行滚进视野。
   * 只做一次（`returnedRef`），否则用户手动收起后会被这条 effect 又弹开。
   */
  const returnedRef = useRef(false);
  useEffect(() => {
    if (returnedRef.current || tree.length === 0) return;
    returnedRef.current = true;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(RETURN_NODE_KEY);
    } catch {
      return;
    }
    if (!raw) return; // 空串 = 未分类，没有可展开的分类
    const nodeId = Number(raw);
    if (!Number.isFinite(nodeId)) return;

    const byId = new Map(nodes.map((n) => [n.id, n]));
    const chain: number[] = [];
    let cur: SopNode | undefined = byId.get(nodeId);
    for (let i = 0; cur && i < 64; i++) {
      chain.push(cur.id);
      cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
    }
    if (chain.length === 0) return;
    setExpanded((p) => new Set([...p, ...chain]));
    requestAnimationFrame(() => {
      document.querySelector(`[data-sop-node="${nodeId}"]`)?.scrollIntoView({ block: "center" });
    });
  }, [tree, nodes]);

  const toggle = (id: number) =>
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** 进阅读器前记下「从哪个分类点进去的」，返回时据此还原展开与滚动位置 */
  const openDoc = (d: SopDocument) => {
    try {
      sessionStorage.setItem(RETURN_NODE_KEY, d.nodeId == null ? "" : String(d.nodeId));
    } catch {
      /* ignore */
    }
    navigate(`/m/sop/${d.id}`);
  };

  const kw = keyword.trim().toLowerCase();
  const searchHits = useMemo(() => {
    if (!kw) return [];
    return documents.filter((d) => {
      const path = sopNodePath(nodes, d.nodeId) ?? "";
      return d.title.toLowerCase().includes(kw) || path.toLowerCase().includes(kw);
    });
  }, [kw, documents, nodes]);

  const docRow = (d: SopDocument, depth: number) => (
    <button
      key={`doc-${d.id}`}
      type="button"
      onClick={() => openDoc(d)}
      className="flex w-full items-center gap-2.5 py-3 pr-3.5 text-left transition-colors active:bg-gray-50 dark:active:bg-gray-800"
      style={{ paddingLeft: 14 + depth * 16 }}
    >
      <FileText className="size-4 shrink-0 text-gray-300 dark:text-gray-600" strokeWidth={1.6} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-gray-900 dark:text-gray-100">{d.title}</span>
        <span className="block text-[10px] text-gray-400">{formatBytes(d.sizeBytes)}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-gray-300 dark:text-gray-600" />
    </button>
  );

  const nodeRow = (n: SopTreeNode, depth: number) => {
    const open = expanded.has(n.id);
    const total = subtreeDocCount.get(n.id) ?? 0;
    return (
      <div key={`node-${n.id}`} data-sop-node={n.id}>
        <button
          type="button"
          onClick={() => toggle(n.id)}
          className="flex w-full items-center gap-2 py-3 pr-3.5 text-left transition-colors active:bg-gray-50 dark:active:bg-gray-800"
          style={{ paddingLeft: 14 + depth * 16 }}
        >
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-gray-400" />
          )}
          {open ? (
            <FolderOpen className="size-4 shrink-0 text-amber-400" strokeWidth={1.6} />
          ) : (
            <Folder className="size-4 shrink-0 text-amber-400" strokeWidth={1.6} />
          )}
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-900 dark:text-gray-100">
            {n.name}
          </span>
          {total > 0 ? (
            <span className="shrink-0 rounded-full bg-gray-100 px-1.5 text-[10px] tabular-nums text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {total}
            </span>
          ) : null}
        </button>
        {open ? (
          <>
            {n.children.map((c) => nodeRow(c, depth + 1))}
            {documentsOfNode(documents, n.id).map((d) => docRow(d, depth + 1))}
          </>
        ) : null}
      </div>
    );
  };

  const empty = documents.length === 0;

  return (
    <div className="min-h-[100dvh] bg-gray-50 dark:bg-gray-950">
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex h-12 items-center gap-3 px-4">
          <button onClick={() => navigate(-1)} className="-ml-1 p-1" aria-label="返回">
            <ArrowLeft className="size-5 text-gray-700 dark:text-gray-300" />
          </button>
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">SOP 操作</h1>
        </div>
      </header>

      <div className="px-4 pt-3">
        <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
          <Search className="size-3.5 shrink-0 text-gray-400" />
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索文档或分类…"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
          />
        </div>
      </div>

      <div className="px-4 pb-8 pt-3">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-xs text-gray-400">
            <Loader2 className="size-3.5 animate-spin" />
            加载中…
          </div>
        ) : error ? (
          <div className="py-16 text-center text-xs text-red-500">
            {error instanceof Error ? error.message : "加载失败"}
          </div>
        ) : kw ? (
          /* 搜索态：直接列命中项（带所属路径），不维持树 —— 否则命中项可能藏在收起的文件夹里 */
          searchHits.length === 0 ? (
            <EmptyState text="没有匹配的文档" />
          ) : (
            <Card>
              {searchHits.map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => openDoc(d)}
                  className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left transition-colors active:bg-gray-50 dark:active:bg-gray-800"
                  style={i ? { borderTop: "1px solid rgba(30,55,90,0.04)" } : undefined}
                >
                  <FileText className="size-4 shrink-0 text-gray-300 dark:text-gray-600" strokeWidth={1.6} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-gray-900 dark:text-gray-100">{d.title}</span>
                    <span className="block truncate text-[10px] text-gray-400">
                      {sopNodePath(nodes, d.nodeId) ?? "未分类"}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-gray-300 dark:text-gray-600" />
                </button>
              ))}
            </Card>
          )
        ) : empty && unfiled.length === 0 && nodes.length === 0 ? (
          <EmptyState text="暂无 SOP 文档" />
        ) : (
          <>
            {tree.length > 0 ? <Card>{tree.map((n) => nodeRow(n, 0))}</Card> : null}

            {/* 未分类挂在树之外单列一块：它没有节点，塞进树里只会凭空多一个不存在的分类 */}
            {unfiled.length > 0 ? (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center gap-1.5 px-1">
                  <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">未分类</span>
                  <span className="text-[10px] text-gray-300 dark:text-gray-600">{unfiled.length}</span>
                </div>
                <Card>{unfiled.map((d) => docRow(d, 0))}</Card>
              </div>
            ) : null}

            {tree.length === 0 && unfiled.length === 0 ? <EmptyState text="暂无 SOP 文档" /> : null}
          </>
        )}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white dark:bg-gray-900" style={{ boxShadow: "0 4px 14px rgba(15,23,42,0.03)" }}>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <FileText className="size-9 text-gray-200 dark:text-gray-800" />
      <p className="text-[13px] text-gray-400">{text}</p>
    </div>
  );
}
