import { createPortal } from "react-dom";
import type { CSSProperties, RefObject } from "react";

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
 * 默认滚动 window；内容管理壳内可传入 scrollRef（如主内容区）。
 */
export default function ScrollButtons({
  scrollRef,
}: {
  /** 嵌入壳内滚动容器；缺省为 window / document */
  scrollRef?: RefObject<HTMLElement | null>;
}) {
  const toTop = () => {
    const el = scrollRef?.current;
    if (el) el.scrollTo({ top: 0, behavior: "smooth" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const toBottom = () => {
    const el = scrollRef?.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    else window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  };

  return createPortal(
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
    </div>,
    document.body
  );
}
