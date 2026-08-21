import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useAupList, useRenewAup, useDeleteAup } from "@/features/aup/hooks/useAup";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import type { AupListItem } from "@/features/aup/schema/aup";
import { appConfirm } from "@/lib/appDialog";
import "../../aup/aup.css";

gsap.registerPlugin(useGSAP);

/** 阶段 → 展示文案（含返修子状态） */
function stageText(item: AupListItem): string {
  switch (item.currentStage) {
    case "approved":
      return "已批准";
    case "terminated":
      return "已终止";
    case "expired":
      return "已过期";
    case "draft":
      switch (item.draftSource) {
        case "piReturn":
          return "退回给实验员";
        case "formatReturn":
          return "返修(格式)";
        case "expertReturn":
          return "返修(专家)";
        case "rollback":
          return "已回退";
        default:
          return "填写中";
      }
    case "piReview":
      return "组长审核中";
    case "formatReview":
      return "格式审查中";
    case "expertReview":
      return "专家审查中";
    default:
      return item.currentStage;
  }
}

/** 阶段 → 印章 */
function stageSeal(item: AupListItem): { lines: string[]; cls: string } {
  switch (item.currentStage) {
    case "approved":
      return { lines: ["已", "批准"], cls: "approved" };
    case "terminated":
      return { lines: ["已", "终止"], cls: "terminated" };
    case "expired":
      return { lines: ["已", "过期"], cls: "terminated" };
    case "draft":
      switch (item.draftSource) {
        case "piReturn":
          return { lines: ["退回", "实验员"], cls: "modify" };
        case "formatReturn":
          return { lines: ["返修", "格式"], cls: "modify" };
        case "expertReturn":
          return { lines: ["返修", "专家"], cls: "modify" };
        case "rollback":
          return { lines: ["已", "回退"], cls: "modify" };
        default:
          return { lines: ["草稿"], cls: "draft" };
      }
    case "piReview":
      return { lines: ["组长", "审核中"], cls: "review" };
    case "formatReview":
      return { lines: ["格式", "审查中"], cls: "review" };
    case "expertReview":
      return { lines: ["专家", "审查中"], cls: "review" };
    default:
      return { lines: [item.currentStage], cls: "draft" };
  }
}

/**
 * 学生端 AUP 计划书：卡片式展示「所在课题组」的计划书（计划书式）。
 * 课题组内成员协作填写，均可进入编辑（仅限填写内容）。
 */
export default function StudentAupPage() {
  const navigate = useNavigate();
  const userInfo = authStorage.getUserInfo();
  const projectGroupName = userInfo?.projectGroupName?.trim() || "";
  const currentUserId = userInfo?.id;
  // 学生视图（教职工模拟）下，管理动作沿用原教职工角色
  const staffRole = (() => {
    try {
      const raw = localStorage.getItem("admin_original_auth");
      if (raw) {
        const o = JSON.parse(raw) as { role?: string };
        if (o.role) return o.role;
      }
    } catch {
      /* ignore */
    }
    return authStorage.getRole() || "";
  })();
  const isPlatformOwner = hasMinRole(staffRole, "PLATFORM_OWNER");

  const { data, isLoading } = useAupList({
    projectGroupName: projectGroupName || undefined,
    size: 100,
  });
  const renewMut = useRenewAup();
  const deleteMut = useDeleteAup();
  const rawItems = data?.items ?? [];
  // demo 记录（isDemo === 1）在有真实记录时自动隐藏；若全是 demo 则保留以便演示
  const hasRealRecord = rawItems.some((i) => i.isDemo !== 1);
  const items = hasRealRecord ? rawItems.filter((i) => i.isDemo !== 1) : rawItems;

  const gridRef = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const cells = gridRef.current?.querySelectorAll(".aup-doc-stack");
      if (!cells || cells.length === 0) return;
      gsap.fromTo(
        cells,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, ease: "power2.out", overwrite: true }
      );
    },
    { scope: gridRef, dependencies: [items] }
  );

  const handleRenew = async (id: number) => {
    if (!await appConfirm("续期将基于该已过期计划书新建一份草稿（引用原注册号、结转未用动物数），重新走审核流程。确定续期？")) return;
    try {
      const res = await renewMut.mutateAsync(id);
      if (res?.id) navigate(`/aup/fill/${res.id}`);
    } catch {
      /* toast 已由 hook 处理 */
    }
  };

  const handleDelete = async (id: number) => {
    if (await appConfirm("确定删除该计划书？删除后不可恢复。")) deleteMut.mutate(id);
  };

  return (
    <div className="aup-app" style={{ padding: "16px" }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>AUP 计划书</h1>
        <p style={{ marginTop: 4, fontSize: 13, color: "var(--muted)" }}>
          {projectGroupName ? `课题组：${projectGroupName}` : "未关联课题组"}
        </p>
      </div>

      {isLoading ? (
        <div className="aup-empty">加载中…</div>
      ) : items.length === 0 ? (
        <div className="aup-empty">暂无计划书，可在门户「填写计划书」入口新建</div>
      ) : (
        <div
          ref={gridRef}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 18, perspective: "1200px" }}
        >
          {items.map((item) => {
            const isDraft = item.currentStage === "draft";
            const isPi = !!currentUserId && item.piUserId === currentUserId;
            const isOwn = !!currentUserId && item.createdBy === currentUserId;
            const sameGroup = !!projectGroupName;
            const isPiReview = item.currentStage === "piReview" && isPi;
            // draft 阶段：组长 → 填写 + 提交；实验员（本人或同组）→ 填写/继续；其余 → 查看
            // piReview 阶段：组长 → 审核
            const primary = isPiReview || (isDraft && (isPi || isOwn || sameGroup));
            const label = isPiReview
              ? "审核"
              : !isDraft
                ? "查看"
                : isPi
                  ? "填写 + 提交"
                  : isOwn || sameGroup
                    ? "填写/继续"
                    : "查看";
            // 删除权限与后端 delete 一致：平台管理者可删任意；否则仅申请人本人可删自己的首次草稿（未提交过）
            const canDelete =
              item.isDemo !== 1 &&
              (isPlatformOwner ||
                (item.currentStage === "draft" &&
                  item.draftSource === "first" &&
                  !!currentUserId &&
                  item.createdBy === currentUserId));
            const seal = stageSeal(item);
            const go = () =>
              navigate(isPiReview ? `/student/aup/review/${item.id}` : `/aup/fill/${item.id}`);
            return (
              <div className="aup-doc-stack" key={item.id}>
                <div className="aup-doc" onClick={go}>
                  <div className="aup-doc-hd">
                    <span className="aup-doc-title">实验动物使用计划书</span>
                    <span className="aup-doc-no">{item.registerNo || "草稿"}</span>
                  </div>
                  <div className="aup-doc-body">
                    <div className="aup-f">
                      <div className="aup-f-k">项目名称</div>
                      <div className="aup-f-v">
                        {item.projectName || "（未命名）"}
                        {item.isDemo === 1 && <span className="demo-badge">演示示例</span>}
                      </div>
                    </div>
                    <div className="aup-f">
                      <div className="aup-f-k">课题组负责人</div>
                      <div className="aup-f-v">{item.piName || "—"}</div>
                    </div>
                    <div className="aup-f">
                      <div className="aup-f-k">状态</div>
                      <div className="aup-f-v">{stageText(item)}</div>
                    </div>
                  </div>
                  <div className="aup-doc-foot">
                    <div className="aup-doc-acts">
                      {item.currentStage === "expired" && (isPi || isOwn) && (
                        <button
                          className="btn primary small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRenew(item.id);
                          }}
                        >
                          续期
                        </button>
                      )}
                      {canDelete && (
                        <button
                          className="btn ghost small"
                          style={{ color: "var(--danger)" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(item.id);
                          }}
                        >
                          删除
                        </button>
                      )}
                      <button
                        className={primary ? "btn primary small" : "btn ghost small"}
                        onClick={(e) => {
                          e.stopPropagation();
                          go();
                        }}
                      >
                        {label}
                      </button>
                    </div>
                    <div className="aup-doc-foot-right">
                      <div className={"aup-seal " + seal.cls}>
                        {seal.lines.map((l) => (
                          <span key={l}>{l}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
