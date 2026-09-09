import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import type { AssetRow } from "@/api/domains/asset.api";
import { batchMoveAssetLocation, fetchAssetRecords } from "@/api/domains/asset.api";
import { queryKeys } from "@/api/hooks/queryKeys";

const norm = (s?: string | null) => (s ?? "").replace(/\s+/g, "").toLowerCase();

export type RelocateTarget = { id: number; name: string };

/**
 * 扫码归位（实地盘点）：连续扫码把实物资产归到目标地点。
 *
 * 状态机与副作用集中在这里，UI 由图形视图渲染（顶部横幅 + 画布上的「待归位」卡片区）。
 * 扫码弹窗复用 MobileScanDialog，本 hook 只负责解码结果 → 查资产 → 入列 → 批量移入。
 */
export function useAssetRelocate() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<RelocateTarget | null>(null);
  const [scanned, setScanned] = useState<AssetRow[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [continuous, setContinuous] = useState(true);
  const [looking, setLooking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const scannedRef = useRef<AssetRow[]>([]);
  const reopenTimer = useRef<number | null>(null);
  useEffect(() => {
    scannedRef.current = scanned;
  }, [scanned]);

  const clearReopenTimer = useCallback(() => {
    if (reopenTimer.current != null) {
      window.clearTimeout(reopenTimer.current);
      reopenTimer.current = null;
    }
  }, []);
  useEffect(() => clearReopenTimer, [clearReopenTimer]);

  const start = useCallback((node: RelocateTarget) => {
    setTarget(node);
    setScanned([]);
    setScanOpen(true);
  }, []);

  const exit = useCallback(() => {
    clearReopenTimer();
    setScanOpen(false);
    setTarget(null);
    setScanned([]);
  }, [clearReopenTimer]);

  const remove = useCallback((id: string) => {
    setScanned((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const handleScanResult = useCallback(
    async (text: string) => {
      setScanOpen(false);
      const code = (text ?? "").trim();
      if (!code || !target) return;
      setLooking(true);
      try {
        const data = await fetchAssetRecords({ page: 1, size: 5, keyword: code });
        const hit = (data.rows ?? []).find((r) => norm(r.assetCode) === norm(code));
        if (!hit) {
          toast.error(`未找到资产：${code}`);
          return;
        }
        if (hit.locationNodeId === target.id) {
          toast.error(`${hit.assetName} 已在此地点`);
          return;
        }
        if (scannedRef.current.some((x) => x.id === hit.id)) {
          toast.error(`${hit.assetName} 已在待归位列表`);
          return;
        }
        setScanned((prev) => [...prev, hit]);
        toast.success(`已扫入：${hit.assetName}`);
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
    [target, continuous]
  );

  const submit = useCallback(async () => {
    if (!target || scannedRef.current.length === 0 || submitting) return;
    const rows = scannedRef.current;
    setSubmitting(true);
    try {
      const res = await batchMoveAssetLocation({ ids: rows.map((r) => r.id), nodeId: target.id });
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      const failed = res.failed ?? [];
      if (failed.length === 0) {
        toast.success(`已归位 ${res.moved} 台到「${target.name}」`);
        exit();
      } else {
        const codeOf = (id: string) => rows.find((r) => r.id === id)?.assetCode ?? id;
        toast.error(
          `成功 ${res.moved} 台，失败 ${failed.length} 台（${failed.map((f) => `${codeOf(f.id)}：${f.reason}`).join("；")}）`,
          { duration: 6000 }
        );
        // 成功的出列，失败的留下让用户处理
        const failedIds = new Set(failed.map((f) => f.id));
        setScanned((prev) => prev.filter((r) => failedIds.has(r.id)));
      }
    } catch (e) {
      toast.error((e as Error)?.message || "批量移入失败");
    } finally {
      setSubmitting(false);
    }
  }, [target, submitting, qc, exit]);

  return {
    target,
    scanned,
    scanOpen,
    setScanOpen,
    continuous,
    setContinuous,
    looking,
    submitting,
    start,
    exit,
    remove,
    handleScanResult,
    submit,
  };
}
