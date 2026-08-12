import { useParams, useNavigate, Link } from "react-router-dom";
import { usePublicContent } from "@/api/hooks/usePortalContent";

export default function ArticleDetailPage() {
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
        <p className="text-neutral-400">文章不存在</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f5f2]">
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 32px 80px" }}>
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
        <div style={{ padding: "36px 0 28px" }}>
          <span style={{ display: "inline-block", fontSize: 11, fontWeight: 600, padding: "4px 14px", borderRadius: 99, background: "#fef3c7", color: "#92400e", marginBottom: 16 }}>
            文章干货
          </span>
          <h1 style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.35, marginBottom: 14 }}>{item.title}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "#b0a89a" }}>
            <span>{item.publishedAt?.split("T")[0] || ""}</span>
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#d4c9b8" }} />
            <span>实验动物科学部</span>
          </div>
        </div>

        {/* 封面图 */}
        {item.coverUrl && (
          <img src={item.coverUrl} alt={item.title} style={{ width: "100%", height: 360, borderRadius: 16, marginBottom: 40, objectFit: "cover" }} />
        )}

        {/* 正文 */}
        <div style={{ fontSize: 15, color: "#333", lineHeight: 1.85 }}>
          {item.contentHtml ? (
            <div dangerouslySetInnerHTML={{ __html: item.contentHtml }} />
          ) : (
            <p style={{ color: "#666" }}>{item.summary || "暂无正文内容"}</p>
          )}
        </div>

      </div>
    </div>
  );
}
