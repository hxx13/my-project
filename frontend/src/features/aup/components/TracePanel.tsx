import type { AupTrace } from "../schema/aup";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";

/** 动作 → 中文文案 */
const ACTION_LABELS: Record<string, string> = {
  create: "创建计划书",
  submit: "提交",
  pass: "审核通过",
  return: "退回修改",
  assignExpert: "分配专家",
  approve: "审核通过",
  terminate: "终止",
  expire: "到期",
  rollback: "回退",
  save: "保存草稿",
  autosave: "自动保存",
  upload: "上传附件",
  delFile: "删除附件",
};

/** 阶段流转类动作（时间线节点用主色） */
const STAGE_ACTIONS = new Set(["submit", "pass", "return", "assignExpert", "approve", "terminate", "expire", "rollback"]);

/** 右侧留痕面板（`.trace-panel` / `.trace`），按后端倒序渲染。 */
export default function TracePanel({ traces }: { traces: AupTrace[] }) {
  return (
    <aside className="trace-panel">
      <div className="hd">进行记录 · 留痕</div>
      <div className="body">
        {!traces || traces.length === 0 ? (
          <div className="aup-empty" style={{ padding: "20px 0" }}>暂无记录</div>
        ) : (
          traces.map((t) => {
            const label = ACTION_LABELS[t.action] ?? t.action;
            const cls = STAGE_ACTIONS.has(t.action) ? "stage" : "edit";
            return (
              <div key={t.id} className={"trace " + cls}>
                <div className="t">
                  {label}
                  {t.comment ? ` · ${t.comment}` : ""}
                </div>
                <div className="m">{formatDateTimeAsiaShanghaiShort(t.createdAt)}</div>
                {(t.actorName || t.actor) && (
                  <div className="who">
                    {t.role === "expert" || t.role === "secretary" || t.role === "PI" ? "审核人" : "操作人"}：
                    <b>{t.actorName ?? t.actor}</b>
                    {t.role ? `（${roleLabel(t.role)}）` : ""}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

const ROLE_LABELS: Record<string, string> = {
  lab: "实验员",
  PI: "组长",
  secretary: "秘书",
  expert: "专家",
  admin: "管理员",
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
