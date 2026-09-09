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

  return (
    <div
      style={{
        position: "relative",
        width: layout.paperWidthPx,
        height: layout.paperHeightPx,
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
                // align/bold 是预留字段：渲染引擎尚未消费，预览必须与实印一致，故恒常规字重 + 左对齐
                fontWeight: 400,
                display: "flex",
                alignItems: "center",
                padding: `0 ${px(1)}px`,
                justifyContent: "flex-start",
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
  );
}
