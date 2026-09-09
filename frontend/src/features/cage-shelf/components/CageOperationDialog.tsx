import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { submitCageDivide, submitCageTransfer, type CageOpTarget } from "@/api/domains/cageShelf.api";
import { CageFormModalPortal } from "./CageFormModalPortal";
import { displayPosition } from "../constants";
import type { CageOpKind, CageOpSource } from "../useCageOpSelect";

/** 坐标 → 位号，与网格显示同一套换算（A-1 在底行，显示为 A-10） */
function positionLabel(x?: number | null, y?: number | null): string {
  if (x == null || y == null) return "—";
  return displayPosition(`${x}-${y}`);
}

function whereOf(t: CageOpTarget): string {
  return [t.campusName, t.roomName, t.shelveName].filter(Boolean).join(" / ");
}

/**
 * 分笼 / 转移的确认弹窗 — 三端共用。
 * 目标已在主网格上选好，这里只复核坐标 + 补充保留源笼位/原因，然后提交。
 * 是否需审核由后端按视角 + 配置决定，这里只展示结果。
 */
export default function CageOperationDialog({
  open,
  op,
  source,
  picked,
  onClose,
  onDone,
}: {
  open: boolean;
  op: CageOpKind;
  source: CageOpSource | null;
  picked: CageOpTarget[];
  onClose: () => void;
  onDone?: () => void;
}) {
  /** 分笼默认保留源笼位；不勾选才会把源笼位归档为空笼盒 */
  const [keepSource, setKeepSource] = useState(true);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isDivide = op === "divide";

  useEffect(() => {
    if (open) {
      setKeepSource(true);
      setReason("");
    }
  }, [open]);

  if (!open || !source) return null;

  const handleSubmit = async () => {
    if (picked.length === 0) {
      toast.error(isDivide ? "请先选择分笼目标笼位" : "请先选择转移目标笼位");
      return;
    }
    setSubmitting(true);
    try {
      const res = isDivide
        ? await submitCageDivide({
            sourceAnimalCageId: source.animalCageId,
            targetAnimalCageIds: picked.map((t) => t.animalCageId),
            keepSource,
            reason: reason.trim() || undefined,
          })
        : await submitCageTransfer({
            fromAnimalCageId: source.animalCageId,
            toAnimalCageId: picked[0].animalCageId,
            reason: reason.trim() || undefined,
          });
      toast.success(res.needApproval ? "已提交，等待审核" : "操作已完成");
      onDone?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CageFormModalPortal>
      <div className="aup-modal-mask" onClick={onClose}>
        <div className="aup-modal" style={{ maxWidth: 560, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
          <h3>{isDivide ? "确认分笼" : "确认转移笼位"}</h3>

          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.7, marginBottom: 10 }}>
            <div>
              源笼位：<b style={{ color: "var(--twin-ink)" }}>{source.position ? displayPosition(source.position) : source.animalCageId}</b>
              {source.occupantName ? ` · 占用者 ${source.occupantName}` : ""}
            </div>
            <div style={{ marginTop: 4 }}>
              {isDivide ? "目标笼位（表单将整表复制到这些笼位作为基础信息）：" : "转移目标（占用者/动物信息/状态标记整体迁入）："}
            </div>
          </div>

          <div
            style={{
              maxHeight: "32vh",
              overflowY: "auto",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 8,
              marginBottom: 10,
            }}
          >
            {picked.length === 0 ? (
              <div style={{ padding: 12, textAlign: "center", fontSize: 12, color: "var(--muted)" }}>未选择目标笼位</div>
            ) : (
              picked.map((t) => (
                <div
                  key={t.animalCageId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    padding: "4px 2px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span style={{ fontWeight: 600, minWidth: 44 }}>{positionLabel(t.positionX, t.positionY)}</span>
                  <span style={{ color: "var(--muted)", minWidth: 0, flex: 1 }}>{whereOf(t)}</span>
                  {t.aupNumber && <span style={{ fontSize: 11, color: "var(--muted)" }}>{t.aupNumber}</span>}
                </div>
              ))
            )}
          </div>

          {isDivide && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 8 }}>
              <input type="checkbox" checked={keepSource} onChange={(e) => setKeepSource(e.target.checked)} />
              保留原笼位不变（默认保留；不勾选则源笼位归档为空笼盒）
            </label>
          )}

          <textarea
            className="input"
            rows={2}
            placeholder="原因（可选，会记入留痕）"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ width: "100%", resize: "vertical" }}
          />

          <div className="aup-modal-actions">
            <button className="btn ghost" onClick={onClose} disabled={submitting}>
              返回选位
            </button>
            <button
              className="btn primary"
              disabled={submitting || picked.length === 0}
              onClick={handleSubmit}
            >
              {submitting ? "提交中…" : isDivide ? `确认分笼（${picked.length}）` : "确认转移"}
            </button>
          </div>
        </div>
      </div>
    </CageFormModalPortal>
  );
}
