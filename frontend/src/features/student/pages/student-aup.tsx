import { useNavigate } from "react-router-dom";
import { useAupList } from "@/features/aup/hooks/useAup";
import { authStorage } from "@/features/auth/authStorage";

/** 阶段 → 展示文案 */
const STAGE_TEXT: Record<string, string> = {
  draft: "填写中",
  piReview: "组长审核",
  formatReview: "格式审查",
  expertReview: "专家审查",
  approved: "已批准",
  terminated: "已终止",
  expired: "已过期",
};

/**
 * 学生端 AUP 计划书：卡片式展示「所在课题组」的计划书。
 * 一个课题组通常只有少数几个 AUP，故不用列表，用卡片；点击进入填写/查看。
 * 课题组内成员协作填写，均可进入编辑（仅限填写内容）。
 */
export default function StudentAupPage() {
  const navigate = useNavigate();
  const userInfo = authStorage.getUserInfo();
  const projectGroupName = (userInfo as { projectGroupName?: string | null } | null)?.projectGroupName?.trim() || "";
  const currentUserId = userInfo?.id;

  const { data, isLoading } = useAupList({
    projectGroupName: projectGroupName || undefined,
    size: 100,
  });
  const items = data?.items ?? [];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">AUP 计划书</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {projectGroupName ? `课题组：${projectGroupName}` : "未关联课题组"}
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          暂无计划书，可在门户「填写计划书」入口新建
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const isDraft = item.currentStage === "draft";
            const isPi = !!currentUserId && item.piUserId === currentUserId;
            const isOwn = !!currentUserId && item.createdBy === currentUserId;
            const sameGroup = !!projectGroupName;
            // draft 阶段：组长 → 填写 + 提交；实验员（本人或同组）→ 填写/继续；其余 → 查看
            const primary = isDraft && (isPi || isOwn || sameGroup);
            const label = !isDraft
              ? "查看"
              : isPi
                ? "填写 + 提交"
                : isOwn || sameGroup
                  ? "填写/继续"
                  : "查看";
            const go = () => navigate(`/aup/fill/${item.id}`);
            return (
              <div
                key={item.id}
                className="cursor-pointer rounded-xl border p-4 transition-colors hover:border-primary"
                onClick={go}
              >
                <div className="truncate font-medium">{item.projectName || "（未命名）"}</div>
                <div className="mt-1 truncate text-sm text-muted-foreground">{item.piName || "—"}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {STAGE_TEXT[item.currentStage] || item.currentStage}
                  </span>
                  {item.registerNo && (
                    <span className="font-mono text-xs text-muted-foreground">{item.registerNo}</span>
                  )}
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className={
                      primary
                        ? "rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                        : "rounded-md border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      go();
                    }}
                  >
                    {label}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
