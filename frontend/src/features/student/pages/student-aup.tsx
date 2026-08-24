import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAupList, useRenewAup, useDeleteAup } from "@/features/aup/hooks/useAup";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import type { AupListItem } from "@/features/aup/schema/aup";
import { AupListCardGrid, type ItemAction } from "@/features/aup/components/AupListCard";
import { appConfirm } from "@/lib/appDialog";
import "../../aup/aup.css";

/**
 * 学生端 AUP 计划书：与管理端相同的计划书卡片格式。
 * 仅展示本课题组（或无课题组时仅本人相关）的计划书，不包含全库过期/未关联记录。
 */
export default function StudentAupPage() {
  const navigate = useNavigate();
  const userInfo = authStorage.getUserInfo();
  const projectGroupName = userInfo?.projectGroupName?.trim() || "";
  const currentUserId = userInfo?.id;
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

  const listParams = useMemo(
    () => ({
      groupScopeOnly: true,
      projectGroupName: projectGroupName || undefined,
      size: 100,
      sortBy: "updatedAt",
      sortDir: "desc" as const,
    }),
    [projectGroupName]
  );

  const { data, isLoading } = useAupList(listParams);
  const renewMut = useRenewAup();
  const deleteMut = useDeleteAup();
  const rawItems = data?.items ?? [];
  const hasRealRecord = rawItems.some((i) => i.isDemo !== 1);
  const items = hasRealRecord ? rawItems.filter((i) => i.isDemo !== 1) : rawItems;
  const genKey = useMemo(() => JSON.stringify(listParams), [listParams]);

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

  const getActions = (item: AupListItem): ItemAction[] => {
    const acts: ItemAction[] = [];
    const isDraft = item.currentStage === "draft";
    const isPi = !!currentUserId && item.piUserId === currentUserId;
    const isOwn = !!currentUserId && item.createdBy === currentUserId;
    const sameGroup = !!projectGroupName;
    const isPiReview = item.currentStage === "piReview" && isPi;
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
    const go = () =>
      navigate(isPiReview ? `/student/aup/review/${item.id}` : `/aup/fill/${item.id}`);

    if (item.currentStage === "expired" && (isPi || isOwn)) {
      acts.push({ key: "renew", label: "续期", primary: true, onClick: () => handleRenew(item.id) });
    }
    const canDelete =
      item.isDemo !== 1 &&
      (isPlatformOwner ||
        (item.currentStage === "draft" &&
          item.draftSource === "first" &&
          !!currentUserId &&
          item.createdBy === currentUserId));
    if (canDelete) {
      acts.push({ key: "delete", label: "删除", danger: true, onClick: () => handleDelete(item.id) });
    }
    acts.push({
      key: "open",
      label,
      primary,
      onClick: go,
    });
    return acts;
  };

  return (
    <div className="aup-app aup-list-fixed" style={{ padding: "16px" }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>AUP 计划书</h1>
        <p style={{ marginTop: 4, fontSize: 13, color: "var(--muted)" }}>
          {projectGroupName ? `课题组：${projectGroupName}` : "未关联课题组（仅显示本人相关计划书）"}
        </p>
      </div>

      {isLoading ? (
        <div className="aup-empty">加载中…</div>
      ) : items.length === 0 ? (
        <div className="aup-empty">暂无计划书，可在门户「填写计划书」入口新建</div>
      ) : (
        <AupListCardGrid
          items={items}
          genKey={genKey}
          getActions={getActions}
          showSnapshots={false}
        />
      )}
    </div>
  );
}
