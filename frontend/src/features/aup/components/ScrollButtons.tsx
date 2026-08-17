import type { CSSProperties } from "react";

const BTN_STYLE: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  border: "1px solid #e5e9ef",
  background: "#fff",
  color: "#1a2233",
  cursor: "pointer",
  fontSize: 18,
  lineHeight: 1,
  boxShadow: "0 2px 8px rgba(0,0,0,.12)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "background .15s",
};

/**
 * 右下角浮动「回顶部 / 滚到底部」按钮。
 * 填写页与模板编辑页复用，滚动容器默认为 window（document）。
 */
export default function ScrollButtons() {
  const toTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const toBottom = () =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });

  return (
    <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 40, display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        style={BTN_STYLE}
        onClick={toTop}
        title="回到顶部"
        aria-label="回到顶部"
        onMouseEnter={(e) => (e.currentTarget.style.background = "#eef1fd")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
      >
        ↑
      </button>
      <button
        type="button"
        style={BTN_STYLE}
        onClick={toBottom}
        title="滚到底部"
        aria-label="滚到底部"
        onMouseEnter={(e) => (e.currentTarget.style.background = "#eef1fd")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
      >
        ↓
      </button>
    </div>
  );
}
