/**
 * AssetRelocatePanel — 扫码归位（图形视图 · 连续扫码批量移入）
 *
 * 在图形视图选中地点后打开：连续扫码把实物资产「归位」到该地点（实地盘点场景）。
 * 交互参考小程序 assetRecord 页「批量记录」面板（列表 + 连续扫码 + 底部批量确认），
 * 但网页版更顺手：扫码成功即入列并自动重开扫码弹窗，列表可逐行移除。
 *
 * 扫码弹窗复用 MobileScanDialog；资产按 assetCode 精确匹配（去空格、大小写不敏感）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { ScanLine, Trash2, X } from "lucide-react";
import type { AssetRow } from "@/api/domains/asset.api";
import { batchMoveAssetLocation, fetchAssetRecords } from "@/api/domains/asset.api";
import { queryKeys } from "@/api/hooks/queryKeys";
import { Portal } from "@/components/Portal";
import MobileScanDialog from "@/pages/mobile/MobileScanDialog";

const norm = (s?: string | null) => (s ?? "").replace(/\s+/g, "").toLowerCase();

export interface AssetRelocatePanelProps {
  open: boolean;
  /** 归位目标地点节点 id（未选中地点时为 null，此时面板不应打开） */
  targetNodeId: number | null;
  /** 目标地点名（标题展示） */
  targetNodeName: string | null;
  onClose: () => void;
}

export default function AssetRelocatePanel({ open, targetNodeId, targetNodeName, onClose }: AssetRelocatePanelProps) {
  const qc = useQueryClient();
  const [list, setList] = useState<AssetRow[]>([]);
  /** 连续扫码：一次成功入列后自动重开扫码弹窗 */
  const [continuous, setContinuous] = useState(true);
  const [scanOpen, setScanOpen] = useState(false);
  const [looking, setLooking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const reopenTimer = useRef<number | null>(null);
  /** 列表镜像：供扫码回调读取最新列表做去重判定，避免闭包取到旧值 */
  const listRef = useRef<AssetRow[]>([]);

  useEffect(() => {
    listRef.current = list;
  }, [list]);

  const clearReopenTimer = useCallback(() => {
    if (reopenTimer.current != null) {
      window.clearTimeout(reopenTimer.current);
      reopenTimer.current = null;
    }
  }, []);

  // 关闭面板即复位：清列表、取消待触发的连续扫码
  useEffect(() => {
    if (open) return;
    clearReopenTimer();
    setScanOpen(false);
    setList([]);
    setContinuous(true);
  }, [open, clearReopenTimer]);

  useEffect(() => clearReopenTimer, [clearReopenTimer]);

  const handleScanResult = useCallback(
    async (text: string) => {
      setScanOpen(false);
      const code = (text ?? "").trim();
      if (!code || targetNodeId == null) return;
      setLooking(true);
      try {
        const data = await fetchAssetRecords({ page: 1, size: 5, keyword: code });
        const hit = (data.rows ?? []).find((r) => norm(r.assetCode) === norm(code));
        if (!hit) {
          toast.error("未找到该资产");
          return;
        }
        if (hit.locationNodeId === targetNodeId) {
          toast.error("已在此地点");
          return;
        }
        if (listRef.current.some((x) => x.id === hit.id)) {
          toast.error("已在列表中");
          return;
        }
        setList((prev) => [...prev, hit]);
        toast.success(`已加入：${hit.assetName}`);
        if (continuous) {
          // 延迟重开：给相机实例一个释放窗口，避免初始化冲突
          reopenTimer.current = window.setTimeout(() => {
            reopenTimer.current = null;
            setScanOpen(true);
          }, 400);
        }
      } catch (e) {
        toast.error((e as Error)?.message || "查询资产失败");
      } finally {
        setLooking(false);
      }
    },
    [targetNodeId, continuous]
  );

  const handleSubmit = async () => {
    if (targetNodeId == null || list.length === 0 || submitting) return;
    setSubmitting(true);
    const ids = list.map((r) => r.id);
    try {
      const res = await batchMoveAssetLocation({ ids, nodeId: targetNodeId });
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      const failed = res.failed ?? [];
      if (failed.length === 0) {
        toast.success(`成功 ${res.moved} 台`);
      } else {
        const codeOf = (id: string) => list.find((r) => r.id === id)?.assetCode ?? id;
        const detail = failed.map((f) => `${codeOf(f.id)}：${f.reason}`).join("；");
        toast.error(`成功 ${res.moved} 台，失败 ${failed.length} 台（${detail}）`, { duration: 6000 });
      }
      // 成功的行出列；失败的行保留在列表里（附失败原因由 toast 给出），面板不关以便处理
      const failedIds = new Set(failed.map((f) => f.id));
      setList((prev) => prev.filter((r) => failedIds.has(r.id)));
      if (failed.length === 0) onClose();
    } catch (e) {
      toast.error((e as Error)?.message || "批量移入失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <Portal>
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-twin-xl bg-[var(--twin-canvas)] shadow-twin-level-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部：目标地点 + 连续扫码开关 + 关闭 */}
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--twin-hairline)] px-4 py-3">
              <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--twin-ink)]">
                扫码归位到「{targetNodeName ?? "—"}」
              </h3>
              <button
                type="button"
                onClick={() => setContinuous((v) => !v)}
                title="开启后每扫一台自动重新打开扫码"
                aria-pressed={continuous}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1 text-[10px] text-[var(--twin-body)] transition hover:border-[var(--twin-link-deep)]"
              >
                <span
                  className={`relative inline-block h-3 w-6 shrink-0 rounded-full transition ${
                    continuous ? "bg-[var(--twin-link-deep)]" : "bg-[var(--twin-hairline-strong)]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-2 w-2 rounded-full bg-white transition-all ${
                      continuous ? "left-3.5" : "left-0.5"
                    }`}
                  />
                </span>
                连续扫码
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="shrink-0 text-[var(--twin-mute)] transition hover:text-[var(--twin-ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 主体：扫码按钮 + 已扫列表 */}
            <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
              <button
                type="button"
                onClick={() => setScanOpen(true)}
                disabled={looking}
                className="flex w-full items-center justify-center gap-1.5 rounded-twin-md bg-[var(--twin-link-deep)] px-3 py-2.5 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                <ScanLine className="h-4 w-4" /> {looking ? "查询中…" : "扫码"}
              </button>

              {list.length === 0 ? (
                <p className="py-10 text-center text-[11px] text-[var(--twin-mute)]">
                  还没有扫码记录，点上方「扫码」开始
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {list.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2.5 py-1.5"
                    >
                      <span className="w-28 shrink-0 truncate font-mono text-[11px] text-[var(--twin-mute)]" title={r.assetCode}>
                        {r.assetCode}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--twin-ink)]" title={r.assetName}>
                        {r.assetName}
                      </span>
                      <span
                        className="w-32 shrink-0 truncate text-[11px] text-[var(--twin-body)]"
                        title={r.location || "—"}
                      >
                        原地点 {r.location || "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setList((prev) => prev.filter((x) => x.id !== r.id))}
                        aria-label="移除"
                        title="移除"
                        className="shrink-0 rounded p-1 text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas)] hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 底部：确认移入 + 清空 */}
            <div className="flex shrink-0 gap-2 border-t border-[var(--twin-hairline)] p-3">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={list.length === 0 || submitting}
                className="flex-1 rounded-twin-md bg-[var(--twin-link-deep)] px-3 py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "移入中…" : `确认移入 ${list.length} 台`}
              </button>
              <button
                type="button"
                onClick={() => setList([])}
                disabled={list.length === 0}
                className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-[13px] text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)] disabled:opacity-50"
              >
                清空
              </button>
            </div>
          </div>
        </div>
      </Portal>

      {/* 扫码弹窗复用（自身 portal 到 body，层级同 z-modal，DOM 在后故显示在上） */}
      <MobileScanDialog open={scanOpen} onClose={() => setScanOpen(false)} onResult={handleScanResult} />
    </>
  );
}
