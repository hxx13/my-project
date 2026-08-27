import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import {
  approveTeamJoinRequest,
  cancelTeamJoinRequest,
  dissolveTeam,
  inviteMembers,
  rejectTeamJoinRequest,
  removeTeamMember,
  transferTeam,
  updateMemberRole,
  updateTeam,
  type TeamMember,
  type TeamVisibility,
} from "@/api/domains/team.api";
import { fetchUnifiedPersonnel } from "@/api/domains/admin.api";
import { useTeamDetail, useTeamJoinRequests } from "./hooks/useTeams";
import "@/features/aup/aup.css";

function fmt(s?: string) {
  return s ? s.replace("T", " ").slice(0, 16) : "—";
}

function visibilityLabel(v: string) {
  return v === "PRIVATE" ? "私有" : "公开";
}

function roleLabel(code: string) {
  const u = (code ?? "").toUpperCase();
  if (u === "OWNER") return "负责人";
  if (u === "MANAGER") return "管理员";
  if (u === "MEMBER") return "成员";
  return code || "—";
}

function InviteMemberModal({
  teamId,
  onClose,
  onInvited,
}: {
  teamId: number;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["personnel", "team-invite", page, applied],
    queryFn: () => fetchUnifiedPersonnel(page, 20, { keyword: applied }),
  });
  const rows = data?.list ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    if (selected.size === 0) {
      toast.error("请选择要邀请的成员");
      return;
    }
    setSending(true);
    try {
      await inviteMembers(teamId, { personnelIds: [...selected] });
      toast.success(`已发出 ${selected.size} 个邀请`);
      onInvited();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "邀请失败");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="aup-modal-mask" onClick={onClose}>
      <div className="aup-modal" style={{ maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
        <h3>邀请成员</h3>
        <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
          <input
            className="input"
            style={{ flex: 1 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setApplied(keyword.trim());
                setPage(1);
              }
            }}
            placeholder="搜索姓名 / 工号"
          />
          <button type="button" className="btn ghost small" onClick={() => { setApplied(keyword.trim()); setPage(1); }}>
            搜索
          </button>
        </div>

        <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
          {isLoading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>加载中…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>无匹配人员</div>
          ) : (
            <table className="list-table" style={{ borderRadius: 0, border: "none" }}>
              <thead>
                <tr>
                  <th style={{ width: 40, padding: "8px 10px" }}></th>
                  <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>姓名</th>
                  <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>身份</th>
                  <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>部门</th>
                  <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>课题组</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td style={{ padding: "8px 10px" }}>
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    </td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{p.name}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span
                        className="status-badge"
                        style={{ background: p.staffId ? "#eef1fd" : "#e9f7ef", color: p.staffId ? "#3b5bdb" : "#2f9e44" }}
                      >
                        {p.staffId ? "教职工" : p.aroUserId ? "学生" : "—"}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "var(--muted)" }}>{p.departmentName || "—"}</td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "var(--muted)" }}>{p.projectGroupName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一页
            </button>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{page} / {totalPages}</span>
            <button type="button" className="btn ghost small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              下一页
            </button>
          </div>
        )}

        <div className="aup-modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn primary" disabled={sending || selected.size === 0} onClick={submit}>
            {sending ? "邀请中…" : `邀请 (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeamDetailPage() {
  const { id } = useParams();
  const teamId = id ? Number(id) : undefined;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const goBack = useGoBack("/content-manager/nhp-team");

  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [visDraft, setVisDraft] = useState<TeamVisibility>("PUBLIC");
  const [inviteOpen, setInviteOpen] = useState(false);

  const detailQuery = useTeamDetail(teamId);
  const team = detailQuery.data;
  const members: TeamMember[] = team?.members ?? [];

  const requestsQuery = useTeamJoinRequests(teamId);
  const requests = requestsQuery.data?.list ?? [];

  const invalidateDetail = () => {
    void qc.invalidateQueries({ queryKey: ["team", "detail", teamId] });
    void qc.invalidateQueries({ queryKey: ["team", "join-requests", teamId] });
  };

  const startEdit = () => {
    if (!team) return;
    setNameDraft(team.name);
    setDescDraft(team.description ?? "");
    setVisDraft(team.visibility);
    setEditing(true);
  };

  const updateMut = useMutation({
    mutationFn: () =>
      updateTeam(teamId!, {
        name: nameDraft.trim(),
        description: descDraft.trim() || undefined,
        visibility: visDraft,
      }),
    onSuccess: () => {
      toast.success("已保存");
      setEditing(false);
      invalidateDetail();
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  const dissolveMut = useMutation({
    mutationFn: () => dissolveTeam(teamId!),
    onSuccess: () => {
      toast.success("团队已解散");
      void qc.invalidateQueries({ queryKey: ["team", "list"] });
      navigate("/content-manager/nhp-team");
    },
    onError: (e: Error) => toast.error(e.message || "解散失败"),
  });

  const transferMut = useMutation({
    mutationFn: (memberId: number) => transferTeam(teamId!, memberId),
    onSuccess: () => {
      toast.success("已转让");
      invalidateDetail();
    },
    onError: (e: Error) => toast.error(e.message || "转让失败"),
  });

  const roleMut = useMutation({
    mutationFn: ({ memberId, roleCode }: { memberId: number; roleCode: string }) =>
      updateMemberRole(teamId!, memberId, roleCode),
    onSuccess: () => {
      toast.success("角色已更新");
      invalidateDetail();
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });

  const removeMut = useMutation({
    mutationFn: (memberId: number) => removeTeamMember(teamId!, memberId),
    onSuccess: () => {
      toast.success("已移除");
      invalidateDetail();
    },
    onError: (e: Error) => toast.error(e.message || "移除失败"),
  });

  const approveMut = useMutation({
    mutationFn: (requestId: number) => approveTeamJoinRequest(teamId!, requestId),
    onSuccess: () => {
      toast.success("已通过");
      invalidateDetail();
    },
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });

  const rejectMut = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: number; reason: string }) =>
      rejectTeamJoinRequest(teamId!, requestId, reason),
    onSuccess: () => {
      toast.success("已拒绝");
      invalidateDetail();
    },
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });

  const cancelMut = useMutation({
    mutationFn: (requestId: number) => cancelTeamJoinRequest(teamId!, requestId),
    onSuccess: () => {
      toast.success("已取消");
      invalidateDetail();
    },
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });

  const handleRole = async (m: TeamMember) => {
    const next = await appPrompt("修改角色 code（MANAGER / MEMBER）", m.roleCode);
    if (next == null) return;
    const roleCode = next.trim();
    if (!roleCode || roleCode === m.roleCode) return;
    roleMut.mutate({ memberId: m.memberId, roleCode });
  };

  const handleTransfer = async (m: TeamMember) => {
    if (await appConfirm(`将团队转让给「${m.name}」？你将不再是负责人。`)) {
      transferMut.mutate(m.memberId);
    }
  };

  const handleRemove = async (m: TeamMember) => {
    if (await appConfirm(`将「${m.name}」移出团队？`)) {
      removeMut.mutate(m.memberId);
    }
  };

  const handleReject = async (requestId: number) => {
    const reason = (await appPrompt("拒绝原因（可留空）", "", { allowEmpty: true })) ?? "";
    rejectMut.mutate({ requestId, reason });
  };

  if (detailQuery.isLoading) {
    return (
      <div className="aup-app aup-app--workbench">
        <div className="aup-wb">
          <div className="aup-wb-empty">加载中…</div>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="aup-app aup-app--workbench">
        <div className="aup-wb">
          <div className="aup-wb-empty">团队不存在或已删除</div>
        </div>
      </div>
    );
  }

  return (
    <div className="aup-app aup-app--workbench">
      <div className="aup-wb">
        <div className="aup-wb-hd aup-wb-hd--compact">
          <div className="aup-wb-hd-main">
            <button type="button" className="btn ghost small" onClick={goBack}>
              ← 返回
            </button>
            <h1>{team.name}</h1>
            <span className="aup-wb-chip muted">{visibilityLabel(team.visibility)}</span>
            <span className="aup-wb-chip">{team.memberCount} 名成员</span>
          </div>
          <div className="aup-wb-actions">
            <button type="button" className="btn ghost small" onClick={() => setInviteOpen(true)}>
              ＋ 邀请成员
            </button>
            <button
              type="button"
              className="btn danger small"
              disabled={dissolveMut.isPending}
              onClick={async () => {
                if (await appConfirm(`确认解散团队「${team.name}」？此操作不可恢复。`, { danger: true })) {
                  dissolveMut.mutate();
                }
              }}
            >
              {dissolveMut.isPending ? "解散中…" : "解散团队"}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* 团队信息 */}
          <div className="aup-wb-panel">
            <div className="aup-wb-panel-hd">
              <span className="title">团队信息</span>
              <div style={{ flex: 1 }} />
              {!editing ? (
                <button type="button" className="btn ghost small" onClick={startEdit}>
                  编辑
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn primary small"
                    disabled={updateMut.isPending || !nameDraft.trim()}
                    onClick={() => updateMut.mutate()}
                  >
                    {updateMut.isPending ? "保存中…" : "保存"}
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => setEditing(false)}>
                    取消
                  </button>
                </>
              )}
            </div>

            {!editing ? (
              <div style={{ fontSize: 13 }}>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: "var(--muted)" }}>负责人：</span>
                  {team.ownerName || "—"}
                </div>
                <div style={{ color: "var(--muted)" }}>
                  {team.description || "暂无简介"}
                </div>
                <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12 }}>
                  创建于 {fmt(team.createdAt)}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 13 }}>
                  名称
                  <input
                    className="input"
                    style={{ width: "100%", marginTop: 4 }}
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                  />
                </label>
                <label style={{ fontSize: 13 }}>
                  简介
                  <textarea
                    className="textarea"
                    style={{ width: "100%", marginTop: 4 }}
                    rows={2}
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                  />
                </label>
                <label style={{ fontSize: 13 }}>
                  可见性
                  <select
                    className="select"
                    style={{ width: "100%", marginTop: 4 }}
                    value={visDraft}
                    onChange={(e) => setVisDraft(e.target.value as TeamVisibility)}
                  >
                    <option value="PUBLIC">公开</option>
                    <option value="PRIVATE">私有</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          {/* 成员列表 */}
          <div className="aup-wb-panel">
            <div className="aup-wb-panel-hd">
              <span className="title">成员列表</span>
              <span className="aup-wb-chip muted">{members.length} 人</span>
            </div>
            {members.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>暂无成员</div>
            ) : (
              <table className="list-table">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>工号</th>
                    <th>部门</th>
                    <th>课题组</th>
                    <th>角色</th>
                    <th>加入时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.memberId}>
                      <td className="proj-name">{m.name}</td>
                      <td style={{ color: "var(--muted)" }}>{m.staffId || m.jobNumber || "—"}</td>
                      <td style={{ color: "var(--muted)" }}>{m.departmentName || "—"}</td>
                      <td style={{ color: "var(--muted)" }}>{m.projectGroupName || "—"}</td>
                      <td>
                        <span className="status-badge" style={{ background: "#eef1fd", color: "#3b5bdb" }}>
                          {roleLabel(m.roleCode)}
                        </span>
                      </td>
                      <td style={{ color: "var(--muted)" }}>{fmt(m.joinedAt)}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button type="button" className="btn ghost small" onClick={() => handleRole(m)}>
                            改角色
                          </button>
                          <button type="button" className="btn ghost small" onClick={() => handleTransfer(m)}>
                            转让
                          </button>
                          <button type="button" className="btn danger small" onClick={() => handleRemove(m)}>
                            移除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 待审申请 */}
          <div className="aup-wb-panel">
            <div className="aup-wb-panel-hd">
              <span className="title">待审申请</span>
              <span className="aup-wb-chip muted">{requests.length} 条</span>
            </div>
            {requests.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>暂无待处理申请</div>
            ) : (
              <table className="list-table">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>类型</th>
                    <th>留言</th>
                    <th>申请时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td className="proj-name">{r.name}</td>
                      <td>{r.type === "INVITE" ? "邀请" : "申请"}</td>
                      <td style={{ color: "var(--muted)", maxWidth: 240 }}>{r.message || "—"}</td>
                      <td style={{ color: "var(--muted)" }}>{fmt(r.createdAt)}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn primary small"
                            disabled={approveMut.isPending}
                            onClick={() => approveMut.mutate(r.id)}
                          >
                            通过
                          </button>
                          <button
                            type="button"
                            className="btn danger small"
                            disabled={rejectMut.isPending}
                            onClick={() => handleReject(r.id)}
                          >
                            拒绝
                          </button>
                          <button
                            type="button"
                            className="btn ghost small"
                            disabled={cancelMut.isPending}
                            onClick={() => cancelMut.mutate(r.id)}
                          >
                            取消
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {inviteOpen && (
        <InviteMemberModal
          teamId={team.id}
          onClose={() => setInviteOpen(false)}
          onInvited={() => {
            setInviteOpen(false);
            invalidateDetail();
          }}
        />
      )}
    </div>
  );
}
