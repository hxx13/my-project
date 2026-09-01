import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { fetchNhpCapabilities, fetchNhpPermissions, createNhpPermission, deleteNhpPermission, fetchNhpConfigTeams } from "../../api/nhpPermission.api";
import { fetchTeamRoles } from "@/api/domains/team.api";
import { MatrixTable } from "../../components/event-assignment/MatrixTable";
import "@/features/aup/aup.css";

export default function NhpPermissionPage() {
  const qc = useQueryClient();
  const goBack = useGoBack("/nhp-admin/template");

  const myTeamsQuery = useQuery({
    queryKey: ["nhp", "config-teams"],
    queryFn: fetchNhpConfigTeams,
  });
  const myTeams = myTeamsQuery.data ?? [];
  const [teamId, setTeamId] = useState<number | null>(null);

  useEffect(() => {
    if (teamId == null && myTeams.length === 1) setTeamId(myTeams[0].id);
  }, [myTeams, teamId]);

  const capsQuery = useQuery({ queryKey: ["nhp", "capabilities"], queryFn: fetchNhpCapabilities });
  const permsQuery = useQuery({ queryKey: ["nhp", "permissions", teamId], queryFn: fetchNhpPermissions, enabled: teamId != null });
  const rolesQuery = useQuery({ queryKey: ["team", "roles", teamId], queryFn: () => fetchTeamRoles(teamId!), enabled: teamId != null });

  const caps = capsQuery.data ?? [];
  const roles = rolesQuery.data ?? [];

  const permMap = new Map<string, number>();
  for (const p of permsQuery.data ?? []) {
    if (p.resourceType === "global" && (p.teamId ?? 0) === (teamId ?? 0)) {
      permMap.set(`${p.subjectCode}:${p.capabilityCode}`, p.id);
    }
  }

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["nhp", "permissions", teamId] });
  };

  const grantMut = useMutation({
    mutationFn: (args: { roleCode: string; capabilityCode: string }) =>
      createNhpPermission({ subjectType: "team_role", subjectCode: args.roleCode, resourceType: "global", resourceId: null, capabilityCode: args.capabilityCode, teamId }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message || "授权失败"),
  });
  const revokeMut = useMutation({
    mutationFn: (id: number) => deleteNhpPermission(id),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message || "撤销失败"),
  });

  const toggleCell = (roleCode: string, capabilityCode: string, checked: boolean) => {
    if (teamId == null) return;
    const key = `${roleCode}:${capabilityCode}`;
    if (checked) {
      grantMut.mutate({ roleCode, capabilityCode });
    } else {
      const id = permMap.get(key);
      if (id != null) revokeMut.mutate(id);
    }
  };

  const roleOf = (id: string | number) => roles.find((r) => r.id === id);
  const capOf = (id: string | number) => caps.find((c) => c.id === id);

  return (
    <div className="aup-app aup-app--workbench">
      <div className="aup-wb">
        <div className="aup-wb-hd aup-wb-hd--compact">
          <div className="aup-wb-hd-main">
            <button type="button" className="btn ghost small" onClick={goBack}>← 返回</button>
            <h1>权限配置</h1>
            <label style={{ fontSize: 12, color: "var(--muted)", marginLeft: 12 }}>选择团队</label>
            <select
              value={teamId == null ? "" : String(teamId)}
              onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : null)}
              style={{ padding: "5px 8px", fontSize: 13, borderRadius: 6, minWidth: 180 }}
            >
              <option value="">选择团队</option>
              {myTeams.map((t) => (
                <option key={t.id} value={String(t.id)}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12 }}>
          {teamId == null ? (
            <div className="aup-wb-empty">暂无您可配置权限的团队（负责人或持有「配置权限」能力者）</div>
          ) : (
            <div className="aup-wb-panel">
              <div className="aup-wb-panel-hd">
                <span className="title">权限矩阵（团队角色 × 能力）</span>
                <span className="aup-wb-chip muted">勾选 = 该角色拥有该能力（本团队作用域）；负责人默认全开不可取消</span>
              </div>
              <MatrixTable
                rows={roles.map((r) => ({ id: r.id, label: r.label, subLabel: r.code }))}
                columns={caps.map((c) => ({ id: c.id, label: c.label }))}
                cellOn={(rowId, colId) => {
                  const role = roleOf(rowId);
                  const cap = capOf(colId);
                  if (!role || !cap) return false;
                  if (role.code === "OWNER" && cap.code === "config:manage") return true;
                  return permMap.has(`${role.code}:${cap.code}`);
                }}
                onToggleCell={(rowId, colId) => {
                  const role = roleOf(rowId);
                  const cap = capOf(colId);
                  if (!role || !cap) return;
                  if (role.code === "OWNER" && cap.code === "config:manage") return; // OWNER 配置权限不可取消，防锁死
                  toggleCell(role.code, cap.code, !permMap.has(`${role.code}:${cap.code}`));
                }}
                cellDisabled={(rowId, colId) =>
                  roleOf(rowId)?.code === "OWNER" && capOf(colId)?.code === "config:manage"
                }
                cornerLabel="角色 \\ 能力"
                matrixKey={`perm-${teamId}`}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
