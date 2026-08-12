import { useParams, Link, useNavigate } from "react-router-dom";
import { usePublicContent } from "@/api/hooks/usePortalContent";

export default function NoticeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const numId = id ? Number(id) : 0;
  const { data: item, isLoading } = usePublicContent(numId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f7f5f2] flex items-center justify-center">
        <div style={{ width: 24, height: 24, border: "3px solid #e8e4df", borderTopColor: "#d97706", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-[#f7f5f2] flex items-center justify-center">
        <p className="text-neutral-400">公告不存在</p>
      </div>
    );
  }

  const ext = (item.extensionJson as Record<string, string>) || {};
  const priority = (ext.priority as string) || "notice";
  const priorityConfig: Record<string, { badge: string; color: string }> = {
    important: { badge: "重要", color: "#dc2626" },
    notice: { badge: "通知", color: "#065f46" },
    update: { badge: "更新", color: "#6d28d9" },
  };
  const pc = priorityConfig[priority] || priorityConfig.notice;

  return (
    <div className="min-h-screen bg-[#f7f5f2]">
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 32px 80px" }}>
        {/* 面包屑 */}
        <div style={{ padding: "32px 0 0", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#b0a89a" }}>
          <Link to="/news" style={{ color: "#8b7355", textDecoration: "none" }}>新闻动态</Link>
          <span>›</span>
          <span>正文</span>
          <button onClick={() => navigate(-1)} style={{ marginLeft: "auto", fontSize: 12, color: "#d97706", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
            ← 返回
          </button>
        </div>

        {/* 标题 */}
        <div style={{ padding: "36px 0 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 12px", borderRadius: 99, background: "#fef2f2", color: pc.color }}>
              {pc.badge}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 12px", borderRadius: 99, background: "#faf7f2", color: "#8b7355" }}>
              通知公告
            </span>
            <span style={{ fontSize: 11, color: "#b0a89a" }}>{item.publishedAt?.split("T")[0] || ""}</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.35, marginBottom: 14 }}>{item.title}</h1>
        </div>

        {/* 信息摘要卡 */}
        {(item.summary || ext.publisher) && (
          <div style={{ background: "white", border: "1px solid #e8e4df", borderRadius: 14, padding: "18px 22px", marginBottom: 32, display: "flex", gap: 32, flexWrap: "wrap" }}>
            {ext.publisher && (
              <div>
                <div style={{ fontSize: 10, color: "#b0a89a", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>发布单位</div>
                <div style={{ fontSize: 13, color: "#333", fontWeight: 500 }}>{ext.publisher as string}</div>
              </div>
            )}
            {item.summary && (
              <div>
                <div style={{ fontSize: 10, color: "#b0a89a", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>摘要</div>
                <div style={{ fontSize: 13, color: "#333", fontWeight: 500 }}>{item.summary}</div>
              </div>
            )}
          </div>
        )}

        {/* 正文 */}
        <div style={{ fontSize: 15, color: "#333", lineHeight: 1.85 }}>
          {item.contentHtml ? (
            <div dangerouslySetInnerHTML={{ __html: item.contentHtml }} />
          ) : (
            <p style={{ color: "#666" }}>暂无正文内容</p>
          )}
        </div>

      </div>
    </div>
  );
}
