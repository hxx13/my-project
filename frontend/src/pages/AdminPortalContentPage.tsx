import { useState } from "react";
import { Link } from "react-router-dom";
import { useAdminContents, useDeleteContent } from "@/api/hooks/usePortalContent";
import type { ContentType, ContentStatus, PortalContentView } from "@/api/domains/portalContent.api";

export default function AdminPortalContentPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ContentType | "">("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data: pageData, isFetching } = useAdminContents({
    type: typeFilter || undefined,
    status: (statusFilter as ContentStatus) || undefined,
    search: search || undefined,
    page: 1,
    size: 100,
  });

  const rows: PortalContentView[] = (pageData?.data ?? []).filter((r) => r.contentType !== "PAGE");
  const deleteMut = useDeleteContent();

  const handleDelete = (id: number) => {
    if (!confirm("确定删除？将移入回收站。")) return;
    deleteMut.mutate(id);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Tab 栏 */}
      <div style={{ display: "flex", gap: 0, background: "white", borderBottom: "1px solid #e8e4df", flexShrink: 0, padding: "0 24px" }}>
        {([["", "全部"], ["NEWS", "科研文章"], ["NOTICE", "通知公告"], ["MODEL_RESOURCE", "模型资源"]] as const).map(([val, label]) => (
          <button key={val} onClick={() => setTypeFilter(val)}
            style={{
              padding: "10px 18px", border: "none", background: "none", cursor: "pointer",
              fontSize: 12, fontWeight: typeFilter === val ? 700 : 400,
              color: typeFilter === val ? "#d97706" : "#666",
              borderBottom: typeFilter === val ? "2px solid #d97706" : "2px solid transparent",
              transition: "all .15s",
            }}>
            {label}
          </button>
        ))}
      </div>
      {/* 工具栏 */}
      <div style={{ padding: "14px 24px", display: "flex", alignItems: "center", gap: 12, background: "white", borderBottom: "1px solid #e8e4df", flexShrink: 0 }}>
        <input
          style={{ padding: "7px 14px", border: "1px solid #d4c9b8", borderRadius: 8, fontSize: 12, width: 240, outline: "none", color: "#333" }}
          placeholder="搜索标题…" value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <select style={{ padding: "7px 12px", border: "1px solid #d4c9b8", borderRadius: 8, fontSize: 12, background: "white", color: "#333", cursor: "pointer" }}
          value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">全部状态</option><option value="PUBLISHED">已发布</option><option value="DRAFT">草稿</option><option value="ARCHIVED">已归档</option>
        </select>
        <span style={{ color: "#b0a89a", fontSize: 11 }}>共 {pageData?.total ?? 0} 条</span>
        {isFetching && <span style={{ width: 16, height: 16, border: "2px solid #e8e4df", borderTopColor: "#d97706", borderRadius: "50%", display: "inline-block", animation: "spin 0.6s linear infinite" }} />}
        <Link to="/content-manager/content/recycle" style={{ padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "white", color: "#666", border: "1px solid #d4c9b8", textDecoration: "none" }}>
          🗑 回收站
        </Link>
        <Link to="/content-manager/content/new" style={{ padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", background: "#d97706", color: "white", marginLeft: "auto", textDecoration: "none" }}>
          + 新建内容
        </Link>
      </div>

      {/* 表格 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: "white", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <thead style={{ background: "#fafaf9", position: "sticky", top: 0, zIndex: 2 }}>
            <tr style={{ borderBottom: "2px solid #e8e4df" }}>
              <th style={{ padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8b7355", textTransform: "uppercase", letterSpacing: "0.05em", width: 60 }}>ID</th>
              <th style={{ padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8b7355", textTransform: "uppercase", letterSpacing: "0.05em" }}>标题</th>
              <th style={{ padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8b7355", textTransform: "uppercase", letterSpacing: "0.05em", width: 90 }}>类型</th>
              <th style={{ padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8b7355", textTransform: "uppercase", letterSpacing: "0.05em", width: 90 }}>状态</th>
              <th style={{ padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8b7355", textTransform: "uppercase", letterSpacing: "0.05em", width: 110 }}>更新时间</th>
              <th style={{ padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8b7355", textTransform: "uppercase", letterSpacing: "0.05em", width: 180 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isPublished = row.status === "PUBLISHED";
              const typeBadge: Record<string, { bg: string; color: string; label: string }> = {
                NEWS: { bg: "#fef3c7", color: "#92400e", label: "科研文章" },
                NOTICE: { bg: "#d1fae5", color: "#065f46", label: "通知公告" },
                MODEL_RESOURCE: { bg: "#ede9fe", color: "#6d28d9", label: "模型资源" },
                PAGE: { bg: "#e0f2fe", color: "#0369a1", label: "页面" },
              };
              const tb = typeBadge[row.contentType] || typeBadge.NEWS;
              const dotColor = isPublished ? "#22c55e" : row.status === "DRAFT" ? "#f59e0b" : "#b0b0b0";
              const statusLabel = isPublished ? "已发布" : row.status === "DRAFT" ? "草稿" : "已归档";
              const previewPath = row.contentType === "MODEL_RESOURCE" ? `/models/${row.id}` : row.contentType === "NOTICE" ? `/news/notice/${row.id}` : `/news/article/${row.id}`;
              return (
                <tr key={row.id}>
                  <td style={{ padding: "12px 14px", borderBottom: "1px solid #f0ece6", fontSize: 12, verticalAlign: "middle", fontFamily: "monospace", color: "#b0a89a" }}>#{row.id}</td>
                  <td style={{ padding: "12px 14px", borderBottom: "1px solid #f0ece6", fontSize: 12, verticalAlign: "middle", fontWeight: 600, color: "#1a1a1a", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</td>
                  <td style={{ padding: "12px 14px", borderBottom: "1px solid #f0ece6", fontSize: 12, verticalAlign: "middle" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 999, letterSpacing: "0.03em", whiteSpace: "nowrap", background: tb.bg, color: tb.color }}>{tb.label}</span>
                  </td>
                  <td style={{ padding: "12px 14px", borderBottom: "1px solid #f0ece6", fontSize: 12, verticalAlign: "middle" }}>
                    <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", marginRight: 6, background: dotColor }} />{statusLabel}
                  </td>
                  <td style={{ padding: "12px 14px", borderBottom: "1px solid #f0ece6", fontSize: 12, verticalAlign: "middle" }}>{row.updatedAt?.split("T")[0] || ""}</td>
                  <td style={{ padding: "12px 14px", borderBottom: "1px solid #f0ece6", fontSize: 12, verticalAlign: "middle" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <Link to={`/content-manager/content/${row.id}/edit`} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid #d4c9b8", background: "white", color: "#666", whiteSpace: "nowrap", textDecoration: "none" }}>编辑</Link>
                      <a href={`/#${previewPath}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid #d4c9b8", background: "white", color: "#666", whiteSpace: "nowrap", textDecoration: "none" }}>预览</a>
                      {isPublished ? (
                        <button onClick={() => handleDelete(row.id)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid #d4c9b8", background: "white", color: "#666", whiteSpace: "nowrap" }}>归档</button>
                      ) : (
                        <button onClick={() => handleDelete(row.id)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid #d4c9b8", background: "white", color: "#666", whiteSpace: "nowrap" }}>删除</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !isFetching && (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#b0a89a" }}>暂无内容</td></tr>
            )}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontSize: 12, color: "#b0a89a" }}>
          <span>共 {pageData?.total ?? 0} 条</span>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
