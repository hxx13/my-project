import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import {
  createNhpSnapshot,
  fetchNhpSnapshot,
  fetchNhpSnapshots,
  rollbackNhpSnapshot,
  type NhpSnapshotMeta,
} from "../api/nhpRecord.api";

import { appConfirm } from "@/lib/appDialog";
/**
 * NHP 快照抽屉（对齐 AUP SnapshotDrawer）。
 * 列出不可变版本；查看 JSON；回退覆盖当前值；手动创建当前快照。
 */
export default function NhpSnapshotDrawer({
  open,
  recordId,
  readOnly,
  operatorId,
  bizStage,
  onClose,
  onCreated,
  onRolledBack,
}: {
  open: boolean;
  recordId?: number | null;
  readOnly?: boolean;
  operatorId?: string;
  bizStage?: string;
  onClose: () => void;
  onCreated?: () => void;
  /** 回退成功后把新值/记录状态回填工作台 */
  onRolledBack?: (payload: {
    values: Record<string, unknown>;
    recordStatus: string;
    snapshotCount: number;
  }) => void;
}) {
  const [snaps, setSnaps] = useState<NhpSnapshotMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [rolling, setRolling] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const load = async () => {
    if (!recordId) {
      setSnaps([]);
      return;
    }
    setLoading(true);
    try {
      setSnaps(await fetchNhpSnapshots(recordId));
    } catch (e) {
      toast.error((e as Error).message || "加载快照失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setPreview(null);
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recordId]);

  const sorted = useMemo(() => [...snaps].sort((a, b) => b.versionNo - a.versionNo), [snaps]);
  const maxVersion = sorted.length > 0 ? sorted[0].versionNo : -1;

  if (!open) return null;

  const handleCreate = async () => {
    if (!recordId || creating) return;
    setCreating(true);
    try {
      await createNhpSnapshot(recordId, { operatorId, bizStage, note: "手动快照" });
      toast.success("已创建快照");
      await load();
      onCreated?.();
    } catch (e) {
      toast.error((e as Error).message || "创建快照失败");
    } finally {
      setCreating(false);
    }
  };

  const handleView = async (snapId: number) => {
    if (!recordId) return;
    try {
      const full = await fetchNhpSnapshot(recordId, snapId);
      setPreview(full.dataJson ?? "{}");
    } catch (e) {
      toast.error((e as Error).message || "加载快照详情失败");
    }
  };

  const handleRollback = async (s: NhpSnapshotMeta) => {
    if (!recordId || rolling != null) return;
    if (!await appConfirm(`确定回退到 v${s.versionNo}？当前草稿会被覆盖，并自动备份当前值。`)) return;
    setRolling(s.id);
    try {
      const res = await rollbackNhpSnapshot(recordId, s.id, {
        operatorId,
        bizStage,
        note: `回退至 v${s.versionNo}`,
      });
      toast.success(`已回退到 v${res.restoredVersionNo}`);
      onRolledBack?.({
        values: res.values ?? {},
        recordStatus: res.record?.status ?? "DRAFT",
        snapshotCount: res.snapshotCount ?? 0,
      });
      await load();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "回退失败");
    } finally {
      setRolling(null);
    }
  };

  return (
    <div className="drawer-mask" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-hd">
          <b>历史快照 · 可回退</b>
          <div style={{ display: "flex", gap: 8 }}>
            {!readOnly && recordId && (
              <button className="btn ghost small" disabled={creating} onClick={handleCreate}>
                {creating ? "创建中…" : "＋ 当前快照"}
              </button>
            )}
            <button className="btn ghost small" onClick={onClose}>
              ✕ 关闭
            </button>
          </div>
        </div>
        {loading ? (
          <div className="aup-empty">加载中…</div>
        ) : sorted.length === 0 ? (
          <div className="aup-empty">暂无快照。完成/锁定或手动创建后会出现在此。</div>
        ) : (
          sorted.map((s) => (
            <div key={s.id} className={"snap" + (s.versionNo === maxVersion ? " cur" : "")} style={{ marginBottom: 10 }}>
              <div className="sn">
                v{s.versionNo} · {stageLabel(s)}
              </div>
              <div className="m">
                {formatDateTimeAsiaShanghaiShort(s.createdAt)}
                {s.createdBy ? ` · ${s.createdBy}` : ""}
                {s.note ? ` · ${s.note}` : ""}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                {s.versionNo === maxVersion && (
                  <span className="tag" style={{ background: "var(--primary-weak)", color: "var(--primary)" }}>
                    最新
                  </span>
                )}
                <button className="btn ghost small" type="button" onClick={() => handleView(s.id)}>
                  查看数据
                </button>
                {!readOnly && s.versionNo !== maxVersion && (
                  <button
                    className="btn ghost small"
                    type="button"
                    disabled={rolling === s.id}
                    onClick={() => handleRollback(s)}
                  >
                    {rolling === s.id ? "回退中…" : "回退到此版本"}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        {preview != null && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <b style={{ fontSize: 13 }}>快照 JSON</b>
              <button className="btn ghost small" type="button" onClick={() => setPreview(null)}>
                收起
              </button>
            </div>
            <pre
              style={{
                fontSize: 11,
                maxHeight: 240,
                overflow: "auto",
                background: "#f8fafc",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 10,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {pretty(preview)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function stageLabel(s: NhpSnapshotMeta): string {
  const st = (s.stage || "").toUpperCase();
  if (st === "LOCKED") return "数据锁定";
  if (st === "COMPLETE") return "提交完成";
  const biz: Record<string, string> = {
    donor: "供体建档",
    recipient: "受体入组",
    crossmatch: "交叉配型",
    surgery: "移植手术",
    followup: "术后随访",
    necropsy: "终点剖检",
    lock: "数据锁定",
  };
  return (s.bizStage && biz[s.bizStage]) || "填写草稿";
}

function pretty(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
