import { useParams, Link, useNavigate } from "react-router-dom";
import { usePublicContent } from "@/api/hooks/usePortalContent";

export default function ModelResourceDetailPage() {
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
        <p className="text-neutral-400">品系不存在</p>
      </div>
    );
  }

  let ext: Record<string, unknown> = {};
  try {
    ext = typeof item.extensionJson === 'string'
      ? JSON.parse(item.extensionJson)
      : (item.extensionJson as Record<string, unknown>) || {};
  } catch {
    ext = {};
  }
  const extLinks = (ext.links as Array<{ url: string; label: string }>) || [];
  const strainId = (ext.strainId as string) || `SHSMU-M-${String(item.id).padStart(5, "0")}`;

  const labelStyle: React.CSSProperties = { fontSize: 10, color: "#b0a89a", textTransform: "uppercase", letterSpacing: "0.06em" };
  const valueStyle: React.CSSProperties = { fontSize: 13, color: "#333", fontWeight: 500 };

  return (
    <div className="min-h-screen bg-[#f7f5f2]">
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 48px 80px" }}>
        {/* 面包屑 */}
        <div style={{ padding: "28px 0 0", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#b0a89a" }}>
          <Link to="/models" style={{ color: "#8b7355", textDecoration: "none" }}>模型资源</Link>
          <span>›</span>
          {item.categoryName && <><Link to={`/models?search=${encodeURIComponent(item.categoryName)}`} style={{ color: "#8b7355", textDecoration: "none" }}>{item.categoryName}</Link><span>›</span></>}
          <span>{item.title}</span>
          <button onClick={() => navigate(-1)} style={{ marginLeft: "auto", fontSize: 12, color: "#d97706", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
            ← 返回
          </button>
        </div>

        {/* 标题区 */}
        <div style={{ padding: "24px 0 32px", display: "flex", gap: 48, alignItems: "flex-start" }}>
          <div style={{ width: 320, height: 220, borderRadius: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 72, background: "linear-gradient(135deg, #ede9fe, #c4b5fd)" }}>
            🧬
          </div>
          <div style={{ flex: 1, paddingTop: 8 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontFamily: "monospace", color: "#8b7355", background: "#faf7f2", padding: "5px 14px", borderRadius: 8, marginBottom: 14 }}>
              📋 {strainId}
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.3, marginBottom: 10 }}>{item.title}</h1>
            <p style={{ fontSize: 15, color: "#8b7355", marginBottom: 16, lineHeight: 1.5 }}>{item.summary || "暂无简介"}</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
              {item.categoryName && <span style={{ fontSize: 11, fontWeight: 600, padding: "5px 14px", borderRadius: 99, background: "#ede9fe", color: "#6d28d9" }}>{item.categoryName}</span>}
              {(ext.strainBg as string) && <span style={{ fontSize: 11, fontWeight: 600, padding: "5px 14px", borderRadius: 99, background: "#fef3c7", color: "#92400e" }}>{ext.strainBg as string}</span>}
              <span style={{ fontSize: 11, fontWeight: 600, padding: "5px 14px", borderRadius: 99, background: "#e8e4df", color: "#5c4d3c" }}>可用</span>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {extLinks.map((link, i) => (
                <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" style={{
                  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#d97706",
                  textDecoration: "none", fontWeight: 600, padding: "8px 18px", border: "1px solid #fde68a",
                  borderRadius: 10, background: "#fef9ee",
                }}>
                  🔗 {link.label || "百科页面"} →
                </a>
              ))}
            </div>
          </div>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid #e8e4df" }} />

        {/* 正文 + 侧栏 */}
        <div style={{ display: "flex", gap: 56, paddingTop: 36 }}>
          {/* 正文 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {item.contentHtml ? (
              <div style={{ fontSize: 14, lineHeight: 1.8, color: "#444" }} dangerouslySetInnerHTML={{ __html: item.contentHtml }} />
            ) : (
              <div style={{ fontSize: 14, lineHeight: 1.8, color: "#444" }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px" }}>品系描述</h2>
                <p>{item.summary || "暂无详细描述。请通过后台编辑补充品系描述、基因修饰信息、研究应用等内容。"}</p>
              </div>
            )}
          </div>

          {/* 信息卡 */}
          <aside style={{ width: 260, flexShrink: 0 }}>
            <div style={{
              background: "white", border: "1px solid #e8e4df", borderRadius: 14,
              padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              position: "sticky", top: 84,
            }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8b7355", marginBottom: 14 }}>品系信息</h4>
              {[
                ["品系编号", strainId],
                ["常用名", (ext.commonName as string) || "-"],
                ["遗传背景", (ext.strainBg as string) || "-"],
                ["品系分类", item.categoryName || "-"],
                ["修饰方式", (ext.modMethod as string) || "-"],
                ["纯合子育性", (ext.fertility as string) || "-"],
                ["饲养环境", (ext.housing as string) || "-"],
              ].map(([label, value]) => (
                <div key={label} style={{ marginBottom: 12 }}>
                  <div style={labelStyle}>{label}</div>
                  <div style={valueStyle}>{value}</div>
                </div>
              ))}
              {extLinks.length > 0 && (
                <div style={{ marginBottom: 0 }}>
                  <div style={labelStyle}>百科外链</div>
                  {extLinks.map((link, i) => (
                    <div key={i} style={{ ...valueStyle, marginTop: 2 }}>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: "#d97706", textDecoration: "none" }}>
                        {link.label || link.url} →
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>

      </div>
    </div>
  );
}
