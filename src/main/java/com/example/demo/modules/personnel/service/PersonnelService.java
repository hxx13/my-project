package com.example.demo.modules.personnel.service;

import com.example.demo.modules.personnel.dto.PersonnelFilter;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * 统一人员表服务：聚合同步（aro_personnel 学生 + sys_user 教职工 → personnel，按姓名合并双 id）+ 统一查询。
 */
@Service
public class PersonnelService {

    private static final Logger log = LoggerFactory.getLogger(PersonnelService.class);

    private final PersonnelMapper personnelMapper;
    private final JdbcTemplate jdbcTemplate;

    public PersonnelService(PersonnelMapper personnelMapper, JdbcTemplate jdbcTemplate) {
        this.personnelMapper = personnelMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    /** 统一人员查询（分页 + 多维度筛选）。groupId/departmentId 已在 controller 解析为名称。 */
    public Map<String, Object> listUnified(PersonnelFilter filter) {
        int page = filter.getPage() == null || filter.getPage() < 1 ? 1 : filter.getPage();
        int pageSize = filter.getPageSize() == null || filter.getPageSize() < 1 ? 20 : filter.getPageSize();
        pageSize = Math.min(pageSize, 200);
        filter.setLimit(pageSize);
        filter.setOffset((page - 1) * pageSize);
        return Map.of(
                "list", personnelMapper.search(filter),
                "total", personnelMapper.count(filter),
                "page", page,
                "pageSize", pageSize);
    }

    /** 房间字典：从 personnel.allowed_rooms_display_zh 去重拆分（分隔符 、，,;；），有序返回。 */
    public List<String> listRooms() {
        Set<String> set = new LinkedHashSet<>();
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT DISTINCT allowed_rooms_display_zh FROM personnel " +
                        "WHERE allowed_rooms_display_zh IS NOT NULL AND allowed_rooms_display_zh <> ''");
        for (Map<String, Object> r : rows) {
            String v = str(r.get("allowed_rooms_display_zh"));
            if (v.isEmpty()) continue;
            for (String part : v.split("[、，,;；]")) {
                String t = part.trim();
                if (!t.isEmpty()) set.add(t);
            }
        }
        return new ArrayList<>(set);
    }

    private static final Set<String> EDITABLE_FIELDS = Set.of(
            "job_number", "department_name", "project_group_name", "user_type_names", "is_school");

    /** 更新单个本地字段（白名单，防注入）。同步时非空字段可覆盖，本地修改后也可覆盖，空值不覆盖。 */
    public void updateField(Long id, String field, String value) {
        if (id == null) throw new RuntimeException("id 不能为空");
        if (field == null || !EDITABLE_FIELDS.contains(field)) {
            throw new RuntimeException("字段不可修改: " + field);
        }
        if (value == null || value.isBlank()) {
            throw new RuntimeException("不能置空，如需清除请联系开发");
        }
        jdbcTemplate.update("UPDATE personnel SET " + field + " = ? WHERE id = ?", value.trim(), id);
    }

    /**
     * 聚合同步：aro_personnel（学生，工号=学号）+ sys_user（教职工，staff_id）→ personnel。
     * 以姓名为中心合并双 id（同名合并；同名不同人属已知风险，由复审评估）。
     */
    @Transactional
    public Map<String, Object> syncUnified() {
        Map<String, Personnel> byName = new LinkedHashMap<>();

        // 学生：aro_personnel（排除占位行 name=user_id）
        List<Map<String, Object>> students = jdbcTemplate.queryForList(
                "SELECT user_id, name, job_number, department_name, project_group_name, user_type_names, head, gender, " +
                        "mobile_phone, email, is_school, allowed_rooms_display_zh, has_official_room_permission FROM aro_personnel " +
                        "WHERE name IS NOT NULL AND name != '' AND name != user_id");
        for (Map<String, Object> r : students) {
            String name = str(r.get("name"));
            if (name.isBlank()) continue;
            Personnel p = byName.computeIfAbsent(name, k -> newPersonnel(name));
            p.setAroUserId(str(r.get("user_id")));
            fillProfile(p, r);
        }

        // 教职工：sys_user 里 id 以 STAFF_ 开头（自注册教职工账号，登录后显示 staff）
        // 姓名用 name 兜底 displayNickname / username（教职工账号 name 常为空）
        List<Map<String, Object>> staff = jdbcTemplate.queryForList(
                "SELECT id, COALESCE(NULLIF(name,''), NULLIF(display_nickname,''), username) AS name, " +
                        "department_name, project_group_name, user_type_names, head, gender, " +
                        "mobile_phone, email, is_school FROM sys_user " +
                        "WHERE id LIKE 'STAFF_%'");
        for (Map<String, Object> r : staff) {
            String name = str(r.get("name"));
            if (name.isBlank()) continue;
            Personnel p = byName.computeIfAbsent(name, k -> newPersonnel(name));
            p.setStaffId(str(r.get("id")));
            fillProfile(p, r);
        }

        int count = 0;
        int bindings = 0;
        for (Personnel p : byName.values()) {
            // upsert：按姓名（唯一）存在则合并（不空值覆盖），不存在则插入
            Personnel existing = personnelMapper.findByName(p.getName());
            if (existing == null) {
                personnelMapper.insert(p);
            } else {
                mergeNonBlank(existing, p);
                personnelMapper.update(existing);
            }
            count++;
            // aro 绑定：教职工账号 → 其 ARO 认证 id（aro_user_id），供「切学生视角」索引
            if (p.getAroUserId() != null && !p.getAroUserId().isBlank()
                    && p.getStaffId() != null && !p.getStaffId().isBlank()) {
                bindings += bindAro(p.getStaffId(), p.getAroUserId());
            }
        }
        int depts = syncDepartments();
        int groups = syncProjectGroups();
        log.info("[personnel-sync] 聚合完成，学生 {} 教职工 {} → 统一人员 {} 条，aro 绑定 {} 条，部门 {} 条，课题组 {} 条",
                students.size(), staff.size(), count, bindings, depts, groups);
        return Map.of("students", students.size(), "staff", staff.size(), "unified", count,
                "bindings", bindings, "departments", depts, "groups", groups);
    }

    /** 从 aro_personnel.department_name 聚合部门字典（含校内/校外多数归属），幂等。 */
    private int syncDepartments() {
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT department_name, COALESCE(SUM(is_school), 0) AS school_cnt, COUNT(*) AS cnt " +
                            "FROM aro_personnel WHERE department_name IS NOT NULL AND department_name != '' " +
                            "GROUP BY department_name");
            int count = 0;
            for (Map<String, Object> row : rows) {
                String name = str(row.get("department_name"));
                if (name.isEmpty()) continue;
                int schoolCnt = toInt(row.get("school_cnt"));
                int cnt = toInt(row.get("cnt"));
                int isSchool = (cnt > 0 && schoolCnt * 2 >= cnt) ? 1 : 0;
                jdbcTemplate.update("INSERT INTO department(name, is_school, active) VALUES(?, ?, 1) " +
                        "ON DUPLICATE KEY UPDATE is_school = VALUES(is_school)", name, isSchool);
                count++;
            }
            return count;
        } catch (Exception e) {
            log.warn("[personnel-sync] 部门聚合失败: {}", e.getMessage());
            return 0;
        }
    }

    /** 从 aro_personnel.project_group_name 聚合课题组字典（归部门），幂等。 */
    private int syncProjectGroups() {
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT DISTINCT project_group_name, department_name FROM aro_personnel " +
                            "WHERE project_group_name IS NOT NULL AND project_group_name != ''");
            int count = 0;
            for (Map<String, Object> row : rows) {
                Long deptId = null;
                String dept = str(row.get("department_name"));
                if (!dept.isEmpty()) {
                    try {
                        deptId = jdbcTemplate.queryForObject(
                                "SELECT id FROM department WHERE name = ? LIMIT 1", Long.class, dept);
                    } catch (Exception ignore) {
                        deptId = null;
                    }
                }
                String name = str(row.get("project_group_name"));
                for (String g : name.split(",")) {
                    g = g.trim();
                    if (g.isEmpty()) continue;
                    jdbcTemplate.update("INSERT INTO project_group(name, department_id, active) VALUES(?, ?, 1) " +
                            "ON DUPLICATE KEY UPDATE department_id = VALUES(department_id)", g, deptId);
                    count++;
                }
            }
            return count;
        } catch (Exception e) {
            log.warn("[personnel-sync] 课题组聚合失败: {}", e.getMessage());
            return 0;
        }
    }

    /** 幂等写 user_aro_binding（sys_user.id ↔ aro_personnel.user_id）。 */
    private int bindAro(String userId, String aroUserId) {
        if (userId == null || userId.isBlank() || aroUserId == null || aroUserId.isBlank()) {
            return 0;
        }
        try {
            return jdbcTemplate.update(
                    "INSERT INTO user_aro_binding(user_id, aro_user_id) VALUES(?, ?) " +
                            "ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), aro_user_id = VALUES(aro_user_id)",
                    userId, aroUserId);
        } catch (Exception e) {
            log.warn("[personnel-sync] aro 绑定失败 user={} aro={} err={}", userId, aroUserId, e.getMessage());
            return 0;
        }
    }

    private Personnel newPersonnel(String name) {
        Personnel p = new Personnel();
        p.setName(name);
        return p;
    }

    private void fillProfile(Personnel p, Map<String, Object> r) {
        if (p.getJobNumber() == null) p.setJobNumber(str(r.get("job_number")));
        if (p.getDepartmentName() == null) p.setDepartmentName(str(r.get("department_name")));
        if (p.getProjectGroupName() == null) p.setProjectGroupName(str(r.get("project_group_name")));
        if (p.getUserTypeNames() == null) p.setUserTypeNames(str(r.get("user_type_names")));
        if (p.getHead() == null) p.setHead(str(r.get("head")));
        if (p.getGender() == null) p.setGender(toInt(r.get("gender")));
        if (p.getMobilePhone() == null) p.setMobilePhone(str(r.get("mobile_phone")));
        if (p.getEmail() == null) p.setEmail(str(r.get("email")));
        if (p.getIsSchool() == null) p.setIsSchool(toInt(r.get("is_school")));
        if (p.getAllowedRoomsDisplayZh() == null) p.setAllowedRoomsDisplayZh(str(r.get("allowed_rooms_display_zh")));
        if (p.getHasOfficialRoomPermission() == null) p.setHasOfficialRoomPermission(toInt(r.get("has_official_room_permission")));
    }

    /** 不空值覆盖：把 src 的非空字段覆盖到 target（保留 target 已有非空值，不被空值覆盖）。 */
    private void mergeNonBlank(Personnel target, Personnel src) {
        if (src.getStaffId() != null && !src.getStaffId().isBlank()) target.setStaffId(src.getStaffId());
        if (src.getAroUserId() != null && !src.getAroUserId().isBlank()) target.setAroUserId(src.getAroUserId());
        if (src.getJobNumber() != null && !src.getJobNumber().isBlank()) target.setJobNumber(src.getJobNumber());
        if (src.getDepartmentName() != null && !src.getDepartmentName().isBlank()) target.setDepartmentName(src.getDepartmentName());
        if (src.getProjectGroupName() != null && !src.getProjectGroupName().isBlank()) target.setProjectGroupName(src.getProjectGroupName());
        if (src.getUserTypeNames() != null && !src.getUserTypeNames().isBlank()) target.setUserTypeNames(src.getUserTypeNames());
        if (src.getHead() != null && !src.getHead().isBlank()) target.setHead(src.getHead());
        if (src.getGender() != null) target.setGender(src.getGender());
        if (src.getMobilePhone() != null && !src.getMobilePhone().isBlank()) target.setMobilePhone(src.getMobilePhone());
        if (src.getEmail() != null && !src.getEmail().isBlank()) target.setEmail(src.getEmail());
        if (src.getIsSchool() != null) target.setIsSchool(src.getIsSchool());
        if (src.getAllowedRoomsDisplayZh() != null && !src.getAllowedRoomsDisplayZh().isBlank()) target.setAllowedRoomsDisplayZh(src.getAllowedRoomsDisplayZh());
        if (src.getHasOfficialRoomPermission() != null) target.setHasOfficialRoomPermission(src.getHasOfficialRoomPermission());
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static Integer toInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(v).trim()); } catch (Exception e) { return null; }
    }
}
