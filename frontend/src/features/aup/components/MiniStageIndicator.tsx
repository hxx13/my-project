import { Fragment } from "react";
import type { AupMiniStepsPayload } from "../schema/aup";

/**
 * 列表行「阶段过程」迷你指示器，对应原型 `.mini-steps`。
 * 入参为 AupListItem.miniSteps（后端序列化的 JSON 字符串，形如 { steps:[{key,label,status}], terminal }）。
 * 状态映射：done→已完成 / current→进行中 / pending→待处理。
 *
 * 后端在 terminated / expired 时把 `terminal` 置为终态代码。
 * terminated：「通过」降为 pending，红色「已终止」表达终态（未走完审批）。
 * expired：保留「通过」为 done，红色「已过期」接在通过后（必须先通过才会过期）。
 */
export default function MiniStageIndicator({ miniSteps }: { miniSteps?: string | null }) {
  if (!miniSteps) return <span style={{ color: "var(--muted)" }}>—</span>;

  let payload: AupMiniStepsPayload | null = null;
  try {
    payload = JSON.parse(miniSteps) as AupMiniStepsPayload;
  } catch {
    payload = null;
  }
  const terminal = payload?.terminal;
  const rawSteps = payload?.steps ?? [];
  if (rawSteps.length === 0) return <span style={{ color: "var(--muted)" }}>—</span>;

  // 仅终止时把「通过」从 done 降为 pending；过期必须先经过通过，保留通过为 done。
  const steps =
    terminal === "terminated"
      ? rawSteps.map((s) =>
          s.key === "approved" && s.status === "done" ? { ...s, status: "pending" as const } : s
        )
      : rawSteps;

  const terminalLabel = terminal
    ? terminal === "terminated"
      ? "已终止"
      : terminal === "expired"
        ? "已过期"
        : terminal
    : null;

  return (
    <div className="mini-steps">
      {steps.map((s, i) => {
        const cls = s.status === "pending" ? "" : s.status === "current" ? "active" : s.status;
        return (
          <Fragment key={s.key}>
            {i > 0 && (
              <div className={"line" + (steps[i - 1].status === "done" ? " done" : "")} />
            )}
            <div className={"ms " + cls}>
              <div className="dot" />
              <div className="lbl">{s.label}</div>
            </div>
          </Fragment>
        );
      })}
      {terminalLabel ? (
        <Fragment>
          <div className={"line" + (terminal === "expired" ? " done" : "")} />
          <div className="ms">
            <div className="dot" style={{ background: "var(--danger)" }} />
            <div className="lbl" style={{ color: "var(--danger)", fontWeight: 700 }}>
              {terminalLabel}
            </div>
          </div>
        </Fragment>
      ) : null}
    </div>
  );
}
