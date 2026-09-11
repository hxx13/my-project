import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { computePreviewLayout, MM_TO_PX } from "../cardPreviewLayout";
import { effectiveCells, type CardSlot, type CardSpec } from "../types";

interface Props {
  spec: CardSpec;
  slots: CardSlot[];
  sample: Record<string, string>;
}

export function CardPreview({ spec, slots, sample }: Props) {
  const layout = computePreviewLayout(spec, slots);
  const px = (mm: number) => mm * MM_TO_PX;

  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const fit = () => {
      const avail = el.clientWidth;
      const w = layout.paperWidthPx;
      if (avail > 0 && w > 0) setScale(Math.min(1, avail / w));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.paperWidthPx, layout.paperHeightPx]);

  return (
    <div ref={hostRef} style={{ width: "100%" }}>
      <div style={{ width: layout.paperWidthPx * scale, height: layout.paperHeightPx * scale }}>
        <div
          style={{
            position: "relative",
            width: layout.paperWidthPx,
            height: layout.paperHeightPx,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            background: "#fff",
            border: "1px solid var(--app-color-border)",
            color: "#000",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: layout.layoutWidthPx,
              height: layout.layoutHeightPx,
              transformOrigin: "top left",
              transform: layout.rotated
                ? `translate(0, ${layout.paperHeightPx}px) rotate(-90deg)`
                : undefined,
            }}
          >
          {layout.rows.map((row, j) =>
            row.map((r, i) => {
              // 空格子不产矩形，矩形下标与 cells 下标会错位——按 r.index 取对应单元格
              const cell = effectiveCells(slots[j])[r.index];
              if (!cell) return null;
              const fontSize = slots[j].fontSizePt ?? spec.defaultFontSizePt;
              const fontWeight = slots[j].fontWeight ?? spec.defaultFontWeight ?? 700;
              const hAlign = slots[j].align ?? "left";
              const vAlign = slots[j].vAlign ?? "middle";
              return (
                <div
                  key={`${j}-${i}`}
                  style={{
                    position: "absolute",
                    left: px(r.x),
                    top: px(r.y),
                    width: px(r.w),
                    height: px(r.h),
                    boxSizing: "border-box",
                    border:
                      spec.borderWidthMm > 0
                        ? `${Math.max(px(spec.borderWidthMm), 0.5)}px solid ${spec.borderColor}`
                        : "none",
                    fontSize: px(fontSize * 0.3528), // pt → mm → px
                    fontWeight,
                    display: "flex",
                    alignItems: vAlign === "top" ? "flex-start" : vAlign === "bottom" ? "flex-end" : "center",
                    padding: `0 ${px(1)}px`,
                    justifyContent: hAlign === "center" ? "center" : hAlign === "right" ? "flex-end" : "flex-start",
                  }}
                >
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {cell.label ?? ""}
                    {cell.fieldKey ? sample[cell.fieldKey] ?? "" : ""}
                  </span>
                </div>
              );
            })
          )}
          {layout.qrRect && spec.qr.enabled ? (
            <div
              style={{
                position: "absolute",
                left: px(layout.qrRect.x),
                top: px(layout.qrRect.y),
                width: px(layout.qrRect.w),
                height: px(layout.qrRect.h),
              }}
            >
              <QRCodeSVG value={sample[spec.qr.fieldKey] ?? ""} size={px(spec.qr.sizeMm)} level="M" />
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
