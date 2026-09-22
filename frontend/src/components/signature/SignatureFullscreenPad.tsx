import { useEffect, useRef, useState } from "react";
import { Portal } from "@/components/Portal";
import { SignaturePad } from "./SignaturePad";
import { fitSignatureBox, SIGNATURE_CANVAS } from "./signatureData";
import { useViewportHeight } from "@/pages/mobile/useViewportHeight";

/** 内容区四周留白（p-3 的 12px × 2） */
const GUTTER = 24;

/**
 * 手机端签名浮层（整屏，只有 返回 / 重试 / 提交 三个按钮）。
 *
 * <p>写区永远是一块 8:3，问题只是竖屏手机上横着放不下 —— 所以竖屏时**整个浮层转 90°**
 * 铺满屏幕（连按钮条一起转，不是只转画布），用户把手机横过来看到的就是正常的横屏界面，
 * 画布长边顺着手机长边，能占满整屏。横屏时不动。
 *
 * <p>转的是外层容器，{@link SignaturePad} 自己的坐标系没变，所以落笔坐标、导出的
 * 800×300 都不受影响 —— 屏上多大、手机怎么拿，最终贴进文档的都是同一张 8:3。
 *
 * <p>高度取 visualViewport 而非 window.innerHeight / 100vh：微信与 iOS webview 里
 * 地址栏展开时 vh 按大视口算，画布底部连同按钮条会被推到屏幕外。
 */
export function SignatureFullscreenPad({
  value,
  onChange,
  onBack,
  onSubmit,
  busy = false,
  title,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  onBack: () => void;
  onSubmit: () => void;
  busy?: boolean;
  /** 按钮条上的一行小字（如「为 张三 签署」）；不传就只有三个按钮 */
  title?: string;
}) {
  const vh = useViewportHeight();
  /** 按钮条以上那块可写区，实测尺寸（比按 window 估算准：按钮高、标题换行都算在内） */
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const viewW = typeof window === "undefined" ? 0 : Math.round(window.visualViewport?.width ?? window.innerWidth);
  const viewH = vh || (typeof window === "undefined" ? 0 : window.innerHeight);
  /** 竖屏：整层转 90° 摆，等于借屏幕的长边当写区的长边 */
  const portrait = viewH >= viewW;
  const layoutW = portrait ? viewH : viewW;
  const layoutH = portrait ? viewW : viewH;

  // 首帧还没量到 box 时给个保守值，ResizeObserver 一到就纠正
  const availW = Math.max(160, (box.w || layoutW) - GUTTER);
  const availH = Math.max(80, (box.h || layoutH) - GUTTER);
  const { width: padW, height: padH } = fitSignatureBox(availW, availH);

  return (
    /*
     * Portal 到 body：浮层挂在「我的」tab 的内容容器里，那容器自带层叠上下文（滚动 + 定位），
     * 子元素 z-index 再高也出不去，移动端外壳的底部 tab 栏就盖不住。z 用 --z-modal(800) > tab 栏的 --z-sticky(400)。
     */
    <Portal>
      {/* 外层只负责裁掉旋转后撑到屏幕外的部分（旋转前的盒子比屏幕宽/高） */}
      <div className="fixed inset-0 z-[var(--z-modal)] overflow-hidden bg-white dark:bg-gray-900">
        <div
          className="absolute left-0 top-0 flex flex-col"
          style={{
            width: layoutW,
            height: layoutH,
            ...(portrait
              ? { transform: `translate(${layoutH}px, 0) rotate(90deg)`, transformOrigin: "0 0" }
              : null),
          }}
        >
          <div ref={boxRef} className="flex min-h-0 flex-1 items-center justify-center p-3">
            <div className="shrink-0" style={{ width: padW }}>
              <SignaturePad
                value={value}
                onChange={onChange}
                outputSize={SIGNATURE_CANVAS}
                format="png"
                rotate={portrait ? 90 : 0}
                height={padH}
                showFooter={false}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-center gap-3 border-t border-gray-200 p-3 dark:border-gray-800">
            {title ? (
              <span className="mr-1 max-w-[36%] truncate text-xs text-gray-500 dark:text-gray-400">{title}</span>
            ) : null}
            <button
              type="button"
              className="rounded-xl border border-gray-300 px-5 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200"
              onClick={onBack}
            >
              返回
            </button>
            <button
              type="button"
              className="rounded-xl border border-gray-300 px-5 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200"
              onClick={() => onChange(null)}
            >
              重试
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={busy || !value}
              className="rounded-xl bg-indigo-600 px-6 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? "提交中…" : "提交"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
