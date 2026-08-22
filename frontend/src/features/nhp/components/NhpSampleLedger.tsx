/**
 * 样本台账（LEDGER 形态示例）：列表 + 添加（自动取号 SMP）。
 * 台账形态按「表单→实体类型」映射后，此组件可泛化为样本/给药/AE 三种台账。
 */
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { createNhpSample, fetchNhpSamples, type NhpSample } from "../api/nhpEntity.api";
import "../nhp.css";

export default function NhpSampleLedger({ subjectId }: { subjectId: number }) {
  const [samples, setSamples] = useState<NhpSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [sampleType, setSampleType] = useState("");
  const [timepoint, setTimepoint] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetchNhpSamples(subjectId)
      .then(setSamples)
      .catch(() => toast.error("加载样本失败"))
      .finally(() => setLoading(false));
  }, [subjectId]);

  useEffect(() => {
    load();
  }, [load]);

  const onAdd = async () => {
    if (!sampleType.trim()) {
      toast.error("请填样本类型");
      return;
    }
    try {
      await createNhpSample({
        recipientSubjectId: subjectId,
        sampleType: sampleType.trim(),
        timepointCode: timepoint.trim() || undefined,
      });
      toast.success("已创建样本");
      setSampleType("");
      setTimepoint("");
      load();
    } catch (e) {
      toast.error((e as Error).message || "创建失败");
    }
  };

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <input className="input" style={{ width: 150 }} placeholder="样本类型（如 EDTA 血）" value={sampleType} onChange={(e) => setSampleType(e.target.value)} />
        <input className="input" style={{ width: 130 }} placeholder="时点（可选，如 TP04）" value={timepoint} onChange={(e) => setTimepoint(e.target.value)} />
        <button type="button" className="btn primary small" onClick={() => void onAdd()}>
          ＋ 添加样本
        </button>
      </div>

      {loading ? (
        <div className="aup-empty">加载样本…</div>
      ) : samples.length === 0 ? (
        <div className="aup-empty">暂无样本</div>
      ) : (
        <div className="nhp-form-launcher-list">
          {samples.map((s) => (
            <div key={s.id} className="nhp-form-launcher-row">
              <div className="nhp-form-launcher-main">
                <div className="nhp-form-launcher-title">
                  <span className="nhp-form-launcher-badge">台账</span>
                  {s.sampleCode ?? `#${s.id}`}
                </div>
                <div className="nhp-form-launcher-hint">
                  {[s.sampleType, s.timepointCode, s.collectDatetime].filter(Boolean).join(" · ") || "样本"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
