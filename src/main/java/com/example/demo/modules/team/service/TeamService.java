package com.example.demo.modules.team.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import com.example.demo.modules.personnel.service.PersonnelService;
import com.example.demo.modules.team.dto.*;
import com.example.demo.modules.team.entity.Team;
import com.example.demo.modules.team.entity.TeamAuditLog;
import com.example.demo.modules.team.entity.TeamJoinRequest;
import com.example.demo.modules.team.entity.TeamMember;
import com.example.demo.modules.team.mapper.TeamMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * 团队管理核心服务 — 统一身份 + 管理员门 + 团队级角色门 + 申请状态机 + 审计。
 */
@Service
public class TeamService {

    private static final Set<String> MANAGE_ROLES = Set.of("OWNER", "MANAGER");
    private static final Set<String> OWNER_ROLES = Set.of("OWNER");
    private static final Set<String> ASSIGNABLE_ROLES = Set.of("MANAGER", "MEMBER");

    private final TeamMapper teamMapper;
    private final PersonnelService personnelService;
    private final PersonnelMapper personnelMapper;
    private final JdbcTemplate jdbcTemplate;

    public TeamService(TeamMapper teamMapper,
                       PersonnelService personnelService,
                       PersonnelMapper personnelMapper,
                       JdbcTemplate jdbcTemplate) {
        this.teamMapper = teamMapper;
        this.personnelService = personnelService;
        this.personnelMapper = personnelMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    // ═══════════════════════════════════════════
    // 门
    // ═══════════════════════════════════════════

    /** 全局管理员门：拦截器卡 STAFF 底座，这里再卡 ADMIN。 */
    private void requireAdmin(User user) {
        if (user == null || user.getRole() == null
                || user.getRole().getLevel() < RoleEnum.ADMIN.getLevel()) {
            throw new TwinBusinessException(403, "无权限");
        }
    }

    private boolean isSuperAdmin(User user) {
        return user.getRole() != null && user.getRole().getLevel() >= RoleEnum.SUPER_ADMIN.getLevel();
    }

    /** 当前用户 → 统一 personnel.id（经 resolveIdByAccount 归一），未关联返回 null。 */
    private Long currentPersonnelId(User user) {
        if (user == null) return null;
        String pid = personnelService.resolveIdByAccount(user.getId());
        if (pid == null) return null;
        try {
            return Long.parseLong(pid);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 当前用户所属的全部有效团队 id（owner 或 member；owner 优先排前），无则空。 */
    public List<Long> myTeamIds(User user) {
        Long pid = currentPersonnelId(user);
        if (pid == null) return List.of();
        List<Team> teams = teamMapper.selectTeamsByPersonnelId(pid);
        if (teams == null || teams.isEmpty()) return List.of();
        List<Long> ids = new ArrayList<>();
        for (Team t : teams) {
            if (t.getId() != null) ids.add(t.getId());
        }
        return ids;
    }

    /** NHP 等下游复用：当前用户在团队内的角色（非成员 null；SUPER_ADMIN 越权 OWNER）。 */
    public String teamRoleOf(User user, Long teamId) {
        return memberRoleOf(user, teamId);
    }

    /** 当前用户在团队内的角色；SUPER_ADMIN 越权视为 OWNER。 */
    private String memberRoleOf(User user, Long teamId) {
        if (user == null) return null;
        if (isSuperAdmin(user)) return "OWNER";
        Long pid = currentPersonnelId(user);
        if (pid == null) return null;
        TeamMember m = teamMapper.selectMemberByTeamAndPersonnel(teamId, pid);
        return m == null ? null : m.getRoleCode();
    }

    /** 团队级角色门：要求 OWNER/MANAGER 等。 */
    private void requireTeamRole(User user, Long teamId, Set<String> allowedRoles) {
        String role = memberRoleOf(user, teamId);
        if (role == null || !allowedRoles.contains(role)) {
            throw new TwinBusinessException(403, "无权限");
        }
    }

    /** 团队查看权限：仅成员（或 SUPER_ADMIN）可查看详情/成员名单；非成员（含公开团队）仅可看列表并申请加入。 */
    private void requireTeamViewable(User user, Team team) {
        if (isSuperAdmin(user)) {
            return;
        }
        if (team != null && memberRoleOf(user, team.getId()) != null) {
            return;
        }
        throw new TwinBusinessException(403, "无权查看该团队");
    }

    // ═══════════════════════════════════════════
    // 团队角色字典（内置 team_id=0 + 团队自定义）
    // ═══════════════════════════════════════════

    /** 团队角色列表（内置 + 团队自定义）。 */
    public List<Map<String, Object>> listRoles(Long teamId) {
        return jdbcTemplate.queryForList(
                "SELECT id, team_id, code, label, sort_order, active FROM team_role "
                        + "WHERE team_id = 0 OR team_id = ? ORDER BY sort_order, id",
                teamId);
    }

    /** 新增团队自定义角色（仅负责人）。 */
    public Map<String, Object> createRole(User user, Long teamId, String code, String label) {
        requireTeam(teamId);
        requireTeamRole(user, teamId, OWNER_ROLES);
        String c = code == null ? null : code.trim().toUpperCase();
        String l = label == null ? null : label.trim();
        if (c == null || c.isBlank() || l == null || l.isBlank()) {
            throw new TwinBusinessException(400, "角色 code 与名称必填");
        }
        Integer builtin = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM team_role WHERE team_id = 0 AND code = ?", Integer.class, c);
        if (builtin != null && builtin > 0) {
            throw new TwinBusinessException(409, "内置角色 code 不可重复: " + c);
        }
        try {
            jdbcTemplate.update(
                    "INSERT INTO team_role (team_id, code, label, sort_order, active) VALUES (?, ?, ?, 100, 1)",
                    teamId, c, l);
        } catch (Exception e) {
            throw new TwinBusinessException(409, "角色 code 已存在: " + c);
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, team_id, code, label, sort_order, active FROM team_role WHERE team_id = ? AND code = ?",
                teamId, c);
        return rows.isEmpty() ? Map.of("teamId", teamId, "code", c, "label", l) : rows.get(0);
    }

    /** 删除团队自定义角色（仅负责人；被成员引用时拒绝）。 */
    public void deleteRole(User user, Long teamId, Long roleId) {
        requireTeam(teamId);
        requireTeamRole(user, teamId, OWNER_ROLES);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT team_id, code FROM team_role WHERE id = ?", roleId);
        if (rows.isEmpty()) {
            throw new TwinBusinessException(404, "角色不存在");
        }
        Map<String, Object> role = rows.get(0);
        long rt = ((Number) role.get("team_id")).longValue();
        if (rt != teamId.longValue()) {
            throw new TwinBusinessException(404, "角色不存在");
        }
        String code = String.valueOf(role.get("code"));
        Integer refs = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM team_member WHERE team_id = ? AND role_code = ? AND deleted = 0",
                Integer.class, teamId, code);
        if (refs != null && refs > 0) {
            throw new TwinBusinessException(409, "该角色已被 " + refs + " 名成员引用，无法删除");
        }
        jdbcTemplate.update("DELETE FROM team_role WHERE id = ?", roleId);
    }

    private Team requireTeam(Long id) {
        Team t = teamMapper.selectTeamById(id);
        if (t == null) throw new TwinBusinessException(404, "团队不存在");
        return t;
    }

    private boolean isDissolved(Team t) {
        return "DISSOLVED".equals(t.getStatus());
    }

    private Long requirePersonnel(Long personnelId) {
        if (personnelId == null) throw new TwinBusinessException(400, "personnelId 不能为空");
        if (personnelMapper.findById(personnelId) == null) {
            throw new TwinBusinessException(400, "人员不存在");
        }
        return personnelId;
    }

    private void audit(Long teamId, Long actorPid, String action, String targetType, Long targetId, String detail) {
        TeamAuditLog l = new TeamAuditLog();
        l.setTeamId(teamId);
        l.setActorPersonnelId(actorPid);
        l.setAction(action);
        l.setTargetType(targetType);
        l.setTargetId(targetId);
        l.setDetail(detail != null && detail.length() > 512 ? detail.substring(0, 512) : detail);
        teamMapper.insertAuditLog(l);
    }

    // ═══════════════════════════════════════════
    // 查询
    // ═══════════════════════════════════════════

    /** 团队精简摘要：名称 / 负责人名 / 成员数。id 为空或团队缺失时返回 null（或对应字段为 null）。 */
    public Map<String, Object> teamSummary(Long id) {
        if (id == null) return null;
        Team t = teamMapper.selectTeamById(id);
        if (t == null) return null;
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("name", t.getName());
        map.put("ownerName", t.getOwnerPersonnelId() == null ? null : teamMapper.selectOwnerName(t.getOwnerPersonnelId()));
        List<Map<String, Object>> members = teamMapper.selectMembersByTeam(id);
        map.put("memberCount", members == null ? null : members.size());
        return map;
    }

    private Map<String, Object> buildDetail(Long id) {
        Team t = requireTeam(id);
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", t.getId());
        map.put("name", t.getName());
        map.put("description", t.getDescription());
        map.put("avatar", t.getAvatar());
        map.put("visibility", t.getVisibility());
        map.put("status", t.getStatus());
        map.put("ownerPersonnelId", t.getOwnerPersonnelId());
        map.put("maxMembers", t.getMaxMembers());
        map.put("createdBy", t.getCreatedBy());
        map.put("createdAt", t.getCreatedAt());
        map.put("ownerName", teamMapper.selectOwnerName(t.getOwnerPersonnelId()));
        map.put("members", teamMapper.selectMembersByTeam(id));
        map.put("pendingCount", teamMapper.countRequests(id, "PENDING"));
        return map;
    }

    public Map<String, Object> list(User user, String keyword, int page, int pageSize) {
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 20;
        int offset = (page - 1) * pageSize;
        List<Map<String, Object>> teams = teamMapper.selectTeams(keyword, offset, pageSize);
        for (Map<String, Object> t : teams) {
            Object idObj = t.get("id");
            Long tid = idObj == null ? null : Long.valueOf(String.valueOf(idObj));
            t.put("myRole", memberRoleOf(user, tid));
        }
        return Map.of(
                "list", teams,
                "total", teamMapper.countTeams(keyword),
                "page", page,
                "pageSize", pageSize);
    }

    public Map<String, Object> getDetail(User user, Long id) {
        requireTeamViewable(user, requireTeam(id));
        Map<String, Object> detail = buildDetail(id);
        // 当前用户在该团队的角色（OWNER/MANAGER/MEMBER/null），前端据此显隐操作按钮
        detail.put("myRole", memberRoleOf(user, id));
        // 当前用户 personnelId，前端据此隐藏「本人行」的操作按钮（本人不能改本人）
        detail.put("myPersonnelId", currentPersonnelId(user));
        return detail;
    }

    public List<Map<String, Object>> listMembers(User user, Long id) {
        requireTeamViewable(user, requireTeam(id));
        return teamMapper.selectMembersByTeam(id);
    }

    public Map<String, Object> listRequests(User user, Long id, String status, int page, int pageSize) {
        requireTeam(id);
        requireTeamRole(user, id, MANAGE_ROLES);
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 20;
        int offset = (page - 1) * pageSize;
        return Map.of(
                "list", teamMapper.selectRequests(id, status, offset, pageSize),
                "total", teamMapper.countRequests(id, status),
                "page", page,
                "pageSize", pageSize);
    }

    // ═══════════════════════════════════════════
    // 团队生命周期
    // ═══════════════════════════════════════════

    @Transactional
    public Map<String, Object> create(User user, TeamCreateRequest body) {
        String name = body.getName() == null ? "" : body.getName().trim();
        if (name.isEmpty()) throw new TwinBusinessException(400, "团队名称不能为空");
        Long ownerPid = currentPersonnelId(user);
        if (ownerPid == null) throw new TwinBusinessException(400, "当前账号未关联人员档案");

        Team t = new Team();
        t.setName(name);
        t.setDescription(body.getDescription());
        t.setVisibility(body.getVisibility() != null && !body.getVisibility().isBlank() ? body.getVisibility() : "PUBLIC");
        t.setStatus("ACTIVE");
        t.setOwnerPersonnelId(ownerPid);
        t.setMaxMembers(body.getMaxMembers());
        t.setCreatedBy(user.getId());
        teamMapper.insertTeam(t);

        TeamMember owner = new TeamMember();
        owner.setTeamId(t.getId());
        owner.setPersonnelId(ownerPid);
        owner.setRoleCode("OWNER");
        teamMapper.insertMember(owner);

        audit(t.getId(), ownerPid, "CREATE_TEAM", "team", t.getId(), name);
        return buildDetail(t.getId());
    }

    @Transactional
    public Map<String, Object> edit(User user, Long id, TeamUpdateRequest body) {
        Team t = requireTeam(id);
        requireTeamRole(user, id, MANAGE_ROLES);

        if (body.getName() != null && !body.getName().trim().isEmpty()) {
            t.setName(body.getName().trim());
        }
        if (body.getDescription() != null) t.setDescription(body.getDescription());
        if (body.getVisibility() != null && !body.getVisibility().isBlank()) t.setVisibility(body.getVisibility());
        if (body.getAvatar() != null) t.setAvatar(body.getAvatar());
        teamMapper.updateTeam(t);

        audit(id, currentPersonnelId(user), "EDIT", "team", id, "编辑团队");
        return buildDetail(id);
    }

    @Transactional
    public Map<String, Object> dissolve(User user, Long id) {
        Team t = requireTeam(id);
        requireTeamRole(user, id, OWNER_ROLES);
        teamMapper.updateTeamStatus(id, "DISSOLVED");
        audit(id, currentPersonnelId(user), "DISSOLVE", "team", id, "解散团队");
        return buildDetail(id);
    }

    @Transactional
    public Map<String, Object> transfer(User user, Long id, Long targetMemberId) {
        Team t = requireTeam(id);
        requireTeamRole(user, id, OWNER_ROLES);
        if (targetMemberId == null) throw new TwinBusinessException(400, "targetMemberId 不能为空");

        TeamMember target = teamMapper.selectMemberById(targetMemberId);
        if (target == null || !Objects.equals(target.getTeamId(), id)) {
            throw new TwinBusinessException(400, "目标成员不存在");
        }
        if ("OWNER".equals(target.getRoleCode())) throw new TwinBusinessException(400, "目标成员已是负责人");

        Long actorPid = currentPersonnelId(user);
        TeamMember oldOwner = actorPid == null ? null : teamMapper.selectMemberByTeamAndPersonnel(id, actorPid);
        if (oldOwner != null && !Objects.equals(oldOwner.getId(), target.getId())) {
            teamMapper.updateMemberRole(oldOwner.getId(), "MANAGER");
        }
        teamMapper.updateMemberRole(target.getId(), "OWNER");
        teamMapper.updateTeamOwner(id, target.getPersonnelId());

        audit(id, actorPid, "TRANSFER_OWNER", "member", targetMemberId, "转让负责人 → " + target.getPersonnelId());
        return buildDetail(id);
    }

    // ═══════════════════════════════════════════
    // 成员管理
    // ═══════════════════════════════════════════

    @Transactional
    public Map<String, Object> addMember(User user, Long id, AddMemberRequest body) {
        Team t = requireTeam(id);
        requireTeamRole(user, id, MANAGE_ROLES);
        if (isDissolved(t)) throw new TwinBusinessException(400, "团队已解散");

        Long pid = requirePersonnel(body.getPersonnelId());
        if (teamMapper.selectMemberByTeamAndPersonnel(id, pid) != null) {
            throw new TwinBusinessException(409, "该人员已是团队成员");
        }
        String roleCode = body.getRoleCode() == null || body.getRoleCode().isBlank() ? "MEMBER" : body.getRoleCode();
        if (!ASSIGNABLE_ROLES.contains(roleCode)) {
            throw new TwinBusinessException(400, "非法角色（仅 MANAGER/MEMBER）");
        }

        teamMapper.upsertMember(id, pid, roleCode);

        audit(id, currentPersonnelId(user), "ADD_MEMBER", "member", pid, "添加成员 " + pid);
        return buildDetail(id);
    }

    @Transactional
    public Map<String, Object> changeRole(User user, Long id, Long memberId, String roleCode) {
        requireTeam(id);
        requireTeamRole(user, id, OWNER_ROLES);

        TeamMember m = teamMapper.selectMemberById(memberId);
        if (m == null || !Objects.equals(m.getTeamId(), id)) {
            throw new TwinBusinessException(404, "成员不存在");
        }
        if ("OWNER".equals(m.getRoleCode())) throw new TwinBusinessException(400, "负责人角色请走转让");
        if (roleCode == null || !ASSIGNABLE_ROLES.contains(roleCode)) {
            throw new TwinBusinessException(400, "非法角色（仅 MANAGER/MEMBER）");
        }

        teamMapper.updateMemberRole(memberId, roleCode);
        audit(id, currentPersonnelId(user), "CHANGE_ROLE", "member", memberId, "角色 → " + roleCode);
        return buildDetail(id);
    }

    @Transactional
    public Map<String, Object> removeMember(User user, Long id, Long memberId) {
        requireTeam(id);
        requireTeamRole(user, id, MANAGE_ROLES);

        TeamMember m = teamMapper.selectMemberById(memberId);
        if (m == null || !Objects.equals(m.getTeamId(), id)) {
            throw new TwinBusinessException(404, "成员不存在");
        }
        if ("OWNER".equals(m.getRoleCode())) throw new TwinBusinessException(400, "不能移除负责人");

        teamMapper.softDeleteMember(memberId);
        audit(id, currentPersonnelId(user), "REMOVE_MEMBER", "member", memberId, "移除成员 " + m.getPersonnelId());
        return buildDetail(id);
    }

    // ═══════════════════════════════════════════
    // 邀请 / 申请
    // ═══════════════════════════════════════════

    @Transactional
    public Map<String, Object> invite(User user, Long id, InviteRequest body) {
        Team t = requireTeam(id);
        requireTeamRole(user, id, MANAGE_ROLES);
        if (isDissolved(t)) throw new TwinBusinessException(400, "团队已解散");

        List<Long> ids = body.getPersonnelIds() == null ? List.of() : body.getPersonnelIds();
        if (ids.isEmpty()) throw new TwinBusinessException(400, "请选择邀请对象");

        List<Long> created = new ArrayList<>();
        for (Long pid : ids) {
            if (pid == null) continue;
            if (personnelMapper.findById(pid) == null) continue;
            if (teamMapper.selectMemberByTeamAndPersonnel(id, pid) != null) continue;
            if (teamMapper.selectPendingRequestByTeamAndPersonnel(id, pid) != null) continue;
            TeamJoinRequest r = new TeamJoinRequest();
            r.setTeamId(id);
            r.setPersonnelId(pid);
            r.setType("INVITE");
            r.setStatus("PENDING");
            r.setMessage(body.getMessage());
            teamMapper.insertRequest(r);
            created.add(r.getId());
            audit(id, currentPersonnelId(user), "INVITE", "request", r.getId(), "邀请 " + pid);
        }
        return Map.of("created", created.size());
    }

    @Transactional
    public Map<String, Object> apply(User user, Long id, JoinApplyRequest body) {
        Team t = requireTeam(id);
        if (isDissolved(t)) throw new TwinBusinessException(400, "团队已解散，不接受申请");

        Long pid = currentPersonnelId(user);
        if (pid == null) throw new TwinBusinessException(400, "当前账号未关联人员档案");
        if (teamMapper.selectMemberByTeamAndPersonnel(id, pid) != null) {
            throw new TwinBusinessException(409, "该人员已是团队成员");
        }
        if (teamMapper.selectPendingRequestByTeamAndPersonnel(id, pid) != null) {
            throw new TwinBusinessException(409, "已有待处理申请");
        }

        TeamJoinRequest r = new TeamJoinRequest();
        r.setTeamId(id);
        r.setPersonnelId(pid);
        r.setType("APPLY");
        r.setStatus("PENDING");
        r.setMessage(body.getMessage());
        teamMapper.insertRequest(r);

        audit(id, pid, "APPLY", "request", r.getId(), "申请加入 " + pid);
        return Map.of("requestId", r.getId());
    }

    // ═══════════════════════════════════════════
    // 审批
    // ═══════════════════════════════════════════

    @Transactional
    public Map<String, Object> approve(User user, Long id, Long requestId) {
        requireTeam(id);
        requireTeamRole(user, id, MANAGE_ROLES);

        TeamJoinRequest r = teamMapper.selectRequestByIdForUpdate(requestId);
        if (r == null || !Objects.equals(r.getTeamId(), id)) throw new TwinBusinessException(404, "申请不存在");
        if (!"PENDING".equals(r.getStatus())) throw new TwinBusinessException(400, "当前状态不可审批");

        teamMapper.upsertMember(id, r.getPersonnelId(), "MEMBER");
        teamMapper.updateRequestStatus(requestId, "APPROVED", currentPersonnelId(user));

        audit(id, currentPersonnelId(user), "APPROVE", "request", requestId, "通过申请 " + r.getPersonnelId());
        return buildDetail(id);
    }

    @Transactional
    public Map<String, Object> reject(User user, Long id, Long requestId, String reason) {
        requireTeam(id);
        requireTeamRole(user, id, MANAGE_ROLES);

        TeamJoinRequest r = teamMapper.selectRequestByIdForUpdate(requestId);
        if (r == null || !Objects.equals(r.getTeamId(), id)) throw new TwinBusinessException(404, "申请不存在");
        if (!"PENDING".equals(r.getStatus())) throw new TwinBusinessException(400, "当前状态不可审批");
        if (reason == null || reason.isBlank()) throw new TwinBusinessException(400, "拒绝理由不能为空");

        teamMapper.updateRequestStatus(requestId, "REJECTED", currentPersonnelId(user));
        audit(id, currentPersonnelId(user), "REJECT", "request", requestId, "拒绝: " + reason);
        return buildDetail(id);
    }

    @Transactional
    public Map<String, Object> cancel(User user, Long id, Long requestId) {
        requireTeam(id);

        TeamJoinRequest r = teamMapper.selectRequestByIdForUpdate(requestId);
        if (r == null || !Objects.equals(r.getTeamId(), id)) throw new TwinBusinessException(404, "申请不存在");
        if (!"PENDING".equals(r.getStatus())) throw new TwinBusinessException(400, "当前状态不可取消");

        Long pid = currentPersonnelId(user);
        boolean isApplicant = pid != null && pid.equals(r.getPersonnelId());
        boolean isManager = MANAGE_ROLES.contains(memberRoleOf(user, id));
        if (!isApplicant && !isManager) throw new TwinBusinessException(403, "无权限取消");

        teamMapper.updateRequestStatus(requestId, "CANCELLED", pid);
        audit(id, pid, "CANCEL", "request", requestId, "取消申请");
        return buildDetail(id);
    }

    // ═══════════════════════════════════════════
    // 受邀人：接收邀请
    // ═══════════════════════════════════════════

    /** 我收到的待处理邀请（type=INVITE & PENDING & personnelId=当前用户）。 */
    public List<Map<String, Object>> listMyInvites(User user) {
        Long pid = currentPersonnelId(user);
        if (pid == null) return List.of();
        return teamMapper.selectMyInvites(pid);
    }

    /** 接受邀请：受邀人本人确认加入 → 写入成员并置 APPROVED。 */
    @Transactional
    public Map<String, Object> acceptInvite(User user, Long requestId) {
        Long pid = currentPersonnelId(user);
        if (pid == null) throw new TwinBusinessException(400, "当前账号未关联人员档案");
        TeamJoinRequest r = teamMapper.selectRequestByIdForUpdate(requestId);
        if (r == null) throw new TwinBusinessException(404, "邀请不存在");
        if (!"INVITE".equals(r.getType()) || !pid.equals(r.getPersonnelId())) {
            throw new TwinBusinessException(403, "无权限处理该邀请");
        }
        if (!"PENDING".equals(r.getStatus())) throw new TwinBusinessException(400, "当前状态不可处理");
        teamMapper.upsertMember(r.getTeamId(), pid, "MEMBER");
        teamMapper.updateRequestStatus(requestId, "APPROVED", pid);
        audit(r.getTeamId(), pid, "ACCEPT_INVITE", "request", requestId, "接受邀请");
        return buildDetail(r.getTeamId());
    }

    /** 拒绝邀请：受邀人本人拒绝 → 置 REJECTED。 */
    @Transactional
    public Map<String, Object> declineInvite(User user, Long requestId) {
        Long pid = currentPersonnelId(user);
        if (pid == null) throw new TwinBusinessException(400, "当前账号未关联人员档案");
        TeamJoinRequest r = teamMapper.selectRequestByIdForUpdate(requestId);
        if (r == null) throw new TwinBusinessException(404, "邀请不存在");
        if (!"INVITE".equals(r.getType()) || !pid.equals(r.getPersonnelId())) {
            throw new TwinBusinessException(403, "无权限处理该邀请");
        }
        if (!"PENDING".equals(r.getStatus())) throw new TwinBusinessException(400, "当前状态不可处理");
        teamMapper.updateRequestStatus(requestId, "REJECTED", pid);
        audit(r.getTeamId(), pid, "DECLINE_INVITE", "request", requestId, "拒绝邀请");
        return buildDetail(r.getTeamId());
    }
}
