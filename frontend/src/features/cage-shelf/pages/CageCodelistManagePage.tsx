import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Loader2, ChevronLeft } from "lucide-react";
import { fetchCageInfoCodelists, type CodelistSummary } from "../api/cageForm.api";

/**
 * CageCodelistManagePage — 码表管理（只读列表：code / name / itemCount）
 */
export default function CageCodelistManagePage() {
  const navigate = useNavigate();
  const [codelists, setCodelists] = useState<CodelistSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCageInfoCodelists()
      .then((list) => setCodelists(list ?? []))
      .catch((e) => toast.error(e?.message || "加载码表失败"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* 顶栏 */}
      <div className="shrink-0 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate("..")}
          className="inline-flex items-center gap-0.5 text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)] transition"
        >
          <ChevronLeft className="h-3.5 w-3.5" />返回
        </button>
        <span className="text-[var(--twin-hairline)]">|</span>
        <h2 className="text-base font-bold text-[var(--twin-ink)]">码表管理</h2>
        <span className="text-[11px] text-[var(--twin-mute)]">（只读）</span>
      </div>

      {/* 码表列表 */}
      <div className="flex-1 min-h-0 flex flex-col rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-[var(--twin-hairline)]">
          <span className="text-sm font-semibold text-[var(--twin-ink)]">全部码表</span>
          <span className="text-[11px] text-[var(--twin-mute)]">{codelists.length} 个码表</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? (
            <div className="flex min-h-[120px] items-center justify-center text-sm text-[var(--twin-mute)]">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />加载中…
            </div>
          ) : codelists.length === 0 ? (
            <div className="flex min-h-[120px] items-center justify-center text-sm text-[var(--twin-mute)]">
              暂无码表
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-[2] bg-[var(--twin-canvas-soft)] border-b border-[var(--twin-hairline)]">
                <tr className="text-[var(--twin-mute)] font-semibold">
                  <th className="px-3 py-2">码表编码</th>
                  <th className="px-3 py-2">名称</th>
                  <th className="px-3 py-2 w-24 text-right">条目数</th>
                </tr>
              </thead>
              <tbody>
                {codelists.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--twin-hairline)] hover:bg-[var(--twin-canvas-soft)] transition-colors">
                    <td className="px-3 py-2 font-mono text-[11px] text-[var(--twin-ink)]">{c.code}</td>
                    <td className="px-3 py-2 font-medium text-[var(--twin-ink)]">{c.name}</td>
                    <td className="px-3 py-2 text-right text-[var(--twin-mute)]">{c.itemCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
