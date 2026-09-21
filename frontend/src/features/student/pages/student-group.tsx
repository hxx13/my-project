import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Send, UserMinus, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import {
  StudentCard,
  StudentInput,
  StudentButton,
  Badge,
  Skeleton,
  ErrorRetry,
  EmptyState,
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  showToast,
} from "../components/ui";
import { studentQueryKey } from "../utils/studentQueryScope";
import {
  fetchMyGroup,
  fetchGroupOptions,
  fetchMyGroupApplications,
  fetchGroupMembers,
  fetchGroupRequests,
  applyGroup,
  approveGroupRequest,
  rejectGroupRequest,
  removeGroupMember,
  type MyGroupInfo,
  type GroupOption,
  type MyGroupApplication,
  type GroupMember,
  type GroupJoinRequest,
} from "../api/student.api";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "待审批",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
  CANCELLED: "已作废",
};

const STATUS_VARIANT: Record<string, "warning" | "success" | "error" | "default"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "error",
  CANCELLED: "default",
};

export default function StudentGroupPage() {
  const qc = useQueryClient();

  const { data: myGroup, isLoading: loadingMy, isError: errorMy, refetch: refetchMy } = useQuery({
    queryKey: studentQueryKey("group", "my"),
    queryFn: fetchMyGroup,
    retry: 1,
  });
  const hasGroup = !!myGroup?.hasGroup;
  const isPi = !!myGroup?.isPi;

  // 申请侧数据：仅无组时拉取
  const { data: options = [], isLoading: loadingOptions } = useQuery({
    queryKey: studentQueryKey("group", "options"),
    queryFn: fetchGroupOptions,
    enabled: !hasGroup,
    retry: 1,
  });
  const { data: applications = [], isLoading: loadingApplications } = useQuery({
    queryKey: studentQueryKey("group", "applications"),
    queryFn: fetchMyGroupApplications,
    enabled: !hasGroup,
    retry: 1,
  });

  // PI 侧数据：仅 PI 时拉取
  const { data: requests = [], isLoading: loadingRequests } = useQuery({
    queryKey: studentQueryKey("group", "requests"),
    queryFn: fetchGroupRequests,
    enabled: isPi,
    retry: 1,
  });
  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: studentQueryKey("group", "members"),
    queryFn: fetchGroupMembers,
    enabled: isPi,
    retry: 1,
  });

  // 申请表单态
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [applied, setApplied] = useState(false);

  // 拒绝 / 移出对话框
  const [rejectTarget, setRejectTarget] = useState<GroupJoinRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<GroupMember | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [removing, setRemoving] = useState(false);

  const hasPending = applied || applications.some((a) => a.status === "PENDING");

  const filteredOptions = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return options;
    return options.filter((o) => o.label.toLowerCase().includes(kw));
  }, [options, search]);

  const selectedOption: GroupOption | undefined = options.find((o) => o.value === selected);

  const handleApply = async () => {
    if (!selected) {
      showToast("请先选择要加入的课题组", "error");
      return;
    }
    try {
      setSubmitting(true);
      await applyGroup(Number(selected), message);
      setApplied(true);
      setMessage("");
      showToast("申请已提交，等待审批", "success");
      void qc.invalidateQueries({ queryKey: studentQueryKey("group", "applications") });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "提交申请失败", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (r: GroupJoinRequest) => {
    try {
      await approveGroupRequest(r.id);
      showToast("已批准", "success");
      void qc.invalidateQueries({ queryKey: studentQueryKey("group", "requests") });
      void qc.invalidateQueries({ queryKey: studentQueryKey("group", "members") });
      void qc.invalidateQueries({ queryKey: studentQueryKey("group", "my") });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "批准失败", "error");
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      showToast("拒绝理由不能为空", "error");
      return;
    }
    try {
      setRejecting(true);
      await rejectGroupRequest(rejectTarget.id, rejectReason);
      showToast("已拒绝", "success");
      setRejectTarget(null);
      setRejectReason("");
      void qc.invalidateQueries({ queryKey: studentQueryKey("group", "requests") });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "拒绝失败", "error");
    } finally {
      setRejecting(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      setRemoving(true);
      await removeGroupMember(removeTarget.id, removeReason);
      showToast("已移出成员", "success");
      setRemoveTarget(null);
      setRemoveReason("");
      void qc.invalidateQueries({ queryKey: studentQueryKey("group", "members") });
      void qc.invalidateQueries({ queryKey: studentQueryKey("group", "my") });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "移出成员失败", "error");
    } finally {
      setRemoving(false);
    }
  };

  if (loadingMy) {
    return (
      <AdminPageShell title="我的课题组">
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </AdminPageShell>
    );
  }

  if (errorMy || !myGroup) {
    return (
      <AdminPageShell title="我的课题组">
        <ErrorRetry message="加载课题组信息失败" onRetry={() => refetchMy()} />
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell title="我的课题组">
      {!hasGroup ? (
        <div className="space-y-4">
          <StudentCard padding="md" className="border border-[var(--student-border)]">
            {hasPending ? (
              <div className="flex items-center gap-2 text-[13px] text-[var(--student-ink)]">
                <Badge variant="warning">已提交，等待审批</Badge>
                <span className="text-[var(--student-mute-foreground)]">
                  你已提交加入课题组的申请，PI 审批通过后即可生效。
                </span>
              </div>
            ) : (
              <>
                <p className="mb-3 text-[13px] text-[var(--student-mute-foreground)]">
                  你还没有加入课题组。选择下方课题组并提交申请，由该组 PI 审批。
                </p>
                <StudentInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索课题组名称…"
                />
                <div className="mt-3 max-h-56 overflow-y-auto rounded-[var(--student-radius-md)] border border-[var(--student-border)]">
                  {loadingOptions ? (
                    <div className="p-4">
                      <Skeleton className="h-4 w-full" />
                    </div>
                  ) : filteredOptions.length === 0 ? (
                    <p className="p-4 text-center text-[12px] text-[var(--student-mute-foreground)]">
                      {options.length === 0 ? "暂无可申请的课题组" : "没有匹配的课题组"}
                    </p>
                  ) : (
                    filteredOptions.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setSelected(o.value)}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors",
                          "border-b border-[var(--student-hairline)] last:border-b-0",
                          selected === o.value
                            ? "bg-[var(--student-primary-soft)] text-[var(--student-primary)]"
                            : "text-[var(--student-ink)] hover:bg-[var(--student-canvas-soft)]",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{o.label}</span>
                        {selected === o.value && <Check className="size-4 shrink-0" strokeWidth={2} />}
                      </button>
                    ))
                  )}
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="申请留言（选填）"
                  rows={2}
                  className="mt-3 w-full resize-none rounded-[var(--student-radius-md)] border border-[var(--student-border)] bg-white px-3 py-2 text-sm text-foreground placeholder:text-[var(--student-mute)] outline-none focus-visible:border-[var(--student-primary)] focus-visible:ring-[3px] focus-visible:ring-[var(--student-primary-soft)]"
                />
                <StudentButton
                  className="mt-3 w-full"
                  onClick={handleApply}
                  disabled={submitting || !selected}
                >
                  <Send className="size-4" />
                  {submitting ? "提交中…" : selectedOption ? `申请加入「${selectedOption.label}」` : "提交申请"}
                </StudentButton>
              </>
            )}
          </StudentCard>

          <StudentCard padding="md" className="border border-[var(--student-border)]">
            <h3 className="mb-2 text-[15px] font-semibold text-[var(--student-foreground)]">我的申请记录</h3>
            {loadingApplications ? (
              <Skeleton className="h-10 w-full" />
            ) : applications.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-[var(--student-mute-foreground)]">暂无申请记录</p>
            ) : (
              <div className="divide-y divide-[var(--student-hairline)]">
                {applications.map((a) => (
                  <ApplicationRow key={a.id} app={a} />
                ))}
              </div>
            )}
          </StudentCard>
        </div>
      ) : !isPi ? (
        <GroupInfoCard myGroup={myGroup} />
      ) : (
        <div className="space-y-4">
          <GroupInfoCard myGroup={myGroup} />
          <PiRequestsCard
            requests={requests}
            loading={loadingRequests}
            onApprove={handleApprove}
            onReject={(r) => {
              setRejectTarget(r);
              setRejectReason("");
            }}
          />
          <PiMembersCard
            members={members}
            loading={loadingMembers}
            onRemove={(m) => {
              setRemoveTarget(m);
              setRemoveReason("");
            }}
          />
        </div>
      )}

      {/* 拒绝原因对话框（必填） */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogHeader>
          <DialogTitle>拒绝申请</DialogTitle>
          <DialogDescription>
            {rejectTarget?.applicantName ? `申请人：${rejectTarget.applicantName}` : ""}
          </DialogDescription>
        </DialogHeader>
        <StudentInput
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="拒绝理由（必填）"
        />
        <DialogFooter>
          <StudentButton variant="secondary" size="sm" onClick={() => setRejectTarget(null)}>
            取消
          </StudentButton>
          <StudentButton variant="destructive" size="sm" onClick={handleReject} disabled={rejecting}>
            {rejecting ? "提交中…" : "确认拒绝"}
          </StudentButton>
        </DialogFooter>
      </Dialog>

      {/* 移出成员对话框（原因选填 + 二次确认） */}
      <Dialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogHeader>
          <DialogTitle>移出成员</DialogTitle>
          <DialogDescription>
            {removeTarget?.name ? `确定将「${removeTarget.name}」移出课题组？该操作不可撤销。` : "确定移出该成员？该操作不可撤销。"}
          </DialogDescription>
        </DialogHeader>
        <StudentInput
          value={removeReason}
          onChange={(e) => setRemoveReason(e.target.value)}
          placeholder="移出理由（选填）"
        />
        <DialogFooter>
          <StudentButton variant="secondary" size="sm" onClick={() => setRemoveTarget(null)}>
            取消
          </StudentButton>
          <StudentButton variant="destructive" size="sm" onClick={handleRemove} disabled={removing}>
            {removing ? "处理中…" : "确认移出"}
          </StudentButton>
        </DialogFooter>
      </Dialog>
    </AdminPageShell>
  );
}

/* ------------------------------------------------------------------ */
/*  子块                                                               */
/* ------------------------------------------------------------------ */

function ApplicationRow({ app }: { app: MyGroupApplication }) {
  return (
    <div className="flex items-center gap-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-[var(--student-ink)]">
          {app.projectGroupName || `课题组 #${app.projectGroupId}`}
        </p>
        {app.rejectReason && (
          <p className="mt-0.5 truncate text-[11px] text-[var(--student-mute-foreground)]">
            拒绝理由：{app.rejectReason}
          </p>
        )}
      </div>
      <Badge variant={STATUS_VARIANT[app.status] ?? "default"}>{STATUS_LABEL[app.status] ?? app.status}</Badge>
    </div>
  );
}

function GroupInfoCard({ myGroup }: { myGroup: MyGroupInfo }) {
  return (
    <StudentCard padding="md" className="border border-[var(--student-border)]">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--student-radius-sm)] bg-[var(--student-primary-soft)]">
          <Users className="size-5 text-[var(--student-primary)]" strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-[var(--student-foreground)]">
            {myGroup.projectGroupName || "课题组"}
          </p>
          <p className="mt-0.5 text-[12px] text-[var(--student-mute-foreground)]">
            成员 {myGroup.memberCount ?? 0} 人
          </p>
        </div>
        {myGroup.isPi && <Badge variant="profile">PI</Badge>}
      </div>
      {!myGroup.isPi && (
        <p className="mt-3 border-t border-[var(--student-border)] pt-2.5 text-[12px] text-[var(--student-mute-foreground)]">
          普通成员仅可查看课题组信息。
        </p>
      )}
    </StudentCard>
  );
}

function PiRequestsCard({
  requests,
  loading,
  onApprove,
  onReject,
}: {
  requests: GroupJoinRequest[];
  loading: boolean;
  onApprove: (r: GroupJoinRequest) => void;
  onReject: (r: GroupJoinRequest) => void;
}) {
  return (
    <StudentCard padding="md" className="border border-[var(--student-border)]">
      <h3 className="mb-2 text-[15px] font-semibold text-[var(--student-foreground)]">待审申请</h3>
      {loading ? (
        <Skeleton className="h-10 w-full" />
      ) : requests.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-[var(--student-mute-foreground)]">暂无待审申请</p>
      ) : (
        <div className="divide-y divide-[var(--student-hairline)]">
          {requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[var(--student-ink)]">
                  {r.applicantName || "申请人"}
                </p>
                {r.message && (
                  <p className="mt-0.5 truncate text-[11px] text-[var(--student-mute-foreground)]">
                    留言：{r.message}
                  </p>
                )}
              </div>
              <StudentButton variant="primary" size="sm" onClick={() => onApprove(r)}>
                <Check className="size-3.5" /> 批准
              </StudentButton>
              <StudentButton variant="secondary" size="sm" onClick={() => onReject(r)}>
                <X className="size-3.5" /> 拒绝
              </StudentButton>
            </div>
          ))}
        </div>
      )}
    </StudentCard>
  );
}

function PiMembersCard({
  members,
  loading,
  onRemove,
}: {
  members: GroupMember[];
  loading: boolean;
  onRemove: (m: GroupMember) => void;
}) {
  return (
    <StudentCard padding="md" className="border border-[var(--student-border)]">
      <h3 className="mb-2 text-[15px] font-semibold text-[var(--student-foreground)]">
        成员名单（{members.length}）
      </h3>
      {loading ? (
        <Skeleton className="h-10 w-full" />
      ) : members.length === 0 ? (
        <EmptyState icon={Users} title="暂无成员" />
      ) : (
        <div className="divide-y divide-[var(--student-hairline)]">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-[var(--student-ink)]">{m.name || "—"}</p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--student-mute-foreground)]">
                  {m.jobNumber ? `工号 ${m.jobNumber}` : m.staffId ? `账号 ${m.staffId}` : "—"}
                </p>
              </div>
              <StudentButton variant="ghost" size="sm" onClick={() => onRemove(m)}>
                <UserMinus className="size-3.5" /> 移出
              </StudentButton>
            </div>
          ))}
        </div>
      )}
    </StudentCard>
  );
}
