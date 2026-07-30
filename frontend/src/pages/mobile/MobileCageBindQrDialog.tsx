/** 手机版 — 扫码绑定笼盒对话框
 *
 *  扫码由父组件工具栏蓝色按钮触发，本对话框只负责状态展示 + 笼位确认
 */
import { useState, useCallback } from "react";
import { Loader2, AlertTriangle, Check, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { bindCageBox, updateAnimalCage, type AnimalCageUpdatePayload } from "@/api/domains/cageShelf.api";
import type { CageShelfCell } from "@/features/student/api/student.api";
import { getCellStatusDisplayLabel } from "@/features/cage-shelf/components/CageCellOverlays";
import toast from "react-hot-toast";

interface Props {
  visible: boolean;
  onClose: () => void;
  scannedCode: string;
  selectedCell?: CageShelfCell | null;
  selectedCageData?: Record<string, unknown> | null;
  shelfMeta?: { roomId?: number | string; shelveId?: number | string; [k: string]: unknown } | null;
  onBound?: () => void;
}

export default function MobileCageBindQrDialog({
  visible, onClose, scannedCode, selectedCell, selectedCageData, shelfMeta, onBound,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const roomId = shelfMeta?.roomId != null ? Number(shelfMeta.roomId) : 0;
  const shelveId = shelfMeta?.shelveId != null ? Number(shelfMeta.shelveId) : 0;

  const handleConfirm = useCallback(async () => {
    if (!selectedCell || !selectedCageData || !scannedCode) {
      setError("请先扫码并选择目标笼位");
      return;
    }
    const cellType = (selectedCell as any).animalCageType;
    if (cellType !== 2) {
      setError("只能绑定到「已预约(空笼盒)」的笼位");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const cageId = Number((selectedCageData as any).id ?? 0);
      const cageName = String((selectedCageData as any).name ?? "");
      const cagePosX = Number((selectedCageData as any).positionX ?? (selectedCell as any).x ?? 0);
      const cagePosY = Number((selectedCageData as any).positionY ?? (selectedCell as any).y ?? 0);

      await bindCageBox(String(cageId), scannedCode);

      const payload: AnimalCageUpdatePayload = {
        id: cageId,
        name: cageName,
        roomId,
        shelveId,
        postionX: cagePosX,
        postionY: cagePosY,
        qrcode: scannedCode,
        state: 3,
      };
      await updateAnimalCage(payload);

      toast.success("绑定成功！");
      setSubmitting(false);
      onBound?.();
      onClose();
    } catch (e: any) {
      setError(e?.message || "绑定失败");
      setSubmitting(false);
    }
  }, [selectedCell, selectedCageData, scannedCode, roomId, shelveId, onBound, onClose]);

  const handleClose = useCallback(() => {
    setError("");
    setSubmitting(false);
    onClose();
  }, [onClose]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] bg-black/60 flex items-end justify-center">
      <div className="bg-[var(--app-color-surface-page)] w-full max-h-[85vh] rounded-t-[var(--app-radius-container)] overflow-auto pb-8">
        <div className="sticky top-0 bg-[var(--app-color-surface-page)] px-4 pt-4 pb-2 flex items-center justify-between border-b border-[var(--app-color-border)]">
          <h2 className="text-lg font-semibold text-[var(--app-color-text-primary)]">扫码绑定笼盒</h2>
          <button onClick={handleClose} className="text-[var(--app-color-text-secondary)] text-sm px-2 py-1">
            取消
          </button>
        </div>

        <div className="px-4 pt-4 space-y-4">
          {/* ── 扫码状态 ── */}
          {!scannedCode ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="w-12 h-12 rounded-md flex items-center justify-center"
                style={{ background: "rgba(37,99,235,0.1)" }}>
                <QrCode className="w-6 h-6" style={{ color: "#2563eb" }} />
              </div>
              <p className="text-sm text-[var(--app-color-text-secondary)]">
                请点击工具栏蓝色扫码按钮获取笼盒编号
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-[var(--app-radius-container)]"
                style={{ background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)" }}>
                <Check className="w-5 h-5 shrink-0" style={{ color: "#2563eb" }} />
                <div className="min-w-0">
                  <div className="text-xs text-[var(--app-color-text-secondary)]">已扫描笼盒编码</div>
                  <div className="text-[var(--app-color-text-primary)] font-mono font-semibold text-sm truncate">{scannedCode}</div>
                </div>
              </div>
              <p className="text-sm text-[var(--app-color-text-secondary)]">
                请点击下方网格中目标笼位完成绑定（仅可选择「已预约(空笼盒)」的笼位）
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-[var(--app-radius-container)] bg-red-50 text-red-600 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* ── 已选笼位确认 ── */}
          {scannedCode && selectedCell && (
            <div className="space-y-3 p-3 rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-raised)]">
              <div className="text-sm font-medium text-[var(--app-color-text-primary)]">已选择笼位</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-[var(--app-color-text-secondary)]">位置</div>
                <div className="text-[var(--app-color-text-primary)] font-semibold">{selectedCell.position}</div>
                <div className="text-[var(--app-color-text-secondary)]">状态</div>
                <div className="text-[var(--app-color-text-primary)]">
                  {getCellStatusDisplayLabel((selectedCell as any)?.statuses) || "—"}
                </div>
                {(selectedCell as any).piName && (
                  <>
                    <div className="text-[var(--app-color-text-secondary)]">PI</div>
                    <div className="text-[var(--app-color-text-primary)]">{(selectedCell as any).piName}</div>
                  </>
                )}
                {(selectedCell as any).projectPiName && (
                  <>
                    <div className="text-[var(--app-color-text-secondary)]">课题组长</div>
                    <div className="text-[var(--app-color-text-primary)]">{(selectedCell as any).projectPiName}</div>
                  </>
                )}
              </div>
              <button
                onClick={handleConfirm}
                disabled={submitting || (selectedCell as any).animalCageType !== 2}
                className={cn(
                  "w-full py-3 rounded-[var(--app-radius-container)] text-white font-medium",
                  (selectedCell as any).animalCageType === 2
                    ? ""
                    : "bg-gray-300 cursor-not-allowed",
                )}
                style={(selectedCell as any).animalCageType === 2 ? { background: "#2563eb" } : undefined}
              >
                {submitting ? "绑定中..." : "确认绑定"}
              </button>
            </div>
          )}

          {submitting && (
            <div className="flex items-center justify-center gap-2 py-4 text-[var(--app-color-text-secondary)]">
              <Loader2 className="w-5 h-5 animate-spin" />
              正在绑定笼盒...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
