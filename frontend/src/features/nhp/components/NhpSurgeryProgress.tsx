/**
 * 手术标志性进度：时间条 + 业务阶段摘要。
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { fetchNhpVisits } from "../api/nhpVisit.api";
import { LIFECYCLE_STAGE_OPTIONS, lifecycleStageLabel } from "../api/nhpSubjectBoard.api";
import { advanceNhpStage } from "../api/nhpRecord.api";
import type { NhpSurgeryContext } from "../utils/nhpSurgeryContext";
import NhpTimelineStrip from "./NhpTimelineStrip";
import { NHP_BIZ_STAGES } from "./NhpStageStepper";
import "../nhp.css";

function lifecycleToBizIndex(stage?: string): number {
  const s = (stage ?? "").toUpperCase();
  if (s === "SCREENING") return 0;
  if (s === "MATCHING") return 2;
  if (s === "POST_TX") return 4;
  if (s === "ENDPOINT") return 5;
  return 1;
}

/** 下一生命周期阶段；已在终点或无阶段则 null */
function nextStage(stage?: string): string | null {
  const cur = (stage ?? "").toUpperCase();
  const idx = LIFECYCLE_STAGE_OPTIONS.findIndex((o) => o.value === cur);
  if (idx < 0 || idx >= LIFECYCLE_STAGE_OPTIONS.length - 1) return null;
  return LIFECYCLE_STAGE_OPTIONS[idx + 1].value;
}

type Props = {
  surgery: NhpSurgeryContext;
  compact?: boolean;
};

export default function NhpSurgeryProgress({ surgery, compact }: Props) {
  const queryClient = useQueryClient();
  const visitsQuery = useQuery({ queryKey: ["nhp", "visits"], queryFn: () => fetchNhpVisits(), staleTime: 60_000 });
  const visits = visitsQuery.data ?? [];
  const bizIdx = lifecycleToBizIndex(surgery.lifecycleStage);

  const next = nextStage(surgery.lifecycleStage);
  const advanceMutation = useMutation({
    mutationFn: () => advanceNhpStage(surgery.subjectId, next!),
    onSuccess: () => {
      toast.success("已推进阶段");
      void queryClient.invalidateQueries({ queryKey: ["nhp", "subject-board"] });
    },
    onError: (e) => toast.error((e as Error).message || "推进失败"),
  });

  if (compact) {
    return (
      <div className="nhp-surgery-progress nhp-surgery-progress--compact">
        <div className="nhp-surgery-progress-row">
          <span className="nhp-surgery-progress-k">阶段</span>
          <span className="nhp-surgery-progress-v">{lifecycleStageLabel(surgery.lifecycleStage)}</span>
          {next && (
            <button
              type="button"
              className="btn ghost small"
              disabled={advanceMutation.isPending}
              onClick={() => advanceMutation.mutate()}
            >
              推进到 {lifecycleStageLabel(next)}
            </button>
          )}
          <span className="nhp-surgery-progress-k">时点</span>
          <span className="nhp-surgery-progress-v">{surgery.currentTp ?? "—"}</span>
          <span className="nhp-surgery-progress-k">手术日</span>
          <span className="nhp-surgery-progress-v">{surgery.txDate ?? "术前"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="nhp-surgery-progress">
      {next && (
        <div style={{ marginBottom: 8 }}>
          <button
            type="button"
            className="btn ghost small"
            disabled={advanceMutation.isPending}
            onClick={() => advanceMutation.mutate()}
          >
            推进到 {lifecycleStageLabel(next)}
          </button>
        </div>
      )}
      <div className="nhp-surgery-biz-strip">
        {NHP_BIZ_STAGES.filter((s) => s.key !== "lock").map((s, i) => {
          const done = i < bizIdx;
          const active = i === bizIdx;
          return (
            <div key={s.key} className={"nhp-surgery-biz-step" + (done ? " done" : active ? " active" : "")}>
              <div className="dot">{done ? "✓" : i + 1}</div>
              <div className="lbl">{s.label}</div>
            </div>
          );
        })}
      </div>
      {visits.length > 0 && (
        <NhpTimelineStrip
          visits={visits}
          currentTp={surgery.currentTp}
          day0={surgery.txDate}
        />
      )}
    </div>
  );
}
