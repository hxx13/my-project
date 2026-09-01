package com.example.demo.modules.nhp.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.identity.dto.IdentityTagVO;
import com.example.demo.modules.identity.service.PersonIdentityService;
import com.example.demo.modules.team.service.TeamService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * NHP 权限判定统一入口（下游 Controller 复用，可注入、不经 HTTP、无鉴权副作用）。
 *
 * <p>分层：
 * <ul>
 *   <li>平台所有者（RoleEnum≥PLATFORM_OWNER）：隐式全放，不落矩阵。</li>
 *   <li>身份准入（NHP_EXPERT）：后台配置入口 + 字段/码表写（暂不细粒度）。</li>
 *   <li>团队角色（OWNER/MANAGER/MEMBER）：团队方案/项目/表单级权限，走 crf_permission 矩阵。</li>
 * </ul>
 */
@Service
public class NhpPermissionService {

    /** NHP 准入身份标识 code（种子 NHP_EXPERT / NHP专家，环境变量可覆盖）。 */
    @Value("${nhp.identity.expert-code:NHP_EXPERT}")
    private String nhpExpertCode;

    private final PersonIdentityService personIdentityService;
    private final TeamService teamService;
    private final JdbcTemplate jdbcTemplate;

    public NhpPermissionService(PersonIdentityService personIdentityService,
                                TeamService teamService,
                                JdbcTemplate jdbcTemplate) {
        this.personIdentityService = personIdentityService;
        this.teamService = teamService;
        this.jdbcTemplate = jdbcTemplate;
    }

    /** 平台所有者：全局后门，无视一切身份/团队/表单权限。 */
    public boolean isPlatformOwner(User user) {
        if (user == null) {
            return false;
        }
        RoleEnum role = user.getRole();
        return role != null && role.getLevel() >= RoleEnum.PLATFORM_OWNER.getLevel();
    }

    /** 是否持有指定身份标识 code（入参为 User，内部 resolve 到 personnel.id）。 */
    public boolean hasIdentity(User user, String code) {
        if (user == null || code == null || code.isBlank()) {
            return false;
        }
        String pid = personIdentityService.resolveIdByAccount(user.getId());
        if (pid == null) {
            return false;
        }
        List<IdentityTagVO> tags = personIdentityService.getByUser(pid);
        for (IdentityTagVO tag : tags) {
            if (tag != null && Objects.equals(tag.getCode(), code)) {
                return true;
            }
        }
        return false;
    }

    /** 是否 NHP 准入（持有 NHP专家身份）。 */
    public boolean isNhpExpert(User user) {
        return isPlatformOwner(user) || hasIdentity(user, nhpExpertCode);
    }

    /** 当前用户在团队内的角色（OWNER/MANAGER/MEMBER；非成员 null；SUPER_ADMIN 越权 OWNER）。 */
    public String teamRoleOf(User user, Long teamId) {
        return teamService.teamRoleOf(user, teamId);
    }

    /**
     * 查通用授权矩阵：主体×资源×能力 是否命中（resource_id/team_id 为 NULL 表示「该类型全部 / 全局」通配）。
     */
    public boolean hasGrant(String subjectType, String subjectCode,
                            String resourceType, Long resourceId,
                            String capabilityCode, Long teamId) {
        if (subjectType == null || subjectCode == null || resourceType == null || capabilityCode == null) {
            return false;
        }
        try {
            Integer n = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM crf_permission "
                            + "WHERE subject_type = ? AND subject_code = ? "
                            + "AND resource_type = ? AND (resource_id IS NULL OR resource_id = ?) "
                            + "AND capability_code = ? AND (team_id IS NULL OR team_id = ?)",
                    Integer.class,
                    subjectType, subjectCode, resourceType, resourceId, capabilityCode, teamId);
            return n != null && n > 0;
        } catch (Exception e) {
            return false;
        }
    }

    /** 是否团队负责人（平台所有者隐式全放）。用于项目/记录的删除、推进、身份改动等 OWNER 级操作。 */
    public boolean isTeamOwner(User user, Long teamId) {
        if (isPlatformOwner(user)) {
            return true;
        }
        if (teamId == null) {
            return false;
        }
        return "OWNER".equals(teamService.teamRoleOf(user, teamId));
    }

    /** 表单实例所属团队 id（经 transplant_id → crf_transplant.team_id）。 */
    public Long teamIdOfRecord(Long recordId) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT t.team_id FROM crf_record r LEFT JOIN crf_transplant t ON r.transplant_id = t.id WHERE r.id = ?",
                    Long.class, recordId);
        } catch (Exception e) {
            return null;
        }
    }

    /** 研究对象所属团队 id（经 crf_transplant.donor_subject_id / recipient_subject_id）。 */
    public Long teamIdOfSubject(Long subjectId) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT team_id FROM crf_transplant WHERE donor_subject_id = ? OR recipient_subject_id = ? LIMIT 1",
                    Long.class, subjectId, subjectId);
        } catch (Exception e) {
            return null;
        }
    }

    /** 表单实例所属表单 code（formKey，供表单级访问判定）。 */
    public String formKeyOfRecord(Long recordId) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT f.code FROM crf_record r JOIN crf_form f ON f.id = r.form_id WHERE r.id = ?",
                    String.class, recordId);
        } catch (Exception e) {
            return null;
        }
    }

    /** 表单实例创建者账号 id（本人判定用）。 */
    public String createdByOfRecord(Long recordId) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT created_by FROM crf_record WHERE id = ?", String.class, recordId);
        } catch (Exception e) {
            return null;
        }
    }

    /** 项目所属团队 id。 */
    public Long teamIdOfProject(Long projectId) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT team_id FROM crf_transplant WHERE id = ?", Long.class, projectId);
        } catch (Exception e) {
            return null;
        }
    }

    /** 是否团队成员（任意角色 OWNER/MANAGER/MEMBER）或平台所有者。 */
    public boolean isTeamMember(User user, Long teamId) {
        if (isPlatformOwner(user)) {
            return true;
        }
        if (teamId == null) {
            return false;
        }
        return teamService.teamRoleOf(user, teamId) != null;
    }

    /** 是否团队负责人或管理员，或平台所有者。 */
    public boolean canManageTeam(User user, Long teamId) {
        if (isPlatformOwner(user)) {
            return true;
        }
        if (teamId == null) {
            return false;
        }
        String role = teamService.teamRoleOf(user, teamId);
        return "OWNER".equals(role) || "MANAGER".equals(role);
    }

    /** 表单级访问设置（3 级回退：项目×事件×表单 → 项目×0×表单 → 0×0×表单）。 */
    public Map<String, Object> formAccessOf(Long projectId, Long eventId, String formKey) {
        Map<String, Object> def = new HashMap<>();
        def.put("locked", 0);
        def.put("self_view", 1);
        def.put("others_view", 1);
        def.put("self_edit", 1);
        def.put("others_edit", 1);
        if (formKey == null || formKey.isBlank()) return def;
        long pid = projectId == null ? 0 : projectId;
        long eid = eventId == null ? 0 : eventId;
        String SQL = "SELECT locked, self_view, others_view, self_edit, others_edit FROM crf_form_access WHERE project_id = ? AND event_id = ? AND form_key = ?";
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(SQL, pid, eid, formKey);
            if (!rows.isEmpty()) return rows.get(0);
            if (eid != 0) {
                rows = jdbcTemplate.queryForList(SQL, pid, 0L, formKey);
                if (!rows.isEmpty()) return rows.get(0);
            }
            if (pid != 0) {
                rows = jdbcTemplate.queryForList(SQL, 0L, 0L, formKey);
                if (!rows.isEmpty()) return rows.get(0);
            }
            return def;
        } catch (Exception e) {
            return def;
        }
    }

    /** 记录所属项目 id（transplant_id）。 */
    public Long projectIdOfRecord(Long recordId) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT transplant_id FROM crf_record WHERE id = ?", Long.class, recordId);
        } catch (Exception e) {
            return null;
        }
    }

    /** 记录所属事件/访视时点 id（经 visit_instance → visit）。 */
    public Long eventIdOfRecord(Long recordId) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT vi.visit_id FROM crf_record r LEFT JOIN crf_visit_instance vi ON vi.id = r.visit_instance_id WHERE r.id = ?",
                    Long.class, recordId);
        } catch (Exception e) {
            return null;
        }
    }

    private boolean accessBool(Map<String, Object> acc, String key) {
        Object v = acc == null ? null : acc.get(key);
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n) return n.intValue() != 0;
        return v != null && "1".equals(String.valueOf(v));
    }

    /** 记录查看权限：平台所有者全放；本人按 self_view；他人（本团队）按 others_view。 */
    public boolean canViewRecord(User user, Long recordId, String formKey, String createdBy) {
        if (isPlatformOwner(user)) return true;
        Map<String, Object> acc = formAccessOf(projectIdOfRecord(recordId), eventIdOfRecord(recordId), formKey);
        boolean isOwner = user != null && createdBy != null && user.getId().equals(createdBy);
        if (isOwner) return accessBool(acc, "self_view");
        return accessBool(acc, "others_view") && isTeamMember(user, teamIdOfRecord(recordId));
    }

    /** 记录编辑权限：平台所有者全放；锁定则只读；本人按 self_edit；他人（本团队）按 others_edit。 */
    public boolean canEditRecord(User user, Long recordId, String formKey, String createdBy) {
        if (isPlatformOwner(user)) return true;
        Map<String, Object> acc = formAccessOf(projectIdOfRecord(recordId), eventIdOfRecord(recordId), formKey);
        if (accessBool(acc, "locked")) return false;
        boolean isOwner = user != null && createdBy != null && user.getId().equals(createdBy);
        if (isOwner) return accessBool(acc, "self_edit");
        return accessBool(acc, "others_edit") && isTeamMember(user, teamIdOfRecord(recordId));
    }

    /** 用户是否在其团队角色上拥有指定能力（团队作用域授权矩阵）。负责人默认拥有全部能力。 */
    public boolean hasCapability(User user, Long teamId, String capabilityCode) {
        if (isPlatformOwner(user)) return true;
        if (teamId == null) return false;
        String role = teamService.teamRoleOf(user, teamId);
        if (role == null) return false;
        if ("OWNER".equals(role) && !hasOwnerGrants(teamId)) {
            return true; // ponytail: 旧团队尚未显式授权 OWNER 前保持全开，seed 后转矩阵判定
        }
        return hasGrant("team_role", role, "global", null, capabilityCode, teamId);
    }

    /** 该团队是否已为 OWNER 角色显式授权（区分「未初始化」与「已取消」）。 */
    private boolean hasOwnerGrants(Long teamId) {
        try {
            Integer n = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM crf_permission WHERE subject_type='team_role' AND subject_code='OWNER' AND team_id=?",
                    Integer.class, teamId);
            return n != null && n > 0;
        } catch (Exception e) {
            return false;
        }
    }

    /** 为团队 OWNER 角色补齐全部能力授权（仅当尚未授权，幂等；供权限矩阵可编辑）。 */
    public void ensureOwnerGrants(Long teamId) {
        if (teamId == null || hasOwnerGrants(teamId)) return;
        List<String> caps = jdbcTemplate.queryForList("SELECT code FROM crf_capability WHERE active = 1", String.class);
        for (String cap : caps) {
            jdbcTemplate.update("INSERT IGNORE INTO crf_permission (subject_type, subject_code, resource_type, resource_id, capability_code, team_id) "
                    + "VALUES ('team_role', 'OWNER', 'global', NULL, ?, ?)", cap, teamId);
        }
    }

    /** 是否可配置该团队权限：平台所有者 / 团队负责人 / 持有「配置权限」能力。 */
    public boolean canConfigTeam(User user, Long teamId) {
        if (isPlatformOwner(user)) return true;
        if (teamId == null) return false;
        if ("OWNER".equals(teamService.teamRoleOf(user, teamId))) return true;
        return hasCapability(user, teamId, "config:manage");
    }

    /** 当前用户可配置权限的团队（我所在团队中 OWNER 或持有 config:manage 者），供权限页下拉。 */
    public List<Map<String, Object>> configurableTeams(User user) {
        if (user == null) return List.of();
        List<Long> ids = teamService.myTeamIds(user);
        List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (Long id : ids) {
            if (!canConfigTeam(user, id)) continue;
            ensureOwnerGrants(id); // 保证 OWNER 角色有显式授权，权限矩阵可编辑
            Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("id", id);
            Map<String, Object> s = teamService.teamSummary(id);
            m.put("name", s == null ? null : s.get("name"));
            out.add(m);
        }
        return out;
    }

    /** 用户对某记录所属团队是否拥有指定能力（记录级能力判定）。 */
    public boolean hasRecordCapability(User user, Long recordId, String capabilityCode) {
        if (isPlatformOwner(user)) return true;
        return hasCapability(user, teamIdOfRecord(recordId), capabilityCode);
    }

    /** 用户对某项目所属团队是否拥有指定能力（项目级能力判定）。 */
    public boolean hasProjectCapability(User user, Long projectId, String capabilityCode) {
        if (isPlatformOwner(user)) return true;
        return hasCapability(user, teamIdOfProject(projectId), capabilityCode);
    }
}
