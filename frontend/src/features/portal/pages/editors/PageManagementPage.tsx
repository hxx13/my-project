import { Link } from "react-router-dom";
import { FileText, HelpCircle, Phone, BookOpen } from "lucide-react";

const PAGE_TYPES = [
  {
    key: "about",
    title: "关于我们",
    desc: "部门简介、平台实力、统计数字、内容分段",
    icon: FileText,
    color: "#d97706",
    bg: "#fef3c7",
  },
  {
    key: "faq",
    title: "常见问题",
    desc: "问答条目管理，前端手风琴展示",
    icon: HelpCircle,
    color: "#7c3aed",
    bg: "#ede9fe",
  },
  {
    key: "contact",
    title: "联系我们",
    desc: "地址、电话、邮箱、办公时间等联系方式与地图指引",
    icon: Phone,
    color: "#059669",
    bg: "#d1fae5",
  },
  {
    key: "service_guide",
    title: "服务指南",
    desc: "使用流程与收费标准（通用编辑器）",
    icon: BookOpen,
    color: "#0369a1",
    bg: "#e0f2fe",
  },
];

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid #e8e4df",
  borderRadius: 16,
  padding: "28px 24px",
  boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
  cursor: "pointer",
  transition: "box-shadow 0.2s, transform 0.15s",
  textDecoration: "none",
  color: "inherit",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: 10,
};

export default function PageManagementPage() {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 32, background: "#f5f3f0" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1a1a1a", marginBottom: 6 }}>📄 页面管理</h1>
          <p style={{ fontSize: 13, color: "#8b7355" }}>选择要编辑的页面类型，进入专用编辑器。每个页面支持多版本管理，编辑保存后选择一个版本发布。</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {PAGE_TYPES.map((pt) => {
            const Icon = pt.icon;
            const href = pt.key === "service_guide"
              ? `/content-manager/pages/service-guide`
              : `/content-manager/pages/${pt.key}`;
            return (
              <Link
                key={pt.key}
                to={href}
                state={{ returnTo: "/content-manager/pages", returnLabel: "返回页面管理" }}
                style={cardStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.1)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.04)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div
                  style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: pt.bg, display: "flex",
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Icon style={{ width: 26, height: 26, color: pt.color }} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>{pt.title}</div>
                  <div style={{ fontSize: 12, color: "#8b7355", lineHeight: 1.5 }}>{pt.desc}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
