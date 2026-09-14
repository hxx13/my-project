import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileWarning, Loader2 } from "lucide-react";
import { fetchSopTree } from "@/api/domains/sop.api";
import { authStorage } from "@/features/auth/authStorage";
import { useViewportHeight } from "@/pages/mobile/useViewportHeight";
import SopPdfPane from "../components/SopPdfPane";
import { sopNodePath } from "../sopTree";

/**
 * H5「SOP 操作」阅读器。
 *
 * 定高用 `useViewportHeight()` 而不是 100vh/100dvh：微信与 iOS webview 里 vh 按大视口算，
 * 地址栏一收一放底部就被推出可见区，100dvh 又不是所有 webview 版本都认。
 *
 * 文档不在列表里（被删/直接输 URL）时给明确的无此文档提示，不要白屏。
 */
export default function MobileSopReaderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const docId = Number(id);
  const { data, isLoading } = useQuery({ queryKey: ["sop", "tree"], queryFn: fetchSopTree, staleTime: 30_000 });
  const viewportHeight = useViewportHeight();

  const doc = useMemo(
    () => (Number.isFinite(docId) ? data?.documents.find((d) => d.id === docId) ?? null : null),
    [data, docId],
  );
  const path = useMemo(() => (doc ? sopNodePath(data?.nodes ?? [], doc.nodeId) : null), [data, doc]);

  const user = authStorage.getUserInfo();
  const viewerName = (user?.displayName || user?.displayNickname || user?.username || "").trim();

  return (
    <div
      className="flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950"
      style={{ height: viewportHeight > 0 ? `${viewportHeight}px` : "100dvh" }}
    >
      <header className="shrink-0 border-b border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex h-12 items-center gap-3 px-4">
          <button onClick={() => navigate(-1)} className="-ml-1 shrink-0 p-1" aria-label="返回">
            <ArrowLeft className="size-5 text-gray-700 dark:text-gray-300" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-gray-900 dark:text-gray-100">
              {doc?.title ?? "SOP 操作"}
            </p>
            {path ? <p className="truncate text-[10px] text-gray-400">{path}</p> : null}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-gray-400">
            <Loader2 className="size-3.5 animate-spin" />
            加载中…
          </div>
        ) : doc ? (
          /* key 跟文档走：水印时间戳与缩放档位都在挂载时初始化，换文档必须重挂载 */
          <SopPdfPane key={doc.id} doc={doc} viewerName={viewerName} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
            <FileWarning className="size-9 text-gray-200 dark:text-gray-800" />
            <p className="text-[13px] text-gray-400">文档不存在或已被删除</p>
            <button
              type="button"
              onClick={() => navigate("/m/sop", { replace: true })}
              className="mt-2 inline-flex items-center gap-1 rounded-full border border-gray-200 px-4 py-1.5 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300"
            >
              <ArrowLeft className="size-3.5" />
              返回列表
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
