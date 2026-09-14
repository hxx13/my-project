import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Loader2, Search } from "lucide-react";
import { fetchSopTree, type SopDocument, type SopNode } from "@/api/domains/sop.api";
import { buildSopTree, documentsOfNode, formatBytes, sopNodePath, type SopTreeNode } from "../sopTree";

/**
 * H5「SOP 操作」列表：**按分类分级折叠**，点文档进阅读器。
 *
 * 早先这里是「把所有文档按全路径拍平成若干分组标题」，理由是手机上少点展开。那是错的 ——
 * 拍平之后分类的层级关系就没了，深一层的东西看着和顶层并列。现在按真实树渲染，可逐级展开。
 *
 * 搜索时**不刻意维持树形**：有关键词就直接列命中的文档（每条带上所属路径），
 * 因为没有「自动展开全部命中链」的话，命中项可能藏在收起的文件夹里根本看不见。
 */
export default function MobileSopListPage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const { data, isLoading, error } = useQuery({ queryKey: ["sop", "tree"], queryFn: fetchSopTree, staleTime: 30_000 });

  const nodes = data?.nodes ?? [];
  const documents = data?.documents ?? [];
  const tree = useMemo(() => buildSopTree(nodes), [nodes]);
  const unfiled = useMemo(() => documentsOfNode(documents, null), [documents]);

  /** 每个分类**含子孙**的文档数：收起时看得到这个文件夹里总共几份，比只数直接子项有用 */
  const subtreeDocCount = useMemo(() => {
    const direct = new Map<number, number>();
    for (const d of documents) if (d.nodeId != null) direct.set(d.nodeId, (direct.get(d.nodeId) ?? 0) + 1);
    const memo = new Map<number, number>();
    const count = (n: SopTreeNode): number => {
      const hit = memo.get(n.id);
      if (hit != null) return hit;
      const total = (direct.get(n.id) ?? 0) + n.children.reduce((s, c) => s + count(c), 0);
      memo.set(n.id, total);
      return total;
    };
    for (const n of tree) count(n);
    return memo;
  }, [documents, tree]);

  /** 首次拿到数据时展开前两层：整棵收起的话页面看着是空的，用户以为没内容 */
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

  const toggle = (id: number) =>
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

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
      onClick={() => navigate(`/m/sop/${d.id}`)}
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
      <div key={`node-${n.id}`}>
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
                  onClick={() => navigate(`/m/sop/${d.id}`)}
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
