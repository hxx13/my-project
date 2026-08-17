import { useMemo } from "react";
import type { AupStage } from "../schema/aup";

/** 阶段标签（与规格 2.1 状态机一致，展示用） */
const STAGE_LABELS: Record<AupStage, string> = {
  draft: "填写计划书",
  piReview: "组长审核",
  formatReview: "格式审查",
  expertReview: "专家审查",
  approved: "审核通过",
  terminated: "已终止",
  expired: "已过期",
};

/** 返修来源 → 首步标签（退回到返修阶段时显示从哪里退回） */
const RETURN_LABELS: Record<string, string> = {
  piReturn: "返修(组长审核)",
  formatReturn: "返修(格式审查)",
  expertReturn: "返修(专家审查)",
  rollback: "返修(回退)",
};

type StepState = "done" | "active" | "pending" | "end";

interface Step {
  key: string;
  label: string;
  state: StepState;
  order: number;
}

/**
 * 顶部阶段指示器（`.stepper`）。按 current_stage 推导各步骤状态，
 * 终止/到期追加一个 danger 状态节点。
 * 返修阶段（draft 且非首次 draftSource）首步显示「返修」而非「填写计划书」。
 */
export default function StageStepper({ currentStage, draftSource }: { currentStage: AupStage; draftSource?: string }) {
  const steps = useMemo<Step[]>(() => {
    const draftLabel = draftSource && RETURN_LABELS[draftSource] ? RETURN_LABELS[draftSource] : STAGE_LABELS.draft;

    const base: { key: AupStage; order: number; label: string }[] = [
      { key: "draft", order: 1, label: draftLabel },
      { key: "piReview", order: 2, label: STAGE_LABELS.piReview },
      { key: "formatReview", order: 3, label: STAGE_LABELS.formatReview },
      { key: "expertReview", order: 4, label: STAGE_LABELS.expertReview },
      { key: "approved", order: 5, label: STAGE_LABELS.approved },
    ];

    if (currentStage === "approved") {
      return base.map((s) => ({ key: s.key, label: s.label, state: "done" as StepState, order: s.order }));
    }
    if (currentStage === "expired") {
      return [
        ...base.map((s) => ({ key: s.key, label: s.label, state: "done" as StepState, order: s.order })),
        { key: "expired", label: "已过期", state: "end" as StepState, order: 6 },
      ];
    }
    if (currentStage === "terminated") {
      return [
        ...base.slice(0, 4).map((s) => ({ key: s.key, label: s.label, state: "done" as StepState, order: s.order })),
        { key: "terminated", label: "已终止", state: "end" as StepState, order: 5 },
      ];
    }

    const activeIdx = base.findIndex((s) => s.key === currentStage);
    return base.map((s, i) => ({
      key: s.key,
      label: s.label,
      state: (i < activeIdx ? "done" : i === activeIdx ? "active" : "pending") as StepState,
      order: s.order,
    }));
  }, [currentStage, draftSource]);

  return (
    <div className="stepper-wrap">
      <div className="stepper">
        {steps.map((s, i) => (
          <div key={s.key} style={{ display: "contents" }}>
            {i > 0 && <div className={"connector" + (s.state !== "pending" && s.state !== "end" ? " done" : "")} />}
            <div className={"step " + s.state}>
              <div className="dot">
                {s.state === "done" ? "✓" : s.state === "end" ? "✕" : s.order}
              </div>
              <div className="label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
