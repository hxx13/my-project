import { useCallback, useEffect, useRef } from "react";
import type { JSX, PointerEvent as ReactPointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { fitSize } from "./signatureData";

/** 签名纸底：JPEG 无透明通道，不铺白会导出黑底（黑字变不可见） */
const PAPER = "#ffffff";
/** CSS 变量取不到时的笔色兜底 */
const PEN_FALLBACK = "#111827";

export type SignaturePadProps = {
  /** 受控 dataUrl */
  value?: string | null;
  /** 空画布回调 null */
  onChange: (dataUrl: string | null) => void;
  /** 默认 180 */
  height?: number;
  /** 不传则取 CSS 变量 --app-color-text-primary */
  penColor?: string;
  /** 默认 2.5 */
  lineWidth?: number;
  /** 默认 600 */
  maxEdge?: number;
  /** 默认 0.8（仅 jpeg 生效） */
  quality?: number;
  /**
   * 固定输出尺寸。给了就按「等比 contain + 居中」重绘到**恰好这个尺寸**的画布上 ——
   * 这样不管容器多宽、笔迹画多大，每次产出的像素尺寸完全一致（贴进文档不用再逐张对齐）。
   * 不传 = 保持原有行为（宽度跟随容器，最长边压到 maxEdge）。
   */
  outputSize?: { width: number; height: number };
  /** 默认 "jpeg"（含既有调用方依赖的白底）。细笔画建议用 "png"：无损，放大不糊。 */
  format?: "jpeg" | "png";
  disabled?: boolean;
  className?: string;
};

/**
 * 通用手写签名板。触摸与鼠标同一套 Pointer Events，
 * 抬笔即按 fitSize 离屏重绘为 JPEG dataUrl 回调出去。
 */
export function SignaturePad({
  value = null,
  onChange,
  height = 180,
  penColor,
  lineWidth = 2.5,
  maxEdge = 600,
  quality = 0.8,
  outputSize,
  format = "jpeg",
  disabled = false,
  className,
}: SignaturePadProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** 空画布判据：本轮是否真的落过笔 */
  const dirtyRef = useRef(false);
  /** 正在落笔 */
  const drawingRef = useRef(false);
  /** 当前按下的 pointerId，防止多指串线 */
  const pointerIdRef = useRef<number | null>(null);
  /** 画布当前内容源，同时用作「自己发出的值回流」判据 */
  const valueRef = useRef<string | null>(value);

  /** 笔色：优先 prop，其次 CSS 变量，最后兜底 */
  const resolvePen = useCallback(() => {
    if (penColor) return penColor;
    const canvas = canvasRef.current;
    if (!canvas) return PEN_FALLBACK;
    const color = getComputedStyle(canvas).getPropertyValue("--app-color-text-primary").trim();
    return color || PEN_FALLBACK;
  }, [penColor]);

  /** 重建 backing store（按 dpr 放大）并把 dataUrl 画回去 */
  const render = useCallback(
    (dataUrl: string | null, force: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const cssW = Math.max(
        1,
        Math.round(canvas.clientWidth || canvas.parentElement?.clientWidth || 300)
      );
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(cssW * dpr);
      const h = Math.round(height * dpr);
      if (!force && canvas.width === w && canvas.height === h) return; // 尺寸没变别重画，免得抹掉正在写的字
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = resolvePen();
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, cssW, height);
      valueRef.current = dataUrl;
      dirtyRef.current = Boolean(dataUrl);
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const ctx2 = canvas.getContext("2d");
        if (!ctx2) return;
        const scale = Math.min(cssW / img.width, height / img.height, 1);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx2.drawImage(img, (cssW - dw) / 2, (height - dh) / 2, dw, dh);
        dirtyRef.current = true;
      };
      img.src = dataUrl;
    },
    [height, lineWidth, resolvePen]
  );

  // 挂载 + 容器尺寸变化时重建（旋转/换屏后 canvas 宽度会变）
  useEffect(() => {
    render(valueRef.current, true);
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => render(valueRef.current, false));
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [render]);

  // 外部赋值（含父组件回填我们自己发出的值：相等即跳过，避免抹掉笔迹）
  useEffect(() => {
    if (value === valueRef.current) return;
    render(value ?? null, true);
  }, [value, render]);

  /**
   * 抬笔落图：空画布回 null，否则离屏重绘后导出。
   * 给了 outputSize 就重绘到固定尺寸（等比 contain + 居中），否则走原来的「最长边压 maxEdge」。
   */
  const commit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!dirtyRef.current) {
      valueRef.current = null;
      onChange(null);
      return;
    }
    const off = document.createElement("canvas");
    const octx = off.getContext("2d");
    if (!octx) return;

    if (outputSize) {
      off.width = Math.max(1, outputSize.width);
      off.height = Math.max(1, outputSize.height);
      octx.fillStyle = PAPER;
      octx.fillRect(0, 0, off.width, off.height);
      const scale = Math.min(off.width / canvas.width, off.height / canvas.height);
      const w = canvas.width * scale;
      const h = canvas.height * scale;
      octx.drawImage(canvas, (off.width - w) / 2, (off.height - h) / 2, w, h);
    } else {
      const { width, height: outH } = fitSize(canvas.width, canvas.height, maxEdge);
      off.width = Math.max(1, width);
      off.height = Math.max(1, outH);
      octx.fillStyle = PAPER;
      octx.fillRect(0, 0, off.width, off.height);
      octx.drawImage(canvas, 0, 0, off.width, off.height);
    }

    const dataUrl = format === "png"
      ? off.toDataURL("image/png")
      : off.toDataURL("image/jpeg", quality);
    valueRef.current = dataUrl;
    onChange(dataUrl);
  }, [maxEdge, quality, outputSize, format, onChange]);

  const pointOf = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;
    drawingRef.current = true;
    const { x, y } = pointOf(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y); // 点一下也留一个圆点
    ctx.stroke();
    dirtyRef.current = true;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || !drawingRef.current || pointerIdRef.current !== e.pointerId) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointOf(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirtyRef.current = true;
  };

  const endStroke = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    pointerIdRef.current = null;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    commit();
  };

  const clear = () => {
    render(null, true);
    valueRef.current = null;
    onChange(null);
  };

  return (
    <div className={`flex w-full flex-col gap-2 ${className ?? ""}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        style={{
          // 必须保留：否则触摸屏上手指划动会被浏览器当成滚动手势，画不出线
          touchAction: "none",
          width: "100%",
          height,
        }}
        className={`block rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] ${
          disabled ? "pointer-events-none opacity-50" : ""
        }`}
      />
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={clear}>
          重新签名
        </Button>
      </div>
    </div>
  );
}
