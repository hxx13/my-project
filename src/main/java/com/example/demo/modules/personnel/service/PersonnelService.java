package com.example.demo.modules.personnel.service;

import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.personnel.dto.PersonnelFilter;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.*;

/**
 * 统一人员表服务：聚合同步（aro_personnel 学生 + sys_user 教职工 → personnel，按姓名合并双 id）+ 统一查询。
 */
@Service
public class PersonnelService {

    private static final Logger log = LoggerFactory.getLogger(PersonnelService.class);

    private static final int NAME_MAX_LEN = 128;

    private final PersonnelMapper personnelMapper;
    private final UserMapper userMapper;
    private final JdbcTemplate jdbcTemplate;

    public PersonnelService(PersonnelMapper personnelMapper, UserMapper userMapper, JdbcTemplate jdbcTemplate) {
        this.personnelMapper = personnelMapper;
        this.userMapper = userMapper;
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
     * 修改真实姓名（personnel.name），绝不改登录账号 username / display_nickname。
     * 联动写 sys_user.name 与 aro_personnel.name，避免下次聚合同步用账号名盖回，
     * 以及业务展示（UserDisplayNameService 优先读 aro_personnel）仍显示旧名。
     * 注意：personnel 以姓名唯一；ARO 全量回灌仍可能覆盖 aro_personnel.name。
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateName(Long id, String rawName) {
        if (id == null) throw new RuntimeException("id 不能为空");
        String name = rawName == null ? "" : rawName.trim();
        if (name.isEmpty()) throw new RuntimeException("姓名不能为空");
        if (name.length() > NAME_MAX_LEN) {
            throw new RuntimeException("姓名长度不能超过 " + NAME_MAX_LEN);
        }
        Personnel row = personnelMapper.findById(id);
        if (row == null) throw new RuntimeException("人员不存在");
        if (name.equals(row.getName())) {
            return;
        }
        Personnel clash = personnelMapper.findByName(name);
        if (clash != null && !Objects.equals(clash.getId(), id)) {
            throw new RuntimeException("姓名已被占用，请换一个或先处理同名人员");
        }
        int updated = jdbcTemplate.update("UPDATE personnel SET name = ? WHERE id = ?", name, id);
        if (updated <= 0) throw new RuntimeException("更新姓名失败");

        // 教职工侧：只写 name 列，保证 sync 的 COALESCE(name, …) 用真实姓名而非账号名
        if (row.getStaffId() != null && !row.getStaffId().isBlank()) {
            userMapper.updateNameById(row.getStaffId().trim(), name);
        }
        // 学生侧：业务展示读 aro_personnel.name；对应 sys_user 若存在也写 name
        if (row.getAroUserId() != null && !row.getAroUserId().isBlank()) {
            String aroUid = row.getAroUserId().trim();
            jdbcTemplate.update("UPDATE aro_personnel SET name = ? WHERE user_id = ?", name, aroUid);
            userMapper.updateNameById(aroUid, name);
        }
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
        // role 回填：运行期同步的新人员 role 为空时，从 sys_user 兜底补（教职工侧优先，学生侧 MEMBER），幂等只填空值
        int roleBackfill = jdbcTemplate.update(
                "UPDATE personnel p " +
                        "LEFT JOIN sys_user su_staff ON su_staff.id = p.staff_id " +
                        "LEFT JOIN sys_user su_student ON su_student.id = p.aro_user_id " +
                        "SET p.role = COALESCE(su_staff.role, su_student.role) " +
                        "WHERE p.role IS NULL AND (su_staff.role IS NOT NULL OR su_student.role IS NOT NULL)");
        log.info("[personnel-sync] 聚合完成，学生 {} 教职工 {} → 统一人员 {} 条，aro 绑定 {} 条，部门 {} 条，课题组 {} 条，role 回填 {} 条",
                students.size(), staff.size(), count, bindings, depts, groups, roleBackfill);
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
        fillStr(p.getJobNumber(), p::setJobNumber, str(r.get("job_number")));
        fillStr(p.getDepartmentName(), p::setDepartmentName, str(r.get("department_name")));
        fillStr(p.getProjectGroupName(), p::setProjectGroupName, str(r.get("project_group_name")));
        fillStr(p.getUserTypeNames(), p::setUserTypeNames, str(r.get("user_type_names")));
        fillStr(p.getHead(), p::setHead, str(r.get("head")));
        if (p.getGender() == null) p.setGender(toInt(r.get("gender")));
        fillStr(p.getMobilePhone(), p::setMobilePhone, str(r.get("mobile_phone")));
        fillStr(p.getEmail(), p::setEmail, str(r.get("email")));
        if (p.getIsSchool() == null) p.setIsSchool(toInt(r.get("is_school")));
        fillStr(p.getAllowedRoomsDisplayZh(), p::setAllowedRoomsDisplayZh, str(r.get("allowed_rooms_display_zh")));
        if (p.getHasOfficialRoomPermission() == null) {
            Integer v = toInt(r.get("has_official_room_permission"));
            p.setHasOfficialRoomPermission(v == null ? 0 : v);
        }
    }

    /**
     * 为新建/注册的教职工账号立刻挂上 personnel 行并写入真实姓名。
     * 解决：仅写 sys_user、不同步 personnel 时，统一人员页看不见、后续按姓名同步又被账号名盖回或「过几天对不上」。
     * 不改 username；name 冲突且已被其他 staff 占用时抛错。
     */
    @Transactional(rollbackFor = Exception.class)
    public void ensureStaffPersonnel(String staffUserId, String rawName, String roleCode) {
        if (!StringUtils.hasText(staffUserId)) {
            throw new IllegalArgumentException("staffUserId 不能为空");
        }
        String name = rawName == null ? "" : rawName.trim();
        if (name.isEmpty()) {
            throw new IllegalArgumentException("真实姓名不能为空");
        }
        if (name.length() > NAME_MAX_LEN) {
            throw new IllegalArgumentException("真实姓名长度不能超过 " + NAME_MAX_LEN);
        }
        String staffId = staffUserId.trim();
        userMapper.updateNameById(staffId, name);

        Personnel byStaff = personnelMapper.findByStaffId(staffId);
        if (byStaff != null) {
            if (!name.equals(byStaff.getName())) {
                Personnel clash = personnelMapper.findByName(name);
                if (clash != null && !Objects.equals(clash.getId(), byStaff.getId())) {
                    throw new IllegalArgumentException("姓名已被占用，请换一个或先处理同名人员");
                }
                jdbcTemplate.update("UPDATE personnel SET name = ? WHERE id = ?", name, byStaff.getId());
            }
            if (StringUtils.hasText(roleCode) && !StringUtils.hasText(byStaff.getRole())) {
                personnelMapper.updateRole(byStaff.getId(), roleCode.trim());
            }
            return;
        }

        Personnel clash = personnelMapper.findByName(name);
        if (clash != null) {
            if (StringUtils.hasText(clash.getStaffId()) && !staffId.equals(clash.getStaffId().trim())) {
                throw new IllegalArgumentException("姓名已被其他教职工账号占用");
            }
            personnelMapper.linkStaff(clash.getId(), staffId);
            if (StringUtils.hasText(roleCode)) {
                personnelMapper.updateRole(clash.getId(), roleCode.trim());
            }
            return;
        }

        Personnel p = new Personnel();
        p.setName(name);
        p.setStaffId(staffId);
        personnelMapper.insert(p);
        if (StringUtils.hasText(roleCode) && p.getId() != null) {
            personnelMapper.updateRole(p.getId(), roleCode.trim());
        }
    }

    /** 仅当目标尚未设置且源非空时赋值，避免 str(null)="" 污染（保证同名合并时后者的非空值可覆盖）。 */
    private static void fillStr(String current, java.util.function.Consumer<String> setter, String value) {
        if ((current == null || current.isEmpty()) && value != null && !value.isEmpty()) {
            setter.accept(value);
        }
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
