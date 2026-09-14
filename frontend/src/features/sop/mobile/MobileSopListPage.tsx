import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, FileText, Loader2, Search } from "lucide-react";
import { fetchSopTree, type SopDocument } from "@/api/domains/sop.api";
import { formatBytes, sopNodePath } from "../sopTree";

/**
 * H5「SOP 操作」列表：按分类分组列出全部文档，点一条进阅读器。
 *
 * 用扁平分组而不是桌面端那棵可折叠树：手机上要频繁点开/收起很累，
 * 而 SOP 的分类数量级本来就小，直接把分类名当小标题罗列更好扫。
 */
export default function MobileSopListPage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const { data, isLoading, error } = useQuery({ queryKey: ["sop", "tree"], queryFn: fetchSopTree, staleTime: 30_000 });

  const nodes = data?.nodes ?? [];
  const documents = data?.documents ?? [];

  const groups = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const matched = kw
      ? documents.filter((d) => {
          const path = sopNodePath(nodes, d.nodeId) ?? "";
          return d.title.toLowerCase().includes(kw) || path.toLowerCase().includes(kw);
        })
      : documents;
    const map = new Map<string, SopDocument[]>();
    for (const d of matched) {
      const key = sopNodePath(nodes, d.nodeId) ?? "未分类";
      const arr = map.get(key);
      if (arr) arr.push(d);
      else map.set(key, [d]);
    }
    return [...map.entries()];
  }, [nodes, documents, keyword]);

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
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <FileText className="size-9 text-gray-200 dark:text-gray-800" />
            <p className="text-[13px] text-gray-400">{keyword.trim() ? "没有匹配的文档" : "暂无 SOP 文档"}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(([category, docs]) => (
              <section key={category}>
                <div className="mb-1.5 flex items-center gap-1.5 px-1">
                  <span className="truncate text-[11px] font-semibold text-gray-400 dark:text-gray-500">{category}</span>
                  <span className="shrink-0 text-[10px] text-gray-300 dark:text-gray-600">{docs.length}</span>
                </div>
                <div className="overflow-hidden rounded-2xl bg-white dark:bg-gray-900" style={{ boxShadow: "0 4px 14px rgba(15,23,42,0.03)" }}>
                  {docs.map((d, idx) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => navigate(`/m/sop/${d.id}`)}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-gray-50 dark:active:bg-gray-800"
                      style={idx ? { borderTop: "1px solid rgba(30,55,90,0.04)" } : undefined}
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(217,119,6,0.07)" }}>
                        <FileText className="size-4" style={{ color: "var(--student-primary, #d97706)" }} strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-gray-900 dark:text-gray-100">{d.title}</p>
                        <p className="text-[10px] text-gray-400">{formatBytes(d.sizeBytes)}</p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-gray-300 dark:text-gray-600" />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
