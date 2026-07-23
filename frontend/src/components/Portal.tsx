import { createPortal } from "react-dom";

/** 将子节点渲染到 document.body，确保 fixed 定位始终相对于视口 */
export function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}
