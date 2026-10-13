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

  /** 已通过计划书的修改说明（点击「编辑」时展示） */
  const AMEND_NOTICE = [
    "在原实验计划书上可直接修改的条目，属于小修改（minor amendments），可直接修改后点击「保存当前」保存；如果某条目不能直接「保存当前」，则该条目属于大修改（major amendments）。",
    "实验计划书的关键信息，例如项目名称等，禁止修改，并以禁止符号显示。",
    "如需更改 AUP 以下内容（major amendments），则需要使用「更新版本」功能：",
    "1. 修改项目起止日期；",
    "2. 修改合作单位；",
    "3. 修改动物进出口活动；",
    "4. 增加或删减附表格（有害物质的使用、动物运输、基因工程动物信息）；",
    "5. 更改实验目的；",
    "6. 新增可能会导致动物疼痛的程序；动物保定程序；修改实验动物所属的疼痛等级；麻醉止痛药物的使用；安乐死程序；",
    "7. 修改动物实验内容及实验节点；",
    "8. 修改实验计划所用动物品种；",
    "9. 修改 3 年所用实验动物数量，以及计算依据；",
    "10. 增加非药用化合物；",
    "11. 修改动科部以外动物饲养空间（即课题组饲养空间）申请，以及特殊饲养要求，单笼饲养等情况；",
    "12. 修改动物尸体的处置。",
    "",
    "注：",
    "● 如果点击并提交实验计划书的更新版本，原实验计划书将变更为历史版本。更新版本的审核流程与新计划书一致。审核通过后将给予新实验计划更新版本号。",
  ].join("\n");

  const handleAmend = async (id: number) => {
    const ok = await appConfirm(AMEND_NOTICE, {
      title: "修改实验计划书提示",
      confirmText: "进入修改",
      cancelText: "取消",
    });
    if (ok) navigate(`/aup/fill/${id}?amend=1`);
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
    // 已通过的计划书：仅该计划书课题组长可修改；已有进行中更新版本时不重复发起
    if (item.currentStage === "approved" && isPi && !item.amendmentStage) {
      acts.push({ key: "amend", label: "编辑", primary: true, onClick: () => handleAmend(item.id) });
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
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>AUP 计划书</h1>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {projectGroupName ? `课题组：${projectGroupName}` : "未关联课题组"}
        </span>
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
