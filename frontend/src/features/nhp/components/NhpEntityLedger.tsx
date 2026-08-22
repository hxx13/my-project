/**
 * 台账（LEDGER 形态）：按实体类型（样本/给药/不良事件）列表 + 添加。
 * 实体类型由表单数据域推导（D4→样本 / D6→给药 / D5→不良事件）。
 */
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  createNhpAdverseEvent,
  createNhpMedication,
  createNhpSample,
  fetchNhpAdverseEvents,
  fetchNhpMedications,
  fetchNhpSamples,
  type NhpAdverseEvent,
  type NhpEntityType,
  type NhpMedication,
  type NhpSample,
} from "../api/nhpEntity.api";
import "../nhp.css";

type LedgerItem = { id: number; code: string; summary: string };

type Props = { entityType: NhpEntityType; subjectId: number; txId?: number };

export default function NhpEntityLedger({ entityType, subjectId, txId }: Props) {
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [f1, setF1] = useState("");
  const [f2, setF2] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (entityType === "sample") {
        const rows = await fetchNhpSamples(subjectId);
        setItems(
          rows.map((s: NhpSample) => ({
            id: s.id,
            code: s.sampleCode ?? `#${s.id}`,
            summary: [s.sampleType, s.timepointCode].filter(Boolean).join(" · ") || "样本",
          })),
        );
      } else if (entityType === "medication") {
        const rows = await fetchNhpMedications();
        setItems(
          rows.map((m: NhpMedication) => ({
            id: m.id,
            code: m.medCode ?? `#${m.id}`,
            summary:
              [m.drugCode, m.doseValue != null ? `${m.doseValue}${m.doseUnit ?? ""}` : null]
                .filter(Boolean)
                .join(" · ") || "给药",
          })),
        );
      } else {
        const rows = await fetchNhpAdverseEvents(txId);
        setItems(
          rows.map((a: NhpAdverseEvent) => ({
            id: a.id,
            code: a.aeCode ?? `#${a.id}`,
            summary: [a.aeType, a.aeGrade].filter(Boolean).join(" · ") || "不良事件",
          })),
        );
      }
    } catch (e) {
      toast.error((e as Error).message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [entityType, subjectId, txId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onAdd = async () => {
    if (!f1.trim()) {
      toast.error("请填必填项");
      return;
    }
    try {
      if (entityType === "sample") {
        await createNhpSample({ recipientSubjectId: subjectId, sampleType: f1.trim(), timepointCode: f2.trim() || undefined });
      } else if (entityType === "medication") {
        await createNhpMedication({ drugCode: f1.trim(), doseValue: f2 ? Number(f2) : undefined });
      } else {
        await createNhpAdverseEvent({ txId, aeType: f1.trim(), aeGrade: f2.trim() || undefined });
      }
      toast.success("已创建");
      setF1("");
      setF2("");
      void load();
    } catch (e) {
      toast.error((e as Error).message || "创建失败");
    }
  };

  const label1 = entityType === "sample" ? "样本类型" : entityType === "medication" ? "药品编码" : "AE 类型";
  const label2 = entityType === "sample" ? "时点(可选)" : entityType === "medication" ? "剂量(可选)" : "分级(可选)";
  const title = entityType === "sample" ? "样本台账" : entityType === "medication" ? "给药台账" : "不良事件台账";

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <input className="input" style={{ width: 150 }} placeholder={label1} value={f1} onChange={(e) => setF1(e.target.value)} />
        <input className="input" style={{ width: 130 }} placeholder={label2} value={f2} onChange={(e) => setF2(e.target.value)} />
        <button type="button" className="btn primary small" onClick={() => void onAdd()}>
          ＋ 添加
        </button>
      </div>

      {loading ? (
        <div className="aup-empty">加载{title}…</div>
      ) : items.length === 0 ? (
        <div className="aup-empty">暂无记录</div>
      ) : (
        <div className="nhp-form-launcher-list">
          {items.map((it) => (
            <div key={it.id} className="nhp-form-launcher-row">
              <div className="nhp-form-launcher-main">
                <div className="nhp-form-launcher-title">
                  <span className="nhp-form-launcher-badge">台账</span>
                  {it.code}
                </div>
                <div className="nhp-form-launcher-hint">{it.summary}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
