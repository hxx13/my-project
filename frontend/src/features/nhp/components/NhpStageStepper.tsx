/**
 * NHP 业务/访视提示（可选）：与套内域表码正交。
 * Dn 不是流水线步骤；勿用「域完成度」驱动必填管线。
 * 填写页默认不展示域管道步进条；本组件仅作软提示入口。
 */
import type { FormField, FormSection } from "../schema/formTemplate";

export type NhpBizStage =
  | "donor"
  | "recipient"
  | "crossmatch"
  | "surgery"
  | "followup"
  | "necropsy"
  | "lock";

/**
 * 可选业务语境标签（与访视/工作流相关）。
 * domains 仅作「常见关联表码」弱提示，不是阶段锁、也不是 D1→D10 进度。
 */
export const NHP_BIZ_STAGES: { key: NhpBizStage; label: string; domains: string[] }[] = [
  { key: "donor", label: "供体建档", domains: ["D1"] },
  { key: "recipient", label: "受体入组", domains: ["D2"] },
  { key: "crossmatch", label: "交叉配型", domains: ["D3"] },
  { key: "surgery", label: "移植手术", domains: ["D7", "D9", "D10"] },
  { key: "followup", label: "术后随访", domains: ["D4", "D5", "D6"] },
  { key: "necropsy", label: "终点剖检", domains: ["D8"] },
  { key: "lock", label: "数据锁定", domains: [] },
];

type StepState = "done" | "active" | "pending" | "end";

/**
 * 可选软提示条：不按域完成度锁步骤；点击仅跳转 TOC，无 stage lock。
 * 填写主路径请勿依赖本组件做「下一域」。
 */
export default function NhpStageStepper({
  active = "donor",
  doneKeys = [],
  recordStatus,
  subtitle = "业务语境提示（可选；域码≠步骤）",
  onSelect,
}: {
  active?: NhpBizStage;
  /** 已完成的业务阶段（可选展示；不作为填写门控） */
  doneKeys?: NhpBizStage[];
  recordStatus?: string;
  subtitle?: string;
  onSelect?: (stage: NhpBizStage) => void;
}) {
  const locked = (recordStatus || "").toUpperCase() === "LOCKED";
  const complete = (recordStatus || "").toUpperCase() === "COMPLETE";
  const doneSet = new Set(doneKeys);
  const activeIdx = Math.max(0, NHP_BIZ_STAGES.findIndex((s) => s.key === active));

  return (
    <div className="stepper-wrap nhp-biz-hint">
      <div className="nhp-stepper-meta">
        {subtitle && <span>{subtitle}</span>}
        {locked && (
          <span className="tag" style={{ background: "var(--success-weak)", color: "var(--success)" }}>
            已锁定
          </span>
        )}
        {!locked && complete && (
          <span className="tag" style={{ background: "var(--primary-weak)", color: "var(--primary)" }}>
            已完成 · 待锁定
          </span>
        )}
      </div>
      <div className="stepper" role="list">
        {NHP_BIZ_STAGES.map((s, i) => {
          let state: StepState = "pending";
          if (locked || doneSet.has(s.key) || (complete && s.key !== "lock" && i < NHP_BIZ_STAGES.length - 1)) {
            state = "done";
          } else if (i === activeIdx) {
            state = "active";
          }
          if (complete && s.key === "lock" && !locked) state = "active";
          return (
            <div key={s.key} style={{ display: "contents" }}>
              {i > 0 && <div className={"connector" + (state !== "pending" ? " done" : "")} />}
              <button
                type="button"
                role="listitem"
                className={"step " + state}
                onClick={() => onSelect?.(s.key)}
                title={
                  s.domains.length
                    ? `${s.label}（常见关联表码 ${s.domains.join("·")}，非必填流水线）`
                    : s.label
                }
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: onSelect ? "pointer" : "default",
                  padding: 0,
                }}
              >
                <div className="dot">{state === "done" ? "✓" : i + 1}</div>
                <div className="label">{s.label}</div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 表码 → 可选业务语境（弱映射；勿当阶段锁） */
export function stageForDomain(domainCode: string): NhpBizStage {
  const n = parseInt(String(domainCode).replace(/^D+/i, ""), 10);
  if (n === 1) return "donor";
  if (n === 2) return "recipient";
  if (n === 3) return "crossmatch";
  if (n === 7 || n === 9 || n === 10) return "surgery";
  if (n === 4 || n === 5 || n === 6) return "followup";
  if (n === 8) return "necropsy";
  return "donor";
}

export function primaryDomainForStage(stage: NhpBizStage): string | null {
  const hit = NHP_BIZ_STAGES.find((s) => s.key === stage);
  return hit?.domains[0] ?? null;
}

export function hasFieldValue(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** 章节是否满足提交门控：仅看必填；无必填则不阻塞 */
export function sectionDone(sec: FormSection, values: Record<string, unknown>): boolean {
  const fields = collectSectionFields(sec);
  if (!fields.length) return true;
  const required = fields.filter((f) => f.required);
  if (!required.length) return true;
  return required.every((f) => hasFieldValue(values[f.fieldKey]));
}

/** TOC 进度点：有必填看必填；否则「有任一值」才算填过（全空不算绿勾） */
export function sectionTouchedOrComplete(sec: FormSection, values: Record<string, unknown>): boolean {
  const fields = collectSectionFields(sec);
  if (!fields.length) return true;
  const required = fields.filter((f) => f.required);
  if (required.length) return required.every((f) => hasFieldValue(values[f.fieldKey]));
  return fields.some((f) => hasFieldValue(values[f.fieldKey]));
}

export function collectSectionFields(sec: FormSection): FormField[] {
  return [...(sec.fields ?? []), ...(sec.subsections ?? []).flatMap((u) => u.fields ?? [])];
}

function domainPrefix(code: string): string | null {
  const m = String(code).match(/^(D+\d+)/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * 可选：根据已填必填推导业务语境高亮（不驱动填写门控、不锁域）。
 */
export function deriveBizProgress(
  sections: FormSection[],
  values: Record<string, unknown>,
  recordStatus?: string,
): { active: NhpBizStage; doneKeys: NhpBizStage[] } {
  const status = (recordStatus || "").toUpperCase();
  if (status === "LOCKED") {
    return { active: "lock", doneKeys: NHP_BIZ_STAGES.map((s) => s.key) };
  }

  const sectionsByDomain = new Map<string, FormSection[]>();
  for (const sec of sections) {
    const d = domainPrefix(sec.code);
    if (!d) continue;
    const list = sectionsByDomain.get(d) ?? [];
    list.push(sec);
    sectionsByDomain.set(d, list);
  }

  const presentDomains = new Set(sectionsByDomain.keys());
  if (presentDomains.size === 0) {
    return { active: "donor", doneKeys: [] };
  }

  const domainComplete = (domain: string): boolean => {
    const secs = sectionsByDomain.get(domain);
    if (!secs || secs.length === 0) return true;
    return secs.every((sec) => sectionDone(sec, values));
  };

  const doneKeys: NhpBizStage[] = [];
  for (const s of NHP_BIZ_STAGES) {
    if (s.key === "lock") continue;
    const domains = s.domains.filter((d) => presentDomains.has(d));
    if (domains.length === 0) continue;
    if (domains.every((d) => domainComplete(d))) doneKeys.push(s.key);
  }

  if (status === "COMPLETE") {
    for (const s of NHP_BIZ_STAGES) {
      if (s.key !== "lock" && !doneKeys.includes(s.key)) doneKeys.push(s.key);
    }
    return { active: "lock", doneKeys };
  }

  const active = NHP_BIZ_STAGES.find((s) => s.key !== "lock" && !doneKeys.includes(s.key))?.key ?? "lock";
  return { active, doneKeys };
}
