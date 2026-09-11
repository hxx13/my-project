import { useEffect } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useBrowserFullscreen } from "@/hooks/useBrowserFullscreen";

/**
 * Header 全屏切换按钮：点击等效 F11 全屏，再次点击退出。
 * 目标固定为整页 documentElement；样式由调用方按各自 CSS 变量作用域传入。
 */
export function FullscreenToggleButton({ className }: { className?: string }) {
  const { isFullscreen, targetRef, toggleFullscreen } = useBrowserFullscreen();

  // 不绑定 targetRef 会走 fallback 并打出 warning，这里显式指向整页
  useEffect(() => {
    targetRef.current = document.documentElement;
  }, [targetRef]);

  const label = isFullscreen ? "退出全屏" : "全屏";

  return (
    <button
      type="button"
      onClick={() => void toggleFullscreen()}
      title={label}
      aria-label={label}
      aria-pressed={isFullscreen}
      className={className}
    >
      {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
    </button>
  );
}
