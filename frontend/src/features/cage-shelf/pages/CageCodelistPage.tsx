import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { fetchCageInfoCodelists } from "../api/cageForm.api";
import "@/features/aup/aup.css";

/**
 * CageCodelistPage — 笼位字段码表管理（只读列表，后台控制台壳）。
 *
 * 数据来自自建 /admin/cage-info/codelists（每 code 最新活跃版本 + itemCount）。
 * 码表后端目前仅支持列表，本页只读。
 */
export default function CageCodelistPage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");

  const query = useQuery({
    queryKey: ["cage-info", "codelists"],
    queryFn: fetchCageInfoCodelists,
  });

  const codelists = query.data ?? [];
  const q = keyword.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return codelists;
    return codelists.filter(
      (c) => (c.code || "").toLowerCase().includes(q) || (c.name || "").toLowerCase().includes(q),
    );
  }, [codelists, q]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* 顶栏：返回 + 标题 */}
      <div className="shrink-0 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate("/console/admin/cage-shelves/forms")}
          className="inline-flex items-center gap-0.5 text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)] transition"
        >
          <ChevronLeft className="h-3.5 w-3.5" />表单管理
        </button>
        <span className="text-[var(--twin-hairline)]">|</span>
        <h2 className="text-base font-bold text-[var(--twin-ink)]">码表管理</h2>
      </div>

      {/* 工作台（aup-wb 表格壳） */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)", height: "100%" }}>
          <div className="aup-wb">
            <div className="aup-wb-toolbar">
              <button
                type="button"
                className="btn ghost small"
                onClick={() => navigate("/console/admin/cage-shelves/forms")}
                style={{ flexShrink: 0 }}
              >
                ← 返回
              </button>
              <input
                className="input"
                placeholder="搜索码表编码 / 名称…"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              {keyword.trim() && (
                <button type="button" className="btn ghost small" onClick={() => setKeyword("")}>
                  清除
                </button>
              )}
              <span className="aup-wb-count">共 {filtered.length} 个码表</span>
            </div>

            <div className="aup-wb-main aup-wb-main--full">
              {query.isLoading ? (
                <div className="aup-wb-empty">加载码表…</div>
              ) : filtered.length === 0 ? (
                <div className="aup-wb-empty">{q ? "无匹配码表" : "暂无可用码表"}</div>
              ) : (
                <div className="aup-wb-table-wrap">
                  <table className="aup-wb-table" style={{ minWidth: 640 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 200 }}>编码</th>
                        <th>名称</th>
                        <th style={{ width: 120 }}>条目数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <div className="mono" title={c.code}>
                              {c.code}
                            </div>
                          </td>
                          <td>
                            <div className="clip" title={c.name}>
                              {c.name}
                            </div>
                          </td>
                          <td>
                            <span className="aup-wb-chip muted">{c.itemCount ?? 0}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
