package com.example.demo.modules.personnel.service;

import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.personnel.dto.PersonnelFilter;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.entity.PersonnelRoomAuthorization;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import com.example.demo.modules.personnel.mapper.PersonnelRoomAuthorizationMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 统一人员表服务：聚合同步（aro_personnel 学生 + sys_user 教职工 → personnel，按账号 id 上下行）+ 统一查询。
 * 教职工账号与学生账号的合并由人工通过 PersonnelMergeService 完成，不再按姓名自动推断。
 */
@Service
public class PersonnelService {

    private static final Logger log = LoggerFactory.getLogger(PersonnelService.class);

    private static final int NAME_MAX_LEN = 128;
    private static final int JOB_NUMBER_MAX_LEN = 64;
    private static final int HEAD_URL_MAX_LEN = 512;

    private static final ObjectMapper ROOM_JSON = new ObjectMapper();

    private final PersonnelMapper personnelMapper;
    private final UserMapper userMapper;
    private final JdbcTemplate jdbcTemplate;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final PersonnelRoomAuthorizationMapper roomAuthorizationMapper;

    public PersonnelService(PersonnelMapper personnelMapper, UserMapper userMapper, JdbcTemplate jdbcTemplate) {
        this(personnelMapper, userMapper, jdbcTemplate, null, null);
    }

    @Autowired
    public PersonnelService(PersonnelMapper personnelMapper, UserMapper userMapper, JdbcTemplate jdbcTemplate,
                            AroPersonnelMapper aroPersonnelMapper,
                            PersonnelRoomAuthorizationMapper roomAuthorizationMapper) {
        this.personnelMapper = personnelMapper;
        this.userMapper = userMapper;
        this.jdbcTemplate = jdbcTemplate;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.roomAuthorizationMapper = roomAuthorizationMapper;
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

    /** 任意账号 id(staff_id 或 aro_user_id)→ personnel.id 字符串;不存在返回 null。 */
    public String resolveIdByAccount(String accountId) {
        if (accountId == null || accountId.isBlank()) {
            return null;
        }
        Personnel p = personnelMapper.findByStaffId(accountId);
        if (p == null) {
            p = personnelMapper.findByAroUserId(accountId);
        }
        return p == null ? null : String.valueOf(p.getId());
    }

    /** 任意账号 id(staff_id 或 aro_user_id) → 统一人员;不存在返回 null。操作人/占用者解析统一入口,不复用 sys_user.id。 */
    public Personnel resolveByAccount(String accountId) {
        String pid = resolveIdByAccount(accountId);
        if (pid == null) {
            return null;
        }
        try {
            return personnelMapper.findById(Long.parseLong(pid));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * 姓名 → personnel.id 字符串。查不到返回 null。
     *
     * <p>笼位表单里的「实验员」存的是**姓名**而不是账号 id，要和本人比对必须先落到 personnel.id。
     * 姓名已不是身份键，同名会有多行 —— **歧义时返回 null，绝不猜**：静默挑一条会写错人且不报错。
     */
    public String resolveIdByName(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        List<Personnel> matches = personnelMapper.findByNameAll(name.trim());
        if (matches == null || matches.size() != 1) {
            return null;
        }
        return String.valueOf(matches.get(0).getId());
    }

    /** personnel.id 集合 → staff_id 列表(过滤空 staff_id;非数字 id 忽略)。 */
    public List<String> resolveStaffIds(Collection<String> personnelIds) {
        if (personnelIds == null || personnelIds.isEmpty()) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        for (String pid : personnelIds) {
            if (pid == null || pid.isBlank()) {
                continue;
            }
            try {
                Personnel p = personnelMapper.findById(Long.parseLong(pid));
                if (p != null && p.getStaffId() != null && !p.getStaffId().isBlank()) {
                    result.add(p.getStaffId());
                }
            } catch (NumberFormatException ignore) {
                // 非数字 id 忽略
            }
        }
        return result;
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
     * 改人员的部门或课题组归属。**id 是权威**（展示取字典当前名），文本快照一并写，
     * 给 ARO 回灌与「字典查不到时」的兜底展示用。
     *
     * <p>传 id 为 null 表示清空归属（文本也清空）。
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateOrgRef(Long id, boolean department, Long refId, String name) {
        if (id == null) throw new IllegalArgumentException("id 不能为空");
        if (personnelMapper.findById(id) == null) throw new IllegalArgumentException("人员不存在");
        String n = (name == null || name.isBlank()) ? null : name.trim();
        if (refId == null) n = null;
        if (department) {
            personnelMapper.updateDepartmentRef(id, refId, n);
        } else {
            personnelMapper.updateProjectGroupRef(id, refId, n);
        }
    }

    /**
     * 删除到回收站（软删除）。
     *
     * <p>为什么不直接 DELETE：personnel 是同步派生的 —— 删行之后，下一次同步按 aro_user_id
     * 找不到行就会重新 INSERT 把他建回来。软删标记让同步「看得见但不复活」
     * （见 {@link #syncUnified} 两个循环里的 deletedAt 判断）。
     */
    @Transactional(rollbackFor = Exception.class)
    public void moveToTrash(Long id, String operatorId) {
        if (id == null) throw new IllegalArgumentException("id 不能为空");
        Personnel row = personnelMapper.findById(id);
        if (row == null) throw new IllegalArgumentException("人员不存在");
        if (row.getDeletedAt() != null) throw new IllegalArgumentException("该人员已在回收站中");
        jdbcTemplate.update("UPDATE personnel SET deleted_at = NOW(), deleted_by = ? WHERE id = ?", operatorId, id);
    }

    /** 从回收站恢复（清掉软删标记，列表里重新可见）。 */
    @Transactional(rollbackFor = Exception.class)
    public void restoreFromTrash(Long id) {
        if (id == null) throw new IllegalArgumentException("id 不能为空");
        Personnel row = personnelMapper.findById(id);
        if (row == null) throw new IllegalArgumentException("人员不存在");
        if (row.getDeletedAt() == null) throw new IllegalArgumentException("该人员不在回收站中");
        jdbcTemplate.update("UPDATE personnel SET deleted_at = NULL, deleted_by = NULL WHERE id = ?", id);
    }

    /**
     * 彻底删除：连同 ARO 侧人员行与登录账号一起删掉，切断「下次同步重建」的源头。
     *
     * <p>⚠️ 若此人来自 ARO 镜像同步，删掉 {@code aro_personnel} 行之后**下次镜像同步还会把他加回来**
     * —— ARO 才是权威源。对这类人本操作只能算「删一段时间」，不是永久。
     *
     * <p>⚠️ 其它表里以账号 id / 人员 id 存的历史数据（通知、留痕、申请单等）**不会**被清理，
     * 会变成孤儿行 —— 它们没有外键约束。所以这是不可逆操作，调用方必须二次确认。
     */
    @Transactional(rollbackFor = Exception.class)
    public void purge(Long id) {
        if (id == null) throw new IllegalArgumentException("id 不能为空");
        Personnel p = personnelMapper.findById(id);
        if (p == null) throw new IllegalArgumentException("人员不存在");
        String aroUid = p.getAroUserId() == null ? "" : p.getAroUserId().trim();
        String staffId = p.getStaffId() == null ? "" : p.getStaffId().trim();
        if (!aroUid.isEmpty()) {
            jdbcTemplate.update("DELETE FROM aro_personnel WHERE user_id = ?", aroUid);
            jdbcTemplate.update("DELETE FROM sys_user WHERE id = ?", aroUid);
        }
        if (!staffId.isEmpty()) {
            jdbcTemplate.update("DELETE FROM sys_user WHERE id = ?", staffId);
        }
        personnelMapper.deleteById(id);
        log.warn("[personnel-purge] 彻底删除人员 id={} name={} aro={} staff={}", id, p.getName(), aroUid, staffId);
    }

    /**
     * 修改真实姓名（personnel.name），绝不改登录账号 username / display_nickname。
     * 联动写 sys_user.name 与 aro_personnel.name，避免下次聚合同步用账号名盖回，
     * 以及业务展示（UserDisplayNameService 优先读 aro_personnel）仍显示旧名。
     * 姓名不再是唯一键：允许与其他人员同名；ARO 全量回灌仍可能覆盖 aro_personnel.name。
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
     * 设置或清除头像本地覆盖层。url 传空即清除（展示回落到 ARO 的 head）。
     *
     * <p>只写 head_override 单列：同步的 mergeNonBlank 是「源非空即覆盖」，直接写 head 会被
     * 下一次同步用 ARO 的旧 URL 冲掉，所以本地意图必须存在覆盖层里。
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateHeadOverride(Long id, String url) {
        if (id == null) throw new IllegalArgumentException("id 不能为空");
        if (personnelMapper.findById(id) == null) throw new IllegalArgumentException("人员不存在");
        String normalized = null;
        if (url != null && !url.isBlank()) {
            String u = url.trim();
            if (u.length() > HEAD_URL_MAX_LEN) {
                throw new IllegalArgumentException("头像地址过长");
            }
            // 只接受站内相对路径或 http(s) 绝对地址，挡掉 javascript:/data: 与协议相对 //evil.com 等
            boolean local = u.startsWith("/") && !u.startsWith("//");
            boolean http = u.startsWith("https://") || u.startsWith("http://");
            if (!local && !http) {
                throw new IllegalArgumentException("头像地址格式不合法");
            }
            normalized = u;
        }
        personnelMapper.updateHeadOverride(id, normalized);
    }

    /**
     * 读取人员的房间授权。本地覆盖层（room_auth_managed=1）优先读 personnel_room_authorization；
     * 否则回官方 aro_personnel.allowed_rooms_json，返回原始 id 列表 + 快照条目。
     */
    public Map<String, Object> getRoomAuthorization(String personnelId) {
        Personnel p = findByIdOrNull(personnelId);
        String aroUserId = p == null ? null : p.getAroUserId();
        if (aroUserId == null || aroUserId.isBlank()) {
            return Map.of("managed", 0, "roomIds", List.of(), "rooms", List.of());
        }
        aroUserId = aroUserId.trim();
        AroPersonnel aro = aroPersonnelMapper.findByUserId(aroUserId);
        if (aro != null && Integer.valueOf(1).equals(aro.getRoomAuthManaged())) {
            List<String> roomIds = new ArrayList<>();
            for (PersonnelRoomAuthorization row : roomAuthorizationMapper.selectByUser(aroUserId)) {
                if (row.getRoomId() != null && !row.getRoomId().isBlank()) {
                    roomIds.add(row.getRoomId());
                }
            }
            return Map.of("managed", 1, "roomIds", roomIds, "rooms", List.of());
        }
        List<Map<String, Object>> rooms = parseAllowedRooms(aro == null ? null : aro.getAllowedRoomsJson());
        return Map.of("managed", 0, "roomIds", extractRoomIds(rooms), "rooms", rooms);
    }

    /**
     * 写入人员的本地房间授权（覆盖层）。置 room_auth_managed=1 后整表重建该人的授权行；
     * roomIds 为空 = 撤销全部房间。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> updateRoomAuthorization(String personnelId, List<String> roomIds, String operatorId) {
        Personnel p = findByIdOrNull(personnelId);
        if (p == null) {
            throw new RuntimeException("人员不存在");
        }
        String aroUserId = p.getAroUserId();
        if (aroUserId == null || aroUserId.isBlank()) {
            throw new RuntimeException("该人员无 ARO 身份，无法设置房间授权");
        }
        aroUserId = aroUserId.trim();
        aroPersonnelMapper.updateRoomAuthManaged(aroUserId, 1);
        roomAuthorizationMapper.deleteByUser(aroUserId);
        LocalDateTime now = LocalDateTime.now();
        if (roomIds != null) {
            for (String roomId : roomIds) {
                if (roomId == null || roomId.isBlank()) continue;
                PersonnelRoomAuthorization row = new PersonnelRoomAuthorization();
                row.setAroUserId(aroUserId);
                row.setRoomId(roomId.trim());
                row.setUpdatedAt(now);
                row.setUpdatedBy(operatorId);
                roomAuthorizationMapper.insert(row);
            }
        }
        return Map.of("ok", true, "managed", 1);
    }

    private Personnel findByIdOrNull(String personnelId) {
        if (personnelId == null || personnelId.isBlank()) return null;
        try {
            return personnelMapper.findById(Long.parseLong(personnelId.trim()));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 解析官方 allowed_rooms_json（数组），返回原始条目快照；解析失败返回空。 */
    private List<Map<String, Object>> parseAllowedRooms(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            JsonNode root = ROOM_JSON.readTree(json);
            if (root == null || !root.isArray()) return List.of();
            List<Map<String, Object>> result = new ArrayList<>();
            for (JsonNode n : root) {
                if (n == null || n.isNull() || !n.isObject()) continue;
                Map<String, Object> entry = new HashMap<>();
                n.fields().forEachRemaining(e -> entry.put(e.getKey(), e.getValue().asText()));
                result.add(entry);
            }
            return result;
        } catch (Exception e) {
            log.warn("[room-auth] 解析 allowed_rooms_json 失败: {}", e.getMessage());
            return List.of();
        }
    }

    /** 从快照条目提取房间 id（优先 officialRoomId，缺省回退 id）。 */
    private List<String> extractRoomIds(List<Map<String, Object>> rooms) {
        List<String> ids = new ArrayList<>();
        for (Map<String, Object> r : rooms) {
            Object v = r.get("officialRoomId");
            if (v == null || String.valueOf(v).isBlank()) v = r.get("id");
            if (v != null && !String.valueOf(v).isBlank()) ids.add(String.valueOf(v));
        }
        return ids;
    }

    /**
     * 聚合同步：aro_personnel（学生，工号=学号）+ sys_user（教职工，staff_id）→ personnel。
     * 按账号 id 上下行：学生按 aro_user_id、教职工按 staff_id，**任何人之间不再按姓名合并**。
     * 教职工账号与学生账号的合并由人工通过 PersonnelMergeService 完成。
     */
    @Transactional
    public Map<String, Object> syncUnified() {
        List<Personnel> students = new ArrayList<>();
        List<Map<String, Object>> studentRows = jdbcTemplate.queryForList(
                "SELECT user_id, name, job_number, department_name, project_group_name, user_type_names, head, gender, " +
                        "mobile_phone, email, is_school, allowed_rooms_display_zh, has_official_room_permission FROM aro_personnel " +
                        "WHERE name IS NOT NULL AND name != '' AND name != user_id");
        for (Map<String, Object> r : studentRows) {
            String aroUserId = str(r.get("user_id"));
            if (aroUserId.isEmpty()) continue;
            Personnel p = new Personnel();
            p.setAroUserId(aroUserId);
            p.setName(str(r.get("name")));
            fillProfile(p, r);
            students.add(p);
        }

        List<Personnel> staff = new ArrayList<>();
        List<Map<String, Object>> staffRows = jdbcTemplate.queryForList(
                "SELECT id, COALESCE(NULLIF(name,''), NULLIF(display_nickname,''), username) AS name, " +
                        "department_name, project_group_name, user_type_names, head, gender, " +
                        "mobile_phone, email, is_school FROM sys_user " +
                        "WHERE id LIKE 'STAFF_%'");
        for (Map<String, Object> r : staffRows) {
            String staffId = str(r.get("id"));
            if (staffId.isEmpty()) continue;
            Personnel p = new Personnel();
            p.setStaffId(staffId);
            p.setName(str(r.get("name")));
            fillProfile(p, r);
            staff.add(p);
        }

        int count = 0;
        int bindings = 0;
        java.util.Set<Long> touchedIds = new java.util.HashSet<>();
        for (int i = 0; i < students.size(); i++) {
            Personnel p = students.get(i);
            Personnel existing = personnelMapper.findByAroUserId(p.getAroUserId());
            if (existing != null && existing.getDeletedAt() != null) {
                // 回收站里的人：同步看得见但不复活 —— 否则删了下次同步又把他建回来
                continue;
            }
            if (existing == null) {
                if (p.getHasOfficialRoomPermission() == null) p.setHasOfficialRoomPermission(0);
                personnelMapper.insert(p);
                touchedIds.add(p.getId());
            } else {
                mergeNonBlank(existing, p);
                personnelMapper.update(existing);
                students.set(i, existing);
                touchedIds.add(existing.getId());
            }
        }
        for (int i = 0; i < staff.size(); i++) {
            Personnel p = staff.get(i);
            Personnel existing = personnelMapper.findByStaffId(p.getStaffId());
            if (existing != null && existing.getDeletedAt() != null) {
                // 同上：回收站里的教职工行也不复活
                continue;
            }
            if (existing == null) {
                if (p.getHasOfficialRoomPermission() == null) p.setHasOfficialRoomPermission(0);
                personnelMapper.insert(p);
                touchedIds.add(p.getId());
            } else {
                mergeNonBlank(existing, p);
                personnelMapper.update(existing);
                touchedIds.add(existing.getId());
            }
        }
        count = touchedIds.size();
        // 已通过人工合并绑定过的行，维持其 user_aro_binding（不再由姓名推断）
        for (Personnel p : students) {
            if (p.getId() != null && p.getStaffId() != null && !p.getStaffId().isBlank()) {
                bindings += bindAro(p.getStaffId(), p.getAroUserId());
            }
        }

        int depts = syncDepartments();
        int groups = syncProjectGroups();
        linkOrgIds();
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

    /**
     * 只同步一个人的档案：按其 aro_user_id 从 aro_personnel 拉、按其 staff_id 从 sys_user 拉，
     * 用 mergeNonBlank 合并进本行。不动其他人、不动 head_override。
     *
     * <p>头像保护：本人若有本地头像（head_override 非空），本次不同步 head —— 自传头像不允许被覆盖。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> syncOne(Long id) {
        if (id == null) throw new IllegalArgumentException("id 不能为空");
        Personnel p = personnelMapper.findById(id);
        if (p == null) throw new IllegalArgumentException("人员不存在");

        String headBefore = p.getHead();
        int aroMatched = 0;
        int staffMatched = 0;

        if (StringUtils.hasText(p.getAroUserId())) {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT user_id, name, job_number, department_name, project_group_name, user_type_names, head, gender, " +
                            "mobile_phone, email, is_school, allowed_rooms_display_zh, has_official_room_permission " +
                            "FROM aro_personnel WHERE user_id = ?", p.getAroUserId().trim());
            for (Map<String, Object> r : rows) {
                Personnel src = new Personnel();
                src.setAroUserId(str(r.get("user_id")));
                src.setName(str(r.get("name")));
                fillProfile(src, r);
                mergeNonBlank(p, src);
                aroMatched++;
            }
        }

        if (StringUtils.hasText(p.getStaffId())) {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT id, COALESCE(NULLIF(name,''), NULLIF(display_nickname,''), username) AS name, " +
                            "department_name, project_group_name, user_type_names, head, gender, " +
                            "mobile_phone, email, is_school FROM sys_user WHERE id = ?", p.getStaffId().trim());
            for (Map<String, Object> r : rows) {
                Personnel src = new Personnel();
                src.setStaffId(str(r.get("id")));
                src.setName(str(r.get("name")));
                fillProfile(src, r);
                mergeNonBlank(p, src);
                staffMatched++;
            }
        }

        // 头像保护：有本地头像就不同步 head
        if (StringUtils.hasText(p.getHeadOverride())) {
            p.setHead(headBefore);
        }

        personnelMapper.update(p);
        return Map.of("aroMatched", aroMatched, "staffMatched", staffMatched,
                "hasLocalHead", StringUtils.hasText(p.getHeadOverride()));
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

    /**
     * 按名字把人员归属锚定到字典 id。
     *
     * <p>关键：**只在 id 为空时解析**（WHERE ... IS NULL）。字典改名后人员身上的文本快照仍是 ARO 的旧名、
     * 按旧名查不到 → 若清空 id，显示会回落旧文本、改名等于没改。保留 id 才能让显示走字典当前名。
     */
    private void linkOrgIds() {
        try {
            int deptLinked = jdbcTemplate.update(
                    "UPDATE personnel p JOIN department d ON d.name = p.department_name " +
                    "SET p.department_id = d.id " +
                    "WHERE p.department_id IS NULL AND p.department_name IS NOT NULL AND p.department_name <> ''");
            int groupLinked = jdbcTemplate.update(
                    "UPDATE personnel p JOIN project_group g ON g.name = p.project_group_name " +
                    "SET p.project_group_id = g.id " +
                    "WHERE p.project_group_id IS NULL AND p.project_group_name IS NOT NULL AND p.project_group_name <> ''");
            // 兼容「一人两组」的历史逗号串（14 行）：优先锚定到「<本人姓名>的课题组」，取不到再取第一个 token。
            // 都带 IS NULL：保留已有 id 是改名能活下来的关键。
            int groupLinkedByName = jdbcTemplate.update(
                    "UPDATE personnel p JOIN project_group g ON g.name = CONCAT(p.name, '的课题组') " +
                    "SET p.project_group_id = g.id " +
                    "WHERE p.project_group_id IS NULL AND p.project_group_name LIKE '%,%'");
            int groupLinkedByFirst = jdbcTemplate.update(
                    "UPDATE personnel p JOIN project_group g ON g.name = TRIM(SUBSTRING_INDEX(p.project_group_name, ',', 1)) " +
                    "SET p.project_group_id = g.id " +
                    "WHERE p.project_group_id IS NULL AND p.project_group_name LIKE '%,%'");
            // 记录仍带逗号、已锚定主组的行数，供日后人工核对「一人两组」是否要拆
            Integer commaAnchored = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM personnel WHERE project_group_name LIKE '%,%' AND project_group_id IS NOT NULL",
                    Integer.class);
            log.info("[personnel-sync] 归属锚定：部门 {} 行、课题组 {} 行、多组回填（本人名 {} 行 / 首 token {} 行），已锚定的多组行 {} 行",
                    deptLinked, groupLinked, groupLinkedByName, groupLinkedByFirst,
                    commaAnchored == null ? 0 : commaAnchored);
        } catch (Exception e) {
            log.warn("[personnel-sync] 归属锚定失败: {}", e.getMessage());
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
        // 仅当行里真带这一列时才赋值：教职工查询不含该列，留 null 让 mergeNonBlank 跳过，
        // 否则每次同步都会把已合并行的官方房间授权静默清零
        if (p.getHasOfficialRoomPermission() == null && r.containsKey("has_official_room_permission")) {
            Integer v = toInt(r.get("has_official_room_permission"));
            p.setHasOfficialRoomPermission(v == null ? 0 : v);
        }
    }

    /**
     * 为新建/注册的教职工账号立刻挂上 personnel 行并写入真实姓名。
     * 解决：仅写 sys_user、不同步 personnel 时，统一人员页看不见、后续按姓名同步又被账号名盖回或「过几天对不上」。
     * 不改 username。姓名不再参与认人：只按 staff_id 与工号判定，同名不再冲突。
     *
     * jobNumber（工号 = 学号）是强键：填了就优先按它认人，命中唯一未绑定行即合并；
     * 认不出来就在下面新建一行。姓名同音不同字、填成昵称/英文名都会漏合并，工号不会。
     */
    @Transactional(rollbackFor = Exception.class)
    public void ensureStaffPersonnel(String staffUserId, String rawName, String roleCode, String rawJobNumber) {
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
        String jobNumber = rawJobNumber == null ? "" : rawJobNumber.trim();
        if (jobNumber.length() > JOB_NUMBER_MAX_LEN) {
            throw new IllegalArgumentException("工号长度不能超过 " + JOB_NUMBER_MAX_LEN);
        }
        String staffId = staffUserId.trim();
        userMapper.updateNameById(staffId, name);

        Personnel byStaff = personnelMapper.findByStaffId(staffId);
        if (byStaff != null) {
            if (!name.equals(byStaff.getName())) {
                jdbcTemplate.update("UPDATE personnel SET name = ? WHERE id = ?", name, byStaff.getId());
            }
            // 只补空缺的工号，不覆盖 personnel 已有的值
            if (!jobNumber.isEmpty() && !StringUtils.hasText(byStaff.getJobNumber())) {
                personnelMapper.linkStaff(byStaff.getId(), staffId, jobNumber);
            }
            if (StringUtils.hasText(roleCode) && !StringUtils.hasText(byStaff.getRole())) {
                personnelMapper.updateRole(byStaff.getId(), roleCode.trim());
            }
            return;
        }

        // 工号优先：唯一命中且该行还没绑账号 → 合并。姓名不再参与认人，同名不再冲突。
        if (!jobNumber.isEmpty()) {
            List<Personnel> byJob = personnelMapper.findByJobNumber(jobNumber);
            List<Personnel> claimable = byJob.stream()
                    .filter(x -> !StringUtils.hasText(x.getStaffId()))
                    .toList();
            if (claimable.size() == 1) {
                Long id = claimable.get(0).getId();
                personnelMapper.linkStaff(id, staffId, jobNumber);
                if (StringUtils.hasText(roleCode)) {
                    personnelMapper.updateRole(id, roleCode.trim());
                }
                return;
            }
            if (claimable.isEmpty() && !byJob.isEmpty()) {
                throw new IllegalArgumentException("工号 " + jobNumber + " 已绑定其他系统账号，请勿重复注册");
            }
            // 命中多行且都没绑账号（工号本身重复）→ 认不出是谁，落到下面新建一行
        }

        Personnel p = new Personnel();
        p.setName(name);
        p.setStaffId(staffId);
        if (!jobNumber.isEmpty()) {
            p.setJobNumber(jobNumber);
        }
        // 新建教职工账号尚无官方可进房间授权，默认 0（列为 NOT NULL DEFAULT 0，显式插入 null 会触发约束异常）
        p.setHasOfficialRoomPermission(0);
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
